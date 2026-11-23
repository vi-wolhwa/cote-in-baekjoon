/**
 * Java engine (#63): teavm-javac in a compile worker, the program in a run worker (ADR-0004).
 *
 * - The compile worker is shared by all Java engines and survives `terminate()` (a run
 *   timeout), so the next run does not reload the compiler. It is dropped only when a compile
 *   is cut short, crashes or hangs; a crash or hang is retried once with a fresh worker.
 * - Each run gets a fresh run worker; `terminate()` kills it with the program in it.
 * - The last compiled program is kept, so the next sample case skips compiling.
 */
import type { Engine, EngineResult } from '../engine';
import type { CompileOutcome, JavaCompileRequest, JavaCompileResponse } from './compile-worker';
import CompileWorker from './compile-worker?worker&inline';
import type { JavaRunMessage, JavaRunRequest } from './run-worker';
import RunWorker from './run-worker?worker&inline';

/** A compile (javac + TeaVM) normally takes 0.2–1.5 s; a hang is cut well before the 60 s budget. */
export const COMPILE_TIMEOUT_MS = 25_000;

export interface CompileService {
  compile(code: string, runtimeBase: string): Promise<CompileOutcome>;
  /** Kills the compile worker (pending compiles fail); the next compile starts a new one. */
  discard(reason: string): void;
}

export function createCompileService(
  createWorker: () => Worker = () => new CompileWorker(),
  timeoutMs = COMPILE_TIMEOUT_MS,
): CompileService {
  let worker: Worker | undefined;
  let nextId = 1;
  const pending = new Map<number, (outcome: CompileOutcome | { crash: string }) => void>();
  let last: { code: string; outcome: CompileOutcome } | undefined;

  /** Kills the worker. Pending compiles are retried after a crash, not after a discard. */
  const kill = (outcome: { crash: string } | { failure: string }) => {
    worker?.terminate();
    worker = undefined;
    for (const settle of pending.values()) settle(outcome);
    pending.clear();
  };

  const start = () => {
    const w = createWorker();
    w.onmessage = (event: MessageEvent<JavaCompileResponse>) => {
      const { id, ...outcome } = event.data;
      pending.get(id)?.(outcome as CompileOutcome);
      pending.delete(id);
    };
    w.onerror = (event) => {
      // An asynchronous crash inside the compiler: the worker is not reused.
      event.preventDefault?.();
      kill({ crash: event.message || 'Java 컴파일러가 비정상 종료되었습니다.' });
    };
    return w;
  };

  const compileOnce = (code: string, runtimeBase: string) => {
    const w = (worker ??= start());
    const id = nextId++;
    return new Promise<CompileOutcome | { crash: string }>((resolve) => {
      const timer = setTimeout(
        () => kill({ crash: 'Java 컴파일이 너무 오래 걸려 중단했습니다.' }),
        timeoutMs,
      );
      pending.set(id, (outcome) => {
        clearTimeout(timer);
        resolve(outcome);
      });
      const request: JavaCompileRequest = { id, code, runtimeBase };
      w.postMessage(request);
    });
  };

  return {
    async compile(code, runtimeBase) {
      if (last?.code === code) return last.outcome;
      let outcome = await compileOnce(code, runtimeBase);
      if ('crash' in outcome) outcome = await compileOnce(code, runtimeBase);
      if ('crash' in outcome) return { failure: outcome.crash };
      if (!('failure' in outcome)) last = { code, outcome };
      return outcome;
    },
    discard(reason) {
      kill({ failure: reason });
    },
  };
}

/** Shared by every Java engine the sandbox creates. */
let sharedCompiler: CompileService | undefined;

export interface JavaEngineOptions {
  compiler?: CompileService;
  createRunWorker?: () => Worker;
  outputLimit?: number;
}

export function createJavaEngine(options: JavaEngineOptions = {}): Engine {
  const compiler = options.compiler ?? (sharedCompiler ??= createCompileService());
  const createRunWorker = options.createRunWorker ?? (() => new RunWorker());
  let runWorker: Worker | undefined;
  let compiling = false;
  let stopped = false;

  return {
    async run({ code, stdin, runtimeBase }, { onRunStart }) {
      compiling = true;
      const outcome = await compiler.compile(code, runtimeBase);
      compiling = false;
      if (stopped) return failure('Java 실행기가 중단되었습니다.');
      if ('compileError' in outcome) {
        const { compileError } = outcome;
        return { stdout: '', stderr: '', exitCode: 1, outputLimitExceeded: false, compileError };
      }
      if ('failure' in outcome) return failure(outcome.failure);
      const { wasm } = outcome;

      return new Promise<EngineResult>((resolve) => {
        const w = createRunWorker();
        runWorker = w;
        const done = (result: EngineResult) => {
          w.terminate();
          if (runWorker === w) runWorker = undefined;
          resolve(result);
        };
        w.onmessage = (event: MessageEvent<JavaRunMessage>) => {
          // Compile time is not part of the time limit: the clock starts here.
          if (event.data.type === 'run-start') onRunStart();
          else done(event.data.result);
        };
        w.onerror = (event) => {
          event.preventDefault?.();
          done(failure(event.message || 'Worker error'));
        };
        // A copy: the cached program stays usable for the next run.
        const request: JavaRunRequest = {
          wasm: wasm.slice(),
          stdin,
          runtimeBase,
          outputLimit: options.outputLimit,
        };
        w.postMessage(request, [request.wasm.buffer]);
      });
    },
    terminate() {
      stopped = true;
      runWorker?.terminate();
      runWorker = undefined;
      // A compile cut short leaves the compiler in an unknown state.
      if (compiling) compiler.discard('Java 실행기가 중단되었습니다.');
    },
  };
}

function failure(error: string): EngineResult {
  return { stdout: '', stderr: '', exitCode: 1, error, outputLimitExceeded: false };
}
