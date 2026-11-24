/** Solution-mode programs on the real Python (Pyodide) engine (tests/helpers/solution-run-shared.ts). */
import { describe, expect, it } from 'vitest';
import { buildProgram, mapRunMessages, NO_SOLUTION_MESSAGE } from '@/solution/program';
import { AB, run, runCases } from './helpers/solution-run-shared';

runCases(['python']);

describe('errors point at the user code', { timeout: 180_000 }, () => {
  it('Python: no solution function, and a traceback line in the user code', async () => {
    const missing = buildProgram('python', AB, 'def solve(a, b):\n    return a + b');
    const r1 = await run('python', missing.source, '1 2\n');
    expect(mapRunMessages('python', missing, { error: r1.error, stderr: r1.stderr }).error).toBe(
      NO_SOLUTION_MESSAGE,
    );

    const broken = buildProgram('python', AB, '# 주석\ndef solution(a, b):\n    return a // 0');
    const r2 = await run('python', broken.source, '1 2\n');
    const mapped = mapRunMessages('python', broken, { error: r2.error, stderr: r2.stderr });
    expect(mapped.stderr).toContain('File "solution.py", line 3, in solution');
    expect(mapped.stderr).toContain('(입출력 코드)');
  });
});
