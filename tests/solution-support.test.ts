/**
 * Everything around the solution-function core: test case rows (#36), where a format comes
 * from, backups and exam answers. The format editor's table model is in solution-table.test.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Problem } from '@/boj/problem';
import { saveAnswer, answerDiffers } from '@/exam/batch';
import { isAnswer } from '@/exam/answers';
import { emptyRow, rowToSample, sampleToRow, RET_CELL } from '@/solution/cases';
import { checkFormat, type Format } from '@/solution/dsl';
import { clearBundledCache, loadBundledFormat, pickBundled, shardPath } from '@/solution/bundled';
import { EXCLUDED_REASON, resolveFormat, UNKNOWN_REASON } from '@/solution/source';

const f = (x: unknown): Format => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};

const ARRAY = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'arr', type: 'int[]', len: 'n' },
  ],
  lines: [['n'], ['arr']],
  cases: { count: 'T' },
  ret: { type: 'int[]', sep: ' ' },
});

// A problem number with no bundled format, so the inference step is reached.
const AB_PROBLEM: Pick<Problem, 'id' | 'samples' | 'labels' | 'sections'> = {
  id: 9_999_999,
  samples: [
    { input: '1 2\n', output: '3\n' },
    { input: '5 4\n', output: '9\n' },
  ],
  labels: [],
  sections: {
    description: '',
    input: '<p>첫째 줄에 A와 B가 주어진다.</p>',
    output: '<p>A+B를 출력한다.</p>',
  },
};

const AB_JSON = {
  v: 1,
  params: [
    { name: 'x', type: 'int' },
    { name: 'y', type: 'int' },
  ],
  lines: [['x', 'y']],
  cases: null,
  ret: { type: 'long' },
};

describe('test case rows', () => {
  it('turns parameter literals into standard input/output', () => {
    const r = rowToSample(ARRAY, { params: { n: '3', arr: '[3, 1, 2]' }, expected: '[1, 2, 3]' });
    expect(r).toEqual({ ok: true, sample: { input: '1\n3\n3 1 2\n', output: '1 2 3\n' } });
  });

  it('reports errors per cell and for the row', () => {
    expect(rowToSample(ARRAY, { params: { n: '"3"', arr: '' }, expected: '' })).toEqual({
      ok: false,
      errors: {
        cells: {
          n: '정수가 필요해요',
          arr: '값을 적어 주세요',
          [RET_CELL]: '기댓값을 적어 주세요',
        },
      },
    });
    expect(rowToSample(ARRAY, { params: { n: '2', arr: '[1, 2, 3]' }, expected: '[1]' })).toEqual({
      ok: false,
      errors: { cells: {}, row: "'arr'의 길이가 3이에요. n = 2과(와) 같아야 해요" },
    });
  });

  it('reads a stored case back as a row, when it is one case of the format', () => {
    expect(sampleToRow(ARRAY, { input: '1\n3\n3 1 2\n', output: '1 2 3\n' })).toEqual({
      params: { n: '3', arr: '[3, 1, 2]' },
      expected: '[1, 2, 3]',
    });
    expect(sampleToRow(ARRAY, { input: '2\n1\n5\n1\n6\n', output: '5\n6\n' })).toBeUndefined();
    expect(emptyRow(ARRAY)).toEqual({ params: { n: '', arr: '' }, expected: '' });
  });
});

describe('resolveFormat', () => {
  it('prefers the saved format, then bundled data, then inference', () => {
    expect(resolveFormat(AB_PROBLEM, AB_JSON)).toMatchObject({ source: 'user' });
    const bundled = f({
      ...AB_JSON,
      params: [
        { name: 'p', type: 'int' },
        { name: 'q', type: 'int' },
      ],
      lines: [['p', 'q']],
    });
    expect(resolveFormat(AB_PROBLEM, undefined, bundled)).toMatchObject({
      source: 'bundled',
      format: bundled,
    });
    const inferred = resolveFormat(AB_PROBLEM, undefined);
    expect(inferred.source).toBe('inferred');
    expect(inferred.format?.params.map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('uses the bundled format data when there is no saved format', async () => {
    clearBundledCache();
    const fromPackage = (path: string) =>
      Promise.resolve(JSON.parse(readFileSync(`public/${path}`, 'utf8')) as unknown);
    const bundled = await loadBundledFormat(1000, fromPackage);
    expect(resolveFormat({ ...AB_PROBLEM, id: 1000 }, undefined, bundled)).toMatchObject({
      source: 'bundled',
      format: { params: [{ name: 'a' }, { name: 'b' }] },
    });
  });

  it('skips a saved format that no longer passes the samples, and says why', () => {
    const r = resolveFormat(AB_PROBLEM, { ...AB_JSON, ret: { type: 'bool', yes: 'Y', no: 'N' } });
    expect(r.source).toBe('inferred');
    expect(r.savedInvalid?.[0]).toContain('예제 1 출력');
  });

  it('never uses a format for interactive or function problems, or without one', () => {
    expect(resolveFormat({ ...AB_PROBLEM, labels: ['interactive'] }, AB_JSON)).toEqual({
      reason: EXCLUDED_REASON,
    });
    expect(
      resolveFormat(
        { ...AB_PROBLEM, samples: [{ input: '2\nkim 9\nlee 8\n', output: 'kim\n' }] },
        undefined,
      ),
    ).toEqual({ reason: UNKNOWN_REASON });
  });

  it('takes one entry from a shard, dropping invalid ones', () => {
    const shard = { v: 1, formats: { '1000': AB_JSON, '1001': { v: 2 } } };
    expect(pickBundled(shard, 1000)?.params.map((p) => p.name)).toEqual(['x', 'y']);
    expect(pickBundled(shard, 1001)).toBeUndefined();
    expect(pickBundled(shard, 1002)).toBeUndefined();
    expect(pickBundled({ v: 2, formats: { '1000': AB_JSON } }, 1000)).toBeUndefined();
  });

  it('reads only the shard holding the problem, once per page', async () => {
    clearBundledCache();
    const read: string[] = [];
    const reader = (path: string) => {
      read.push(path);
      return Promise.resolve(
        path === shardPath(1) ? { v: 1, formats: { '1000': AB_JSON } } : undefined,
      );
    };
    expect(await loadBundledFormat(1000, reader)).toBeDefined();
    expect(await loadBundledFormat(1999, reader)).toBeUndefined();
    expect(await loadBundledFormat(20000, reader)).toBeUndefined();
    expect(await loadBundledFormat(0, reader)).toBeUndefined();
    expect(read).toEqual(['formats/1.json', 'formats/20.json']);
    const failing = () => Promise.reject(new Error('network'));
    clearBundledCache();
    expect(await loadBundledFormat(1000, failing)).toBeUndefined();
  });
});

describe('storage', () => {
  it('checks stored formats', () => {
    expect(checkFormat(AB_JSON).ok).toBe(true);
    expect(checkFormat({ v: 1, params: [] }).ok).toBe(false);
  });
});

describe('exam answers in solution mode', () => {
  const exam = {
    id: 'e1',
    startedAt: 1,
    durationMs: 3_600_000,
    tiers: [],
    tags: [],
    problems: [{ id: 1000, title: 't', level: 1 }],
  } as unknown as Parameters<typeof saveAnswer>[0];

  it('keeps the submitted program and the function, and compares by the function', () => {
    const saved = saveAnswer(
      exam,
      1000,
      'def solution(a, b): ...\n# glue',
      'python3',
      10,
      'def solution(a, b): ...',
    );
    const answer = saved.answers?.[1000];
    expect(answer).toMatchObject({
      code: 'def solution(a, b): ...\n# glue',
      solution: 'def solution(a, b): ...',
    });
    expect(isAnswer(answer)).toBe(true);
    expect(answerDiffers(answer, 'def solution(a, b): ...', 'python3', true)).toBe(false);
    expect(answerDiffers(answer, 'def solution(a, b): ...', 'python3', false)).toBe(true);
    expect(answerDiffers(answer, 'changed', 'python3', true)).toBe(true);
  });
});
