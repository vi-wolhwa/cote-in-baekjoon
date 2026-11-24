/**
 * Go glue: `package main` and the glue's own imports (under `__cib_` names, so the user's
 * `import "os"` or `import "fmt"` never clash and none goes unused) come before the user's
 * `func solution(...)`; the user's own imports follow at the top of their code. After it,
 * a byte reader and `func main` that calls `solution` per case.
 */
import {
  labelParts,
  retSep,
  type Format,
  type ParamType,
  type RetSpec,
  type RetType,
} from '../dsl';
import { GO_ROWS, GO_RUNTIME } from './go-runtime';
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
import type { GlueLanguage } from './types';

export const GO_PREFIX =
  'package main\nimport (__cib_io "io"; __cib_os "os"; __cib_strconv "strconv")\n';

export const GO_TYPES: Record<ParamType | RetType, string> = {
  int: 'int',
  long: 'int64',
  double: 'float64',
  string: 'string',
  line: 'string',
  bool: 'bool',
  'int[]': '[]int',
  'long[]': '[]int64',
  'double[]': '[]float64',
  'string[]': '[]string',
  'line[]': '[]string',
  'int[][]': '[][]int',
  'long[][]': '[][]int64',
  'double[][]': '[][]float64',
  'string[][]': '[][]string',
  'char[][]': '[]string',
};

const ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/** A Go string literal. */
export function goQuote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    const esc = ESCAPES[ch];
    if (ch === '\\' || ch === '"') out += `\\${ch}`;
    else if (esc !== undefined) out += esc;
    else if (c < 0x20 || c === 0x7f) out += `\\x${c.toString(16).padStart(2, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

/** `package main` written by habit would be a second package clause: blank it out. */
export function dropPackage(code: string): string {
  return code.replace(/^[ \t]*package[ \t]+main[ \t]*;?[ \t]*$/m, '');
}

const ELEMENT: Record<Scalar, string> = {
  int: 'int',
  long: 'int64',
  double: 'float64',
  string: 'string',
};
/** Converts one word (a byte slice) of the input. */
const CONVERT: Record<Scalar, (b: string) => string> = {
  int: (b) => `int(__cib_ll(${b}))`,
  long: (b) => `__cib_ll(${b})`,
  double: (b) => `__cib_dbl(${b})`,
  string: (b) => `string(${b})`,
};
const READ = (t: Scalar) => CONVERT[t]('__cib_word()');

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => `__cib_cnt(${renderCount(c, (v) => `int64(${variable(v)})`)})`;
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_rowsTok([]string{${end.map(goQuote).join(', ')}}, ${k})`,
    line: (end, text) => `__cib_rowsLine(${end.mode}, ${goQuote(end.text)}, ${text})`,
    phys: (end) => `__cib_rowsPhys(${end.mode}, ${goQuote(end.text)})`,
  });

/** A block: its lists start empty; each pass reads the block's variables and appends them. */
function block(plan: Plan, s: Extract<Step, { op: 'block' }>): string[] {
  const head = (() => {
    switch (s.loop.kind) {
      case 'count':
        return `for __cib_b, __cib_bn := 0, ${count(s.loop.n)}; __cib_b < __cib_bn; __cib_b++ {`;
      case 'eof':
        return 'for __cib_has() {';
      case 'tok':
        return `for !__cib_at([]string{${s.loop.end.map(goQuote).join(', ')}}) {`;
      case 'line':
        return `for !__cib_endl(${s.loop.end.mode}, ${goQuote(s.loop.end.text)}) {`;
    }
  })();
  return [
    ...s.items.map((x) => `${variable(x.list)} = ${GO_TYPES[planVar(plan, x.list).type]}{}`),
    head,
    ...s.items.map((x) => `    var ${variable(x.item)} ${GO_TYPES[planVar(plan, x.item).type]}`),
    ...s.steps.flatMap((x) => step(plan, x)).map((l) => `    ${l}`),
    ...s.items.map(
      (x) => `    ${variable(x.list)} = append(${variable(x.list)}, ${variable(x.item)})`,
    ),
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
      return `${v} = __cib_rawl()`;
    case 'rawLines':
      return `${v} = make([]string, ${rows(s.n)}); for __cib_i := range ${v} { ${v}[__cib_i] = __cib_rawl() }`;
    case 'endRaw':
      return '__cib_rawl()';
    case 'nl':
      return '__cib_nl()';
    case 'scalar':
      return `${v} = ${READ(s.t)}`;
    case 'line':
      return `${v} = __cib_line()`;
    case 'array':
      return `${v} = make([]${ELEMENT[s.t]}, ${rows(s.n)}); for __cib_i := range ${v} { ${v}[__cib_i] = ${READ(s.t)} }`;
    case 'rest':
      return `{ __cib_w := __cib_rest(); ${v} = make([]${ELEMENT[s.t]}, len(__cib_w)); for __cib_i, __cib_x := range __cib_w { ${v}[__cib_i] = ${CONVERT[s.t]('__cib_x')} } }`;
    case 'chars':
      return `${v} = make([]string, ${rows(s.n)}); for __cib_i := range ${v} { ${v}[__cib_i] = __cib_tok() }`;
    case 'grid': {
      const e = ELEMENT[s.t];
      return s.cols
        ? `${v} = make([][]${e}, ${rows(s.n)}); for __cib_i := range ${v} { ${v}[__cib_i] = make([]${e}, ${count(s.cols)}); for __cib_j := range ${v}[__cib_i] { ${v}[__cib_i][__cib_j] = ${READ(s.t)} } }`
        : `${v} = make([][]${e}, ${rows(s.n)}); for __cib_i := range ${v} { __cib_nl(); __cib_w := __cib_rest(); ${v}[__cib_i] = make([]${e}, len(__cib_w)); for __cib_j, __cib_x := range __cib_w { ${v}[__cib_i][__cib_j] = ${CONVERT[s.t]('__cib_x')} } }`;
    }
    case 'lines':
      return `${v} = make([]string, ${rows(s.n)}); for __cib_i := range ${v} { __cib_nl(); ${v}[__cib_i] = __cib_line() }`;
    case 'endTok':
      return Array(s.k).fill('__cib_word()').join('; ');
    case 'endLine':
      return '__cib_nl(); __cib_line()';
  }
}

/** Prints `__cib_r`; ranging works for any slice, strings as rows of characters. */
function printer(ret: RetSpec): string[] {
  const sep = goQuote(retSep(ret));
  const join = (arr: string, item: (x: string) => string) => [
    `for __cib_j, __cib_x := range ${arr} {`,
    '    if __cib_j > 0 {',
    `        __cib_o = append(__cib_o, ${sep}...)`,
    '    }',
    `    __cib_o = ${item('__cib_x')}`,
    '}',
  ];
  const put = (x: string) => `__cib_put(__cib_o, ${x})`;
  switch (ret.type) {
    case 'bool':
      return [
        'if __cib_r {',
        `    __cib_o = append(__cib_o, ${goQuote(ret.yes ?? 'true')}...)`,
        '} else {',
        `    __cib_o = append(__cib_o, ${goQuote(ret.no ?? 'false')}...)`,
        '}',
      ];
    case 'double':
      return [
        `__cib_o = __cib_strconv.AppendFloat(__cib_o, float64(__cib_r), 'f', ${ret.digits ?? 6}, 64)`,
      ];
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return join('__cib_r', put);
    case 'int[][]':
    case 'char[][]': {
      const item =
        ret.type === 'char[][]' ? (x: string) => `append(__cib_o, string(${x})...)` : put;
      return [
        'for __cib_i, __cib_row := range __cib_r {',
        '    if __cib_i > 0 {',
        "        __cib_o = append(__cib_o, '\\n')",
        '    }',
        ...join('__cib_row', item).map((l) => `    ${l}`),
        '}',
      ];
    }
    default:
      return [`__cib_o = ${put('__cib_r')}`];
  }
}

export function goGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const label = labelParts(ret);
  const decls = plan.params.map((p, i) => `var ${variable(i)} ${GO_TYPES[p.type]}`);
  const body = (n: number) =>
    [
      ...decls,
      ...plan.steps.flatMap((s) => step(plan, s)),
      `__cib_r := solution(${vars.join(', ')})`,
      'if __cib_cases > 0 {',
      "    __cib_o = append(__cib_o, '\\n')",
      '}',
      '__cib_cases++',
      ...(label
        ? [
            `__cib_o = append(__cib_o, ${goQuote(label.pre)}...)`,
            '__cib_o = __cib_strconv.AppendInt(__cib_o, int64(__cib_cases), 10)',
            `__cib_o = append(__cib_o, ${goQuote(label.post)}...)`,
          ]
        : []),
      ...printer(ret),
      ...(ret.blank ? ["__cib_o = append(__cib_o, '\\n')"] : []),
    ]
      .map((l) => ' '.repeat(n) + l)
      .join('\n');
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return `    {\n${body(8)}\n    }`;
      case 'count':
        return `    __cib_t := int(__cib_ll(__cib_word()))\n    for __cib_k := 0; __cib_k < __cib_t; __cib_k++ {\n${body(8)}\n    }`;
      case 'eof':
        return `    for __cib_has() {\n${body(8)}\n    }`;
      case 'line': {
        const { mode, text } = plan.loop.end;
        return `    for __cib_has() && !__cib_endl(${mode}, ${goQuote(text)}) {\n${body(8)}\n    }`;
      }
      case 'until': {
        const words = plan.loop.tokens.map(goQuote).join(', ');
        return [
          `    __cib_end := []string{${words}}`,
          '    for __cib_has() {',
          '        __cib_s := __cib_p',
          '        __cib_stop := true',
          '        for _, __cib_w := range __cib_end {',
          '            if !__cib_more() || __cib_tok() != __cib_w {',
          '                __cib_stop = false',
          '                break',
          '            }',
          '        }',
          '        if __cib_stop {',
          '            break',
          '        }',
          '        __cib_p = __cib_s',
          body(8),
          '    }',
        ].join('\n');
      }
    }
  })();
  return [
    '// ---- 입출력 코드 ----',
    GO_RUNTIME,
    ...(usesRows(plan) ? [GO_ROWS] : []),
    '',
    'func main() {',
    '    __cib_d, _ = __cib_io.ReadAll(__cib_os.Stdin)',
    '    __cib_o := make([]byte, 0, 1<<16)',
    '    __cib_cases := 0',
    loop,
    '    if __cib_cases > 0 {',
    "        __cib_o = append(__cib_o, '\\n')",
    '    }',
    '    __cib_os.Stdout.Write(__cib_o)',
    '}',
    '',
  ].join('\n');
}

export function goStarter(format: Format): string {
  const params = format.params.map((p) => `${p.name} ${GO_TYPES[p.type]}`).join(', ');
  const type = GO_TYPES[format.ret.type];
  const answer = format.ret.type === 'bool' ? 'answer := true' : `var answer ${type}`;
  return `// 자동 포함: package main\n\nfunc solution(${params}) ${type} {\n    ${answer}\n    return answer\n}\n`;
}

export const goLanguage: GlueLanguage = {
  prefix: GO_PREFIX,
  user: dropPackage,
  glue: goGlue,
  starter: goStarter,
  fileName: 'solution.go',
};
