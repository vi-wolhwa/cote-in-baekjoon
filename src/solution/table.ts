/**
 * The table model behind the format editor (#114). Every parameter is one row, in the order
 * the input is read, which is also the order of `solution(...)`. A row says how it is read:
 * on a new line, on the same line as the row before, or over several lines (one element or
 * row per line). This covers all of DSL v1, so users never edit JSON.
 *
 * The table may hold states that are not valid formats (an empty name, a missing count); a
 * table is turned into a raw format object and checked with checkFormat/validateFormat.
 */
import {
  isArrayType,
  isGridType,
  isRepeat,
  isRepeatOnly,
  isValidName,
  MAX_PARAMS,
  type Cases,
  type Count,
  type Format,
  type ParamType,
  type RetSpec,
} from './dsl';

export type RowMode = 'new' | 'same' | 'repeat';

export interface ParamRow {
  name: string;
  type: ParamType;
  mode: RowMode;
  /** 1D array on a line: its length ('' = the rest of the line). Several lines: how many. */
  count: string;
  /** 2D array: columns ('' = every value of the row's line). */
  cols: string;
}

export interface FormatTable {
  rows: ParamRow[];
  cases: Cases;
  ret: RetSpec;
}

const countString = (c: Count | undefined) => (c === undefined ? '' : String(c));

export function toTable(format: Format): FormatTable {
  const byName = new Map(format.params.map((p) => [p.name, p]));
  const rows: ParamRow[] = [];
  const push = (name: string, mode: RowMode, repeat?: Count) => {
    const p = byName.get(name);
    if (!p) return;
    byName.delete(name);
    rows.push({
      name,
      type: p.type,
      mode,
      count: countString(repeat ?? p.len),
      cols: countString(p.cols),
    });
  };
  for (const line of format.lines) {
    if (isRepeat(line)) push(line.of, 'repeat', line.repeat);
    else line.forEach((name, i) => push(name, i === 0 ? 'new' : 'same'));
  }
  return { rows, cases: format.cases, ret: format.ret };
}

/** "5" → 5, "n-1" → "n-1", "" → undefined. */
function countValue(text: string): Count | undefined {
  const s = text.replace(/\s+/g, '');
  if (s === '') return undefined;
  return /^\d{1,7}$/.test(s) ? Number(s) : s;
}

/** The raw format object of a table, to be checked like any other format. */
export function fromTable(table: FormatTable): unknown {
  const params: Record<string, unknown>[] = [];
  const lines: unknown[] = [];
  for (const row of table.rows) {
    const name = row.name.trim();
    const count = countValue(row.count);
    const param: Record<string, unknown> = { name, type: row.type };
    if (isArrayType(row.type) && row.mode !== 'repeat' && count !== undefined) param.len = count;
    const cols = countValue(row.cols);
    if (isGridType(row.type) && cols !== undefined) param.cols = cols;
    params.push(param);
    const last = lines.at(-1);
    if (row.mode === 'repeat') lines.push({ repeat: count ?? '', of: name });
    else if (row.mode === 'same' && Array.isArray(last)) last.push(name);
    else lines.push([name]);
  }
  return { v: 1, params, lines, cases: table.cases, ret: table.ret };
}

/** Problems the table can name better than the format checks can. */
export function tableErrors(table: FormatTable): string[] {
  const errors: string[] = [];
  table.rows.forEach((row, i) => {
    const label = row.name.trim() || `${i + 1}번째 매개변수`;
    if (row.name.trim() === '') errors.push(`${i + 1}번째 매개변수의 이름을 적어 주세요.`);
    if (row.mode === 'repeat' && row.count.trim() === '') {
      errors.push(`'${label}'을(를) 몇 줄에 걸쳐 읽는지 적어 주세요.`);
    }
  });
  return errors;
}

/** How a row may be read, given its type and the row before it. */
export function modeOptions(table: FormatTable, index: number): RowMode[] {
  const row = table.rows[index];
  if (!row) return [];
  if (isRepeatOnly(row.type)) return ['repeat'];
  const prev = table.rows[index - 1];
  const canShare = prev !== undefined && prev.mode !== 'repeat' && prev.type !== 'line';
  const out: RowMode[] = ['new'];
  if (canShare && row.type !== 'line') out.push('same');
  if (isArrayType(row.type)) out.push('repeat');
  return out;
}

/** Keeps every row's mode one of its options (after a type change, a move or a delete). */
function normalize(table: FormatTable): FormatTable {
  const rows = [...table.rows];
  const out: FormatTable = { ...table, rows };
  rows.forEach((row, i) => {
    const options = modeOptions(out, i);
    if (!options.includes(row.mode)) rows[i] = { ...row, mode: options[0] ?? 'new' };
  });
  return out;
}

export function setRow(table: FormatTable, index: number, patch: Partial<ParamRow>): FormatTable {
  const old = table.rows[index];
  if (!old) return table;
  const row = { ...old, ...patch };
  if (patch.type !== undefined && patch.type !== old.type) {
    if (!isArrayType(row.type) && !isRepeatOnly(row.type)) row.count = '';
    if (!isGridType(row.type)) row.cols = '';
  }
  const rows = table.rows.map((r, i) => (i === index ? row : r));
  return normalize({ ...table, rows });
}

const wordRe = (name: string) => new RegExp(`(?<![\\w])${name}(?![\\w])`, 'g');

/** Renames a row and every count that refers to it. */
export function renameRow(table: FormatTable, index: number, name: string): FormatTable {
  const old = table.rows[index]?.name;
  if (old === undefined) return table;
  const swap = (text: string) => (old && isValidName(old) ? text.replace(wordRe(old), name) : text);
  const rows = table.rows.map((r, i) =>
    i === index ? { ...r, name } : { ...r, count: swap(r.count), cols: swap(r.cols) },
  );
  return { ...table, rows };
}

const NAME_IDEAS = ['n', 'm', 'k', 'x', 'y', 'a', 'b', 'c', 's', 'arr'];

export function addRow(table: FormatTable): FormatTable {
  if (table.rows.length >= MAX_PARAMS) return table;
  const used = new Set(table.rows.map((r) => r.name));
  const name =
    NAME_IDEAS.find((n) => !used.has(n)) ??
    Array.from({ length: MAX_PARAMS + 1 }, (_, i) => `p${i + 1}`).find((n) => !used.has(n)) ??
    'p';
  const row: ParamRow = { name, type: 'int', mode: 'new', count: '', cols: '' };
  return { ...table, rows: [...table.rows, row] };
}

/** Removing every row leaves a problem without input: solution(). */
export function removeRow(table: FormatTable, index: number): FormatTable {
  return normalize({ ...table, rows: table.rows.filter((_, i) => i !== index) });
}

export function moveRow(table: FormatTable, index: number, by: -1 | 1): FormatTable {
  const to = index + by;
  const a = table.rows[index];
  const b = table.rows[to];
  if (!a || !b) return table;
  const rows = [...table.rows];
  rows[index] = b;
  rows[to] = a;
  return normalize({ ...table, rows });
}

/** "1번째 줄", "2번째 줄부터" (several lines), then "그다음 줄" once line numbers stop being fixed. */
export function rowPositions(table: FormatTable): string[] {
  let line: number | undefined = table.cases && 'count' in table.cases ? 1 : 0;
  const out: string[] = [];
  table.rows.forEach((row, i) => {
    if (row.mode === 'same' && i > 0) {
      out.push(out[i - 1] ?? '');
      return;
    }
    if (line !== undefined) line++;
    if (row.mode === 'repeat') {
      out.push(line === undefined ? '그다음 줄부터' : `${line}번째 줄부터`);
      line = undefined;
      return;
    }
    out.push(line === undefined ? '그다음 줄' : `${line}번째 줄`);
  });
  return out;
}

/** The case loop as one of the editor's choices. */
export type CasesChoice = 'once' | 'count' | 'eof' | 'until';

export function casesChoice(cases: Cases): CasesChoice {
  if (cases === null) return 'once';
  if ('count' in cases) return 'count';
  return cases.until === 'EOF' ? 'eof' : 'until';
}

export function casesFor(choice: CasesChoice, old: Cases, until = '0'): Cases {
  if (choice === 'once') return null;
  if (choice === 'count') return { count: old && 'count' in old ? old.count : 'T' };
  if (choice === 'eof') return { until: 'EOF' };
  return { until: old && 'until' in old && old.until !== 'EOF' ? old.until : until };
}
