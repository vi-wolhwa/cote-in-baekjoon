/**
 * Strict reading of standard input with a format, and writing values back as input.
 * Used to validate formats against samples (ADR-0006 steps 1 and 3) and to turn the test
 * case dialog's parameters into input (#36). The glue code in the submitted program reads
 * more leniently (tokens may wrap lines); this reader insists on the format's line layout.
 */
import {
  evalCount,
  isArrayType,
  isGridType,
  isLinesType,
  isRepeat,
  repeatSize,
  parseCount,
  sentinelOf,
  type Count,
  type Format,
  type Param,
} from './dsl';
import { elementType, isToken, parseToken, tokenText, type Value, type Values } from './values';

export type ReadResult = { ok: true; cases: Values[] } | { ok: false; error: string };

/** Lines with their numbers (1-based); blank lines are left out. */
interface Line {
  no: number;
  text: string;
  tokens: string[];
}

export function inputLines(text: string): Line[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw, i) => ({ no: i + 1, text: raw.trimEnd(), tokens: raw.trim().split(/\s+/) }))
    .filter((l) => l.text.trim() !== '');
}

class ReadError extends Error {}

/** Reads every case of `text`. Errors say which line and what was expected, in Korean. */
export function readInput(format: Format, text: string): ReadResult {
  const lines = inputLines(text);
  const byName = new Map(format.params.map((p) => [p.name, p]));
  let at = 0;
  const lastNo = () => (lines.length ? (lines[lines.length - 1] as Line).no : 0);
  const next = (what: string): Line => {
    const line = lines[at++];
    if (!line)
      throw new ReadError(`${lastNo() + 1}번째 줄에 ${what}이(가) 있어야 하는데 입력이 끝났어요`);
    return line;
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

  const readCase = (): Values => {
    const values: Values = new Map();
    const env = new Map<string, number>();
    const keep = (p: Param, v: Value) => {
      values.set(p.name, v);
      if (typeof v === 'number' && Number.isInteger(v)) env.set(p.name, v);
      if (typeof v === 'bigint') env.set(p.name, Number(v));
    };
    for (const spec of format.lines) {
      if (isRepeat(spec)) {
        const p = byName.get(spec.of) as Param;
        const size = repeatSize(spec);
        const rows: Value[] = [];
        if (size.kind === 'count') {
          const n = count(size.count, env, `'${p.name}'`, lines[at]);
          for (let r = 0; r < n; r++) {
            const line = next(`'${p.name}'의 ${r + 1}번째 줄`);
            rows.push(readRow(p, line, env));
          }
        } else if (size.kind === 'until') {
          for (;;) {
            const line = next(`'${p.name}'을(를) 끝내는 줄 '${size.end}'`);
            if (isEndLine(p, line, size.end)) break;
            rows.push(readRow(p, line, env));
          }
        } else {
          while (at < lines.length) rows.push(readRow(p, lines[at++] as Line, env));
        }
        keep(p, rows);
        continue;
      }
      // An array of length 0 alone on its line: the line may be missing (no tokens to read).
      const only = byName.get(spec[0] as string) as Param;
      if (spec.length === 1 && isArrayType(only.type) && only.len !== undefined) {
        if (count(only.len, env, `'${only.name}'`, lines[at]) === 0) {
          keep(only, []);
          continue;
        }
      }
      const line = next(`${spec.join(', ')}`);
      const first = byName.get(spec[0] as string) as Param;
      if (first.type === 'line') {
        keep(first, line.text.trimStart());
        continue;
      }
      let t = 0;
      const take = (what: string) => {
        const tok = line.tokens[t++];
        if (tok === undefined) throw new ReadError(`${line.no}번째 줄에 ${what} 값이 부족해요`);
        return tok;
      };
      for (const name of spec) {
        const p = byName.get(name) as Param;
        if (isArrayType(p.type)) {
          const n =
            p.len === undefined ? line.tokens.length - t : count(p.len, env, `'${p.name}'`, line);
          const items: Value[] = [];
          for (let k = 0; k < n; k++) items.push(token(p, take(`'${p.name}'`), line));
          keep(p, items);
        } else {
          keep(p, token(p, take(`'${p.name}'`), line));
        }
      }
      if (t < line.tokens.length) {
        throw new ReadError(
          `${line.no}번째 줄에 남는 값 '${line.tokens.slice(t).join(' ')}'이(가) 있어요`,
        );
      }
    }
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
      for (;;) {
        if (sentinel === undefined && at >= lines.length) break;
        if (sentinel !== undefined) {
          const line = lines[at];
          if (!line) throw new ReadError(`입력을 끝내는 줄 '${sentinel}'이(가) 없어요`);
          if (line.tokens.join(' ') === sentinel) {
            at++;
            break;
          }
        }
        cases.push(readCaseOnce());
      }
      if (cases.length === 0) throw new ReadError('읽은 케이스가 없어요');
    }
    if (at < lines.length) {
      throw new ReadError(`${(lines[at] as Line).no}번째 줄부터 읽지 않은 입력이 남아요`);
    }
    return { ok: true, cases };
  } catch (e) {
    if (e instanceof ReadError) return { ok: false, error: e.message };
    throw e;
  }

  function token(p: Param, tok: string, line: Line): Value {
    const r = parseToken(elementType(p.type), tok);
    if (!r.ok) throw new ReadError(`${line.no}번째 줄 '${p.name}': ${r.error}`);
    return r.value;
  }

  /** The end line of an `until` repeat: whole text for line[] (" ." is data, "." ends), else tokens. */
  function isEndLine(p: Param, line: Line, end: string): boolean {
    return isLinesType(p.type) ? line.text === end : line.tokens.join(' ') === end;
  }

  function readRow(p: Param, line: Line, env: Map<string, number>): Value {
    // line[]: the whole line, spaces kept (outer spaces trimmed, like `line`).
    if (isLinesType(p.type)) return line.text.trim();
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

// ---- Writing values back as input (round trip, test case dialog) ----

export type WriteResult = { ok: true; text: string } | { ok: false; error: string };

/** Writes cases as standard input. Checks lengths against the counts (e.g. arr has n items). */
export function writeInput(format: Format, cases: Values[]): WriteResult {
  const out: string[] = [];
  const byName = new Map(format.params.map((p) => [p.name, p]));
  try {
    if (format.cases && 'count' in format.cases) out.push(String(cases.length));
    for (const values of cases) {
      const env = new Map<string, number>();
      for (const [name, v] of values) {
        if (typeof v === 'number' && Number.isInteger(v)) env.set(name, v);
        if (typeof v === 'bigint') env.set(name, Number(v));
      }
      const expect = (c: Count, actual: number, what: string) => {
        const parsed = parseCount(c);
        const n = parsed ? evalCount(parsed, env) : Number.NaN;
        if (n !== actual)
          throw new ReadError(
            `${what}의 길이가 ${actual}이에요. ${String(c)} = ${n}과(와) 같아야 해요`,
          );
      };
      for (const spec of format.lines) {
        if (isRepeat(spec)) {
          const p = byName.get(spec.of) as Param;
          const rows = values.get(p.name);
          if (!Array.isArray(rows)) throw new ReadError(`'${p.name}' 값이 없어요`);
          const size = repeatSize(spec);
          if (size.kind === 'count') expect(size.count, rows.length, `'${p.name}'`);
          for (const row of rows) {
            if (isGridType(p.type) && p.cols !== undefined) {
              const len =
                typeof row === 'string' ? row.length : Array.isArray(row) ? row.length : -1;
              expect(p.cols, len, `'${p.name}'의 행`);
            }
            if (isLinesType(p.type)) {
              if (typeof row !== 'string' || /[\r\n]/.test(row) || row.trim() === '') {
                throw new ReadError(`'${p.name}'의 원소는 비어 있지 않은 한 줄 문자열이어야 해요`);
              }
              out.push(row);
              continue;
            }
            const cells = Array.isArray(row) ? row : [row];
            if (cells.some((x) => typeof x === 'string' && !isToken(x))) {
              throw new ReadError(`'${p.name}'의 문자열에는 공백을 넣을 수 없어요`);
            }
            out.push(tokenText(row));
          }
          if (size.kind === 'until') out.push(size.end);
          continue;
        }
        const only = byName.get(spec[0] as string) as Param;
        const value = values.get(only.name);
        if (spec.length === 1 && isArrayType(only.type) && Array.isArray(value)) {
          if (only.len !== undefined) expect(only.len, value.length, `'${only.name}'`);
          if (only.len !== undefined && value.length === 0) continue;
        }
        const parts: string[] = [];
        for (const name of spec) {
          const p = byName.get(name) as Param;
          const v = values.get(name);
          if (v === undefined) throw new ReadError(`'${name}' 값이 없어요`);
          if (isArrayType(p.type)) {
            if (!Array.isArray(v)) throw new ReadError(`'${name}'은(는) 배열이어야 해요`);
            if (p.len !== undefined) expect(p.len, v.length, `'${name}'`);
          }
          const items = Array.isArray(v) ? v : [v];
          for (const item of items) {
            if (p.type !== 'line' && typeof item === 'string' && !isToken(item)) {
              throw new ReadError(`'${name}'의 문자열은 공백 없이 한 단어여야 해요`);
            }
          }
          parts.push(tokenText(v));
        }
        out.push(parts.join(' '));
      }
    }
    const sentinel = sentinelOf(format.cases);
    if (sentinel !== undefined) out.push(sentinel);
    return { ok: true, text: `${out.join('\n')}\n` };
  } catch (e) {
    if (e instanceof ReadError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * True when two inputs hold the same tokens on the same lines. Numbers compare by value,
 * so "3.10" and "3.1", or "+5" and "5", are the same.
 */
export function sameInput(a: string, b: string): boolean {
  const la = inputLines(a);
  const lb = inputLines(b);
  if (la.length !== lb.length) return false;
  return la.every((line, i) => {
    const other = (lb[i] as Line).tokens;
    return (
      line.tokens.length === other.length &&
      line.tokens.every((t, k) => {
        const u = other[k] as string;
        if (t === u) return true;
        const x = Number(t);
        const y = Number(u);
        return /^[+-]?[\d.]/.test(t) && /^[+-]?[\d.]/.test(u) && Number.isFinite(x) && x === y;
      })
    );
  });
}
