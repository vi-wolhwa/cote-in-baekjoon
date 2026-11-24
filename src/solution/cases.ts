/**
 * Test cases in solution-function mode (#36): one value per parameter and an expected
 * return value, typed as literals (`[3, 1, 2]`, `"abc"`). They are checked against the
 * format and stored as standard input/output, so running them is unchanged.
 */
import type { Sample } from '@/boj/problem';
import type { Format } from './dsl';
import { formatOutput, parseOutput } from './output';
import { readInput, writeInput } from './reader';
import { coerce, formatLiteral, parseLiteral, type Value } from './values';

export interface CaseRow {
  /** Literal text per parameter name. */
  params: Record<string, string>;
  expected: string;
}

/** Per-cell errors (parameter name or `ret`), plus one for the row as a whole. */
export interface RowErrors {
  cells: Record<string, string>;
  row?: string;
}

export type RowResult = { ok: true; sample: Sample } | { ok: false; errors: RowErrors };

export const RET_CELL = 'ret';

export function emptyRow(format: Format): CaseRow {
  return { params: Object.fromEntries(format.params.map((p) => [p.name, ''])), expected: '' };
}

export function isEmptyRow(row: CaseRow): boolean {
  return row.expected.trim() === '' && Object.values(row.params).every((v) => v.trim() === '');
}

/** Checks a row and turns it into standard input/output. */
export function rowToSample(format: Format, row: CaseRow): RowResult {
  const cells: Record<string, string> = {};
  const values = new Map<string, Value>();
  for (const p of format.params) {
    const text = row.params[p.name] ?? '';
    if (text.trim() === '') {
      cells[p.name] = '값을 적어 주세요';
      continue;
    }
    const lit = parseLiteral(text);
    const value = lit.ok ? coerce(p.type, lit.value) : lit;
    if (!value.ok) cells[p.name] = value.error;
    else values.set(p.name, value.value);
  }
  let output = '';
  if (row.expected.trim() === '') {
    cells[RET_CELL] = '기댓값을 적어 주세요';
  } else {
    const lit = parseLiteral(row.expected);
    const value = lit.ok ? coerce(format.ret.type, lit.value) : lit;
    if (!value.ok) cells[RET_CELL] = value.error;
    else output = formatOutput(format.ret, [value.value]);
  }
  if (Object.keys(cells).length > 0) return { ok: false, errors: { cells } };
  const input = writeInput(format, [values]);
  if (!input.ok) return { ok: false, errors: { cells, row: input.error } };
  return { ok: true, sample: { input: input.text, output } };
}

/** A stored case as a row, when it holds exactly one case of this format. */
export function sampleToRow(format: Format, sample: Sample): CaseRow | undefined {
  const read = readInput(format, sample.input);
  if (!read.ok || read.cases.length !== 1) return undefined;
  const out = parseOutput(format.ret, sample.output, 1);
  if (!out.ok || out.values.length !== 1) return undefined;
  const values = read.cases[0] as Map<string, Value>;
  return {
    params: Object.fromEntries(
      format.params.map((p) => [p.name, formatLiteral(values.get(p.name) as Value)]),
    ),
    expected: formatLiteral(out.values[0] as Value),
  };
}
