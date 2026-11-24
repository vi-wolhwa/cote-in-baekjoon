/**
 * Rust 2021 glue: the user writes `fn solution(...) -> <ret>` (and any `use` lines, which
 * Rust allows anywhere); nothing goes before it. After it, a byte reader `__CibIn` and a
 * `main` that calls `solution` per case. Values are passed owned (`Vec<i64>`, `String`).
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

export const RUST_TYPES: Record<ParamType | RetType, string> = {
  int: 'i32',
  long: 'i64',
  double: 'f64',
  string: 'String',
  line: 'String',
  bool: 'bool',
  'int[]': 'Vec<i32>',
  'long[]': 'Vec<i64>',
  'double[]': 'Vec<f64>',
  'string[]': 'Vec<String>',
  'line[]': 'Vec<String>',
  'int[][]': 'Vec<Vec<i32>>',
  'long[][]': 'Vec<Vec<i64>>',
  'double[][]': 'Vec<Vec<f64>>',
  'string[][]': 'Vec<Vec<String>>',
  'char[][]': 'Vec<Vec<char>>',
};

const ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/** A Rust string literal. */
export function rustQuote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    const esc = ESCAPES[ch];
    if (ch === '\\' || ch === '"') out += `\\${ch}`;
    else if (esc !== undefined) out += esc;
    else if (c < 0x20 || c === 0x7f) out += `\\u{${c.toString(16)}}`;
    else out += ch;
  }
  return `${out}"`;
}

const RUNTIME = `#[allow(non_camel_case_types)]
struct __CibIn {
    d: Vec<u8>,
    p: usize,
}
fn __cib_fail() -> ! {
    eprintln!("__cib_input");
    std::process::exit(1)
}
fn __cib_ws(c: u8) -> bool {
    c == b' ' || c == b'\\n' || c == b'\\r' || c == b'\\t'
}
fn __cib_str(b: &[u8]) -> String {
    String::from_utf8_lossy(b).into_owned()
}
fn __cib_ll(b: &[u8]) -> i64 {
    let mut i = 0;
    let mut neg = false;
    if i < b.len() && (b[i] == b'-' || b[i] == b'+') {
        neg = b[i] == b'-';
        i += 1;
    }
    if i >= b.len() {
        __cib_fail()
    }
    let mut v: i64 = 0;
    while i < b.len() {
        let c = b[i].wrapping_sub(b'0');
        if c > 9 {
            __cib_fail()
        }
        v = v.wrapping_mul(10).wrapping_sub(c as i64);
        i += 1;
    }
    if neg {
        v
    } else {
        v.wrapping_neg()
    }
}
fn __cib_int(b: &[u8]) -> i32 {
    __cib_ll(b) as i32
}
fn __cib_dbl(b: &[u8]) -> f64 {
    match std::str::from_utf8(b).ok().and_then(|s| s.parse::<f64>().ok()) {
        Some(v) => v,
        None => __cib_fail(),
    }
}
fn __cib_cnt(x: i64) -> usize {
    if x < 0 {
        __cib_fail()
    }
    x as usize
}
#[allow(dead_code)]
impl __CibIn {
    fn more(&mut self) -> bool {
        while self.p < self.d.len() && __cib_ws(self.d[self.p]) {
            self.p += 1;
        }
        self.p < self.d.len()
    }
    fn word(&mut self) -> &[u8] {
        if !self.more() {
            __cib_fail()
        }
        let s = self.p;
        while self.p < self.d.len() && !__cib_ws(self.d[self.p]) {
            self.p += 1;
        }
        &self.d[s..self.p]
    }
    fn tok(&mut self) -> String {
        __cib_str(self.word())
    }
    fn ll(&mut self) -> i64 {
        __cib_ll(self.word())
    }
    fn int(&mut self) -> i32 {
        __cib_int(self.word())
    }
    fn dbl(&mut self) -> f64 {
        __cib_dbl(self.word())
    }
    fn nl(&mut self) {
        let n = self.d.len();
        if self.p > 0 && self.d[self.p - 1] != b'\\n' {
            while self.p < n && self.d[self.p] != b'\\n' {
                self.p += 1;
            }
            if self.p < n {
                self.p += 1;
            }
        }
        loop {
            let mut q = self.p;
            while q < n && self.d[q] != b'\\n' && __cib_ws(self.d[q]) {
                q += 1;
            }
            if q < n && self.d[q] == b'\\n' {
                self.p = q + 1;
            } else {
                break;
            }
        }
    }
    fn end(&self) -> usize {
        if self.p >= self.d.len() {
            __cib_fail()
        }
        let mut e = self.p;
        while e < self.d.len() && self.d[e] != b'\\n' {
            e += 1;
        }
        e
    }
    fn line(&mut self) -> String {
        let mut e = self.end();
        let mut s = self.p;
        self.p = e;
        while s < e && __cib_ws(self.d[s]) {
            s += 1;
        }
        while e > s && __cib_ws(self.d[e - 1]) {
            e -= 1;
        }
        __cib_str(&self.d[s..e])
    }
    // The words of the rest of the line, as ranges of the input.
    fn rest(&mut self) -> Vec<(usize, usize)> {
        let e = self.end();
        let mut r = Vec::new();
        let mut i = self.p;
        self.p = e;
        while i < e {
            while i < e && __cib_ws(self.d[i]) {
                i += 1;
            }
            let s = i;
            while i < e && !__cib_ws(self.d[i]) {
                i += 1;
            }
            if i > s {
                r.push((s, i));
            }
        }
        r
    }
    fn has(&self) -> bool {
        let mut q = self.p;
        while q < self.d.len() && __cib_ws(self.d[q]) {
            q += 1;
        }
        q < self.d.len()
    }
    fn vec<T>(&mut self, n: usize, mut f: impl FnMut(&mut Self) -> T) -> Vec<T> {
        let mut a = Vec::with_capacity(n.min(self.d.len() + 1));
        for _ in 0..n {
            a.push(f(&mut *self));
        }
        a
    }
}`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS = `#[allow(dead_code)]
impl __CibIn {
    fn at(&mut self, w: &[&str]) -> bool {
        let s = self.p;
        let mut ok = true;
        for x in w {
            if !self.more() || self.tok() != *x {
                ok = false;
                break;
            }
        }
        self.p = s;
        ok
    }
    fn rows_tok(&mut self, w: &[&str], k: usize) -> usize {
        let s = self.p;
        let mut r = 0;
        loop {
            let stop = if w.is_empty() { !self.has() } else { self.at(w) };
            if stop {
                break;
            }
            if k < 1 || !self.has() {
                __cib_fail()
            }
            for _ in 0..k {
                self.word();
            }
            r += 1;
        }
        self.p = s;
        r
    }
    fn raw(&mut self) -> String {
        let mut e = self.p;
        while e < self.d.len() && self.d[e] != b'\\n' {
            e += 1;
        }
        let s = self.p;
        self.p = e;
        while e > s && __cib_ws(self.d[e - 1]) {
            e -= 1;
        }
        __cib_str(&self.d[s..e])
    }
    fn rows_line(&mut self, e: Option<&str>, raw: bool) -> usize {
        let s = self.p;
        let mut r = 0;
        loop {
            self.nl();
            if !self.has() {
                if e.is_some() {
                    __cib_fail()
                }
                break;
            }
            let t = if raw { self.raw() } else { self.line() };
            if let Some(x) = e {
                if t == x {
                    break;
                }
            }
            r += 1;
        }
        self.p = s;
        r
    }
}`;

/** Reads one value with the reader `q`. */
const READ: Record<Scalar, (q: string) => string> = {
  int: (q) => `${q}.int()`,
  long: (q) => `${q}.ll()`,
  double: (q) => `${q}.dbl()`,
  string: (q) => `${q}.tok()`,
};
/** Converts one word (a byte slice) of the input. */
const CONVERT: Record<Scalar, (b: string) => string> = {
  int: (b) => `__cib_int(${b})`,
  long: (b) => `__cib_ll(${b})`,
  double: (b) => `__cib_dbl(${b})`,
  string: (b) => `__cib_str(${b})`,
};

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => `__cib_cnt(${renderCount(c, (v) => `${variable(v)} as i64`)})`;
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_in.rows_tok(&[${end.map(rustQuote).join(', ')}], ${k})`,
    line: (end, raw) =>
      `__cib_in.rows_line(${end === null ? 'None' : `Some(${rustQuote(end)})`}, ${raw})`,
  });
/** The words `w` of reader `q`, converted and collected. */
const words = (t: Scalar, q: string, w: string) =>
  `${w}.iter().map(|&(__cib_s, __cib_e)| ${CONVERT[t](`&${q}.d[__cib_s..__cib_e]`)}).collect()`;

function step(s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
    case 'nl':
      return '__cib_in.nl();';
    case 'scalar':
      return `${v} = ${READ[s.t]('__cib_in')};`;
    case 'line':
      return `${v} = __cib_in.line();`;
    case 'array':
      return `${v} = { let __cib_n = ${rows(s.n)}; __cib_in.vec(__cib_n, |__cib_q| ${READ[s.t]('__cib_q')}) };`;
    case 'rest':
      return `${v} = { let __cib_w = __cib_in.rest(); ${words(s.t, '__cib_in', '__cib_w')} };`;
    case 'chars':
      return `${v} = { let __cib_n = ${rows(s.n)}; __cib_in.vec(__cib_n, |__cib_q| __cib_q.tok().chars().collect()) };`;
    case 'grid':
      return s.cols
        ? `${v} = { let __cib_n = ${rows(s.n)}; let __cib_c = ${count(s.cols)}; __cib_in.vec(__cib_n, |__cib_q| __cib_q.vec(__cib_c, |__cib_q| ${READ[s.t]('__cib_q')})) };`
        : `${v} = { let __cib_n = ${rows(s.n)}; __cib_in.vec(__cib_n, |__cib_q| { __cib_q.nl(); let __cib_w = __cib_q.rest(); ${words(s.t, '__cib_q', '__cib_w')} }) };`;
    case 'lines':
      return `${v} = { let __cib_n = ${rows(s.n)}; __cib_in.vec(__cib_n, |__cib_q| { __cib_q.nl(); __cib_q.line() }) };`;
    case 'endTok':
      return Array(s.k).fill('__cib_in.word();').join(' ');
    case 'endLine':
      return '__cib_in.nl(); __cib_in.line();';
  }
}

/** Prints `__cib_r`: any Display value, and anything with `iter()` for arrays. */
function printer(ret: RetSpec): string[] {
  const sep = rustQuote(retSep(ret));
  const join = (arr: string) => [
    `for (__cib_j, __cib_x) in ${arr}.iter().enumerate() {`,
    `    if __cib_j > 0 { __cib_o.push_str(${sep}); }`,
    '    write!(__cib_o, "{}", __cib_x).unwrap();',
    '}',
  ];
  switch (ret.type) {
    case 'bool':
      return [
        `__cib_o.push_str(if __cib_r { ${rustQuote(ret.yes ?? 'true')} } else { ${rustQuote(ret.no ?? 'false')} });`,
      ];
    case 'double':
      return [`write!(__cib_o, "{:.${ret.digits ?? 6}}", __cib_r).unwrap();`];
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return join('__cib_r');
    case 'int[][]':
    case 'char[][]':
      return [
        'for (__cib_i, __cib_row) in __cib_r.iter().enumerate() {',
        "    if __cib_i > 0 { __cib_o.push('\\n'); }",
        ...join('__cib_row').map((l) => `    ${l}`),
        '}',
      ];
    default:
      return ['write!(__cib_o, "{}", __cib_r).unwrap();'];
  }
}

export function rustGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const label = labelParts(ret);
  const decls = plan.params.map((p, i) => `let ${variable(i)}: ${RUST_TYPES[p.type]};`);
  const body = (n: number) =>
    [
      ...decls,
      ...plan.steps.map(step),
      `let __cib_r = solution(${vars.join(', ')});`,
      "if __cib_cases > 0 { __cib_o.push('\\n'); }",
      '__cib_cases += 1;',
      ...(label
        ? [
            `write!(__cib_o, "{}{}{}", ${rustQuote(label.pre)}, __cib_cases, ${rustQuote(label.post)}).unwrap();`,
          ]
        : []),
      ...printer(ret),
      ...(ret.blank ? ["__cib_o.push('\\n');"] : []),
    ]
      .map((l) => ' '.repeat(n) + l)
      .join('\n');
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return `    {\n${body(8)}\n    }`;
      case 'count':
        return `    let __cib_t = __cib_in.int();\n    for _ in 0..__cib_t {\n${body(8)}\n    }`;
      case 'eof':
        return `    while __cib_in.has() {\n${body(8)}\n    }`;
      case 'until': {
        const words = plan.loop.tokens.map(rustQuote).join(', ');
        return [
          `    let __cib_end: &[&str] = &[${words}];`,
          '    while __cib_in.has() {',
          '        let __cib_s = __cib_in.p;',
          '        let mut __cib_stop = true;',
          '        for __cib_w in __cib_end {',
          '            if !__cib_in.more() || __cib_in.tok() != *__cib_w {',
          '                __cib_stop = false;',
          '                break;',
          '            }',
          '        }',
          '        if __cib_stop {',
          '            break;',
          '        }',
          '        __cib_in.p = __cib_s;',
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
    '',
    '#[allow(unused_mut, unused_variables)]',
    'fn main() {',
    '    use std::fmt::Write as _;',
    '    use std::io::Read as _;',
    '    use std::io::Write as _;',
    '    let mut __cib_d = Vec::new();',
    '    std::io::stdin().read_to_end(&mut __cib_d).unwrap();',
    '    let mut __cib_in = __CibIn { d: __cib_d, p: 0 };',
    '    let mut __cib_o = String::new();',
    '    let mut __cib_cases = 0;',
    loop,
    "    if __cib_cases > 0 { __cib_o.push('\\n'); }",
    '    std::io::stdout().write_all(__cib_o.as_bytes()).unwrap();',
    '}',
    '',
  ].join('\n');
}

const PLACEHOLDER: Record<RetType, string> = {
  int: '0',
  long: '0',
  double: '0.0',
  string: 'String::new()',
  bool: 'true',
  'int[]': 'vec![]',
  'long[]': 'vec![]',
  'string[]': 'vec![]',
  'line[]': 'vec![]',
  'int[][]': 'vec![]',
  'char[][]': 'vec![]',
};

export function rustStarter(format: Format): string {
  const params = format.params.map((p) => `${p.name}: ${RUST_TYPES[p.type]}`).join(', ');
  const type = RUST_TYPES[format.ret.type];
  return `fn solution(${params}) -> ${type} {\n    let answer: ${type} = ${PLACEHOLDER[format.ret.type]};\n    answer\n}\n`;
}

export const rustLanguage: GlueLanguage = {
  prefix: '',
  glue: rustGlue,
  starter: rustStarter,
  fileName: 'solution.rs',
};
