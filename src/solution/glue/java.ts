/**
 * Java 11 glue: the user writes `class Solution { public <ret> solution(...) }`; one import
 * line goes before it (the line offset) and `public class Main` with a fast byte reader
 * after it. A new Solution is made per case, like a fresh test on the coding-test site.
 */
import { retSep, type ParamType, type RetSpec, type RetType } from '../dsl';
import { quote, renderCount, type CountRef, type Plan, type Scalar, type Step } from './plan';

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
  'string[]': 'String[]',
  'int[][]': 'int[][]',
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

function step(s: Step): string {
  switch (s.op) {
    case 'nl':
      return '__cib_nl();';
    case 'scalar':
      return `${variable(s.v)} = ${READ[s.t]};`;
    case 'line':
      return `${variable(s.v)} = __cib_line();`;
    case 'array': {
      const v = variable(s.v);
      return `${v} = new ${ELEMENT[s.t]}[${count(s.n)}]; for (int __cib_i = 0; __cib_i < ${v}.length; __cib_i++) ${v}[__cib_i] = ${READ[s.t]};`;
    }
    case 'rest': {
      const v = variable(s.v);
      return `{ String[] __cib_w = __cib_rest(); ${v} = new ${ELEMENT[s.t]}[__cib_w.length]; for (int __cib_i = 0; __cib_i < __cib_w.length; __cib_i++) ${v}[__cib_i] = ${PARSE[s.t]('__cib_w[__cib_i]')}; }`;
    }
    case 'chars': {
      const v = variable(s.v);
      return `${v} = new char[${count(s.n)}][]; for (int __cib_i = 0; __cib_i < ${v}.length; __cib_i++) ${v}[__cib_i] = __cib_tok().toCharArray();`;
    }
    case 'grid': {
      const v = variable(s.v);
      if (s.cols) {
        return `${v} = new int[${count(s.n)}][${count(s.cols)}]; for (int[] __cib_r : ${v}) for (int __cib_j = 0; __cib_j < __cib_r.length; __cib_j++) __cib_r[__cib_j] = __cib_int();`;
      }
      return `${v} = new int[${count(s.n)}][]; for (int __cib_i = 0; __cib_i < ${v}.length; __cib_i++) { __cib_nl(); String[] __cib_w = __cib_rest(); ${v}[__cib_i] = new int[__cib_w.length]; for (int __cib_j = 0; __cib_j < __cib_w.length; __cib_j++) ${v}[__cib_i][__cib_j] = Integer.parseInt(__cib_w[__cib_j]); }`;
    }
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
  const decls = plan.params.map((p, i) => {
    const type = JAVA_TYPES[p.type];
    const init = type === 'int' || type === 'long' ? '0' : type === 'double' ? '0.0' : 'null';
    return `${type} ${variable(i)} = ${init};`;
  });
  const body = (n: number) =>
    [
      ...decls,
      'try {',
      ...plan.steps.map((s) => `    ${step(s)}`),
      '} catch (RuntimeException __cib_e) {',
      '    throw __cib_fail();',
      '}',
      `${JAVA_TYPES[ret.type]} __cib_r = new Solution().solution(${vars.join(', ')});`,
      "if (__cib_cases++ > 0) __cib_o.append('\\n');",
      ...printer(ret),
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
        return `        while (__cib_more()) {\n${body(12)}\n        }`;
      case 'until': {
        const words = plan.loop.tokens.map(quote).join(', ');
        return [
          `        String[] __cib_end = {${words}};`,
          '        while (__cib_more()) {',
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
    '// ---- 입출력 코드 (코딩테스트 in 백준이 붙임) ----',
    'public class Main {',
    RUNTIME,
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
