/**
 * Solution-mode programs on the browser's C++ engine (bundled clang + WASI). The glue of every
 * shared case is checked on g++ as Baekjoon compiles it (tests/native/cpp.test.ts); here run
 * only the cases where clang/wasm32 differs: `long` is 32-bit there, nested vectors go through
 * libc++, and compile errors are mapped to the user's lines.
 */
import { describe, expect, it } from 'vitest';
import { buildProgram, mapRunMessages } from '@/solution/program';
import { AB, run, runCases } from './helpers/solution-run-shared';

runCases(['cpp'], undefined, ['cases until EOF with long values', 'a 2D array in and out']);

describe('errors point at the user code', { timeout: 180_000 }, () => {
  it('C++: a compile error is reported at the line the user wrote', async () => {
    const program = buildProgram('cpp', AB, 'int solution(int a, int b) {\n    return a + c;\n}');
    const r = await run('cpp', program.source, '1 2\n');
    const mapped = mapRunMessages('cpp', program, { compileError: r.compileError, stderr: '' });
    expect(mapped.compileError).toMatch(
      /^solution\.cpp:2:\d+: error: use of undeclared identifier 'c'/,
    );
  });
});
