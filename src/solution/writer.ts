/**
 * Writing values back as standard input with a format: the round trip of sample validation
 * (ADR-0006 step 3) and the input of the test case dialog (#36). Checks lengths against the
 * counts (arr has n items) and that no value could be read as an end line.
 */
import {
  endText,
  evalCount,
  isArrayType,
  isBlock,
  isGridType,
  isLinesType,
  isRepeat,
  lineNames,
  matchesEnd,
  parseCount,
  parseEnd,
  repeatSize,
  sentinelOf,
  type BlockLine,
  type Count,
  type End,
  type Format,
  type LineSpec,
  type Param,
  type RepeatLine,
} from './dsl';
import { isToken, tokenText, type Value, type Values } from './values';

export type WriteResult = { ok: true; text: string } | { ok: false; error: string };

class WriteError extends Error {}

/**
 * Writes cases as standard input. `ends`: the end lines read for "<0", "<=0" and "#*" ends
 * (readInput), used in order; without them such an end is written as "-1", "0" or the prefix.
 */
export function writeInput(format: Format, cases: Values[], ends?: readonly string[]): WriteResult {
  const out: string[] = [];
  const byName = new Map(format.params.map((p) => [p.name, p]));
  const endsLeft = [...(ends ?? [])];
  const endLine = (end: End) =>
    end.kind === 'neg' || end.kind === 'prefix' ? (endsLeft.shift() ?? endText(end)) : endText(end);

  const writeLines = (specs: readonly LineSpec[], values: Values, env: Map<string, number>) => {
    const expect = (c: Count, actual: number, what: string) => {
      const parsed = parseCount(c);
      const n = parsed ? evalCount(parsed, env) : Number.NaN;
      if (n !== actual)
        throw new WriteError(
          `${what}의 길이가 ${actual}이에요. ${String(c)} = ${n}과(와) 같아야 해요`,
        );
    };
    for (const spec of specs) {
      if (isBlock(spec)) writeBlock(spec, values, env, expect);
      else if (isRepeat(spec)) writeRepeat(spec, values, expect);
      else writeLine(spec as string[], values, expect);
    }
  };

  /** Fails when a value written before an end line would be read as the end line. */
  const notEnd = (end: End | undefined, text: string, what: string) => {
    if (end && matchesEnd(end, text)) {
      throw new WriteError(`${what}의 값 '${text}'이(가) 끝내는 줄로 읽혀요`);
    }
  };

  type Expect = (c: Count, actual: number, what: string) => void;

  const writeRepeat = (spec: RepeatLine, values: Values, expect: Expect) => {
    const p = byName.get(spec.of) as Param;
    const rows = values.get(p.name);
    if (!Array.isArray(rows)) throw new WriteError(`'${p.name}' 값이 없어요`);
    const size = repeatSize(spec);
    const end = size.kind === 'until' ? parseEnd(size.end) : undefined;
    if (size.kind === 'count') expect(size.count, rows.length, `'${p.name}'`);
    for (const row of rows) {
      if (isGridType(p.type) && p.cols !== undefined) {
        const len = typeof row === 'string' ? row.length : Array.isArray(row) ? row.length : -1;
        expect(p.cols, len, `'${p.name}'의 행`);
      }
      if (isLinesType(p.type)) {
        if (typeof row !== 'string' || /[\r\n]/.test(row) || (!p.raw && row.trim() === '')) {
          throw new WriteError(`'${p.name}'의 원소는 비어 있지 않은 한 줄 문자열이어야 해요`);
        }
        // No end line check: values are trimmed, so the data line " ." before the end "." is ".".
        out.push(row);
        continue;
      }
      const cells = Array.isArray(row) ? row : [row];
      if (cells.some((x) => typeof x === 'string' && !isToken(x))) {
        throw new WriteError(`'${p.name}'의 문자열에는 공백을 넣을 수 없어요`);
      }
      notEnd(end, tokenText(row), `'${p.name}'`);
      out.push(tokenText(row));
    }
    if (end) out.push(endLine(end));
  };

  const writeLine = (spec: string[], values: Values, expect: Expect) => {
    const only = byName.get(spec[0] as string) as Param;
    const value = values.get(only.name);
    if (spec.length === 1 && isArrayType(only.type) && Array.isArray(value)) {
      if (only.len !== undefined) expect(only.len, value.length, `'${only.name}'`);
      if (only.len !== undefined && value.length === 0) return;
    }
    const parts: string[] = [];
    for (const name of spec) {
      const p = byName.get(name) as Param;
      const v = values.get(name);
      if (v === undefined) throw new WriteError(`'${name}' 값이 없어요`);
      if (isArrayType(p.type)) {
        if (!Array.isArray(v)) throw new WriteError(`'${name}'은(는) 배열이어야 해요`);
        if (p.len !== undefined) expect(p.len, v.length, `'${name}'`);
      }
      if (p.type === 'line' && (typeof v !== 'string' || /[\r\n]/.test(v))) {
        throw new WriteError(`'${name}'은(는) 한 줄 문자열이어야 해요`);
      }
      const items = Array.isArray(v) ? v : [v];
      for (const item of items) {
        if (p.type !== 'line' && typeof item === 'string' && !isToken(item)) {
          throw new WriteError(`'${name}'의 문자열은 공백 없이 한 단어여야 해요`);
        }
      }
      parts.push(tokenText(v));
    }
    out.push(parts.join(' '));
  };

  const writeBlock = (
    spec: BlockLine,
    values: Values,
    env: Map<string, number>,
    expect: Expect,
  ) => {
    const names = lineNames(spec);
    const lists = names.map((n) => values.get(n));
    if (lists.some((l) => !Array.isArray(l))) {
      throw new WriteError(
        `블록에서 읽는 ${names.map((n) => `'${n}'`).join(', ')}은(는) 배열이어야 해요`,
      );
    }
    const blocks = (lists[0] as Value[]).length;
    if (lists.some((l) => (l as Value[]).length !== blocks)) {
      throw new WriteError(
        `블록에서 읽는 ${names.map((n) => `'${n}'`).join(', ')}의 길이가 모두 같아야 해요`,
      );
    }
    const size = repeatSize(spec);
    if (size.kind === 'count') expect(size.count, blocks, '블록');
    const end = size.kind === 'until' ? parseEnd(size.end) : undefined;
    for (let k = 0; k < blocks; k++) {
      const own: Values = new Map(values);
      const ownEnv = new Map(env);
      names.forEach((n, i) => {
        const v = (lists[i] as Value[])[k] as Value;
        own.set(n, v);
        if (typeof v === 'number' && Number.isInteger(v)) ownEnv.set(n, v);
        if (typeof v === 'bigint') ownEnv.set(n, Number(v));
      });
      const first = out.length;
      writeLines(spec.of, own, ownEnv);
      if (out.length > first) notEnd(end, (out[first] as string).trim(), '블록');
    }
    if (end) out.push(endLine(end));
  };

  try {
    if (format.cases && 'count' in format.cases) out.push(String(cases.length));
    const sentinel = sentinelOf(format.cases);
    const caseEnd = sentinel === undefined ? undefined : parseEnd(sentinel);
    for (const values of cases) {
      const env = new Map<string, number>();
      for (const [name, v] of values) {
        if (typeof v === 'number' && Number.isInteger(v)) env.set(name, v);
        if (typeof v === 'bigint') env.set(name, Number(v));
      }
      writeLines(format.lines, values, env);
    }
    if (caseEnd) out.push(endLine(caseEnd));
    return { ok: true, text: `${out.join('\n')}\n` };
  } catch (e) {
    if (e instanceof WriteError) return { ok: false, error: e.message };
    throw e;
  }
}
