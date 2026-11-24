/**
 * Parameter and return values of the solution-function mode, and their text forms:
 * tokens on standard input/output, and literals like `[3, 1, 2]` or `"abc"` in the test case
 * dialog (#36). `long` values are bigint so 64-bit numbers keep every digit.
 */
import type { ParamType, RetType } from './dsl';

export type Value = number | bigint | string | boolean | Value[];
export type Values = Map<string, Value>;

const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;
const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;

const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export type TokenResult = { ok: true; value: Value } | { ok: false; error: string };

/** Reads one token as an int, long, double or string. */
export function parseToken(type: 'int' | 'long' | 'double' | 'string', token: string): TokenResult {
  switch (type) {
    case 'int': {
      if (!INTEGER.test(token))
        return { ok: false, error: `정수(int) 자리에 '${short(token)}'이(가) 있어요` };
      const n = Number(token);
      if (n < INT_MIN || n > INT_MAX) {
        return { ok: false, error: `${short(token)}은(는) int 범위를 넘어요 (long을 쓰세요)` };
      }
      return { ok: true, value: n };
    }
    case 'long': {
      if (!INTEGER.test(token))
        return { ok: false, error: `정수(long) 자리에 '${short(token)}'이(가) 있어요` };
      const n = BigInt(token);
      if (n < LONG_MIN || n > LONG_MAX)
        return { ok: false, error: `${short(token)}은(는) long 범위를 넘어요` };
      return { ok: true, value: n };
    }
    case 'double':
      if (!DECIMAL.test(token))
        return { ok: false, error: `실수(double) 자리에 '${short(token)}'이(가) 있어요` };
      return { ok: true, value: Number(token) };
    case 'string':
      return { ok: true, value: token };
  }
}

/** The element type of an array type, or the type itself. */
export function elementType(type: ParamType | RetType): 'int' | 'long' | 'double' | 'string' {
  if (type.startsWith('int')) return 'int';
  if (type.startsWith('long')) return 'long';
  if (type.startsWith('double')) return 'double';
  return 'string';
}

/** A value as a token on standard input/output. */
export function tokenText(v: Value): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(tokenText).join(' ');
  return String(v);
}

function short(s: string): string {
  return s.length > 20 ? `${s.slice(0, 20)}…` : s;
}

// ---- Literals (test case dialog) ----

type Lit = number | bigint | string | boolean | Lit[];

/** Parses a JSON-like literal; integers too large for a double stay exact (bigint). */
export function parseLiteral(
  text: string,
): { ok: true; value: Lit } | { ok: false; error: string } {
  let i = 0;
  const s = text;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i] as string)) i++;
  };
  const fail = (what: string): never => {
    throw new Error(what);
  };
  const value = (): Lit => {
    ws();
    const c = s[i];
    if (c === '[') {
      i++;
      const items: Lit[] = [];
      ws();
      if (s[i] === ']') {
        i++;
        return items;
      }
      for (;;) {
        items.push(value());
        ws();
        if (s[i] === ',') {
          i++;
          continue;
        }
        if (s[i] === ']') {
          i++;
          return items;
        }
        return fail('배열은 [1, 2, 3]처럼 쉼표로 구분하고 ]로 닫아 주세요');
      }
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let out = '';
      while (i < s.length && s[i] !== quote) {
        if (s[i] === '\\') {
          const e = s[i + 1];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : (e ?? '');
          i += 2;
        } else out += s[i++];
      }
      if (s[i] !== quote) fail('문자열을 따옴표로 닫아 주세요');
      i++;
      return out;
    }
    const m = /^(true|false|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
    if (!m)
      return fail(
        c === undefined ? '값이 비어 있어요' : `'${s.slice(i, i + 10)}'을(를) 읽을 수 없어요`,
      );
    i += (m[0] as string).length;
    const word = m[0] as string;
    if (word === 'true' || word === 'false') return word === 'true';
    if (INTEGER.test(word) && !Number.isSafeInteger(Number(word))) return BigInt(word);
    return Number(word);
  };
  try {
    const v = value();
    ws();
    if (i < s.length)
      return { ok: false, error: `값 뒤에 남는 글자 '${s.slice(i, i + 10)}'이(가) 있어요` };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Checks a literal against a parameter or return type and converts it (long → bigint,
 * char[][] rows → strings). `cols` is the required row length, if known.
 */
export function coerce(
  type: ParamType | RetType,
  lit: Lit,
): { ok: true; value: Value } | { ok: false; error: string } {
  const scalar = (t: 'int' | 'long' | 'double' | 'string', x: Lit): Value => {
    if (t === 'string') {
      if (typeof x !== 'string') throw new Error(`문자열이 필요해요 (예: "abc")`);
      return x;
    }
    if (typeof x !== 'number' && typeof x !== 'bigint') {
      throw new Error(`${t === 'double' ? '실수' : '정수'}가 필요해요`);
    }
    if (t === 'double') return Number(x);
    if (typeof x === 'number' && !Number.isInteger(x))
      throw new Error(`${t}에는 정수만 쓸 수 있어요`);
    const r = parseToken(t, String(x));
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const oneLine = (x: Lit): string => {
    if (typeof x !== 'string') throw new Error('문자열이 필요해요 (예: "hello world")');
    if (/[\r\n]/.test(x)) throw new Error('한 줄 문자열에는 줄바꿈을 넣을 수 없어요');
    return x;
  };
  const list = (x: Lit): Lit[] => {
    if (!Array.isArray(x)) throw new Error('배열이 필요해요 (예: [1, 2, 3])');
    return x;
  };
  try {
    switch (type) {
      case 'int':
      case 'long':
      case 'double':
      case 'string':
        return { ok: true, value: scalar(type, lit) };
      case 'line':
        return { ok: true, value: oneLine(lit) };
      case 'line[]':
        return { ok: true, value: list(lit).map(oneLine) };
      case 'bool':
        if (typeof lit !== 'boolean') throw new Error('true나 false가 필요해요');
        return { ok: true, value: lit };
      case 'int[]':
      case 'long[]':
      case 'double[]':
      case 'string[]':
        return { ok: true, value: list(lit).map((x) => scalar(elementType(type), x)) };
      case 'int[][]':
      case 'long[][]':
      case 'double[][]':
      case 'string[][]': {
        const t = elementType(type);
        return { ok: true, value: list(lit).map((row) => list(row).map((x) => scalar(t, x))) };
      }
      case 'char[][]':
        return {
          ok: true,
          value: list(lit).map((row) => {
            if (typeof row === 'string') return row;
            if (Array.isArray(row) && row.every((c) => typeof c === 'string' && c.length === 1)) {
              return row.join('');
            }
            throw new Error('문자 격자는 ["#.#", "..."]처럼 줄마다 문자열로 써 주세요');
          }),
        };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** A value as a literal for the test case dialog: `[3, 1, 2]`, `"abc"`, `12345678901234n` → digits. */
export function formatLiteral(v: Value): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return `[${v.map(formatLiteral).join(', ')}]`;
  return String(v);
}

/** True when a string token is a valid token (no whitespace, not empty). */
export function isToken(s: string): boolean {
  return s.length > 0 && !/\s/.test(s);
}
