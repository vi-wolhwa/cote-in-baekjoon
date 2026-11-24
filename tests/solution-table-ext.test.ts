/**
 * The format editor's table model with the DSL extensions: flow arrays and raw lines as row
 * options, blocks as groups of rows that round-trip (their rows are edited like others; the
 * block itself only by its count or end line).
 */
import { describe, expect, it } from 'vitest';
import { checkFormat, formatToJson, type Format } from '@/solution/dsl';
import {
  fromTable,
  modeOptions,
  rowPositions,
  setBlockCount,
  setRow,
  tableErrors,
  toTable,
} from '@/solution/table';
import { EXT_CASES } from './native/ext-cases';

const f = (x: unknown): Format => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};
const back = (format: Format) => f(fromTable(toTable(format)));

describe('table model with the DSL extensions', () => {
  it('round-trips every extension case', () => {
    for (const c of Object.values(EXT_CASES)) {
      expect(formatToJson(back(c.format))).toBe(formatToJson(c.format));
    }
  });

  it('keeps flow and raw as row options, only where they apply', () => {
    const table = toTable(EXT_CASES.exprFlow.format);
    expect(table.rows[1]).toMatchObject({ name: 'arr', flow: true });
    const noCount = setRow(table, 1, { count: '' });
    expect(f(fromTable(noCount)).params[1]).toEqual({ name: 'arr', type: 'int[]' });
    const raw = toTable(EXT_CASES.rawLines.format);
    expect(raw.rows.filter((r) => r.raw).map((r) => r.name)).toEqual(['t', 'ls', 'mid', 'rest']);
    const asInt = setRow(raw, 0, { type: 'int' });
    expect(f(fromTable(asInt)).params[0]).toEqual({ name: 't', type: 'int' });
  });

  it('groups block rows, shows where they are read and edits the block count', () => {
    const table = toTable(EXT_CASES.blockCount.format);
    expect(table.rows.map((r) => r.block?.count)).toEqual([undefined, 'n', 'n', 'n']);
    expect(rowPositions(table)).toEqual([
      '1번째 줄',
      '블록 (2번째 줄부터)',
      '블록 (2번째 줄부터)',
      '블록 (2번째 줄부터)',
    ]);
    // The first row of a block starts a line; the next one may share it; no "to the end".
    expect(modeOptions(table, 1)).toEqual(['new']);
    expect(modeOptions(table, 2)).toEqual(['new', 'same']);
    const twice = setBlockCount(table, table.rows[1]?.block?.id ?? -1, 'n*2');
    expect(f(fromTable(twice)).lines[1]).toEqual({
      repeat: 'n*2',
      of: [['k', 'name'], ['items']],
    });
    const empty = setBlockCount(table, table.rows[1]?.block?.id ?? -1, ' ');
    expect(tableErrors(empty)).toContain('블록을 몇 번 읽는지 적어 주세요.');
  });

  it('round-trips blocks up to an end line and to the end of input', () => {
    const table = toTable(EXT_CASES.blockUntil.format);
    expect(table.rows.map((r) => r.block?.mode)).toEqual(['until', 'until', 'eof', 'eof']);
    expect(formatToJson(back(EXT_CASES.blockUntil.format))).toBe(
      formatToJson(EXT_CASES.blockUntil.format),
    );
  });
});
