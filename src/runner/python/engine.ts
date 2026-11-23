/**
 * Python engine (#50): Pyodide in a classic Blob-URL worker (ADR-0004).
 *
 * The worker stays warm: Pyodide loads once per engine (≈1.5 s) and every run reuses it with
 * fresh globals and streams (see harness.py). The time limit starts after loading. When the
 * sandbox stops a run it calls terminate(), which kills the worker with the program in it.
 */
import type { Engine, EngineResult } from '../engine';
import HARNESS from './harness.py?raw';
import WORKER_SOURCE from './worker.js?raw';

/** Same default as the JavaScript engine: 1,000,000 characters (bytes here) of output. */
export const PYTHON_OUTPUT_LIMIT = 1_000_000;

export interface PythonEngineOptions {
  outputLimit?: number;
  /** Starts a worker from source text. Replaced in tests. */
  createWorker?: (source: string) => Worker;
}

/** Messages the worker sends (see worker.js). */
export type WorkerMessage =
  | { type: 'ready'; loadMs: number }
  | { type: 'init-error'; message: string }
  | { type: 'result'; id: number; result: EngineResult }
  | { type: 'fatal'; id: number; message: string };

export function createPythonEngine(options: PythonEngineOptions = {}): Engine {
  const outputLimit = options.outputLimit ?? PYTHON_OUTPUT_LIMIT;
  const createWorker = options.createWorker ?? blobWorker;
  let worker: Worker | undefined;
  let ready: Promise<void> | undefined;
  /** Fails a load that is still in progress. */
  let abortLoad: ((error: Error) => void) | undefined;
  let nextId = 1;
  const pending = new Map<number, (result: EngineResult) => void>();

  /** Kills the worker; the next run starts a fresh one. Pending runs resolve with `reason`. */
  const stop = (reason: string) => {
    worker?.terminate();
    worker = undefined;
    ready = undefined;
    abortLoad?.(new Error(reason));
    abortLoad = undefined;
    for (const resolve of pending.values()) resolve(failure(reason));
    pending.clear();
  };

  const start = (runtimeBase: string) => {
    const w = createWorker(WORKER_SOURCE);
    worker = w;
    const indexURL = `${runtimeBase}pyodide/`;
    return new Promise<void>((resolve, reject) => {
      abortLoad = reject;
      w.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          abortLoad = undefined;
          resolve();
        } else if (msg.type === 'init-error') {
          stop(`Python 실행 환경을 불러오지 못했습니다. (${msg.message})`);
        } else if (msg.type === 'result') {
          pending.get(msg.id)?.(msg.result);
          pending.delete(msg.id);
        } else if (msg.type === 'fatal') {
          const settle = pending.get(msg.id);
          pending.delete(msg.id);
          stop(msg.message);
          settle?.(failure(fatalMessage(msg.message)));
        }
      };
      w.onerror = (event) => {
        event.preventDefault?.();
        stop(`Python 실행 환경을 불러오지 못했습니다. (${event.message || 'worker error'})`);
      };
      w.postMessage({
        type: 'init',
        moduleUrl: `${indexURL}pyodide.mjs`,
        indexURL,
        harness: HARNESS,
      });
    });
  };

  return {
    async run({ code, stdin, runtimeBase }, { onRunStart }) {
      ready ??= start(runtimeBase);
      await ready;
      const w = worker;
      if (!w) return failure('Python 실행기가 중단되었습니다.');
      const id = nextId++;
      return new Promise<EngineResult>((resolve) => {
        pending.set(id, resolve);
        onRunStart();
        w.postMessage({ type: 'run', id, code, stdin, outputLimit });
      });
    },
    terminate() {
      stop('Python 실행기가 중단되었습니다.');
    },
  };
}

function failure(error: string): EngineResult {
  return { stdout: '', stderr: '', exitCode: 1, error, outputLimitExceeded: false };
}

/** Explains interpreter crashes that are not Python exceptions. */
export function fatalMessage(message: string): string {
  if (/call stack|stack overflow|too much recursion/i.test(message)) {
    return 'RecursionError: 재귀가 너무 깊어 브라우저의 스택 한도를 넘었습니다.';
  }
  return message;
}

function blobWorker(source: string): Worker {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return new Worker(url);
  } finally {
    // The worker has already resolved its script URL.
    URL.revokeObjectURL(url);
  }
}
