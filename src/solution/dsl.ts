/**
 * Input/output format of a problem for the solution-function mode (ADR-0006, DSL v1).
 *
 * A format says how standard input becomes the parameters of `solution(...)` and how its
 * return value becomes standard output. Formats come from untrusted places (user edits,
 * pasted JSON, bundled data), so `checkFormat` validates every field before use.
 * Kept free of extension APIs so it can be unit tested. The return value lives in ret.ts,
 * counts in count.ts, end lines in end.ts and the checks of `lines` in dsl-lines.ts.
 */
import { parseCount, type Count } from './count';
import { parseLines } from './dsl-lines';
import { parseRet, RET_KEYS, type RetSpec } from './ret';

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

export {
  caseLabel,
  isOneLineRet,
  labelParts,
  RET_TYPES,
  retSep,
  type RetSpec,
  type RetType,
} from './ret';
export {
  countRefs,
  countText,
  evalCount,
  MAX_COUNT,
  parseCount,
  type Count,
  type ParsedCount,
} from './count';
export { endText, matchesEnd, parseEnd, type End } from './end';

export interface Param {
  name: string;
  type: ParamType;
  /** 1D token arrays: number of elements (omitted: the rest of the line). */
  len?: Count;
  /** 2D arrays: number of columns (omitted: every token of the row's line). */
  cols?: Count;
  /** 1D arrays with a length: the elements may wrap over several lines ("10 per line"). */
  flow?: true;
  /** line and line[]: physical lines as they are, empty lines and outer spaces kept. */
  raw?: true;
}

/**
 * Several lines, one element (a whole line for `line[]`, a row for 2D arrays) per line:
 * `repeat` lines, or until an end line (end.ts: "0", "<0", "#*"; the end line is not part of
 * the value), or until the input ends (`until: "EOF"`, only as the last line).
 */
export type RepeatLine = { repeat: Count; of: string } | { until: string; of: string };

/** A line inside a block: no blocks in blocks. */
export type InnerLine = string[] | RepeatLine;

/**
 * A block: several lines (`of`) read `repeat` times, until an end line or to the end of
 * input. Each parameter read in it is one dimension higher in `solution`: one value (or one
 * row) per block.
 */
export type BlockLine = { repeat: Count; of: InnerLine[] } | { until: string; of: InnerLine[] };

/** One input line: the parameters read from it, in order. */
export type LineSpec = InnerLine | BlockLine;

/** How many lines (or blocks) a repeat line or a block reads. */
export type RepeatSize =
  { kind: 'count'; count: Count } | { kind: 'until'; end: string } | { kind: 'eof' };

export function repeatSize(line: RepeatLine | BlockLine): RepeatSize {
  if ('repeat' in line) return { kind: 'count', count: line.repeat };
  return line.until === 'EOF' ? { kind: 'eof' } : { kind: 'until', end: line.until };
}

export type Cases = null | { count: string } | { until: string };

export interface Format {
  v: 1;
  params: Param[];
  lines: LineSpec[];
  /** null: one case. `{count}`: the first line is the number of cases. `{until}`: "EOF" or an end line such as "0 0". */
  cases: Cases;
  ret: RetSpec;
}

export const MAX_PARAMS = 16;
const MAX_NAME = 20;
export const MAX_WORD = 40;

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

/** A single-parameter repeat line (`of` is a name). */
export function isRepeat(line: LineSpec): line is RepeatLine {
  return !Array.isArray(line) && typeof line.of === 'string';
}

/** A block of several lines (`of` is a list of lines). */
export function isBlock(line: LineSpec): line is BlockLine {
  return !Array.isArray(line) && Array.isArray(line.of);
}

/** The names a line reads, blocks included. */
export function lineNames(line: LineSpec): string[] {
  if (Array.isArray(line)) return line;
  if (isRepeat(line)) return [line.of];
  return (line.of as InnerLine[]).flatMap(lineNames);
}

/** A line with its names and counts changed, blocks included (renaming parameters). */
export function mapLine(
  line: LineSpec,
  name: (n: string) => string,
  count: (c: Count) => Count,
): LineSpec {
  if (Array.isArray(line)) return line.map(name);
  if (isBlock(line)) {
    const of = line.of.map((l) => mapLine(l, name, count) as InnerLine);
    return 'repeat' in line ? { repeat: count(line.repeat), of } : { until: line.until, of };
  }
  const of = name(line.of as string);
  return 'repeat' in line ? { repeat: count(line.repeat), of } : { until: line.until, of };
}

export function sentinelOf(cases: Cases): string | undefined {
  if (cases && 'until' in cases && cases.until !== 'EOF') return cases.until;
  return undefined;
}

/** A parameter's type in `solution` when read in a block: one dimension higher. */
const LIFTED: Partial<Record<ParamType, ParamType>> = {
  int: 'int[]',
  long: 'long[]',
  double: 'double[]',
  string: 'string[]',
  line: 'line[]',
  'int[]': 'int[][]',
  'long[]': 'long[][]',
  'double[]': 'double[][]',
  'string[]': 'string[][]',
  'line[]': 'string[][]',
};

/** Names of the parameters read inside blocks. */
export function blockNames(format: Format): Set<string> {
  return new Set(format.lines.flatMap((l) => (isBlock(l) ? lineNames(l) : [])));
}

/**
 * The parameters as `solution` takes them: the ones read in a block one dimension higher,
 * without their read options (they describe one block's value, not the whole array).
 */
export function solutionParams(format: Format): Param[] {
  const inBlock = blockNames(format);
  return format.params.map((p) =>
    inBlock.has(p.name) ? { name: p.name, type: LIFTED[p.type] ?? p.type } : p,
  );
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
  const ret = parseRet(value.ret, cases === undefined ? undefined : cases !== null, fail);
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
    for (const key of ['flow', 'raw'] as const) {
      const flag = p[key];
      if (flag === undefined || flag === null || flag === false) continue;
      if (flag !== true) fail(`'${name}'의 ${key}는 true여야 해요.`);
      else param[key] = true;
    }
    if (param.flow && (!isArrayType(param.type) || param.len === undefined)) {
      fail(`'${name}'의 flow는 개수(len)가 있는 1차원 배열에만 쓸 수 있어요.`);
    }
    if (param.raw && param.type !== 'line' && param.type !== 'line[]') {
      fail(`'${name}'의 raw는 line, line[]에만 쓸 수 있어요.`);
    }
    out.push(param);
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
    const until = normalizeEnd(raw.until);
    if (until === undefined) {
      fail('"until"은 "EOF"이거나 입력을 끝내는 줄(예: "0 0", "<0", "#*")이어야 해요.');
    }
    return { until: until ?? raw.until };
  }
  fail('"cases"는 null, { "count": "T" }, { "until": "EOF" }, { "until": "0 0" } 중 하나예요.');
  return undefined;
}

/** An end line with spaces normalized, or undefined when it cannot be one. */
export function normalizeEnd(text: string): string | undefined {
  const until = text.trim().replace(/\s+/g, ' ');
  if (until === '' || until.length > MAX_WORD) return undefined;
  return until;
}

/** Compact JSON with the key order of the DSL, for storage, prompts and issues. */
export function formatToJson(format: Format, pretty = false): string {
  const params = format.params.map((p) => {
    const out: Record<string, unknown> = { name: p.name, type: p.type };
    if (p.len !== undefined) out.len = p.len;
    if (p.cols !== undefined) out.cols = p.cols;
    if (p.flow) out.flow = true;
    if (p.raw) out.raw = true;
    return out;
  });
  const ret: Record<string, unknown> = { type: format.ret.type };
  for (const key of RET_KEYS) {
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

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
