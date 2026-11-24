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
  allSteps,
  planVar,
  renderCount,
  renderRows,
  usesRows,
  type CountRef,
  type Plan,
  type Rows,
  type Scalar,
  type Step,
} from './plan';
import { RUST_ROWS, RUST_RUNTIME } from './rust-runtime';
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
    line: (end, text) => `__cib_in.rows_line(${end.mode}, ${rustQuote(end.text)}, ${text})`,
    phys: (end) => `__cib_in.rows_phys(${end.mode}, ${rustQuote(end.text)})`,
  });
/** The words `w` of reader `q`, converted and collected. */
const words = (t: Scalar, q: string, w: string) =>
  `${w}.iter().map(|&(__cib_s, __cib_e)| ${CONVERT[t](`&${q}.d[__cib_s..__cib_e]`)}).collect()`;

/** Block lists are filled by pushing, so they are declared `mut`. */
const blockLists = (plan: Plan) =>
  new Set(
    allSteps(plan.steps).flatMap((s) => (s.op === 'block' ? s.items.map((x) => x.list) : [])),
  );

/** A block: its lists start empty; each pass reads the block's variables and pushes them. */
function block(plan: Plan, s: Extract<Step, { op: 'block' }>): string[] {
  const head = (() => {
    switch (s.loop.kind) {
      case 'count':
        return `for _ in 0..${count(s.loop.n)} {`;
      case 'eof':
        return 'while __cib_in.has() {';
      case 'tok':
        return `while !__cib_in.at(&[${s.loop.end.map(rustQuote).join(', ')}]) {`;
      case 'line':
        return `while !__cib_in.endl(${s.loop.end.mode}, ${rustQuote(s.loop.end.text)}) {`;
    }
  })();
  return [
    ...s.items.map((x) => `${variable(x.list)} = Vec::new();`),
    head,
    ...s.items.map(
      (x) => `    let ${variable(x.item)}: ${RUST_TYPES[planVar(plan, x.item).type]};`,
    ),
    ...s.steps.flatMap((x) => step(plan, x)).map((l) => `    ${l}`),
    ...s.items.map((x) => `    ${variable(x.list)}.push(${variable(x.item)});`),
    '}',
  ];
}

/** The lines of one step. */
function step(plan: Plan, s: Step): string[] {
  if (s.op === 'block') return block(plan, s);
  return [stepLine(s)];
}

function stepLine(s: Exclude<Step, { op: 'block' }>): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
    case 'raw':
      return `${v} = __cib_in.rawl();`;
    case 'rawLines':
      return `${v} = { let __cib_n = ${rows(s.n)}; __cib_in.vec(__cib_n, |__cib_q| __cib_q.rawl()) };`;
    case 'endRaw':
      return '__cib_in.rawl();';
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
  const lists = blockLists(plan);
  const decls = plan.params.map(
    (p, i) => `let ${lists.has(i) ? 'mut ' : ''}${variable(i)}: ${RUST_TYPES[p.type]};`,
  );
  const body = (n: number) =>
    [
      ...decls,
      ...plan.steps.flatMap((s) => step(plan, s)),
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
      case 'line': {
        const { mode, text } = plan.loop.end;
        return `    while __cib_in.has() && !__cib_in.endl(${mode}, ${rustQuote(text)}) {\n${body(8)}\n    }`;
      }
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
    RUST_RUNTIME,
    ...(usesRows(plan) ? [RUST_ROWS] : []),
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
