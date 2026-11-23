/** JavaScript engine: a fresh Blob-URL worker per run (ADR-0004). */
import JsWorker from './worker?worker&inline';
import type { Engine, EngineResult } from '../engine';

export function createJsEngine(): Engine {
  let worker: Worker | undefined;
  return {
    run({ code, stdin }, { onRunStart }) {
      return new Promise<EngineResult>((resolve) => {
        const w = new JsWorker();
        worker = w;
        w.onmessage = (event: MessageEvent<EngineResult>) => {
          w.terminate();
          resolve(event.data);
        };
        w.onerror = (event) => {
          w.terminate();
          resolve({
            stdout: '',
            stderr: '',
            exitCode: 1,
            error: event.message || 'Worker error',
            outputLimitExceeded: false,
          });
        };
        onRunStart();
        w.postMessage({ code, stdin });
      });
    },
    terminate() {
      worker?.terminate();
    },
  };
}
