/**
 * Strict reading of standard input with a format. Used to validate formats against samples
 * (ADR-0006 steps 1 and 3) and to show samples as parameters. The glue code in the submitted
 * program reads more leniently (tokens may wrap lines); this reader insists on the format's
 * line layout. Writing values back as input is in writer.ts.
 */
import {
  evalCount,
  isArrayType,
  isBlock,
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
import { physicalLines, type Line } from './input-lines';
import { elementType, parseToken, type Value, type Values } from './values';

export { inputLines, sameInput } from './input-lines';
export { writeInput, type WriteResult } from './writer';

/**
 * The cases read. `ends`: the end lines read for "<0", "<=0" and "#*" ends, in order, so
 * writing the values back gives the same input.
 */
export type ReadResult =
  { ok: true; cases: Values[]; ends?: string[] } | { ok: false; error: string };

class ReadError extends Error {}

/** Reads every case of `text`. Errors say which line and what was expected, in Korean. */
export function readInput(format: Format, text: string): ReadResult {
  const lines = physicalLines(text);
  const byName = new Map(format.params.map((p) => [p.name, p]));
  const ends: string[] = [];
  let at = 0;
  const lastNo = () => lines.filter((l) => !l.blank).at(-1)?.no ?? 0;
  const ended = (what: string) =>
    new ReadError(`${lastNo() + 1}번째 줄에 ${what}이(가) 있어야 하는데 입력이 끝났어요`);
  /** Index of the next non-blank line (lines.length when none is left). */
  const peekIndex = () => {
    let i = at;
    while (i < lines.length && (lines[i] as Line).blank) i++;
    return i;
  };
  const peek = (): Line | undefined => lines[peekIndex()];
  const next = (what: string): Line => {
    at = peekIndex();
    const line = lines[at++];
    if (!line) throw ended(what);
    return line;
  };
  /** The next physical line, blank or not (raw parameters). */
  const nextRaw = (what: string): Line => {
    const line = lines[at++];
    if (!line) throw ended(what);
    return line;
  };
  /** Keeps the end line read for an end that matches more than one text. */
  const endRead = (end: End, text: string) => {
    if (end.kind === 'neg' || end.kind === 'prefix') ends.push(text);
  };

  const count = (c: Count, env: Map<string, number>, what: string, line?: Line): number => {
    const parsed = parseCount(c);
    const n = parsed ? evalCount(parsed, env) : Number.NaN;
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      const where = line ? `${line.no}번째 줄: ` : '';
      throw new ReadError(`${where}${what}의 개수 ${String(c)} = ${n}을(를) 쓸 수 없어요`);
    }
    return n;
  };

  const keep = (p: Param, v: Value, values: Values, env: Map<string, number>) => {
    values.set(p.name, v);
    if (typeof v === 'number' && Number.isInteger(v)) env.set(p.name, v);
    if (typeof v === 'bigint') env.set(p.name, Number(v));
  };

  const readLines = (specs: readonly LineSpec[], values: Values, env: Map<string, number>) => {
    for (const spec of specs) {
      if (isBlock(spec)) readBlock(spec, values, env);
      else if (isRepeat(spec)) readRepeat(spec, values, env);
      else readLine(spec as string[], values, env);
    }
  };

  const readRepeat = (spec: RepeatLine, values: Values, env: Map<string, number>) => {
    const p = byName.get(spec.of) as Param;
    const size = repeatSize(spec);
    const take = p.raw ? nextRaw : next;
    const rows: Value[] = [];
    if (size.kind === 'count') {
      const n = count(size.count, env, `'${p.name}'`, peek());
      for (let r = 0; r < n; r++) rows.push(readRow(p, take(`'${p.name}'의 ${r + 1}번째 줄`), env));
    } else if (size.kind === 'until') {
      const end = parseEnd(size.end);
      for (;;) {
        const line = take(`'${p.name}'을(를) 끝내는 줄 '${size.end}'`);
        const text = isLinesType(p.type) ? line.text : line.tokens.join(' ');
        if (matchesEnd(end, text)) {
          endRead(end, text);
          break;
        }
        rows.push(readRow(p, line, env));
      }
    } else if (p.raw) {
      while (at < lines.length) rows.push(readRow(p, lines[at++] as Line, env));
    } else {
      while (peek()) rows.push(readRow(p, next(''), env));
    }
    keep(p, rows, values, env);
  };

  const readLine = (spec: string[], values: Values, env: Map<string, number>) => {
    // An array of length 0 alone on its line: the line may be missing (no tokens to read).
    const first = byName.get(spec[0] as string) as Param;
    if (spec.length === 1 && isArrayType(first.type) && first.len !== undefined) {
      if (count(first.len, env, `'${first.name}'`, peek()) === 0) {
        keep(first, [], values, env);
        return;
      }
    }
    if (first.type === 'line') {
      const line = first.raw ? nextRaw(first.name) : next(first.name);
      keep(first, first.raw ? line.raw : line.text.trimStart(), values, env);
      return;
    }
    let line = next(`${spec.join(', ')}`);
    let t = 0;
    const take = (what: string) => {
      const tok = line.tokens[t++];
      if (tok === undefined) throw new ReadError(`${line.no}번째 줄에 ${what} 값이 부족해요`);
      return tok;
    };
    for (const name of spec) {
      const p = byName.get(name) as Param;
      if (!isArrayType(p.type)) {
        keep(p, token(p, take(`'${p.name}'`), line), values, env);
        continue;
      }
      const n =
        p.len === undefined ? line.tokens.length - t : count(p.len, env, `'${p.name}'`, line);
      const items: Value[] = [];
      for (let k = 0; k < n; k++) {
        // A flow array goes on over the next lines when its line runs out.
        if (p.flow && t >= line.tokens.length) {
          line = next(`'${p.name}'의 ${k + 1}번째 값`);
          t = 0;
        }
        items.push(token(p, take(`'${p.name}'`), line));
      }
      keep(p, items, values, env);
    }
    if (t < line.tokens.length) {
      throw new ReadError(
        `${line.no}번째 줄에 남는 값 '${line.tokens.slice(t).join(' ')}'이(가) 있어요`,
      );
    }
  };

  /** A block: each parameter read in it gets one value per block. */
  const readBlock = (spec: BlockLine, values: Values, env: Map<string, number>) => {
    const names = lineNames(spec);
    const lists = new Map<string, Value[]>(names.map((n) => [n, []]));
    const once = () => {
      const start = at;
      const own: Values = new Map();
      readLines(spec.of, own, new Map(env));
      for (const n of names) (lists.get(n) as Value[]).push(own.get(n) as Value);
      return at !== start;
    };
    const size = repeatSize(spec);
    if (size.kind === 'count') {
      const n = count(size.count, env, '블록', peek());
      for (let k = 0; k < n; k++) once();
    } else {
      const end = size.kind === 'until' ? parseEnd(size.end) : undefined;
      for (;;) {
        const i = peekIndex();
        const line = lines[i];
        if (!line) {
          if (end)
            throw new ReadError(`블록을 끝내는 줄 '${(size as { end: string }).end}'이(가) 없어요`);
          break;
        }
        if (end && matchesEnd(end, line.tokens.join(' '))) {
          at = i + 1;
          endRead(end, line.tokens.join(' '));
          break;
        }
        if (!once()) throw new ReadError('블록 하나가 입력을 한 줄도 읽지 않아요');
      }
    }
    for (const n of names) values.set(n, lists.get(n) as Value[]);
  };

  const readCase = (): Values => {
    const values: Values = new Map();
    readLines(format.lines, values, new Map());
    return values;
  };

  /** One case; a case that reads no line would repeat forever (or millions of times). */
  const readCaseOnce = (): Values => {
    const start = at;
    const values = readCase();
    if (at === start) throw new ReadError('케이스 하나가 입력을 한 줄도 읽지 않아요');
    return values;
  };

  try {
    const cases: Values[] = [];
    const c = format.cases;
    if (c === null) {
      cases.push(readCase());
    } else if ('count' in c) {
      const line = next(`케이스 개수 ${c.count}`);
      const tc = line.tokens.length === 1 ? parseToken('int', line.tokens[0] as string) : undefined;
      if (!tc?.ok || (tc.value as number) < 1) {
        throw new ReadError(`${line.no}번째 줄은 케이스 개수 ${c.count} 하나여야 해요`);
      }
      // Every case reads at least one line, so more cases than lines left cannot fit.
      if ((tc.value as number) > lines.length - at) {
        throw new ReadError(
          `케이스가 ${tc.value as number}개인데 남은 줄이 ${lines.length - at}줄이에요`,
        );
      }
      for (let k = 0; k < (tc.value as number); k++) cases.push(readCaseOnce());
    } else {
      const sentinel = sentinelOf(c);
      const end = sentinel === undefined ? undefined : parseEnd(sentinel);
      for (;;) {
        const i = peekIndex();
        const line = lines[i];
        if (end === undefined && !line) break;
        if (end !== undefined) {
          if (!line) throw new ReadError(`입력을 끝내는 줄 '${sentinel}'이(가) 없어요`);
          if (matchesEnd(end, line.tokens.join(' '))) {
            at = i + 1;
            endRead(end, line.tokens.join(' '));
            break;
          }
        }
        cases.push(readCaseOnce());
      }
      if (cases.length === 0) throw new ReadError('읽은 케이스가 없어요');
    }
    const left = peek();
    if (left) throw new ReadError(`${left.no}번째 줄부터 읽지 않은 입력이 남아요`);
    return ends.length ? { ok: true, cases, ends } : { ok: true, cases };
  } catch (e) {
    if (e instanceof ReadError) return { ok: false, error: e.message };
    throw e;
  }

  function token(p: Param, tok: string, line: Line): Value {
    const r = parseToken(elementType(p.type), tok);
    if (!r.ok) throw new ReadError(`${line.no}번째 줄 '${p.name}': ${r.error}`);
    return r.value;
  }

  function readRow(p: Param, line: Line, env: Map<string, number>): Value {
    // line[]: the whole line, spaces kept (outer spaces trimmed, like `line`; raw: as it is).
    if (isLinesType(p.type)) return p.raw ? line.raw : line.text.trim();
    if (isArrayType(p.type)) {
      if (line.tokens.length !== 1) {
        throw new ReadError(`${line.no}번째 줄에는 '${p.name}'의 값 하나만 있어야 해요`);
      }
      return token(p, line.tokens[0] as string, line);
    }
    const cols = p.cols === undefined ? undefined : count(p.cols, env, `'${p.name}'의 열`, line);
    if (p.type === 'char[][]') {
      if (line.tokens.length !== 1) {
        throw new ReadError(`${line.no}번째 줄의 '${p.name}' 행은 공백 없는 문자열이어야 해요`);
      }
      const row = line.tokens[0] as string;
      if (cols !== undefined && row.length !== cols) {
        throw new ReadError(
          `${line.no}번째 줄의 '${p.name}' 행 길이가 ${row.length}이에요 (${cols}이어야 해요)`,
        );
      }
      return row;
    }
    if (cols !== undefined && line.tokens.length !== cols) {
      throw new ReadError(
        `${line.no}번째 줄의 '${p.name}' 행에 값이 ${line.tokens.length}개예요 (${cols}개여야 해요)`,
      );
    }
    return line.tokens.map((tok) => token(p, tok, line));
  }
}
