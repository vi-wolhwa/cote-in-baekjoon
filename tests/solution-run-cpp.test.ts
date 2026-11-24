/** Solution-mode programs on the real C++ (bundled clang) engine (tests/helpers/solution-run-shared.ts). */
import { describe, expect, it } from 'vitest';
import { buildProgram, mapRunMessages } from '@/solution/program';
import { AB, run, runCases } from './helpers/solution-run-shared';

runCases(['cpp'], { index: 0, of: 2 });

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
