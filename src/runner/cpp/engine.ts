/** C++ engine (YoWASP clang). Implemented in #51. */
import type { Engine } from '../engine';

export function createCppEngine(): Engine {
  return {
    run: () =>
      Promise.resolve({
        stdout: '',
        stderr: '',
        exitCode: 1,
        error: 'C++ 실행은 준비 중입니다.',
        outputLimitExceeded: false,
      }),
    terminate() {},
  };
}
