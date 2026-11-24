/** Per-case labels ("Case #1: ") and blank lines after each case (ADR-0006, ret.label/blank). */
import { describe, expect, it } from 'vitest';
import { defaultRet, labelFromText, labelText } from '@/ide/solution/RetOptions';
import { checkFormat, formatToJson, type Format, type RetSpec } from '@/solution/dsl';
import { inferFormat } from '@/solution/infer';
import { labeledOutputs } from '@/solution/infer-ret';
import { formatOutput, parseOutput } from '@/solution/output';
import { setCases, toTable } from '@/solution/table';
import { validateFormat } from '@/solution/validate';

describe('inference', () => {
  const sample = { input: '3\n1 2\n3 4\n5 5\n', output: 'Case #1: 3\nCase #2: 7\nCase #3: 10\n' };

  it('takes a numbered label off every output line', () => {
    expect(labeledOutputs([sample])).toEqual({
      label: 'Case #{i}: ',
      samples: [{ ...sample, output: '3\n7\n10\n' }],
    });
    expect(labeledOutputs([{ input: '', output: 'Case #1: 3\nCase #3: 7\n' }])).toBeUndefined();
    expect(labeledOutputs([{ input: '', output: 'Case #1:\n3\n' }])).toBeUndefined();
  });

  it('infers a format with the label', () => {
    const format = inferFormat({ samples: [sample], inputHtml: '', outputHtml: '' });
    expect(format?.cases).toEqual({ count: expect.any(String) });
    expect(format?.ret).toEqual({ type: 'int', label: 'Case #{i}: ' });
  });
});

describe('format editor', () => {
  it('drops the label (not the blank line) when the input has one case', () => {
    const r = checkFormat({ ...AB, ret: { type: 'int', label: 'Case #{i}: ', blank: true } });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(setCases(toTable(r.format), null).ret).toEqual({ type: 'int', blank: true });
  });

  it('keeps label and blank when the return type changes', () => {
    expect(defaultRet('bool', { type: 'int', label: 'Case #{i}: ', blank: true })).toEqual({
      type: 'bool',
      yes: 'YES',
      no: 'NO',
      label: 'Case #{i}: ',
      blank: true,
    });
  });

  it('shows a trailing newline as \\n', () => {
    expect(labelText('Scenario #{i}:\n')).toBe('Scenario #{i}:\\n');
    expect(labelFromText('Scenario #{i}:\\n')).toBe('Scenario #{i}:\n');
    expect(labelFromText('Case #{i}: ')).toBe('Case #{i}: ');
  });
});

const AB = {
  v: 1,
  params: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'int' },
  ],
  lines: [['a', 'b']],
  cases: { count: 'T' },
  ret: { type: 'int' },
};
const withRet = (ret: Record<string, unknown>, cases: unknown = AB.cases) => ({
  ...AB,
  cases,
  ret: { type: 'int', ...ret },
});
const errors = (x: unknown) => {
  const r = checkFormat(x);
  return r.ok ? [] : r.errors;
};

describe('checkFormat: label and blank', () => {
  it('accepts a label on the answer line or on its own line, and a blank line', () => {
    expect(errors(withRet({ label: 'Case #{i}: ' }))).toEqual([]);
    expect(errors(withRet({ label: 'Scenario #{i}:\n', blank: true }))).toEqual([]);
    expect(errors(withRet({ blank: true }, null))).toEqual([]);
    expect(errors(withRet({ label: '#{i} ' }, { until: 'EOF' }))).toEqual([]);
  });

  it('needs {i} exactly once and no other braces', () => {
    expect(errors(withRet({ label: 'Case #: ' }))[0]).toContain('{i}');
    expect(errors(withRet({ label: '{i}{i}' }))[0]).toContain('{i}');
    expect(errors(withRet({ label: 3 }))[0]).toContain('{i}');
    expect(errors(withRet({ label: '{i} {x}' }))[0]).toContain('중괄호');
  });

  it('allows a newline only at the end, and at most 40 characters', () => {
    expect(errors(withRet({ label: 'Case\n#{i}: ' }))[0]).toContain('맨 끝');
    expect(errors(withRet({ label: 'Case #{i}:\t' }))[0]).toContain('맨 끝');
    expect(errors(withRet({ label: `${'x'.repeat(38)}{i}` }))[0]).toContain('40자');
  });

  it('needs cases for a label, and blank must be true', () => {
    expect(errors(withRet({ label: 'Case #{i}: ' }, null))[0]).toContain('입력 반복');
    expect(errors(withRet({ blank: false }))[0]).toContain('true');
  });

  it('writes label and blank after the other ret keys', () => {
    const r = checkFormat(
      withRet({ blank: true, label: 'Case #{i}: ', type: 'double', digits: 1 }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(formatToJson(r.format)).toContain(
      '"ret":{"type":"double","digits":1,"label":"Case #{i}: ","blank":true}',
    );
  });
});

describe('formatOutput / parseOutput with labels', () => {
  const SAME: RetSpec = { type: 'int', label: 'Case #{i}: ' };
  const OWN: RetSpec = { type: 'int[]', sep: ' ', label: 'Scenario #{i}:\n', blank: true };

  it('prints the label before each case and a blank line after it', () => {
    expect(formatOutput(SAME, [3, 7])).toBe('Case #1: 3\nCase #2: 7\n');
    expect(formatOutput(OWN, [[1, 2], [3]])).toBe('Scenario #1:\n1 2\n\nScenario #2:\n3\n\n');
    expect(formatOutput({ type: 'int', blank: true }, [1, 2])).toBe('1\n\n2\n\n');
  });

  it('reads values back without the labels', () => {
    expect(parseOutput(SAME, 'Case #1: 3\nCase #2: 7\n', 2)).toEqual({ ok: true, values: [3, 7] });
    expect(parseOutput(OWN, 'Scenario #1:\n1 2\n\nScenario #2:\n3 4\n', 2)).toEqual({
      ok: true,
      values: [
        [1, 2],
        [3, 4],
      ],
    });
    // Up to case 10 and beyond: "Case #1: " is not a prefix of "Case #10: ".
    const ten = Array.from({ length: 11 }, (_, k) => `Case #${k + 1}: ${k}`).join('\n');
    expect(parseOutput(SAME, ten, 11)).toMatchObject({ ok: true });
  });

  it('splits multi-line answers by their labels', () => {
    const lines: RetSpec = { type: 'line[]', label: 'Case #{i}:\n' };
    expect(parseOutput(lines, 'Case #1:\na b\nc\nCase #2:\n  d\n', 2)).toEqual({
      ok: true,
      values: [['a b', 'c'], ['  d']],
    });
    const same: RetSpec = { type: 'int[]', sep: '\n', label: 'Case #{i}: ', blank: true };
    expect(parseOutput(same, 'Case #1: 1\n2\n\nCase #2: 3\n', 2)).toEqual({
      ok: true,
      values: [[1, 2], [3]],
    });
    expect(formatOutput(same, [[1, 2], [3]])).toBe('Case #1: 1\n2\n\nCase #2: 3\n\n');
  });

  it('splits multi-line answers by blank lines when there is no label', () => {
    const grid: RetSpec = { type: 'int[][]', blank: true };
    expect(parseOutput(grid, '1 2\n3 4\n\n5\n', 2)).toEqual({
      ok: true,
      values: [
        [
          [1, 2],
          [3, 4],
        ],
        [[5]],
      ],
    });
    expect(parseOutput({ type: 'int', blank: true }, '1\n\n2\n', 2)).toEqual({
      ok: true,
      values: [1, 2],
    });
    expect(parseOutput({ type: 'int', blank: true }, '1\n2\n', 2)).toMatchObject({ ok: false });
  });

  it('rejects a missing or wrong label and a missing blank line', () => {
    expect(parseOutput(SAME, '3\n7\n', 2)).toMatchObject({ ok: false });
    expect(parseOutput(SAME, 'Case #1: 3\nCase #3: 7\n', 2)).toMatchObject({ ok: false });
    expect(parseOutput(OWN, 'Scenario #1:\n1 2\nScenario #2:\n3 4\n', 2)).toMatchObject({
      ok: false,
    });
    expect(parseOutput(SAME, 'Case #1: 3\nCase #2: 7\n8\n', 2)).toMatchObject({ ok: false });
  });

  it('reads one case on its own (a run result)', () => {
    expect(parseOutput(SAME, 'Case #1: 5\n', 1)).toEqual({ ok: true, values: [5] });
    expect(parseOutput(SAME, 'Case #1:\n', 1)).toMatchObject({ ok: false });
  });
});

describe('validateFormat with labels', () => {
  const ok = (format: unknown, input: string, output: string) =>
    validateFormat(format, [{ input, output }]);

  it('round-trips Code Jam style samples', () => {
    const r = ok(withRet({ label: 'Case #{i}: ' }), '2\n1 2\n3 4\n', 'Case #1: 3\nCase #2: 7\n');
    expect(r.ok).toBe(true);
    const scenario = {
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'm', type: 'int' },
      ],
      lines: [['n', 'm']],
      cases: { count: 'T' },
      ret: { type: 'int[]', label: 'Scenario #{i}:\n', blank: true },
    };
    expect(ok(scenario, '2\n1 2\n3 4\n', 'Scenario #1:\n1 2\n\nScenario #2:\n3 4\n').ok).toBe(true);
  });

  it('rejects samples whose labels do not match', () => {
    const r = ok(withRet({ label: 'Case #{i}: ' }), '2\n1 2\n3 4\n', 'Case 1: 3\nCase 2: 7\n');
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.reasons[0]).toContain('예제 1 출력');
  });

  it('keeps label and blank in the checked format', () => {
    const r = checkFormat(withRet({ label: 'Case #{i}: ', blank: true }));
    expect(r.ok && (r.format as Format).ret).toEqual({
      type: 'int',
      label: 'Case #{i}: ',
      blank: true,
    });
  });
});
