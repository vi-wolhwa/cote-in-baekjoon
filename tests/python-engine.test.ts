import { describe, expect, it, vi } from 'vitest';
import type { EngineResult } from '@/runner/engine';
import { createPythonEngine, fatalMessage, type WorkerMessage } from '@/runner/python/engine';

/** Stand-in for the Pyodide worker that answers the engine's messages by script. */
class FakeWorker {
  onmessage: ((event: { data: WorkerMessage }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  sent: { type: string; id?: number; [key: string]: unknown }[] = [];
  terminated = false;

  postMessage(msg: { type: string; id?: number }) {
    this.sent.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: WorkerMessage) {
    this.onmessage?.({ data });
  }
  lastRunId(): number {
    return this.sent.filter((m) => m.type === 'run').at(-1)?.id as number;
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const engine = createPythonEngine({
    outputLimit: 123,
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w as unknown as Worker;
    },
  });
  return { engine, workers };
}

const INPUT = { code: 'print(1)', stdin: '', runtimeBase: 'chrome-extension://id/runtime/' };
const OK: EngineResult = { stdout: '1\n', stderr: '', exitCode: 0, outputLimitExceeded: false };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createPythonEngine', () => {
  it('loads Pyodide from the bundled runtime once and reuses it', async () => {
    const { engine, workers } = setup();
    const onRunStart = vi.fn();
    const first = engine.run(INPUT, { onRunStart });
    const [w] = workers;
    if (!w) throw new Error('no worker');
    expect(w.sent[0]).toMatchObject({
      type: 'init',
      indexURL: 'chrome-extension://id/runtime/pyodide/',
      moduleUrl: 'chrome-extension://id/runtime/pyodide/pyodide.mjs',
    });
    expect(w.sent[0]?.harness).toContain('def _cib_run(');
    // The time limit starts only after loading.
    await flush();
    expect(onRunStart).not.toHaveBeenCalled();

    w.reply({ type: 'ready', loadMs: 1500 });
    await flush();
    expect(onRunStart).toHaveBeenCalledOnce();
    expect(w.sent[1]).toMatchObject({ type: 'run', code: 'print(1)', outputLimit: 123 });
    w.reply({ type: 'result', id: w.lastRunId(), result: OK });
    await expect(first).resolves.toEqual(OK);

    const second = engine.run(INPUT, { onRunStart });
    await flush();
    w.reply({ type: 'result', id: w.lastRunId(), result: OK });
    await expect(second).resolves.toEqual(OK);
    expect(workers).toHaveLength(1);
    expect(onRunStart).toHaveBeenCalledTimes(2);
  });

  it('fails the run when loading fails, and retries with a new worker next time', async () => {
    const { engine, workers } = setup();
    const run = engine.run(INPUT, { onRunStart: () => {} });
    workers[0]?.reply({ type: 'init-error', message: 'boom' });
    await expect(run).rejects.toThrow('boom');
    expect(workers[0]?.terminated).toBe(true);

    void engine.run(INPUT, { onRunStart: () => {} });
    expect(workers).toHaveLength(2);
  });

  it('replaces the worker after the interpreter crashes', async () => {
    const { engine, workers } = setup();
    const run = engine.run(INPUT, { onRunStart: () => {} });
    const w = workers[0] as FakeWorker;
    w.reply({ type: 'ready', loadMs: 1 });
    await flush();
    w.reply({
      type: 'fatal',
      id: w.lastRunId(),
      message: 'RangeError: Maximum call stack size exceeded',
    });
    await expect(run).resolves.toMatchObject({
      stdout: '',
      exitCode: 1,
      error: expect.stringMatching(/^RecursionError/),
    });
    expect(w.terminated).toBe(true);

    void engine.run(INPUT, { onRunStart: () => {} });
    expect(workers).toHaveLength(2);
  });

  it('kills the worker on terminate', async () => {
    const { engine, workers } = setup();
    const run = engine.run(INPUT, { onRunStart: () => {} });
    const w = workers[0] as FakeWorker;
    w.reply({ type: 'ready', loadMs: 1 });
    await flush();
    engine.terminate();
    expect(w.terminated).toBe(true);
    await expect(run).resolves.toMatchObject({ exitCode: 1 });
  });

  it('stops a load that is still in progress on terminate', async () => {
    const { engine, workers } = setup();
    const run = engine.run(INPUT, { onRunStart: () => {} });
    engine.terminate();
    expect(workers[0]?.terminated).toBe(true);
    await expect(run).rejects.toThrow();
  });
});

describe('fatalMessage', () => {
  it('explains a JavaScript stack overflow as a recursion error', () => {
    expect(fatalMessage('RangeError: Maximum call stack size exceeded')).toMatch(
      /^RecursionError: /,
    );
  });

  it('passes other messages through', () => {
    expect(fatalMessage('something else')).toBe('something else');
  });
});
