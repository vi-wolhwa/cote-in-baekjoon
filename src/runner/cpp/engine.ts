/**
 * C++ engine (YoWASP clang, #51): one worker per engine compiles the solution and runs it.
 * The worker keeps the compiler loaded between runs; `terminate()` kills it, which stops a
 * running program as well as a compile in progress (ADR-0004).
 */
import CppWorker from './worker?worker&inline';
import type { Engine, EngineResult } from '../engine';
import type { CppWorkerMessage, CppWorkerRequest } from './worker';

export function createCppEngine(): Engine {
  let worker: Worker | undefined;
  return {
    run({ code, stdin, runtimeBase, build }, { onRunStart }) {
      return new Promise<EngineResult>((resolve) => {
        const w = (worker ??= new CppWorker());
        w.onmessage = (event: MessageEvent<CppWorkerMessage>) => {
          // Compile time is not part of the time limit: the clock starts here.
          if (event.data.type === 'run-start') onRunStart();
          else resolve(event.data.result);
        };
        w.onerror = (event) => {
          // A broken worker is not reused.
          w.terminate();
          if (worker === w) worker = undefined;
          resolve({
            stdout: '',
            stderr: '',
            exitCode: 1,
            error: event.message || 'Worker error',
            outputLimitExceeded: false,
          });
        };
        const request: CppWorkerRequest = { code, stdin, runtimeBase };
        if (build?.kind === 'clang') request.options = { lang: build.lang, std: build.std };
        w.postMessage(request);
      });
    },
    terminate() {
      worker?.terminate();
      worker = undefined;
    },
  };
}
