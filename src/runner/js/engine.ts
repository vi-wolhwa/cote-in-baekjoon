/**
 * JavaScript engine: a fresh Blob-URL worker per run (ADR-0004). TypeScript runs here too,
 * after its types are stripped (ADR-0007).
 */
import JsWorker from './worker?worker&inline';
import type { Engine, EngineResult } from '../engine';
import { stripTypes } from './typescript';

export function createJsEngine(): Engine {
  let worker: Worker | undefined;
  return {
    async run({ code, stdin, build }, { onRunStart }) {
      let source = code;
      if (build?.kind === 'typescript') {
        const stripped = stripTypes(code);
        if ('compileError' in stripped) {
          const { compileError } = stripped;
          return { stdout: '', stderr: '', exitCode: 1, outputLimitExceeded: false, compileError };
        }
        source = stripped.code;
      }
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
        w.postMessage({ code: source, stdin });
      });
    },
    terminate() {
      worker?.terminate();
    },
  };
}
