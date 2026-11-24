/**
 * Swift glue (Baekjoon: `swiftc -O`): `import Foundation` goes before the user's code (the
 * line offset); after it, a reader over the whole input (read once with fread) and a main
 * function that calls `solution` per case and writes everything with one fwrite. Like the
 * coding-test site, parameters have no labels (`func solution(_ n: Int, _ arr: [Int])`),
 * `int` and `long` are both `Int` (64-bit) and `char[][]` is `[String]`.
 */
import { retSep, type Format, type ParamType, type RetSpec, type RetType } from '../dsl';
import {
  renderCount,
  renderRows,
  usesRows,
  type CountRef,
  type Plan,
  type Rows,
  type Scalar,
  type Step,
} from './plan';
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

const RUNTIME = `final class __cib_Reader {
    var d: [UInt8] = []
    var p = 0
    var n = 0
    init() {
        var buf = [UInt8](repeating: 0, count: 1 << 16)
        while true {
            let k = fread(&buf, 1, buf.count, stdin)
            if k <= 0 { break }
            d.append(contentsOf: buf[0..<k])
        }
        n = d.count
    }
    func fail() -> Never {
        fputs("__cib_input\\n", stderr)
        exit(1)
    }
    @inline(__always) func ws(_ c: UInt8) -> Bool { return c == 32 || c == 10 || c == 13 || c == 9 }
    func cnt(_ x: Int) -> Int {
        if x < 0 { fail() }
        return x
    }
    func more() -> Bool {
        while p < n && ws(d[p]) { p += 1 }
        return p < n
    }
    func has() -> Bool {
        var q = p
        while q < n && ws(d[q]) { q += 1 }
        return q < n
    }
    func str(_ s: Int, _ e: Int) -> String { return String(decoding: d[s..<e], as: UTF8.self) }
    func tok() -> String {
        if !more() { fail() }
        let s = p
        while p < n && !ws(d[p]) { p += 1 }
        return str(s, p)
    }
    func ll() -> Int {
        if !more() { fail() }
        var neg = false
        if d[p] == 45 || d[p] == 43 { neg = d[p] == 45; p += 1 }
        if p >= n || ws(d[p]) { fail() }
        var v = 0
        while p < n && !ws(d[p]) {
            let c = Int(d[p]) - 48
            if c < 0 || c > 9 { fail() }
            v = v &* 10 &- c
            p += 1
        }
        return neg ? v : 0 &- v
    }
    func pl(_ s: String) -> Int {
        guard let v = Int(s) else { fail() }
        return v
    }
    func pd(_ s: String) -> Double {
        guard let v = Double(s) else { fail() }
        return v
    }
    func dbl() -> Double { return pd(tok()) }
    func nl() {
        if p > 0 && d[p - 1] != 10 {
            while p < n && d[p] != 10 { p += 1 }
            if p < n { p += 1 }
        }
        while true {
            var q = p
            while q < n && d[q] != 10 && ws(d[q]) { q += 1 }
            if q < n && d[q] == 10 { p = q + 1 } else { break }
        }
    }
    func line() -> String {
        if p >= n { fail() }
        var e = p
        while e < n && d[e] != 10 { e += 1 }
        var s = p
        p = e
        while s < e && ws(d[s]) { s += 1 }
        while e > s && ws(d[e - 1]) { e -= 1 }
        return str(s, e)
    }
    func rest() -> [String] {
        if p >= n { fail() }
        var r: [String] = []
        while p < n && d[p] != 10 {
            while p < n && d[p] != 10 && ws(d[p]) { p += 1 }
            let s = p
            while p < n && !ws(d[p]) { p += 1 }
            if p > s { r.append(str(s, p)) }
        }
        return r
    }`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS = `    func at(_ w: [String]) -> Bool {
        let s = p
        var ok = true
        for x in w {
            if !more() || tok() != x {
                ok = false
                break
            }
        }
        p = s
        return ok
    }
    func rowsTok(_ w: [String], _ k: Int) -> Int {
        let s = p
        var r = 0
        while true {
            if (w.isEmpty ? !has() : at(w)) { break }
            if k < 1 || !has() { fail() }
            for _ in 0..<k { _ = tok() }
            r += 1
        }
        p = s
        return r
    }
    func raw() -> String {
        var e = p
        while e < n && d[e] != 10 { e += 1 }
        let s = p
        p = e
        while e > s && ws(d[e - 1]) { e -= 1 }
        return str(s, e)
    }
    func rowsLine(_ e: String?, _ whole: Bool) -> Int {
        let s = p
        var r = 0
        while true {
            nl()
            if !has() {
                if e != nil { fail() }
                break
            }
            let t = whole ? raw() : line()
            if let e = e, t == e { break }
            r += 1
        }
        p = s
        return r
    }`;

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
    line: (end, raw) => `${R}.rowsLine(${end === null ? 'nil' : swiftQuote(end)}, ${raw})`,
  });

/** Repeats `item` (an expression) `n` times into the array `v`. */
const fill = (v: string, n: string, item: string) =>
  `${v} = []; for _ in 0..<${n} { ${v}.append(${item}) }`;

function step(s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
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

const DEFAULTS: Record<string, string> = { Int: '0', Double: '0', String: '""' };

export function swiftGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const decls = plan.params.map((p, i) => {
    const type = SWIFT_TYPES[p.type];
    return `var ${variable(i)}: ${type} = ${DEFAULTS[type] ?? '[]'}`;
  });
  const body = (n: number) =>
    [
      ...decls,
      ...plan.steps.map(step),
      `let __cib_res = solution(${vars.join(', ')})`,
      'if __cib_cases > 0 { __cib_o.append(10) }',
      '__cib_cases += 1',
      `__cib_o.append(contentsOf: ${formatter(ret)}.utf8)`,
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
    RUNTIME,
    ...(usesRows(plan) ? [ROWS] : []),
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
