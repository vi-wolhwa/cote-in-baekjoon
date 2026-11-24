/**
 * The format editor's table model (#114): every DSL v1 format round-trips through the table,
 * rows can be added, removed, moved and renamed, and the read options follow the type.
 * Also the '형식 오류 신고' issue link.
 */
import { describe, expect, it } from 'vitest';
import bundledData from '@/data/formats.json';
import { checkFormat, formatToJson, sameFormat, type Format } from '@/solution/dsl';
import { signature } from '@/solution/edit';
import { parseBundled } from '@/solution/source';
import {
  addRow,
  casesFor,
  fromTable,
  modeOptions,
  moveRow,
  removeRow,
  renameRow,
  rowPositions,
  setRow,
  tableErrors,
  toTable,
} from '@/solution/table';
import { issueUrl } from '@/shared/report';

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

const GRID = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'm', type: 'int' },
    { name: 'g', type: 'char[][]', cols: 'm' },
    { name: 'k', type: 'int' },
  ],
  lines: [['n', 'm'], { repeat: 'n', of: 'g' }, ['k']],
  cases: null,
  ret: { type: 'int' },
});

const back = (format: Format) => f(fromTable(toTable(format)));

describe('table model', () => {
  it('round-trips every bundled format', () => {
    const all = [...parseBundled(bundledData).values()];
    expect(all.length).toBeGreaterThan(800);
    for (const format of all) expect(formatToJson(back(format))).toBe(formatToJson(format));
  });

  it('turns lines into rows read on a new line, the same line or several lines', () => {
    expect(toTable(GRID).rows).toEqual([
      { name: 'n', type: 'int', mode: 'new', count: '', cols: '' },
      { name: 'm', type: 'int', mode: 'same', count: '', cols: '' },
      { name: 'g', type: 'char[][]', mode: 'repeat', count: 'n', cols: 'm' },
      { name: 'k', type: 'int', mode: 'new', count: '', cols: '' },
    ]);
    expect(rowPositions(toTable(GRID))).toEqual([
      '1번째 줄',
      '1번째 줄',
      '2번째 줄부터 n줄',
      '그다음 줄',
    ]);
    expect(rowPositions(toTable(ARRAY))).toEqual(['2번째 줄', '3번째 줄']);
  });

  it('adds, removes and moves parameters', () => {
    let t = addRow(toTable(ARRAY));
    expect(t.rows[2]).toEqual({ name: 'm', type: 'int', mode: 'new', count: '', cols: '' });
    t = moveRow(t, 2, -1);
    expect(t.rows.map((r) => r.name)).toEqual(['n', 'm', 'arr']);
    t = removeRow(t, 1);
    expect(sameFormat(f(fromTable(t)), ARRAY)).toBe(true);
    // The last parameter cannot be removed.
    expect(removeRow(removeRow(t, 1), 0).rows).toHaveLength(1);
  });

  it('renames a parameter with the counts that refer to it', () => {
    const t = renameRow(toTable(ARRAY), 0, 'size');
    expect(signature(f(fromTable(t)))).toBe('solution(size: int, arr: int[]) → int[]');
    expect(t.rows[1]?.count).toBe('size');
    expect(renameRow(toTable(GRID), 0, 'rows').rows[2]).toMatchObject({ count: 'rows', cols: 'm' });
  });

  it('offers only the read options a type allows and fixes the mode on a type change', () => {
    const t = toTable(GRID);
    expect(modeOptions(t, 0)).toEqual(['new']);
    expect(modeOptions(t, 1)).toEqual(['new', 'same']);
    expect(modeOptions(t, 2)).toEqual(['repeat']);
    // After a repeat row, the next one starts a new line.
    expect(modeOptions(t, 3)).toEqual(['new']);
    const asArray = setRow(t, 1, { type: 'int[]' });
    expect(modeOptions(asArray, 1)).toEqual(['new', 'same', 'repeat']);
    const scalar = setRow(t, 2, { type: 'int' });
    expect(scalar.rows[2]).toMatchObject({ mode: 'new', count: '', cols: '' });
    const line = setRow(t, 1, { type: 'line' });
    expect(line.rows[1]?.mode).toBe('new');
  });

  it('names missing names and counts before checking the format', () => {
    let t = setRow(toTable(GRID), 2, { count: '' });
    t = renameRow(t, 3, ' ');
    expect(tableErrors(t)).toEqual([
      "'g'을(를) 몇 줄에 걸쳐 읽는지 적어 주세요.",
      '4번째 매개변수의 이름을 적어 주세요.',
    ]);
    expect(tableErrors(toTable(GRID))).toEqual([]);
  });

  it('switches between case loops', () => {
    expect(casesFor('count', null)).toEqual({ count: 'T' });
    expect(casesFor('count', { count: 'Q' })).toEqual({ count: 'Q' });
    expect(casesFor('eof', null)).toEqual({ until: 'EOF' });
    expect(casesFor('until', { until: 'EOF' })).toEqual({ until: '0' });
    expect(casesFor('until', { until: '0 0' })).toEqual({ until: '0 0' });
    expect(casesFor('once', { until: 'EOF' })).toBeNull();
  });
});

describe('format report link', () => {
  it('fills the problem, the format and its source, never a "format" parameter', () => {
    const url = new URL(
      issueUrl('format', {
        version: '0.6.0',
        browser: 'Chrome 131',
        problemId: 1000,
        format: formatToJson(ARRAY, true),
        formatSource: '예제로 추론함',
      }),
    );
    expect(url.pathname).toBe('/vi-wolhwa/cote-in-baekjoon/issues/new');
    expect(url.searchParams.get('template')).toBe('4-format.yml');
    expect(url.searchParams.get('problem')).toBe('1000');
    expect(url.searchParams.get('source')).toBe('예제로 추론함');
    expect(url.searchParams.get('version')).toBe('0.6.0 / Chrome 131');
    expect(f(JSON.parse(url.searchParams.get('io_format') ?? ''))).toEqual(ARRAY);
    // GitHub answers 406 Not Acceptable to a "format" query parameter.
    expect(url.searchParams.has('format')).toBe(false);
  });
});
