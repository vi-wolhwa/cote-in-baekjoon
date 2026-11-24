/**
 * Format inference on the synthetic sets (tests/fixtures/infer-set.ts). "Structure" ignores
 * parameter names (types, lines, counts, cases, return); "exact" compares the whole format.
 * The tuning set must match exactly; the held-out set (not used for tuning) must match in
 * structure. The per-set table is printed so changes in accuracy show up in the test log.
 */
import { describe, expect, it } from 'vitest';
import { checkFormat, formatToJson, type Format } from '@/solution/dsl';
import { inferCandidates, inferFormat } from '@/solution/infer';
import { htmlToText, maxBound, scalarNames, sentenceLine } from '@/solution/infer-text';
import { HOLDOUT_SET, INFER_SET, type InferProblem } from './fixtures/infer-set';

/** The format with parameters renamed p0, p1, … in order, so only the structure is compared. */
function structure(format: Format): string {
  const names = new Map(format.params.map((p, i) => [p.name, `p${i}`]));
  const rename = (c: string | number) =>
    typeof c === 'number' ? c : c.replace(/^[a-z_]\w*/, (m) => names.get(m) ?? m);
  const cases = format.cases && 'count' in format.cases ? { count: 'T' } : format.cases;
  return formatToJson({
    ...format,
    cases,
    params: format.params.map((p, i) => ({
      ...p,
      name: `p${i}`,
      ...(p.len !== undefined ? { len: rename(p.len) } : {}),
      ...(p.cols !== undefined ? { cols: rename(p.cols) } : {}),
    })),
    lines: format.lines.map((l) =>
      Array.isArray(l)
        ? l.map((n) => names.get(n) as string)
        : { repeat: rename(l.repeat), of: names.get(l.of) as string },
    ),
  });
}

function expected(value: unknown): Format {
  const r = checkFormat(value);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
}

describe('text hints', () => {
  it('reads TeX and HTML into plain text', () => {
    expect(htmlToText('<p>\\(1 \\le N \\le 10^{5}\\)</p>')).toContain('1 ≤ N ≤ 10^5');
    expect(htmlToText('10<sup>18</sup>')).toBe('10^18');
  });
  it('finds lines, variables and bounds', () => {
    expect(sentenceLine('둘째 줄부터 N개의 줄에')).toBe(2);
    expect(sentenceLine('세 번째 줄에는')).toBe(3);
    expect(scalarNames('첫째 줄에 N과 M이 주어진다. A_1, A_2, …, A_N')).toEqual(['N', 'M']);
    expect(maxBound('1 ≤ N ≤ 100,000, A_i ≤ 10^18')).toBe(1e18);
  });
});

interface Row {
  set: string;
  category: string;
  structure: boolean;
  exact: boolean;
}
const rows: Row[] = [];

function check(set: string, problem: InferProblem, exact: boolean) {
  it(`${problem.category}: ${problem.name}`, () => {
    const got = inferFormat({
      samples: problem.samples,
      inputHtml: problem.input,
      outputHtml: problem.output,
    });
    const want = problem.expect === null ? undefined : expected(problem.expect);
    const same = (f: (x: Format) => string) => (got && want ? f(got) === f(want) : got === want);
    rows.push({
      set,
      category: problem.category,
      structure: same(structure),
      exact: same((x) => formatToJson(x)),
    });
    if (exact) expect(got && formatToJson(got)).toBe(want && formatToJson(want));
    else expect(got && structure(got)).toBe(want && structure(want));
  });
}

describe('inferFormat on the tuning set (exact)', () => {
  for (const problem of INFER_SET) check('조정용', problem, true);
});

describe('inferFormat on the held-out set (structure)', () => {
  for (const problem of HOLDOUT_SET) check('검증용', problem, false);
});

describe('accuracy', () => {
  it('prints a table per set and category', () => {
    const table = [
      '| 세트 | 유형 | 문제 | 구조 일치 | 이름까지 일치 |',
      '| --- | --- | --- | --- | --- |',
    ];
    const count = (rs: Row[], key: 'structure' | 'exact') => rs.filter((r) => r[key]).length;
    for (const set of [...new Set(rows.map((r) => r.set))]) {
      const inSet = rows.filter((r) => r.set === set);
      for (const category of [...new Set(inSet.map((r) => r.category))]) {
        const rs = inSet.filter((r) => r.category === category);
        table.push(
          `| ${set} | ${category} | ${rs.length} | ${count(rs, 'structure')} | ${count(rs, 'exact')} |`,
        );
      }
      table.push(
        `| ${set} | 합계 | ${inSet.length} | ${count(inSet, 'structure')} | ${count(inSet, 'exact')} |`,
      );
    }
    console.log(table.join('\n'));
    expect(rows.length).toBe(INFER_SET.length + HOLDOUT_SET.length);
  });

  it('stays fast on big samples', () => {
    const grid = Array.from({ length: 300 }, (_, i) =>
      Array.from({ length: 300 }, (_, j) => (i * j) % 10).join(' '),
    );
    const edges = Array.from({ length: 2000 }, (_, i) => `${i + 1} ${i + 2}`);
    for (const input of [`300 300\n${grid.join('\n')}\n`, `2001 2000\n${edges.join('\n')}\n`]) {
      const started = performance.now();
      const f = inferFormat({ samples: [{ input, output: '1\n' }], inputHtml: '', outputHtml: '' });
      expect(f).toBeDefined();
      expect(performance.now() - started).toBeLessThan(3000);
    }
  });
});

describe('inference limits', () => {
  it('returns nothing without samples, and for input it cannot read', () => {
    expect(inferFormat({ samples: [], inputHtml: '', outputHtml: '' })).toBeUndefined();
    expect(
      inferFormat({
        // Name-and-score rows: no DSL v1 type holds a string and a number per row.
        samples: [
          { input: '2\nkim 90\nlee 85\n', output: 'kim\n' },
          { input: '3\nan 1\nbo 2\ncy 3\n', output: 'cy\n' },
        ],
        inputHtml: '',
        outputHtml: '',
      }),
    ).toBeUndefined();
  });

  it('only returns candidates that pass sample validation, best first', () => {
    const problem = INFER_SET[5];
    if (!problem) throw new Error('missing');
    const all = inferCandidates({
      samples: problem.samples,
      inputHtml: problem.input,
      outputHtml: problem.output,
    });
    expect(all.length).toBeGreaterThan(1);
    expect(all[0]?.score).toBeGreaterThanOrEqual(all[1]?.score ?? 0);
  });
});
