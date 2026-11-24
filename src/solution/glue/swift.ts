/**
 * Swift glue (Baekjoon: `swiftc -O`): `import Foundation` goes before the user's code (the
 * line offset); after it, a reader over the whole input (read once with fread) and a main
 * function that calls `solution` per case and writes everything with one fwrite. Like the
 * coding-test site, parameters have no labels (`func solution(_ n: Int, _ arr: [Int])`),
 * `int` and `long` are both `Int` (64-bit) and `char[][]` is `[String]`.
 */
import {
  labelParts,
  retSep,
  type Format,
  type ParamType,
  type RetSpec,
  type RetType,
} from '../dsl';
import {
  planVar,
  renderCount,
  renderRows,
  usesRows,
  type CountRef,
  type LineEnd,
  type Plan,
  type Rows,
  type Scalar,
  type Step,
} from './plan';
import { SWIFT_ROWS, SWIFT_RUNTIME } from './swift-runtime';
import type { GlueLanguage } from './types';

export const SWIFT_PREFIX = 'import Foundation\n';

export const SWIFT_TYPES: Record<ParamType | RetType, string> = {
  int: 'Int',
  long: 'Int',
  double: 'Double',
  string: 'String',
  line: 'String',
  bool: 'Bool',
  'int[]': '[Int]',
  'long[]': '[Int]',
  'double[]': '[Double]',
  'string[]': '[String]',
  'line[]': '[String]',
  'int[][]': '[[Int]]',
  'long[][]': '[[Int]]',
  'double[][]': '[[Double]]',
  'string[][]': '[[String]]',
  'char[][]': '[String]',
};

/** A Swift string literal (control characters escaped, `\(` impossible). */
export function swiftQuote(s: string): string {
  const body = [...s]
    .map((ch) => {
      if (ch === '"' || ch === '\\') return `\\${ch}`;
      const c = ch.codePointAt(0) as number;
      if (c < 0x20 || c === 0x7f || c === 0x85 || c === 0x2028 || c === 0x2029) {
        return `\\u{${c.toString(16)}}`;
      }
      return ch;
    })
    .join('');
  return `"${body}"`;
}

const R = '__cib_in';
const READ: Record<Scalar, string> = {
  int: `${R}.ll()`,
  long: `${R}.ll()`,
  double: `${R}.dbl()`,
  string: `${R}.tok()`,
};
const PARSE: Record<Scalar, (x: string) => string> = {
  int: (x) => `${R}.pl(${x})`,
  long: (x) => `${R}.pl(${x})`,
  double: (x) => `${R}.pd(${x})`,
  string: (x) => x,
};

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => `${R}.cnt(${renderCount(c, variable)})`;
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `${R}.rowsTok([${end.map(swiftQuote).join(', ')}], ${k})`,
    line: (end, text) => `${R}.rowsLine(${end.mode}, ${swiftQuote(end.text)}, ${text})`,
    phys: (end) => `${R}.rowsPhys(${end.mode}, ${swiftQuote(end.text)})`,
  });
const endl = (end: LineEnd) => `${R}.endl(${end.mode}, ${swiftQuote(end.text)})`;

/** Repeats `item` (an expression) `n` times into the array `v`. */
const fill = (v: string, n: string, item: string) =>
  `${v} = []; for _ in 0..<${n} { ${v}.append(${item}) }`;

const DEFAULTS: Record<string, string> = { Int: '0', Double: '0', String: '""' };

/** A block: its lists start empty; each pass reads the block's variables and appends them. */
function block(plan: Plan, s: Extract<Step, { op: 'block' }>): string {
  const head = (() => {
    switch (s.loop.kind) {
      case 'count':
        return `for _ in 0..<${count(s.loop.n)}`;
      case 'eof':
        return `while ${R}.has()`;
      case 'tok':
        return `while !${R}.at([${s.loop.end.map(swiftQuote).join(', ')}])`;
      case 'line':
        return `while !${endl(s.loop.end)}`;
    }
  })();
  const type = (v: number) => SWIFT_TYPES[planVar(plan, v).type];
  return [
    ...s.items.map((x) => `${variable(x.list)} = []`),
    `${head} {`,
    ...s.items.map(
      (x) => `    var ${variable(x.item)}: ${type(x.item)} = ${DEFAULTS[type(x.item)] ?? '[]'}`,
    ),
    ...s.steps.flatMap((x) => step(plan, x).split('\n')).map((l) => `    ${l}`),
    ...s.items.map((x) => `    ${variable(x.list)}.append(${variable(x.item)})`),
    '}',
  ].join('\n');
}

function step(plan: Plan, s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
    case 'block':
      return block(plan, s);
    case 'raw':
      return `${v} = ${R}.rawl()`;
    case 'rawLines':
      return fill(v, rows(s.n), `${R}.rawl()`);
    case 'endRaw':
      return `_ = ${R}.rawl()`;
    case 'nl':
      return `${R}.nl()`;
    case 'scalar':
      return `${v} = ${READ[s.t]}`;
    case 'line':
      return `${v} = ${R}.line()`;
    case 'array':
      return fill(v, rows(s.n), READ[s.t]);
    case 'rest':
      return s.t === 'string'
        ? `${v} = ${R}.rest()`
        : `${v} = ${R}.rest().map { ${PARSE[s.t]('$0')} }`;
    case 'chars':
      return fill(v, rows(s.n), `${R}.tok()`);
    case 'grid':
      if (s.cols) {
        return `do { let __cib_m = ${count(s.cols)}; ${v} = []; for _ in 0..<${rows(s.n)} { var __cib_x: [${SWIFT_TYPES[s.t]}] = []; for _ in 0..<__cib_m { __cib_x.append(${READ[s.t]}) }; ${v}.append(__cib_x) } }`;
      }
      return `${v} = []; for _ in 0..<${rows(s.n)} { ${R}.nl(); ${v}.append(${s.t === 'string' ? `${R}.rest()` : `${R}.rest().map { ${PARSE[s.t]('$0')} }`}) }`;
    case 'lines':
      return `${v} = []; for _ in 0..<${rows(s.n)} { ${R}.nl(); ${v}.append(${R}.line()) }`;
    case 'endTok':
      return Array(s.k).fill(`_ = ${R}.tok()`).join('; ');
    case 'endLine':
      return `${R}.nl(); _ = ${R}.line()`;
  }
}

/** The case's output text as a String expression from `__cib_res`. */
function formatter(ret: RetSpec): string {
  const sep = swiftQuote(retSep(ret));
  switch (ret.type) {
    case 'bool':
      return `(__cib_res ? ${swiftQuote(ret.yes ?? 'true')} : ${swiftQuote(ret.no ?? 'false')})`;
    case 'double':
      return `String(format: "%.${ret.digits ?? 6}f", __cib_res)`;
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return `__cib_res.map { String($0) }.joined(separator: ${sep})`;
    case 'int[][]':
    case 'char[][]':
      return `__cib_res.map { $0.map { String($0) }.joined(separator: ${sep}) }.joined(separator: "\\n")`;
    default:
      return 'String(__cib_res)';
  }
}

export function swiftGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const label = labelParts(ret);
  const decls = plan.params.map((p, i) => {
    const type = SWIFT_TYPES[p.type];
    return `var ${variable(i)}: ${type} = ${DEFAULTS[type] ?? '[]'}`;
  });
  const body = (n: number) =>
    [
      ...decls,
      ...plan.steps.flatMap((s) => step(plan, s).split('\n')),
      `let __cib_res = solution(${vars.join(', ')})`,
      'if __cib_cases > 0 { __cib_o.append(10) }',
      '__cib_cases += 1',
      ...(label
        ? [
            `__cib_o.append(contentsOf: (${swiftQuote(label.pre)} + String(__cib_cases) + ${swiftQuote(label.post)}).utf8)`,
          ]
        : []),
      `__cib_o.append(contentsOf: ${formatter(ret)}.utf8)`,
      ...(ret.blank ? ['__cib_o.append(10)'] : []),
    ]
      .map((l) => ' '.repeat(n) + l)
      .join('\n');
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return `    do {\n${body(8)}\n    }`;
      case 'count':
        return `    let __cib_t = ${R}.ll()\n    var __cib_k = 0\n    while __cib_k < __cib_t {\n        __cib_k += 1\n${body(8)}\n    }`;
      case 'eof':
        return `    while ${R}.has() {\n${body(8)}\n    }`;
      case 'line':
        return `    while ${R}.has() && !${endl(plan.loop.end)} {\n${body(8)}\n    }`;
      case 'until': {
        const words = plan.loop.tokens.map(swiftQuote).join(', ');
        return [
          `    let __cib_end: [String] = [${words}]`,
          `    while ${R}.has() {`,
          `        let __cib_s = ${R}.p`,
          '        var __cib_stop = true',
          '        for __cib_w in __cib_end {',
          `            if !${R}.more() || ${R}.tok() != __cib_w {`,
          '                __cib_stop = false',
          '                break',
          '            }',
          '        }',
          '        if __cib_stop { break }',
          `        ${R}.p = __cib_s`,
          body(8),
          '    }',
        ].join('\n');
      }
    }
  })();
  return [
    '// ---- 입출력 코드 ----',
    SWIFT_RUNTIME,
    ...(usesRows(plan) ? [SWIFT_ROWS] : []),
    '}',
    '',
    'func __cib_main() {',
    `    let ${R} = __cib_Reader()`,
    '    var __cib_o: [UInt8] = []',
    '    var __cib_cases = 0',
    loop,
    '    if __cib_cases > 0 { __cib_o.append(10) }',
    '    __cib_o.withUnsafeBufferPointer { _ = fwrite($0.baseAddress, 1, $0.count, stdout) }',
    '    fflush(stdout)',
    '}',
    '',
    '__cib_main()',
    '',
  ].join('\n');
}

/** Swift keywords a format's parameter name could be (they need backticks). */
const KEYWORDS = new Set(
  (
    'associatedtype deinit extension fileprivate func import init inout internal let open ' +
    'operator private protocol rethrows subscript typealias var defer fallthrough guard in ' +
    'repeat where as is nil self Self super throw throws try some any'
  ).split(' '),
);

const PLACEHOLDER: Record<string, string> = {
  Int: '0',
  Double: '0.0',
  String: '""',
  Bool: 'true',
};

export function swiftStarter(format: Format): string {
  const params = format.params
    .map((p) => `_ ${KEYWORDS.has(p.name) ? `\`${p.name}\`` : p.name}: ${SWIFT_TYPES[p.type]}`)
    .join(', ');
  const type = SWIFT_TYPES[format.ret.type];
  return `// 자동 포함: Foundation\n\nfunc solution(${params}) -> ${type} {\n    return ${PLACEHOLDER[type] ?? '[]'}\n}\n`;
}

export const swiftLanguage: GlueLanguage = {
  prefix: SWIFT_PREFIX,
  glue: swiftGlue,
  starter: swiftStarter,
  fileName: 'solution.swift',
};
