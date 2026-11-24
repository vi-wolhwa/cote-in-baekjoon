/** Solution-mode programs on the real C (bundled clang) engine (tests/helpers/solution-run-shared.ts). */
import { describe, expect, it } from 'vitest';
import {
  buildProgram,
  GLUE_COMPILE_NOTE,
  GLUE_INPUT_MESSAGE,
  mapRunMessages,
} from '@/solution/program';
import { AB, CASES, run, runCases, SORT } from './helpers/solution-run-shared';

runCases(['c']);

describe('errors point at the user code', { timeout: 180_000 }, () => {
  it('C: compile errors point at solution.c, and input mismatches are explained', async () => {
    const broken = buildProgram(
      'c',
      AB,
      '// 주석\nint solution(int a, int b) {\n    return a + c;\n}',
    );
    const r1 = await run('c', broken.source, '1 2\n');
    const m1 = mapRunMessages('cpp', broken, { compileError: r1.compileError, stderr: '' });
    expect(m1.compileError).toMatch(/^solution\.c:3:\d+: error: use of undeclared identifier 'c'/);

    const ok = buildProgram('c', AB, CASES['A+B']?.code.c ?? '');
    const r2 = await run('c', ok.source, '1 x\n');
    expect(r2.exitCode).toBe(1);
    expect(mapRunMessages('cpp', ok, { error: r2.error, stderr: r2.stderr }).error).toBe(
      GLUE_INPUT_MESSAGE,
    );
  });
  it('C: a signature that does not match the format is reported in the glue', async () => {
    const program = buildProgram('c', SORT, 'int solution(int n, int arr[]) {\n    return n;\n}');
    const r = await run('c', program.source, '1\n5\n');
    const mapped = mapRunMessages('cpp', program, { compileError: r.compileError, stderr: '' });
    expect(mapped.compileError).toContain('solution.c(입출력 코드)');
    expect(mapped.compileError).toContain(GLUE_COMPILE_NOTE);
  });
});
