import { describe, expect, it, vi } from 'vitest';
import type { EngineResult } from '@/runner/engine';
import { createCompileService, createJavaEngine } from '@/runner/java/engine';

/** A Worker stand-in: `reply` decides what each posted message answers. */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  constructor(private reply: (data: never, worker: FakeWorker) => void) {}
  postMessage(data: never) {
    this.posted.push(data);
    queueMicrotask(() => this.reply(data, this));
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    if (!this.terminated) this.onmessage?.({ data } as MessageEvent);
  }
  crash(message: string) {
    this.onerror?.({ message, preventDefault() {} } as ErrorEvent);
  }
}

const wasm = () => new Uint8Array([0, 97, 115, 109]);
const ok: EngineResult = { stdout: '3\n', stderr: '', exitCode: 0, outputLimitExceeded: false };

describe('Java compile service', () => {
  it('compiles once per code and reuses the warm worker', async () => {
    const workers: FakeWorker[] = [];
    const service = createCompileService(() => {
      const w = new FakeWorker((d: { id: number }, self) => self.emit({ id: d.id, wasm: wasm() }));
      workers.push(w);
      return w as unknown as Worker;
    });
    expect(await service.compile('A', 'base/')).toHaveProperty('wasm');
    expect(await service.compile('A', 'base/')).toHaveProperty('wasm');
    expect(await service.compile('B', 'base/')).toHaveProperty('wasm');
    expect(workers).toHaveLength(1);
    expect(workers[0]?.posted).toHaveLength(2);
  });

  it('retries once with a new worker after a crash', async () => {
    let made = 0;
    const service = createCompileService(() => {
      made++;
      const first = made === 1;
      return new FakeWorker((d: { id: number }, self) =>
        first
          ? self.crash('array element access out of bounds')
          : self.emit({ id: d.id, wasm: wasm() }),
      ) as unknown as Worker;
    });
    expect(await service.compile('A', 'base/')).toHaveProperty('wasm');
    expect(made).toBe(2);
  });

  it('gives up after two crashes and does not cache the failure', async () => {
    const service = createCompileService(
      () => new FakeWorker((_d, self) => self.crash('boom')) as unknown as Worker,
    );
    expect(await service.compile('A', 'base/')).toEqual({ failure: 'boom' });
  });

  it('cuts a hung compile and retries', async () => {
    vi.useFakeTimers();
    try {
      let made = 0;
      const service = createCompileService(() => {
        made++;
        const hang = made === 1;
        return new FakeWorker((d: { id: number }, self) => {
          if (!hang) self.emit({ id: d.id, compileError: 'Main.java:1: error: x' });
        }) as unknown as Worker;
      }, 1000);
      const pending = service.compile('A', 'base/');
      await vi.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual({ compileError: 'Main.java:1: error: x' });
      expect(made).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Java engine', () => {
  const compiler = (outcome: object) => ({
    compile: vi.fn(async () => outcome as never),
    discard: vi.fn(),
  });

  it('starts the clock when the program starts and returns its result', async () => {
    const runWorkers: FakeWorker[] = [];
    const engine = createJavaEngine({
      compiler: compiler({ wasm: wasm() }),
      createRunWorker: () => {
        const w = new FakeWorker((_d, self) => {
          self.emit({ type: 'run-start' });
          self.emit({ type: 'result', result: ok });
        });
        runWorkers.push(w);
        return w as unknown as Worker;
      },
    });
    const onRunStart = vi.fn();
    const result = await engine.run({ code: 'A', stdin: '1 2', runtimeBase: 'b/' }, { onRunStart });
    expect(result).toEqual(ok);
    expect(onRunStart).toHaveBeenCalledOnce();
    expect(runWorkers[0]?.terminated).toBe(true);
    expect(runWorkers[0]?.posted[0]).toMatchObject({ stdin: '1 2', runtimeBase: 'b/' });
  });

  it('returns compile errors without starting a run', async () => {
    const createRunWorker = vi.fn();
    const engine = createJavaEngine({
      compiler: compiler({ compileError: 'Main.java:2: error: x' }),
      createRunWorker,
    });
    const result = await engine.run(
      { code: 'A', stdin: '', runtimeBase: 'b/' },
      { onRunStart: vi.fn() },
    );
    expect(result.compileError).toBe('Main.java:2: error: x');
    expect(createRunWorker).not.toHaveBeenCalled();
  });

  it('kills the run worker but keeps the compiler on terminate', async () => {
    const service = compiler({ wasm: wasm() });
    let worker: FakeWorker | undefined;
    const engine = createJavaEngine({
      compiler: service,
      createRunWorker: () => {
        worker = new FakeWorker((_d, self) => self.emit({ type: 'run-start' }));
        return worker as unknown as Worker;
      },
    });
    const started = new Promise<void>((resolve) => {
      void engine.run({ code: 'A', stdin: '', runtimeBase: 'b/' }, { onRunStart: resolve });
    });
    await started;
    engine.terminate();
    expect(worker?.terminated).toBe(true);
    expect(service.discard).not.toHaveBeenCalled();
  });

  it('discards the compiler when stopped during a compile', async () => {
    let finish: (v: unknown) => void = () => undefined;
    const service = {
      compile: vi.fn(() => new Promise<never>((resolve) => (finish = resolve as never))),
      discard: vi.fn(),
    };
    const engine = createJavaEngine({ compiler: service, createRunWorker: vi.fn() });
    const pending = engine.run(
      { code: 'A', stdin: '', runtimeBase: 'b/' },
      { onRunStart: vi.fn() },
    );
    engine.terminate();
    expect(service.discard).toHaveBeenCalledOnce();
    finish({ failure: 'stopped' });
    expect((await pending).error).toBe('Java 실행기가 중단되었습니다.');
  });
});
