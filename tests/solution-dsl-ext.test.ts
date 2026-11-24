/**
 * DSL extensions (ADR-0006): count expressions, blocks of several lines, flow arrays, end
 * conditions ("<0", "<=0", "#*") and raw lines — the checks, the strict reader and writer,
 * sample validation and the parameters `solution` gets.
 */
import { describe, expect, it } from 'vitest';
import { checkFormat, formatToJson, MAX_PARAMS, solutionParams, type Format } from '@/solution/dsl';
import { matchesEnd, parseEnd } from '@/solution/end';
import { readInput, writeInput } from '@/solution/reader';
import { validateFormat } from '@/solution/validate';
import { EXT_CASES } from './native/ext-cases';

const f = (x: unknown): Format => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};
const errors = (x: unknown) => {
  const r = checkFormat(x);
  return r.ok ? '' : r.errors.join('\n');
};

describe('extension cases', () => {
  for (const [name, c] of Object.entries(EXT_CASES)) {
    it(`${name}: the sample validates and round-trips`, () => {
      const v = validateFormat(formatToJson(c.format) && JSON.parse(formatToJson(c.format)), [
        { input: c.input, output: c.output },
      ]);
      expect(v).toEqual({ ok: true, format: c.format });
    });
  }
});

describe('count expressions', () => {
  const base = (len: unknown) => ({
    v: 1,
    params: [
      { name: 'n', type: 'int' },
      { name: 'm', type: 'long' },
      { name: 'arr', type: 'int[]', len },
    ],
    lines: [['n', 'm'], ['arr']],
    cases: null,
    ret: { type: 'int' },
  });

  it('accepts + - * and parentheses over earlier integers', () => {
    for (const len of ['2*n-1', 'n*m-1', '3*n', 'n*n', 'n+m-1', '4*n-8', '2*(n+m)', 'n', 5]) {
      expect(errors(base(len)), String(len)).toBe('');
    }
  });

  it('rejects unknown names, later or non-integer parameters and bad syntax', () => {
    expect(errors(base('2*k'))).toContain("'k'은(는) 없는 파라미터예요");
    expect(errors(base('n/2'))).toContain('읽을 수 없어요');
    expect(errors(base('(n+1'))).toContain('읽을 수 없어요');
    const late = { ...base('n'), lines: [['arr'], ['n', 'm']] };
    expect(errors(late)).toContain('먼저 읽어야 해요');
  });

  it('reads with the computed length; a negative length is an input error', () => {
    const format = f(base('2*n-m'));
    const r = readInput(format, '2 1\n7 8 9\n');
    expect(r.ok && r.cases[0]?.get('arr')).toEqual([7, 8, 9]);
    expect(readInput(format, '1 5\n\n')).toMatchObject({ ok: false });
    expect(writeInput(format, [new Map<string, never>()])).toMatchObject({ ok: false });
  });

  it('allows 16 parameters', () => {
    expect(MAX_PARAMS).toBe(16);
    const params = Array.from({ length: 16 }, (_, i) => ({ name: `p${i}`, type: 'int' }));
    const ok = {
      v: 1,
      params,
      lines: [params.map((p) => p.name)],
      cases: null,
      ret: { type: 'int' },
    };
    expect(errors(ok)).toBe('');
    const many = [...params, { name: 'q', type: 'int' }];
    expect(errors({ ...ok, params: many, lines: [many.map((p) => p.name)] })).toContain('16개');
  });
});

describe('blocks', () => {
  const block = (of: unknown, extra: Record<string, unknown> = { repeat: 'n' }) => ({
    v: 1,
    params: [
      { name: 'n', type: 'int' },
      { name: 'k', type: 'int' },
      { name: 'xs', type: 'int[]', len: 'k' },
    ],
    lines: [['n'], { ...extra, of }],
    cases: null,
    ret: { type: 'int' },
  });

  it('lifts what a block reads one dimension in solution', () => {
    const format = f(block([['k'], ['xs']]));
    expect(solutionParams(format).map((p) => `${p.name}: ${p.type}`)).toEqual([
      'n: int',
      'k: int[]',
      'xs: int[][]',
    ]);
    const r = readInput(format, '2\n2\n5 6\n1\n7\n');
    expect(r.ok && Object.fromEntries(r.cases[0] ?? [])).toEqual({
      n: 2,
      k: [2, 1],
      xs: [[5, 6], [7]],
    });
    if (r.ok) expect(writeInput(format, r.cases)).toEqual({ ok: true, text: '2\n2\n5 6\n1\n7\n' });
  });

  it('checks nesting, 2D arrays, counts and the first line of an until block', () => {
    expect(errors(block([{ repeat: 2, of: [['k']] }, ['xs']]))).toContain('블록 안에 블록');
    const grid = {
      ...block([['k'], { repeat: 'k', of: 'g' }]),
      params: [
        { name: 'n', type: 'int' },
        { name: 'k', type: 'int' },
        { name: 'g', type: 'int[][]' },
      ],
    };
    expect(errors(grid)).toContain('2차원 배열');
    const outside = {
      ...block([['k'], ['xs']]),
      lines: [['n'], { repeat: 'n', of: [['k']] }, ['xs']],
    };
    expect(errors(outside)).toContain('블록 밖에서는 쓸 수 없어요');
    expect(errors(block([['xs'], ['k']], { until: '0' }))).toContain('첫 줄은 배열이 아닌 값');
    expect(errors(block([], { repeat: 1 }))).toContain('읽을 줄이 없어요');
  });

  it('reads blocks up to an end line or the end of input', () => {
    const until = f(block([['k'], ['xs']], { until: '0' }));
    const r = readInput(until, '9\n1\n4\n2\n5 6\n0\n');
    expect(r.ok && r.cases[0]?.get('xs')).toEqual([[4], [5, 6]]);
    expect(readInput(until, '9\n1\n4\n')).toMatchObject({ ok: false });
    const eof = f({
      ...block([['k'], ['xs']]),
      lines: [['n'], { until: 'EOF', of: [['k'], ['xs']] }],
    });
    const e = readInput(eof, '9\n1\n4\n0\n');
    expect(e.ok && e.cases[0]?.get('k')).toEqual([1, 0]);
  });

  it('writes lists of equal length only, and no value that would end the block', () => {
    const until = f(block([['k'], ['xs']], { until: '0' }));
    const values = new Map<string, never>([
      ['n', 1 as never],
      ['k', [0] as never],
      ['xs', [[]] as never],
    ]);
    expect(writeInput(until, [values])).toMatchObject({ ok: false });
    values.set('xs', [[], []] as never);
    expect(writeInput(until, [values])).toMatchObject({
      ok: false,
      error: expect.stringContaining('같아야'),
    });
  });
});

describe('flow arrays', () => {
  const format = {
    v: 1,
    params: [
      { name: 'n', type: 'int' },
      { name: 'arr', type: 'int[]', len: 'n', flow: true },
    ],
    lines: [['n'], ['arr']],
    cases: null,
    ret: { type: 'int' },
  };

  it('reads the elements over several lines and validates against such samples', () => {
    const r = readInput(f(format), '5\n1 2 3\n4\n5\n');
    expect(r.ok && r.cases[0]?.get('arr')).toEqual([1, 2, 3, 4, 5]);
    expect(readInput(f(format), '2\n1\n2 3\n')).toMatchObject({ ok: false });
    expect(validateFormat(format, [{ input: '5\n1 2 3\n4 5\n', output: '1\n' }]).ok).toBe(true);
    const noFlow = {
      ...format,
      params: [format.params[0], { name: 'arr', type: 'int[]', len: 'n' }],
    };
    expect(validateFormat(noFlow, [{ input: '5\n1 2 3\n4 5\n', output: '1\n' }]).ok).toBe(false);
  });

  it('is only for 1D arrays with a length, at the end of their line', () => {
    expect(
      errors({ ...format, params: [format.params[0], { name: 'arr', type: 'int[]', flow: true }] }),
    ).toContain('flow');
    const notLast = {
      ...format,
      params: [...format.params, { name: 'x', type: 'int' }],
      lines: [['n'], ['arr', 'x']],
    };
    expect(errors(notLast)).toContain('줄의 마지막');
  });
});

describe('end conditions', () => {
  it('parses "<0", "<=0" and prefixes; "***" stays an exact line', () => {
    expect(parseEnd('<0')).toEqual({ kind: 'neg', zero: false });
    expect(parseEnd('<=0')).toEqual({ kind: 'neg', zero: true });
    expect(parseEnd('#*')).toEqual({ kind: 'prefix', text: '#' });
    expect(parseEnd('***')).toEqual({ kind: 'line', text: '***' });
    expect(parseEnd('*')).toEqual({ kind: 'line', text: '*' });
    expect(matchesEnd(parseEnd('<0'), '-1 5')).toBe(true);
    expect(matchesEnd(parseEnd('<0'), '0')).toBe(false);
    expect(matchesEnd(parseEnd('<=0'), '0 3')).toBe(true);
    expect(matchesEnd(parseEnd('<=0'), 'x')).toBe(false);
    expect(matchesEnd(parseEnd('#*'), '# end')).toBe(true);
  });

  it('ends cases and repeats, keeping the end lines read for the round trip', () => {
    const format = f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'ws', type: 'string[]' },
      ],
      lines: [['n'], { until: '#*', of: 'ws' }],
      cases: { until: '<0' },
      ret: { type: 'int' },
    });
    const input = '1\na\n#x\n2\n# y\n-5 -5\n';
    const r = readInput(format, input);
    expect(r).toMatchObject({ ok: true, ends: ['#x', '# y', '-5 -5'] });
    if (r.ok) expect(writeInput(format, r.cases, r.ends)).toEqual({ ok: true, text: input });
    if (r.ok)
      expect(writeInput(format, r.cases)).toEqual({ ok: true, text: '1\na\n#\n2\n#\n-1\n' });
  });

  it('rejects an empty end line', () => {
    const format = {
      v: 1,
      params: [{ name: 'n', type: 'int' }],
      lines: [['n']],
      cases: { until: '  ' },
      ret: { type: 'int' },
    };
    expect(errors(format)).toContain('until');
  });
});

describe('raw lines', () => {
  const format = {
    v: 1,
    params: [
      { name: 'n', type: 'int' },
      { name: 'ls', type: 'line[]', raw: true },
    ],
    lines: [['n'], { repeat: 'n', of: 'ls' }],
    cases: null,
    ret: { type: 'int' },
  };

  it('keeps empty lines and outer spaces, and compares blank lines in the round trip', () => {
    const r = readInput(f(format), '3\n\n  a b  \nc\n');
    expect(r.ok && r.cases[0]?.get('ls')).toEqual(['', '  a b  ', 'c']);
    if (r.ok)
      expect(writeInput(f(format), r.cases)).toEqual({ ok: true, text: '3\n\n  a b  \nc\n' });
    expect(validateFormat(format, [{ input: '2\n\nx\n', output: '1\n' }]).ok).toBe(true);
    expect(validateFormat(format, [{ input: '2\nx\n\n', output: '1\n' }]).ok).toBe(true);
    expect(validateFormat(format, [{ input: '1\n\n', output: '1\n' }]).ok).toBe(true);
  });

  it('is only for line and line[]', () => {
    const bad = { ...format, params: [{ name: 'n', type: 'int', raw: true }, format.params[1]] };
    expect(errors(bad)).toContain('raw');
  });
});
