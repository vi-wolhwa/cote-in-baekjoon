/**
 * Java 11 glue: the user writes `class Solution { public <ret> solution(...) }`; one import
 * line goes before it (the line offset) and `public class Main` with a fast byte reader
 * after it. A new Solution is made per case, like a fresh test on the coding-test site.
 */
import { labelParts, retSep, type ParamType, type RetSpec, type RetType } from '../dsl';
import {
  quote,
  renderCount,
  planVar,
  renderRows,
  usesRows,
  type CountRef,
  type Plan,
  type Rows,
  type Scalar,
  type Step,
} from './plan';

export const JAVA_PREFIX = 'import java.util.*; import java.io.*;\n';

export const JAVA_TYPES: Record<ParamType | RetType, string> = {
  int: 'int',
  long: 'long',
  double: 'double',
  string: 'String',
  line: 'String',
  bool: 'boolean',
  'int[]': 'int[]',
  'long[]': 'long[]',
  'double[]': 'double[]',
  'string[]': 'String[]',
  'line[]': 'String[]',
  'int[][]': 'int[][]',
  'long[][]': 'long[][]',
  'double[][]': 'double[][]',
  'string[][]': 'String[][]',
  'char[][]': 'char[][]',
};

const RUNTIME = `    static byte[] __cib_d;
    static int __cib_p, __cib_n;
    static RuntimeException __cib_fail() { return new RuntimeException("__cib_input"); }
    static boolean __cib_ws(byte c) { return c == ' ' || c == '\\n' || c == '\\r' || c == '\\t'; }
    static boolean __cib_more() {
        while (__cib_p < __cib_n && __cib_ws(__cib_d[__cib_p])) __cib_p++;
        return __cib_p < __cib_n;
    }
    static String __cib_tok() {
        if (!__cib_more()) throw __cib_fail();
        int s = __cib_p;
        while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) __cib_p++;
        return new String(__cib_d, s, __cib_p - s, java.nio.charset.StandardCharsets.UTF_8);
    }
    static long __cib_ll() {
        if (!__cib_more()) throw __cib_fail();
        boolean neg = false;
        if (__cib_d[__cib_p] == '-' || __cib_d[__cib_p] == '+') neg = __cib_d[__cib_p++] == '-';
        if (__cib_p >= __cib_n || __cib_ws(__cib_d[__cib_p])) throw __cib_fail();
        long v = 0;
        while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) {
            int c = __cib_d[__cib_p++] - '0';
            if (c < 0 || c > 9) throw __cib_fail();
            v = v * 10 - c;
        }
        return neg ? v : -v;
    }
    static int __cib_int() { return (int) __cib_ll(); }
    static double __cib_dbl() { return Double.parseDouble(__cib_tok()); }
    static void __cib_nl() {
        if (__cib_p > 0 && __cib_d[__cib_p - 1] != '\\n') {
            while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n') __cib_p++;
            if (__cib_p < __cib_n) __cib_p++;
        }
        for (;;) {
            int q = __cib_p;
            while (q < __cib_n && __cib_d[q] != '\\n' && __cib_ws(__cib_d[q])) q++;
            if (q < __cib_n && __cib_d[q] == '\\n') __cib_p = q + 1;
            else break;
        }
    }
    static String __cib_line() {
        if (__cib_p >= __cib_n) throw __cib_fail();
        int e = __cib_p;
        while (e < __cib_n && __cib_d[e] != '\\n') e++;
        String s = new String(__cib_d, __cib_p, e - __cib_p, java.nio.charset.StandardCharsets.UTF_8);
        __cib_p = e;
        return s.trim();
    }
    static String[] __cib_rest() {
        String s = __cib_line();
        return s.isEmpty() ? new String[0] : s.split("\\\\s+");
    }
    static boolean __cib_has() {
        int q = __cib_p;
        while (q < __cib_n && __cib_ws(__cib_d[q])) q++;
        return q < __cib_n;
    }`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS = `    static boolean __cib_at(String[] w) {
        int s = __cib_p;
        boolean ok = true;
        for (String x : w) if (!__cib_more() || !__cib_tok().equals(x)) { ok = false; break; }
        __cib_p = s;
        return ok;
    }
    static int __cib_rowsTok(String[] w, long k) {
        int s = __cib_p, r = 0;
        for (;;) {
            if (w.length == 0 ? !__cib_has() : __cib_at(w)) break;
            if (k < 1 || !__cib_has()) throw __cib_fail();
            for (long i = 0; i < k; i++) __cib_tok();
            r++;
        }
        __cib_p = s;
        return r;
    }
    static String __cib_raw() {
        int e = __cib_p;
        while (e < __cib_n && __cib_d[e] != '\\n') e++;
        int s = __cib_p;
        __cib_p = e;
        while (e > s && __cib_ws(__cib_d[e - 1])) e--;
        return new String(__cib_d, s, e - s, java.nio.charset.StandardCharsets.UTF_8);
    }
    static boolean __cib_isNum(String f) {
        int i = 0, n = f.length(), k = 0;
        if (i < n && (f.charAt(i) == '+' || f.charAt(i) == '-')) i++;
        while (i < n && f.charAt(i) >= '0' && f.charAt(i) <= '9') { i++; k++; }
        if (i < n && f.charAt(i) == '.') for (i++; i < n && f.charAt(i) >= '0' && f.charAt(i) <= '9'; i++) k++;
        if (k == 0) return false;
        if (i < n && (f.charAt(i) == 'e' || f.charAt(i) == 'E')) {
            int x = 0;
            if (++i < n && (f.charAt(i) == '+' || f.charAt(i) == '-')) i++;
            for (; i < n && f.charAt(i) >= '0' && f.charAt(i) <= '9'; i++) x++;
            if (x == 0) return false;
        }
        return i == n;
    }
    static boolean __cib_isEnd(String t, int m, String e) {
        if (m == 1) return t.equals(e);
        if (m == 4) return t.startsWith(e);
        if (m != 2 && m != 3) return false;
        String s = t.trim();
        int k = 0;
        while (k < s.length() && !Character.isWhitespace(s.charAt(k))) k++;
        String f = s.substring(0, k);
        if (!__cib_isNum(f)) return false;
        double x = Double.parseDouble(f);
        return m == 2 ? x < 0 : x <= 0;
    }
    static int __cib_rowsLine(int m, String e, boolean text) {
        int s = __cib_p, r = 0;
        for (;;) {
            __cib_nl();
            if (!__cib_has()) { if (m != 0) throw __cib_fail(); break; }
            String t = text ? __cib_raw() : __cib_line();
            if (m != 0 && __cib_isEnd(t, m, e)) break;
            r++;
        }
        __cib_p = s;
        return r;
    }
    static boolean __cib_endl(int m, String e) {
        int s = __cib_p;
        __cib_nl();
        if (__cib_has() && __cib_isEnd(__cib_line(), m, e)) return true;
        __cib_p = s;
        return false;
    }
    static void __cib_bol() {
        if (__cib_p > 0 && __cib_d[__cib_p - 1] != '\\n') {
            while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n') __cib_p++;
            if (__cib_p < __cib_n) __cib_p++;
        }
    }
    static String __cib_rawl() {
        __cib_bol();
        if (__cib_p >= __cib_n) throw __cib_fail();
        int e = __cib_p;
        while (e < __cib_n && __cib_d[e] != '\\n') e++;
        int end = e > __cib_p && __cib_d[e - 1] == '\\r' ? e - 1 : e;
        String s = new String(__cib_d, __cib_p, end - __cib_p, java.nio.charset.StandardCharsets.UTF_8);
        __cib_p = e < __cib_n ? e + 1 : __cib_n;
        return s;
    }
    static int __cib_rowsPhys(int m, String e) {
        int s = __cib_p, r = 0;
        __cib_bol();
        for (;;) {
            if (__cib_p >= __cib_n) { if (m != 0) throw __cib_fail(); break; }
            String t = __cib_rawl();
            int k = t.length();
            while (k > 0 && Character.isWhitespace(t.charAt(k - 1))) k--;
            if (m != 0 && __cib_isEnd(t.substring(0, k), m, e)) break;
            r++;
        }
        __cib_p = s;
        return r;
    }`;

const READ: Record<Scalar, string> = {
  int: '__cib_int()',
  long: '__cib_ll()',
  double: '__cib_dbl()',
  string: '__cib_tok()',
};
const PARSE: Record<Scalar, (x: string) => string> = {
  int: (x) => `Integer.parseInt(${x})`,
  long: (x) => `Long.parseLong(${x})`,
  double: (x) => `Double.parseDouble(${x})`,
  string: (x) => x,
};
const ELEMENT: Record<Scalar, string> = {
  int: 'int',
  long: 'long',
  double: 'double',
  string: 'String',
};

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => `(int) (${renderCount(c, variable)})`;
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_rowsTok(new String[] {${end.map(quote).join(', ')}}, ${k})`,
    line: (end, text) => `__cib_rowsLine(${end.mode}, ${quote(end.text)}, ${text})`,
    phys: (end) => `__cib_rowsPhys(${end.mode}, ${quote(end.text)})`,
  });

const BOXED: Record<string, string> = { int: 'Integer', long: 'Long', double: 'Double' };

/**
 * A block: each pass reads the block's variables and adds them to lists, which become the
 * parameter arrays after the loop. Braces keep the block's own names out of the case body.
 */
function block(plan: Plan, s: Extract<Step, { op: 'block' }>): string {
  const head = (() => {
    switch (s.loop.kind) {
      case 'count':
        return `int __cib_bn = ${count(s.loop.n)}; if (__cib_bn < 0) throw __cib_fail(); for (int __cib_bi = 0; __cib_bi < __cib_bn; __cib_bi++)`;
      case 'eof':
        return 'while (__cib_has())';
      case 'tok':
        return `while (!__cib_at(new String[] {${s.loop.end.map(quote).join(', ')}}))`;
      case 'line':
        return `while (!__cib_endl(${s.loop.end.mode}, ${quote(s.loop.end.text)}))`;
    }
  })();
  const type = (v: number) => JAVA_TYPES[planVar(plan, v).type];
  const list = (v: number) => `__cib_l${v}`;
  const toArray = (x: { list: number; item: number }) => {
    const t = type(x.item);
    if (BOXED[t]) {
      return `${variable(x.list)} = new ${t}[${list(x.list)}.size()]; for (int __cib_i = 0; __cib_i < ${variable(x.list)}.length; __cib_i++) ${variable(x.list)}[__cib_i] = ${list(x.list)}.get(__cib_i);`;
    }
    const base = t.replace(/\[.*$/, '');
    return `${variable(x.list)} = ${list(x.list)}.toArray(new ${base}[0]${t.slice(base.length)});`;
  };
  return [
    '{',
    ...s.items.map((x) => {
      const t = type(x.item);
      return `    java.util.ArrayList<${BOXED[t] ?? t}> ${list(x.list)} = new java.util.ArrayList<>();`;
    }),
    `    ${head} {`,
    ...s.items.map((x) => {
      const t = type(x.item);
      const init = BOXED[t] ? (t === 'double' ? '0.0' : '0') : 'null';
      return `        ${t} ${variable(x.item)} = ${init};`;
    }),
    ...s.steps.flatMap((x) => step(plan, x).split('\n')).map((l) => `        ${l}`),
    ...s.items.map((x) => `        ${list(x.list)}.add(${variable(x.item)});`),
    '    }',
    ...s.items.map((x) => `    ${toArray(x)}`),
    '}',
  ].join('\n');
}

function step(plan: Plan, s: Step): string {
  switch (s.op) {
    case 'block':
      return block(plan, s);
    case 'raw':
      return `${variable(s.v)} = __cib_rawl();`;
    case 'rawLines': {
      const v = variable(s.v);
      return `${v} = new String[${rows(s.n)}]; for (int __cib_i = 0; __cib_i < ${v}.length; __cib_i++) ${v}[__cib_i] = __cib_rawl();`;
    }
    case 'endRaw':
      return '__cib_rawl();';
    case 'nl':
      return '__cib_nl();';
    case 'scalar':
      return `${variable(s.v)} = ${READ[s.t]};`;
    case 'line':
      return `${variable(s.v)} = __cib_line();`;
    case 'array': {
      const v = variable(s.v);
      return `${v} = new ${ELEMENT[s.t]}[${rows(s.n)}]; for (int __cib_i = 0; __cib_i < ${v}.length; __cib_i++) ${v}[__cib_i] = ${READ[s.t]};`;
    }
    case 'rest': {
      const v = variable(s.v);
      return `{ String[] __cib_w = __cib_rest(); ${v} = new ${ELEMENT[s.t]}[__cib_w.length]; for (int __cib_i = 0; __cib_i < __cib_w.length; __cib_i++) ${v}[__cib_i] = ${PARSE[s.t]('__cib_w[__cib_i]')}; }`;
    }
    case 'chars': {
      const v = variable(s.v);
      return `${v} = new char[${rows(s.n)}][]; for (int __cib_i = 0; __cib_i < ${v}.length; __cib_i++) ${v}[__cib_i] = __cib_tok().toCharArray();`;
    }
    case 'grid': {
      const v = variable(s.v);
      const e = ELEMENT[s.t];
      if (s.cols) {
        return `${v} = new ${e}[${rows(s.n)}][${count(s.cols)}]; for (${e}[] __cib_r : ${v}) for (int __cib_j = 0; __cib_j < __cib_r.length; __cib_j++) __cib_r[__cib_j] = ${READ[s.t]};`;
      }
      return `${v} = new ${e}[${rows(s.n)}][]; for (int __cib_i = 0; __cib_i < ${v}.length; __cib_i++) { __cib_nl(); String[] __cib_w = __cib_rest(); ${v}[__cib_i] = new ${e}[__cib_w.length]; for (int __cib_j = 0; __cib_j < __cib_w.length; __cib_j++) ${v}[__cib_i][__cib_j] = ${PARSE[s.t]('__cib_w[__cib_j]')}; }`;
    }
    case 'lines': {
      const v = variable(s.v);
      return `${v} = new String[${rows(s.n)}]; for (int __cib_i = 0; __cib_i < ${v}.length; __cib_i++) { __cib_nl(); ${v}[__cib_i] = __cib_line(); }`;
    }
    case 'endTok':
      return Array(s.k).fill('__cib_tok();').join(' ');
    case 'endLine':
      return '__cib_nl(); __cib_line();';
  }
}

function printer(ret: RetSpec): string[] {
  const sep = quote(retSep(ret));
  const join = (arr: string, item: string) => [
    `for (int __cib_j = 0; __cib_j < ${arr}.length; __cib_j++) {`,
    `    if (__cib_j > 0) __cib_o.append(${sep});`,
    `    __cib_o.append(${item});`,
    '}',
  ];
  switch (ret.type) {
    case 'bool':
      return [
        `__cib_o.append(__cib_r ? ${quote(ret.yes ?? 'true')} : ${quote(ret.no ?? 'false')});`,
      ];
    case 'double':
      return [
        `__cib_o.append(String.format(java.util.Locale.ROOT, "%.${ret.digits ?? 6}f", __cib_r));`,
      ];
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return join('__cib_r', '__cib_r[__cib_j]');
    case 'int[][]':
    case 'char[][]':
      return [
        'for (int __cib_i = 0; __cib_i < __cib_r.length; __cib_i++) {',
        "    if (__cib_i > 0) __cib_o.append('\\n');",
        ...join('__cib_r[__cib_i]', '__cib_r[__cib_i][__cib_j]').map((l) => `    ${l}`),
        '}',
      ];
    default:
      return ['__cib_o.append(__cib_r);'];
  }
}

export function javaGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const label = labelParts(ret);
  const decls = plan.params.map((p, i) => {
    const type = JAVA_TYPES[p.type];
    const init = type === 'int' || type === 'long' ? '0' : type === 'double' ? '0.0' : 'null';
    return `${type} ${variable(i)} = ${init};`;
  });
  const body = (n: number) =>
    [
      ...decls,
      'try {',
      ...plan.steps.flatMap((s) => step(plan, s).split('\n')).map((l) => `    ${l}`),
      '} catch (RuntimeException __cib_e) {',
      '    throw __cib_fail();',
      '}',
      `${JAVA_TYPES[ret.type]} __cib_r = new Solution().solution(${vars.join(', ')});`,
      "if (__cib_cases++ > 0) __cib_o.append('\\n');",
      ...(label
        ? [`__cib_o.append(${quote(label.pre)}).append(__cib_cases).append(${quote(label.post)});`]
        : []),
      ...printer(ret),
      ...(ret.blank ? ["__cib_o.append('\\n');"] : []),
    ]
      .map((l) => ' '.repeat(n) + l)
      .join('\n');
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return `        {\n${body(12)}\n        }`;
      case 'count':
        return `        int __cib_t = __cib_int();\n        for (int __cib_k = 0; __cib_k < __cib_t; __cib_k++) {\n${body(12)}\n        }`;
      case 'eof':
        return `        while (__cib_has()) {\n${body(12)}\n        }`;
      case 'line': {
        const { mode, text } = plan.loop.end;
        return `        while (__cib_has() && !__cib_endl(${mode}, ${quote(text)})) {\n${body(12)}\n        }`;
      }
      case 'until': {
        const words = plan.loop.tokens.map(quote).join(', ');
        return [
          `        String[] __cib_end = {${words}};`,
          '        while (__cib_has()) {',
          '            int __cib_s = __cib_p;',
          '            boolean __cib_stop = true;',
          '            for (String __cib_w : __cib_end) {',
          '                if (!__cib_more() || !__cib_tok().equals(__cib_w)) { __cib_stop = false; break; }',
          '            }',
          '            if (__cib_stop) break;',
          '            __cib_p = __cib_s;',
          body(12),
          '        }',
        ].join('\n');
      }
    }
  })();
  return [
    '// ---- 입출력 코드 ----',
    'public class Main {',
    RUNTIME,
    ...(usesRows(plan) ? [ROWS] : []),
    '',
    '    public static void main(String[] __cib_a) throws Exception {',
    '        java.io.InputStream __cib_in = System.in;',
    '        java.io.ByteArrayOutputStream __cib_b = new java.io.ByteArrayOutputStream();',
    '        byte[] __cib_buf = new byte[1 << 16];',
    '        int __cib_k0;',
    '        while ((__cib_k0 = __cib_in.read(__cib_buf)) > 0) __cib_b.write(__cib_buf, 0, __cib_k0);',
    '        __cib_d = __cib_b.toByteArray();',
    '        __cib_n = __cib_d.length;',
    '        StringBuilder __cib_o = new StringBuilder();',
    '        int __cib_cases = 0;',
    loop,
    "        if (__cib_cases > 0) __cib_o.append('\\n');",
    '        System.out.print(__cib_o);',
    '        System.out.flush();',
    '    }',
    '}',
    '',
  ].join('\n');
}

/** `public class Solution` would be a second public class in Main.java: drop `public`. */
export function unpublicSolution(code: string, masked: string): string {
  const m = /\bpublic\s+((?:final\s+)?class\s+Solution\b)/.exec(masked);
  if (!m) return code;
  return (
    code.slice(0, m.index) + ' '.repeat('public'.length) + code.slice(m.index + 'public'.length)
  );
}
