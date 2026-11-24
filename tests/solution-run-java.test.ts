/** Solution-mode programs on the real Java (TeaVM) engine (tests/helpers/solution-run-shared.ts). */
import { describe, expect, it } from 'vitest';
import { buildProgram, mapRunMessages } from '@/solution/program';
import { AB, run, runCases } from './helpers/solution-run-shared';

runCases(['java']);

describe('errors point at the user code', { timeout: 180_000 }, () => {
  it('Java: a wrong return type is reported in the glue with a Korean note', async () => {
    const program = buildProgram(
      'java',
      AB,
      'class Solution {\n    public String solution(int a, int b) {\n        return "x";\n    }\n}',
    );
    const r = await run('java', program.source, '1 2\n');
    const mapped = mapRunMessages('java', program, { compileError: r.compileError, stderr: '' });
    expect(mapped.compileError).toContain('Solution.java(입출력 코드)');
    expect(mapped.compileError).toContain('반환 타입');
  });
});
