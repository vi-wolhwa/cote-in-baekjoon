/**
 * Kotlin (JVM) glue: the user writes `class Solution { fun solution(...): <ret> }` like on a
 * coding-test site, with their own imports at the top; nothing goes before it. After it,
 * top-level `__cib_` reader functions and `fun main()` that make a new Solution per case.
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

const RUNTIME = `private var __cib_d = ByteArray(0)
private var __cib_p = 0
private var __cib_n = 0
private fun __cib_fail(): RuntimeException = RuntimeException("__cib_input")
private fun __cib_ws(c: Byte): Boolean {
    val x = c.toInt()
    return x == 32 || x == 10 || x == 13 || x == 9
}
private fun __cib_more(): Boolean {
    while (__cib_p < __cib_n && __cib_ws(__cib_d[__cib_p])) __cib_p++
    return __cib_p < __cib_n
}
private fun __cib_str(s: Int, e: Int): String = String(__cib_d, s, e - s, Charsets.UTF_8)
private fun __cib_tok(): String {
    if (!__cib_more()) throw __cib_fail()
    val s = __cib_p
    while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) __cib_p++
    return __cib_str(s, __cib_p)
}
private fun __cib_ll(): Long {
    if (!__cib_more()) throw __cib_fail()
    var neg = false
    val c0 = __cib_d[__cib_p].toInt()
    if (c0 == 45 || c0 == 43) {
        neg = c0 == 45
        __cib_p++
    }
    if (__cib_p >= __cib_n || __cib_ws(__cib_d[__cib_p])) throw __cib_fail()
    var v = 0L
    while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) {
        val c = __cib_d[__cib_p++].toInt() - 48
        if (c < 0 || c > 9) throw __cib_fail()
        v = v * 10 - c
    }
    return if (neg) v else -v
}
private fun __cib_int(): Int = __cib_ll().toInt()
private fun __cib_dbl(): Double = __cib_tok().toDouble()
private fun __cib_nl() {
    if (__cib_p > 0 && __cib_d[__cib_p - 1].toInt() != 10) {
        while (__cib_p < __cib_n && __cib_d[__cib_p].toInt() != 10) __cib_p++
        if (__cib_p < __cib_n) __cib_p++
    }
    while (true) {
        var q = __cib_p
        while (q < __cib_n && __cib_d[q].toInt() != 10 && __cib_ws(__cib_d[q])) q++
        if (q < __cib_n && __cib_d[q].toInt() == 10) {
            __cib_p = q + 1
        } else {
            break
        }
    }
}
private fun __cib_end(): Int {
    if (__cib_p >= __cib_n) throw __cib_fail()
    var e = __cib_p
    while (e < __cib_n && __cib_d[e].toInt() != 10) e++
    return e
}
private fun __cib_line(): String {
    var e = __cib_end()
    var s = __cib_p
    __cib_p = e
    while (s < e && __cib_ws(__cib_d[s])) s++
    while (e > s && __cib_ws(__cib_d[e - 1])) e--
    return __cib_str(s, e)
}
private fun __cib_rest(): Array<String> {
    val e = __cib_end()
    val r = ArrayList<String>()
    var i = __cib_p
    __cib_p = e
    while (i < e) {
        while (i < e && __cib_ws(__cib_d[i])) i++
        val s = i
        while (i < e && !__cib_ws(__cib_d[i])) i++
        if (i > s) r.add(__cib_str(s, i))
    }
    return r.toTypedArray()
}
private fun __cib_has(): Boolean {
    var q = __cib_p
    while (q < __cib_n && __cib_ws(__cib_d[q])) q++
    return q < __cib_n
}`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS = `private fun __cib_at(w: Array<String>): Boolean {
    val s = __cib_p
    var ok = true
    for (x in w) {
        if (!__cib_more() || __cib_tok() != x) {
            ok = false
            break
        }
    }
    __cib_p = s
    return ok
}
private fun __cib_rowsTok(w: Array<String>, k: Int): Int {
    val s = __cib_p
    var r = 0
    while (true) {
        if (if (w.isEmpty()) !__cib_has() else __cib_at(w)) break
        if (k < 1 || !__cib_has()) throw __cib_fail()
        for (i in 0 until k) __cib_tok()
        r++
    }
    __cib_p = s
    return r
}
private fun __cib_raw(): String {
    var e = __cib_p
    while (e < __cib_n && __cib_d[e].toInt() != 10) e++
    val s = __cib_p
    __cib_p = e
    while (e > s && __cib_ws(__cib_d[e - 1])) e--
    return __cib_str(s, e)
}
private fun __cib_rowsLine(e: String?, raw: Boolean): Int {
    val s = __cib_p
    var r = 0
    while (true) {
        __cib_nl()
        if (!__cib_has()) {
            if (e != null) throw __cib_fail()
            break
        }
        val t = if (raw) __cib_raw() else __cib_line()
        if (e != null && t == e) break
        r++
    }
    __cib_p = s
    return r
}`;

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
    line: (end, raw) => `__cib_rowsLine(${end === null ? 'null' : kotlinQuote(end)}, ${raw})`,
  });

function step(s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
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
  const decls = plan.params.map((p, i) => {
    const type = KOTLIN_TYPES[p.type];
    return `var ${variable(i)}: ${type} = ${empty(type)}`;
  });
  const body = (n: number) =>
    [
      ...decls,
      'try {',
      ...plan.steps.map((s) => `    ${step(s)}`),
      '} catch (__cib_e: RuntimeException) {',
      '    throw __cib_fail()',
      '}',
      `val __cib_r = Solution().solution(${vars.join(', ')})`,
      "if (__cib_cases++ > 0) __cib_o.append('\\n')",
      ...printer(ret),
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
    RUNTIME,
    ...(usesRows(plan) ? [ROWS] : []),
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
