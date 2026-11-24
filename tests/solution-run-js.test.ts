/** Solution-mode programs on the real JavaScript engine (tests/helpers/solution-run-shared.ts). */
import { describe, expect, it } from 'vitest';
import { buildProgram, GLUE_INPUT_MESSAGE, mapRunMessages } from '@/solution/program';
import { AB, CASES, run, runCases } from './helpers/solution-run-shared';

runCases(['js']);

describe('errors point at the user code', { timeout: 180_000 }, () => {
  it('JavaScript: input that does not match the format', async () => {
    const program = buildProgram('js', AB, CASES['A+B']?.code.js ?? '');
    const r = await run('js', program.source, '1\n');
    expect(mapRunMessages('js', program, { error: r.error, stderr: r.stderr }).error).toBe(
      GLUE_INPUT_MESSAGE,
    );
  });
});
