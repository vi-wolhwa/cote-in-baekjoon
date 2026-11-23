/** Python engine (Pyodide). Implemented in #50. */
import type { Engine } from '../engine';

export function createPythonEngine(): Engine {
  return {
    run: () =>
      Promise.resolve({
        stdout: '',
        stderr: '',
        exitCode: 1,
        error: 'Python 실행은 준비 중입니다.',
        outputLimitExceeded: false,
      }),
    terminate() {},
  };
}
