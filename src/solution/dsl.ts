/**
 * Input/output format of a problem for the solution-function mode (ADR-0006, DSL v1).
 *
 * A format says how standard input becomes the parameters of `solution(...)` and how its
 * return value becomes standard output. Formats come from untrusted places (user edits,
 * pasted JSON, backups, bundled data), so `checkFormat` validates every field before use.
 * Kept free of extension APIs so it can be unit tested.
 */

export const PARAM_TYPES = [
  'int',
  'long',
  'double',
  'string',
  'line',
  'int[]',
  'long[]',
  'double[]',
  'string[]',
  'line[]',
  'int[][]',
  'long[][]',
  'double[][]',
  'string[][]',
  'char[][]',
] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

export const RET_TYPES = [
  'int',
  'long',
  'double',
  'string',
  'bool',
  'int[]',
  'long[]',
  'string[]',
  'line[]',
  'int[][]',
  'char[][]',
] as const;
export type RetType = (typeof RET_TYPES)[number];

/** A count: a parameter name, a number, `name±k`, `name*name` or `name+name`. */
export type Count = string | number;

export interface Param {
  name: string;
  type: ParamType;
  /** 1D token arrays: number of elements (omitted: the rest of the line). */
  len?: Count;
  /** 2D arrays: number of columns (omitted: every token of the row's line). */
  cols?: Count;
}

/**
 * Several lines, one element (a whole line for `line[]`, a row for 2D arrays) per line:
 * `repeat` lines, or until an end line (`until: "0"`, the end line is not part of the value),
 * or until the input ends (`until: "EOF"`, only as the last line of a single-case format).
 */
export type RepeatLine = { repeat: Count; of: string } | { until: string; of: string };

/** One input line: the parameters read from it, in order. */
export type LineSpec = string[] | RepeatLine;

/** How many lines a repeat line reads. */
export type RepeatSize =
  { kind: 'count'; count: Count } | { kind: 'until'; end: string } | { kind: 'eof' };

export function repeatSize(line: RepeatLine): RepeatSize {
  if ('repeat' in line) return { kind: 'count', count: line.repeat };
  return line.until === 'EOF' ? { kind: 'eof' } : { kind: 'until', end: line.until };
}

export type Cases = null | { count: string } | { until: string };

export interface RetSpec {
  type: RetType;
  /** Arrays: separator between elements (2D: between columns). */
  sep?: ' ' | '\n' | '';
  /** bool: the words printed for true and false. */
  yes?: string;
  no?: string;
  /** double: digits after the decimal point. */
  digits?: number;
}

export interface Format {
  v: 1;
  params: Param[];
  lines: LineSpec[];
  /** null: one case. `{count}`: the first line is the number of cases. `{until}`: "EOF" or an end line such as "0 0". */
  cases: Cases;
  ret: RetSpec;
}

export const MAX_PARAMS = 10;
export const MAX_COUNT = 1_000_000;
const MAX_NAME = 20;
const MAX_WORD = 40;

/** Names that are keywords (or awkward) in a language with solution-mode glue. */
const RESERVED = new Set(
  (
    'abstract and as assert async auto await bool boolean break byte case catch char class const ' +
    'continue def default del delete do double elif else enum except export extends false final ' +
    'finally float for from function global goto if implements import in instanceof int interface ' +
    'is lambda let long main namespace native new none nonlocal not null or package pass private ' +
    'protected public raise return short signed sizeof solution static std string struct super ' +
    'switch synchronized template this throw throws transient true try typedef typeof union unsigned ' +
    'using var vector void volatile while with yield list dict set map len input print' +
    // C, Kotlin, Rust, Go, Swift, C# and Ruby (ADR-0008).
    ' extern register inline restrict fun val when object typealias companion data sealed fn mut' +
    ' impl match loop ref self mod crate trait move type pub use where dyn func go chan defer' +
    ' select range fallthrough guard repeat inout init deinit extension protocol subscript' +
    ' operator internal fileprivate out params base checked decimal delegate event explicit' +
    ' fixed implicit lock readonly sbyte stackalloc uint ulong unchecked ushort virtual def end' +
    ' elsif unless until begin rescue ensure nil then redo retry undef alias defined module next' +
    // Keywords of the languages above that were missing (C++, Rust, C#, Swift, Java).
    ' asm constexpr consteval constinit decltype friend mutable noexcept nullptr typeid typename' +
    ' alignas alignof concept requires xor bitand bitor compl explicit_cast become box macro' +
    ' override priv unsafe unsized foreach associatedtype rethrows precedencegroup strictfp' +
    ' arguments eval'
  ).split(' '),
);

export const SCALAR_TYPES: readonly ParamType[] = ['int', 'long', 'double', 'string'];
/** 1D arrays of tokens: on one line (with a length or to the end), or one token per line. */
export const ARRAY_TYPES: readonly ParamType[] = ['int[]', 'long[]', 'double[]', 'string[]'];
/** 2D arrays: one row per line. `char[][]` rows are one token without spaces. */
export const GRID_TYPES: readonly ParamType[] = [
  'int[][]',
  'long[][]',
  'double[][]',
  'string[][]',
  'char[][]',
];

export const isArrayType = (t: ParamType) => ARRAY_TYPES.includes(t);
export const isGridType = (t: ParamType) => GRID_TYPES.includes(t);
/** `line[]`: several whole lines, spaces kept. */
export const isLinesType = (t: ParamType) => t === 'line[]';
/** Types read only over several lines (a repeat line). */
export const isRepeatOnly = (t: ParamType) => isGridType(t) || isLinesType(t);
export const isIntegerType = (t: ParamType) => t === 'int' || t === 'long';

export function isValidName(name: string): boolean {
  return (
    /^[a-z_][A-Za-z0-9_]*$/.test(name) &&
    name.length <= MAX_NAME &&
    !name.startsWith('__') &&
    !RESERVED.has(name.toLowerCase())
  );
}

export type ParsedCount =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; name: string; plus: number }
  | { kind: 'mul'; a: string; b: string }
  | { kind: 'add'; a: string; b: string };

/** Parses a count expression; undefined when it is not one. */
export function parseCount(c: Count): ParsedCount | undefined {
  if (typeof c === 'number') {
    return Number.isInteger(c) && c >= 0 && c <= MAX_COUNT ? { kind: 'num', value: c } : undefined;
  }
  if (typeof c !== 'string') return undefined;
  const s = c.replace(/\s+/g, '');
  if (/^\d{1,7}$/.test(s)) return parseCount(Number(s));
  const ref = /^([a-z_]\w*)(?:([+-])(\d{1,3}))?$/.exec(s);
  if (ref) {
    const k = ref[3] ? Number(ref[3]) : 0;
    return { kind: 'ref', name: ref[1] as string, plus: ref[2] === '-' ? -k : k };
  }
  const mul = /^([a-z_]\w*)([*+])([a-z_]\w*)$/.exec(s);
  if (mul) {
    return { kind: mul[2] === '*' ? 'mul' : 'add', a: mul[1] as string, b: mul[3] as string };
  }
  return undefined;
}

export function countRefs(c: ParsedCount): string[] {
  if (c.kind === 'ref') return [c.name];
  if (c.kind === 'mul' || c.kind === 'add') return [c.a, c.b];
  return [];
}

/** The value of a count with the integer parameters read so far. */
export function evalCount(c: ParsedCount, env: ReadonlyMap<string, number>): number {
  const get = (name: string) => env.get(name) ?? Number.NaN;
  if (c.kind === 'num') return c.value;
  if (c.kind === 'ref') return get(c.name) + c.plus;
  if (c.kind === 'add') return get(c.a) + get(c.b);
  return get(c.a) * get(c.b);
}

/** "n", "n-1", "n*m" or "5", for display and code generation. */
export function countText(c: ParsedCount): string {
  if (c.kind === 'num') return String(c.value);
  if (c.kind === 'ref') {
    if (c.plus === 0) return c.name;
    return `${c.name}${c.plus > 0 ? '+' : '-'}${Math.abs(c.plus)}`;
  }
  return `${c.a}${c.kind === 'add' ? '+' : '*'}${c.b}`;
}

export function isRepeat(line: LineSpec): line is RepeatLine {
  return !Array.isArray(line);
}

export function sentinelOf(cases: Cases): string | undefined {
  if (cases && 'until' in cases && cases.until !== 'EOF') return cases.until;
  return undefined;
}

export type CheckResult = { ok: true; format: Format } | { ok: false; errors: string[] };

/**
 * Checks the shape and the rules of a format (names, references to earlier integers,
 * where each type may be read, return value options). Errors are in Korean.
 */
export function checkFormat(value: unknown): CheckResult {
  const errors: string[] = [];
  const fail = (e: string) => errors.push(e);
  if (!isRecord(value)) return { ok: false, errors: ['형식은 JSON 객체여야 해요.'] };
  if (value.v !== 1) fail('"v"는 1이어야 해요.');
  const params = parseParams(value.params, fail);
  const byName = new Map(params.map((p) => [p.name, p]));
  const lines = parseLines(value.lines, byName, fail);
  const cases = parseCases(value.cases, byName, fail);
  if (params.length === 0 && cases) fail('입력이 없는 형식에는 입력 반복을 쓸 수 없어요.');
  if (cases && lines?.some((l) => !Array.isArray(l) && 'until' in l && l.until === 'EOF')) {
    fail('입력 끝까지 읽는 매개변수가 있으면 입력 반복을 쓸 수 없어요.');
  }
  const ret = parseRet(value.ret, fail);
  if (errors.length || !lines || cases === undefined || !ret) {
    return { ok: false, errors: errors.length ? errors : ['형식을 읽지 못했어요.'] };
  }
  return { ok: true, format: { v: 1, params, lines, cases, ret } };
}

function parseParams(raw: unknown, fail: (e: string) => void): Param[] {
  // No parameters: a problem without input (solution()).
  if (!Array.isArray(raw)) {
    fail('"params"는 매개변수 배열이어야 해요.');
    return [];
  }
  if (raw.length > MAX_PARAMS) fail(`파라미터는 ${MAX_PARAMS}개까지 쓸 수 있어요.`);
  const out: Param[] = [];
  const seen = new Set<string>();
  for (const [i, p] of raw.entries()) {
    if (!isRecord(p) || typeof p.name !== 'string') {
      fail(`${i + 1}번째 파라미터에 이름(name)이 없어요.`);
      continue;
    }
    const name = p.name;
    if (!isValidName(name)) {
      fail(`'${name}'은(는) 쓸 수 없는 이름이에요. 영어 소문자로 시작하고 예약어가 아니어야 해요.`);
    }
    if (seen.has(name)) fail(`'${name}' 이름이 두 번 나와요.`);
    seen.add(name);
    if (!PARAM_TYPES.includes(p.type as ParamType)) {
      fail(`'${name}'의 타입 '${String(p.type)}'을(를) 알 수 없어요.`);
      continue;
    }
    const param: Param = { name, type: p.type as ParamType };
    for (const key of ['len', 'cols'] as const) {
      const c = p[key];
      if (c === undefined || c === null) continue;
      if ((typeof c !== 'string' && typeof c !== 'number') || !parseCount(c)) {
        fail(`'${name}'의 ${key} 값 '${String(c)}'을(를) 읽을 수 없어요.`);
        continue;
      }
      param[key] = c;
    }
    if (param.len !== undefined && !isArrayType(param.type)) {
      fail(`'${name}'은(는) 1차원 배열이 아니라 len을 쓸 수 없어요.`);
    }
    if (param.cols !== undefined && !isGridType(param.type)) {
      fail(`'${name}'은(는) 2차원 배열이 아니라 cols를 쓸 수 없어요.`);
    }
    out.push(param);
  }
  return out;
}

function parseLines(
  raw: unknown,
  byName: Map<string, Param>,
  fail: (e: string) => void,
): LineSpec[] | undefined {
  if (!Array.isArray(raw) || (raw.length === 0 && byName.size > 0)) {
    fail('"lines"에 읽을 줄이 하나 이상 있어야 해요.');
    return undefined;
  }
  const read = new Set<string>();
  const out: LineSpec[] = [];
  /** Checks a count's references: integers read before this point. */
  const checkCount = (c: Count, what: string) => {
    const parsed = parseCount(c);
    if (!parsed) return fail(`${what}의 개수 '${String(c)}'을(를) 읽을 수 없어요.`);
    for (const ref of countRefs(parsed)) {
      const p = byName.get(ref);
      if (!p) fail(`${what}의 개수에 나온 '${ref}'은(는) 없는 파라미터예요.`);
      else if (!isIntegerType(p.type)) fail(`${what}의 개수 '${ref}'은(는) 정수여야 해요.`);
      else if (!read.has(ref)) fail(`${what}의 개수 '${ref}'은(는) 그보다 먼저 읽어야 해요.`);
    }
  };
  for (const [i, line] of raw.entries()) {
    const where = `${i + 1}번째 줄`;
    if (Array.isArray(line)) {
      if (line.length === 0) fail(`${where}에 읽을 파라미터가 없어요.`);
      for (const [j, name] of line.entries()) {
        const p = typeof name === 'string' ? byName.get(name) : undefined;
        if (!p) {
          fail(`${where}의 '${String(name)}'은(는) 없는 파라미터예요.`);
          continue;
        }
        if (read.has(p.name)) fail(`'${p.name}'을(를) 두 번 읽어요.`);
        if (isRepeatOnly(p.type)) {
          fail(`'${p.name}'(${p.type})은(는) 여러 줄로만 읽을 수 있어요.`);
        }
        if (p.type === 'line' && line.length > 1) {
          fail(`'${p.name}'(line)은 한 줄을 통째로 읽어서 혼자 있어야 해요.`);
        }
        if (isArrayType(p.type) && p.len === undefined && j < line.length - 1) {
          fail(`개수가 없는 배열 '${p.name}'은(는) 줄의 마지막에만 둘 수 있어요.`);
        }
        if (isArrayType(p.type) && p.len !== undefined) checkCount(p.len, `'${p.name}'`);
        read.add(p.name);
      }
      out.push(line as string[]);
      continue;
    }
    const hasUntil = isRecord(line) && typeof line.until === 'string';
    if (
      !isRecord(line) ||
      typeof line.of !== 'string' ||
      (line.repeat === undefined && !hasUntil)
    ) {
      fail(`${where}은(는) 파라미터 이름 배열이나 { "repeat", "of" }, { "until", "of" }여야 해요.`);
      continue;
    }
    const p = byName.get(line.of);
    if (!p) {
      fail(`${where}의 '${line.of}'은(는) 없는 파라미터예요.`);
      continue;
    }
    if (read.has(p.name)) fail(`'${p.name}'을(를) 두 번 읽어요.`);
    if (!isArrayType(p.type) && !isRepeatOnly(p.type)) {
      fail(`여러 줄로는 배열만 읽을 수 있어요. '${p.name}'은(는) ${p.type}이에요.`);
    }
    if (p.len !== undefined) fail(`여러 줄로 읽는 '${p.name}'에는 len을 쓰지 않아요.`);
    if (p.cols !== undefined) checkCount(p.cols, `'${p.name}'의 열`);
    read.add(p.name);
    if (hasUntil) {
      const until = (line.until as string).trim().replace(/\s+/g, ' ');
      if (until === '' || until.length > MAX_WORD) {
        fail(`'${p.name}'의 끝내는 줄은 "EOF"이거나 입력을 끝내는 줄(예: "0")이어야 해요.`);
      }
      if (until === 'EOF' && i < raw.length - 1) {
        fail(`입력 끝까지 읽는 '${p.name}'은(는) 마지막 줄이어야 해요.`);
      }
      out.push({ until, of: p.name });
      continue;
    }
    const repeat = line.repeat;
    if (typeof repeat !== 'string' && typeof repeat !== 'number') {
      fail(`${where}의 repeat 값을 읽을 수 없어요.`);
      continue;
    }
    checkCount(repeat, `'${p.name}'`);
    out.push({ repeat, of: p.name });
  }
  for (const name of byName.keys()) {
    if (!read.has(name)) fail(`'${name}'을(를) 읽는 줄이 없어요.`);
  }
  return out;
}

function parseCases(
  raw: unknown,
  byName: Map<string, Param>,
  fail: (e: string) => void,
): Cases | undefined {
  if (raw === null || raw === undefined) return null;
  if (isRecord(raw) && typeof raw.count === 'string' && Object.keys(raw).length === 1) {
    if (!/^[A-Za-z_]\w{0,19}$/.test(raw.count) || byName.has(raw.count)) {
      fail(`케이스 개수 이름 '${raw.count}'은(는) 파라미터와 다른 이름이어야 해요.`);
    }
    return { count: raw.count };
  }
  if (isRecord(raw) && typeof raw.until === 'string' && Object.keys(raw).length === 1) {
    const until = raw.until.trim().replace(/\s+/g, ' ');
    if (until === '' || until.length > MAX_WORD) {
      fail('"until"은 "EOF"이거나 입력을 끝내는 줄(예: "0 0")이어야 해요.');
    }
    return { until };
  }
  fail('"cases"는 null, { "count": "T" }, { "until": "EOF" }, { "until": "0 0" } 중 하나예요.');
  return undefined;
}

function parseRet(raw: unknown, fail: (e: string) => void): RetSpec | undefined {
  if (!isRecord(raw) || !RET_TYPES.includes(raw.type as RetType)) {
    fail(`반환 타입 '${isRecord(raw) ? String(raw.type) : ''}'을(를) 알 수 없어요.`);
    return undefined;
  }
  const type = raw.type as RetType;
  const ret: RetSpec = { type };
  const array = type.endsWith('[]');
  if (raw.sep !== undefined) {
    if (!array) fail('구분자(sep)는 배열 반환값에만 써요.');
    else if (type === 'line[]' && raw.sep !== '\n') {
      fail('line[] 반환값은 원소마다 한 줄씩 출력해요.');
    } else if (raw.sep !== ' ' && raw.sep !== '\n' && raw.sep !== '') {
      fail('구분자(sep)는 공백(" "), 줄바꿈("\\n"), 없음("") 중 하나예요.');
    } else if (raw.sep === '\n' && type.endsWith('[][]')) {
      fail('2차원 배열의 구분자는 열 사이 구분자라 공백이나 없음만 쓸 수 있어요.');
    } else if (raw.sep === '' && !type.endsWith('[][]')) {
      fail('1차원 배열의 구분자는 공백이나 줄바꿈이에요.');
    } else ret.sep = raw.sep;
  }
  if (type === 'bool') {
    for (const key of ['yes', 'no'] as const) {
      const word = raw[key];
      if (typeof word !== 'string' || word.trim() === '' || /[\r\n]/.test(word)) {
        fail(
          `참거짓 반환값에는 ${key === 'yes' ? '참' : '거짓'}일 때 출력할 문구(${key})가 필요해요.`,
        );
      } else if (word.length > MAX_WORD) fail(`${key} 문구가 너무 길어요.`);
      else ret[key] = word;
    }
    if (ret.yes !== undefined && ret.yes === ret.no) fail('yes와 no 문구가 같아요.');
  } else if (raw.yes !== undefined || raw.no !== undefined) {
    fail('yes/no 문구는 bool 반환값에만 써요.');
  }
  if (type === 'double') {
    const d = raw.digits;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 15) {
      fail('실수 반환값에는 소수 자리 수(digits, 0~15)가 필요해요.');
    } else ret.digits = d;
  } else if (raw.digits !== undefined) {
    fail('소수 자리 수(digits)는 double 반환값에만 써요.');
  }
  return ret;
}

/** The separator a return value uses when its format leaves it out. */
export function retSep(ret: RetSpec): string {
  if (ret.type === 'line[]') return '\n';
  if (ret.sep !== undefined) return ret.sep;
  return ret.type === 'char[][]' ? '' : ' ';
}

/** True when one case prints exactly one line. */
export function isOneLineRet(ret: RetSpec): boolean {
  if (ret.type.endsWith('[][]')) return false;
  if (ret.type.endsWith('[]')) return retSep(ret) !== '\n';
  return true;
}

/** Compact JSON with the key order of the DSL, for storage, prompts and issues. */
export function formatToJson(format: Format, pretty = false): string {
  const params = format.params.map((p) => {
    const out: Record<string, unknown> = { name: p.name, type: p.type };
    if (p.len !== undefined) out.len = p.len;
    if (p.cols !== undefined) out.cols = p.cols;
    return out;
  });
  const ret: Record<string, unknown> = { type: format.ret.type };
  for (const key of ['sep', 'yes', 'no', 'digits'] as const) {
    if (format.ret[key] !== undefined) ret[key] = format.ret[key];
  }
  const ordered = { v: 1, params, lines: format.lines, cases: format.cases, ret };
  if (!pretty) return JSON.stringify(ordered);
  // One parameter, line or option per row: short enough to read, no deep indentation.
  const rows = (items: unknown[]) => items.map((x) => `    ${JSON.stringify(x)}`).join(',\n');
  return [
    '{',
    '  "v": 1,',
    `  "params": [\n${rows(params)}\n  ],`,
    `  "lines": [\n${rows(format.lines)}\n  ],`,
    `  "cases": ${JSON.stringify(format.cases)},`,
    `  "ret": ${JSON.stringify(ret)}`,
    '}',
  ].join('\n');
}

export function sameFormat(a: Format, b: Format): boolean {
  return formatToJson(a) === formatToJson(b);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
