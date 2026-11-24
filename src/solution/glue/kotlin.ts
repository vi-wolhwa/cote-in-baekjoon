/**
 * Kotlin (JVM) glue: the user writes `class Solution { fun solution(...): <ret> }` like on a
 * coding-test site, with their own imports at the top; nothing goes before it. After it,
 * top-level `__cib_` reader functions and `fun main()` that make a new Solution per case.
 */
import {
  labelParts,
  retSep,
  type Format,
  type ParamType,
  type RetSpec,
  type RetType,
} from '../dsl';
import { KOTLIN_ROWS, KOTLIN_RUNTIME } from './kotlin-runtime';
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
import type { GlueLanguage } from './types';

export const KOTLIN_TYPES: Record<ParamType | RetType, string> = {
  int: 'Int',
  long: 'Long',
  double: 'Double',
  string: 'String',
  line: 'String',
  bool: 'Boolean',
  'int[]': 'IntArray',
  'long[]': 'LongArray',
  'double[]': 'DoubleArray',
  'string[]': 'Array<String>',
  'line[]': 'Array<String>',
  'int[][]': 'Array<IntArray>',
  'long[][]': 'Array<LongArray>',
  'double[][]': 'Array<DoubleArray>',
  'string[][]': 'Array<Array<String>>',
  'char[][]': 'Array<CharArray>',
};

const ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/** A Kotlin string literal (`$` would start a template). */
export function kotlinQuote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    const esc = ESCAPES[ch];
    if (ch === '\\' || ch === '"' || ch === '$') out += `\\${ch}`;
    else if (esc !== undefined) out += esc;
    else if (c < 0x20 || c === 0x7f) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

const READ: Record<Scalar, string> = {
  int: '__cib_int()',
  long: '__cib_ll()',
  double: '__cib_dbl()',
  string: '__cib_tok()',
};
const ARRAY: Record<Scalar, string> = {
  int: 'IntArray',
  long: 'LongArray',
  double: 'DoubleArray',
  string: 'Array',
};
/** A typed array from a row's words `w`. */
const FROM_WORDS: Record<Scalar, (w: string) => string> = {
  int: (w) => `IntArray(${w}.size) { ${w}[it].toInt() }`,
  long: (w) => `LongArray(${w}.size) { ${w}[it].toLong() }`,
  double: (w) => `DoubleArray(${w}.size) { ${w}[it].toDouble() }`,
  string: (w) => w,
};

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => `(${renderCount(c, variable)}).toInt()`;
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_rowsTok(arrayOf<String>(${end.map(kotlinQuote).join(', ')}), ${k})`,
    line: (end, text) => `__cib_rowsLine(${end.mode}, ${kotlinQuote(end.text)}, ${text})`,
    phys: (end) => `__cib_rowsPhys(${end.mode}, ${kotlinQuote(end.text)})`,
  });
const endl = (end: LineEnd) => `__cib_endl(${end.mode}, ${kotlinQuote(end.text)})`;

/** Converts a block's list buffer (an ArrayList) to the parameter's array type. */
const fromBuffer = (type: string) =>
  ({ IntArray: 'toIntArray()', LongArray: 'toLongArray()', DoubleArray: 'toDoubleArray()' })[
    type
  ] ?? 'toTypedArray()';

/**
 * A block: each pass declares the block's variables, reads them and adds them to a buffer
 * per list; after the loop the buffers become the parameter arrays.
 */
function block(plan: Plan, s: Extract<Step, { op: 'block' }>): string {
  const head = (() => {
    switch (s.loop.kind) {
      case 'count':
        return `for (__cib_b in 0 until ${count(s.loop.n)}.also { if (it < 0) throw __cib_fail() })`;
      case 'eof':
        return 'while (__cib_has())';
      case 'tok':
        return `while (!__cib_at(arrayOf<String>(${s.loop.end.map(kotlinQuote).join(', ')})))`;
      case 'line':
        return `while (!${endl(s.loop.end)})`;
    }
  })();
  const type = (v: number) => KOTLIN_TYPES[planVar(plan, v).type];
  const buffer = (list: number) => `__cib_l${list}`;
  return [
    ...s.items.map((x) => `val ${buffer(x.list)} = ArrayList<${type(x.item)}>()`),
    `${head} {`,
    ...s.items.map((x) => `    var ${variable(x.item)}: ${type(x.item)} = ${empty(type(x.item))}`),
    ...s.steps.flatMap((x) => step(plan, x).split('\n')).map((l) => `    ${l}`),
    ...s.items.map((x) => `    ${buffer(x.list)}.add(${variable(x.item)})`),
    '}',
    ...s.items.map((x) => `${variable(x.list)} = ${buffer(x.list)}.${fromBuffer(type(x.list))}`),
  ].join('\n');
}

function step(plan: Plan, s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
    case 'block':
      return block(plan, s);
    case 'raw':
      return `${v} = __cib_rawl()`;
    case 'rawLines':
      return `${v} = Array(${rows(s.n)}) { __cib_rawl() }`;
    case 'endRaw':
      return '__cib_rawl()';
    case 'nl':
      return '__cib_nl()';
    case 'scalar':
      return `${v} = ${READ[s.t]}`;
    case 'line':
      return `${v} = __cib_line()`;
    case 'array':
      return `${v} = ${ARRAY[s.t]}(${rows(s.n)}) { ${READ[s.t]} }`;
    case 'rest':
      return `${v} = __cib_rest().let { __cib_w -> ${FROM_WORDS[s.t]('__cib_w')} }`;
    case 'chars':
      return `${v} = Array(${rows(s.n)}) { __cib_tok().toCharArray() }`;
    case 'grid':
      return s.cols
        ? `${v} = Array(${rows(s.n)}) { ${ARRAY[s.t]}(${count(s.cols)}) { ${READ[s.t]} } }`
        : `${v} = Array(${rows(s.n)}) { __cib_nl(); val __cib_w = __cib_rest(); ${FROM_WORDS[s.t]('__cib_w')} }`;
    case 'lines':
      return `${v} = Array(${rows(s.n)}) { __cib_nl(); __cib_line() }`;
    case 'endTok':
      return Array(s.k).fill('__cib_tok()').join('; ');
    case 'endLine':
      return '__cib_nl(); __cib_line()';
  }
}

/** Prints `__cib_r`; indexing works for IntArray, Array, List and String rows alike. */
function printer(ret: RetSpec): string[] {
  const sep = kotlinQuote(retSep(ret));
  const join = (arr: string, item: string) => [
    `for (__cib_j in ${arr}.indices) {`,
    `    if (__cib_j > 0) __cib_o.append(${sep})`,
    `    __cib_o.append(${item})`,
    '}',
  ];
  switch (ret.type) {
    case 'bool':
      return [
        `__cib_o.append(if (__cib_r) ${kotlinQuote(ret.yes ?? 'true')} else ${kotlinQuote(ret.no ?? 'false')})`,
      ];
    case 'double':
      return [
        `__cib_o.append(String.format(java.util.Locale.ROOT, "%.${ret.digits ?? 6}f", __cib_r))`,
      ];
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return join('__cib_r', '__cib_r[__cib_j]');
    case 'int[][]':
    case 'char[][]':
      return [
        'for (__cib_i in __cib_r.indices) {',
        "    if (__cib_i > 0) __cib_o.append('\\n')",
        ...join('__cib_r[__cib_i]', '__cib_r[__cib_i][__cib_j]').map((l) => `    ${l}`),
        '}',
      ];
    default:
      return ['__cib_o.append(__cib_r)'];
  }
}

/** An empty value of a type, for the variables before they are read. */
function empty(type: string): string {
  if (type.startsWith('Array<')) return `arrayOf<${type.slice(6, -1)}>()`;
  if (type.endsWith('Array')) return `${type}(0)`;
  return { Int: '0', Long: '0L', Double: '0.0', String: '""', Boolean: 'false' }[type] ?? '0';
}

export function kotlinGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const label = labelParts(ret);
  const decls = plan.params.map((p, i) => {
    const type = KOTLIN_TYPES[p.type];
    return `var ${variable(i)}: ${type} = ${empty(type)}`;
  });
  const body = (n: number) =>
    [
      ...decls,
      'try {',
      ...plan.steps.flatMap((s) => step(plan, s).split('\n')).map((l) => `    ${l}`),
      '} catch (__cib_e: RuntimeException) {',
      '    throw __cib_fail()',
      '}',
      `val __cib_r = Solution().solution(${vars.join(', ')})`,
      "if (__cib_cases++ > 0) __cib_o.append('\\n')",
      ...(label
        ? [
            `__cib_o.append(${kotlinQuote(label.pre)}).append(__cib_cases).append(${kotlinQuote(label.post)})`,
          ]
        : []),
      ...printer(ret),
      ...(ret.blank ? ["__cib_o.append('\\n')"] : []),
    ]
      .map((l) => ' '.repeat(n) + l)
      .join('\n');
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return `    run {\n${body(8)}\n    }`;
      case 'count':
        return `    val __cib_t = __cib_int()\n    for (__cib_k in 0 until __cib_t) {\n${body(8)}\n    }`;
      case 'eof':
        return `    while (__cib_has()) {\n${body(8)}\n    }`;
      case 'line':
        return `    while (__cib_has() && !${endl(plan.loop.end)}) {\n${body(8)}\n    }`;
      case 'until': {
        const words = plan.loop.tokens.map(kotlinQuote).join(', ');
        return [
          `    val __cib_endWords = arrayOf<String>(${words})`,
          '    while (__cib_has()) {',
          '        val __cib_s = __cib_p',
          '        var __cib_stop = true',
          '        for (__cib_w in __cib_endWords) {',
          '            if (!__cib_more() || __cib_tok() != __cib_w) {',
          '                __cib_stop = false',
          '                break',
          '            }',
          '        }',
          '        if (__cib_stop) break',
          '        __cib_p = __cib_s',
          body(8),
          '    }',
        ].join('\n');
      }
    }
  })();
  return [
    '// ---- 입출력 코드 ----',
    KOTLIN_RUNTIME,
    ...(usesRows(plan) ? [KOTLIN_ROWS] : []),
    '',
    'fun main() {',
    '    __cib_d = System.`in`.readBytes()',
    '    __cib_n = __cib_d.size',
    '    val __cib_o = StringBuilder()',
    '    var __cib_cases = 0',
    loop,
    "    if (__cib_cases > 0) __cib_o.append('\\n')",
    '    print(__cib_o)',
    '    System.out.flush()',
    '}',
    '',
  ].join('\n');
}

const PLACEHOLDER: Record<RetType, string> = {
  int: '0',
  long: '0L',
  double: '0.0',
  string: '""',
  bool: 'true',
  'int[]': 'intArrayOf()',
  'long[]': 'longArrayOf()',
  'string[]': 'arrayOf()',
  'line[]': 'arrayOf()',
  'int[][]': 'arrayOf()',
  'char[][]': 'arrayOf()',
};

export function kotlinStarter(format: Format): string {
  const params = format.params.map((p) => `${p.name}: ${KOTLIN_TYPES[p.type]}`).join(', ');
  const type = KOTLIN_TYPES[format.ret.type];
  return `class Solution {\n    fun solution(${params}): ${type} {\n        var answer: ${type} = ${PLACEHOLDER[format.ret.type]}\n        return answer\n    }\n}\n`;
}

export const kotlinLanguage: GlueLanguage = {
  prefix: '',
  glue: kotlinGlue,
  starter: kotlinStarter,
  fileName: 'Solution.kt',
};
