/**
 * C# glue (Baekjoon: .NET console app): one `using` line goes before the user's code (the
 * line offset); the user writes `public class Solution { public <ret> solution(...) }` like
 * the coding-test site, and the glue adds `public static class __cib_Main` with the only
 * `Main`: a byte reader over the whole input, one call per case (a new Solution each time)
 * and one write at the end. 2D arrays are jagged (`int[][]`).
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

export const CSHARP_PREFIX =
  'using System; using System.Collections.Generic; using System.Linq; using System.Text;\n';

export const CSHARP_TYPES: Record<ParamType | RetType, string> = {
  int: 'int',
  long: 'long',
  double: 'double',
  string: 'string',
  line: 'string',
  bool: 'bool',
  'int[]': 'int[]',
  'long[]': 'long[]',
  'double[]': 'double[]',
  'string[]': 'string[]',
  'line[]': 'string[]',
  'int[][]': 'int[][]',
  'long[][]': 'long[][]',
  'double[][]': 'double[][]',
  'string[][]': 'string[][]',
  'char[][]': 'char[][]',
};

/** A C# string literal (control and line-separator characters escaped). */
export function csharpQuote(s: string): string {
  const body = [...s]
    .map((ch) => {
      if (ch === '"' || ch === '\\') return `\\${ch}`;
      const c = ch.codePointAt(0) as number;
      if (c < 0x20 || c === 0x7f || c === 0x85 || c === 0x2028 || c === 0x2029) {
        return `\\u${c.toString(16).padStart(4, '0')}`;
      }
      return ch;
    })
    .join('');
  return `"${body}"`;
}

const RUNTIME = `    sealed class __cib_Error : System.Exception { }
    static byte[] __cib_d;
    static int __cib_p, __cib_n;
    static System.Exception __cib_fail() { return new __cib_Error(); }
    static bool __cib_ws(byte c) { return c == ' ' || c == '\\n' || c == '\\r' || c == '\\t'; }
    static int __cib_cnt(long x) { if (x < 0 || x > int.MaxValue) throw __cib_fail(); return (int)x; }
    static string __cib_str(int s, int e) { return System.Text.Encoding.UTF8.GetString(__cib_d, s, e - s); }
    static bool __cib_more() {
        while (__cib_p < __cib_n && __cib_ws(__cib_d[__cib_p])) __cib_p++;
        return __cib_p < __cib_n;
    }
    static bool __cib_has() {
        int q = __cib_p;
        while (q < __cib_n && __cib_ws(__cib_d[q])) q++;
        return q < __cib_n;
    }
    static string __cib_tok() {
        if (!__cib_more()) throw __cib_fail();
        int s = __cib_p;
        while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) __cib_p++;
        return __cib_str(s, __cib_p);
    }
    static long __cib_ll() {
        if (!__cib_more()) throw __cib_fail();
        bool neg = false;
        if (__cib_d[__cib_p] == '-' || __cib_d[__cib_p] == '+') neg = __cib_d[__cib_p++] == '-';
        if (__cib_p >= __cib_n || __cib_ws(__cib_d[__cib_p])) throw __cib_fail();
        long v = 0;
        while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) {
            int c = __cib_d[__cib_p++] - '0';
            if (c < 0 || c > 9) throw __cib_fail();
            v = unchecked(v * 10 - c);
        }
        return neg ? v : unchecked(-v);
    }
    static int __cib_int() { return unchecked((int)__cib_ll()); }
    static long __cib_pl(string s) {
        long v;
        if (!long.TryParse(s, System.Globalization.NumberStyles.AllowLeadingSign, System.Globalization.CultureInfo.InvariantCulture, out v)) throw __cib_fail();
        return v;
    }
    static int __cib_pi(string s) { return unchecked((int)__cib_pl(s)); }
    static double __cib_pd(string s) {
        double v;
        if (!double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out v)) throw __cib_fail();
        return v;
    }
    static double __cib_dbl() { return __cib_pd(__cib_tok()); }
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
    static string __cib_line() {
        if (__cib_p >= __cib_n) throw __cib_fail();
        int e = __cib_p;
        while (e < __cib_n && __cib_d[e] != '\\n') e++;
        int s = __cib_p;
        __cib_p = e;
        while (s < e && __cib_ws(__cib_d[s])) s++;
        while (e > s && __cib_ws(__cib_d[e - 1])) e--;
        return __cib_str(s, e);
    }
    static string[] __cib_rest() {
        if (__cib_p >= __cib_n) throw __cib_fail();
        var r = new System.Collections.Generic.List<string>();
        while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n') {
            while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n' && __cib_ws(__cib_d[__cib_p])) __cib_p++;
            int s = __cib_p;
            while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) __cib_p++;
            if (__cib_p > s) r.Add(__cib_str(s, __cib_p));
        }
        return r.ToArray();
    }`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS = `    static bool __cib_at(string[] w) {
        int s = __cib_p;
        bool ok = true;
        foreach (string x in w) if (!__cib_more() || __cib_tok() != x) { ok = false; break; }
        __cib_p = s;
        return ok;
    }
    static int __cib_rowsTok(string[] w, long k) {
        int s = __cib_p, r = 0;
        for (;;) {
            if (w.Length == 0 ? !__cib_has() : __cib_at(w)) break;
            if (k < 1 || !__cib_has()) throw __cib_fail();
            for (long i = 0; i < k; i++) __cib_tok();
            r++;
        }
        __cib_p = s;
        return r;
    }
    static string __cib_raw() {
        int e = __cib_p;
        while (e < __cib_n && __cib_d[e] != '\\n') e++;
        int s = __cib_p;
        __cib_p = e;
        while (e > s && __cib_ws(__cib_d[e - 1])) e--;
        return __cib_str(s, e);
    }
    static int __cib_rowsLine(string e, bool raw) {
        int s = __cib_p, r = 0;
        for (;;) {
            __cib_nl();
            if (!__cib_has()) { if (e != null) throw __cib_fail(); break; }
            string t = raw ? __cib_raw() : __cib_line();
            if (e != null && t == e) break;
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
const PARSE: Record<Scalar, string> = {
  int: '__cib_pi',
  long: '__cib_pl',
  double: '__cib_pd',
  string: '',
};

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => `__cib_cnt(${renderCount(c, variable)})`;
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_rowsTok(new string[] {${end.map(csharpQuote).join(', ')}}, ${k})`,
    line: (end, raw) =>
      `__cib_rowsLine(${end === null ? 'null' : csharpQuote(end)}, ${raw ? 'true' : 'false'})`,
  });

function step(s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
    case 'nl':
      return '__cib_nl();';
    case 'scalar':
      return `${v} = ${READ[s.t]};`;
    case 'line':
      return `${v} = __cib_line();`;
    case 'array':
      return `${v} = new ${CSHARP_TYPES[s.t]}[${rows(s.n)}]; for (int __cib_i = 0; __cib_i < ${v}.Length; __cib_i++) ${v}[__cib_i] = ${READ[s.t]};`;
    case 'rest':
      return s.t === 'string'
        ? `${v} = __cib_rest();`
        : `${v} = System.Array.ConvertAll(__cib_rest(), ${PARSE[s.t]});`;
    case 'chars':
      return `${v} = new char[${rows(s.n)}][]; for (int __cib_i = 0; __cib_i < ${v}.Length; __cib_i++) ${v}[__cib_i] = __cib_tok().ToCharArray();`;
    case 'grid': {
      const e = CSHARP_TYPES[s.t];
      if (s.cols) {
        return `{ int __cib_m = ${count(s.cols)}; ${v} = new ${e}[${rows(s.n)}][]; for (int __cib_i = 0; __cib_i < ${v}.Length; __cib_i++) { ${v}[__cib_i] = new ${e}[__cib_m]; for (int __cib_j = 0; __cib_j < __cib_m; __cib_j++) ${v}[__cib_i][__cib_j] = ${READ[s.t]}; } }`;
      }
      const row =
        s.t === 'string' ? '__cib_rest()' : `System.Array.ConvertAll(__cib_rest(), ${PARSE[s.t]})`;
      return `${v} = new ${e}[${rows(s.n)}][]; for (int __cib_i = 0; __cib_i < ${v}.Length; __cib_i++) { __cib_nl(); ${v}[__cib_i] = ${row}; }`;
    }
    case 'lines':
      return `${v} = new string[${rows(s.n)}]; for (int __cib_i = 0; __cib_i < ${v}.Length; __cib_i++) { __cib_nl(); ${v}[__cib_i] = __cib_line(); }`;
    case 'endTok':
      return Array(s.k).fill('__cib_tok();').join(' ');
    case 'endLine':
      return '__cib_nl(); __cib_line();';
  }
}

function printer(ret: RetSpec): string[] {
  const sep = csharpQuote(retSep(ret));
  const join = (arr: string, item: string) => [
    `for (int __cib_j = 0; __cib_j < ${arr}.Length; __cib_j++) {`,
    `    if (__cib_j > 0) __cib_o.Append(${sep});`,
    `    __cib_o.Append(${item});`,
    '}',
  ];
  switch (ret.type) {
    case 'bool':
      return [
        `__cib_o.Append(__cib_res ? ${csharpQuote(ret.yes ?? 'true')} : ${csharpQuote(ret.no ?? 'false')});`,
      ];
    case 'double':
      return [
        `__cib_o.Append(__cib_res.ToString("F${ret.digits ?? 6}", System.Globalization.CultureInfo.InvariantCulture));`,
      ];
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return join('__cib_res', '__cib_res[__cib_j]');
    case 'int[][]':
    case 'char[][]':
      return [
        'for (int __cib_i = 0; __cib_i < __cib_res.Length; __cib_i++) {',
        "    if (__cib_i > 0) __cib_o.Append('\\n');",
        ...join('__cib_res[__cib_i]', '__cib_res[__cib_i][__cib_j]').map((l) => `    ${l}`),
        '}',
      ];
    default:
      return ['__cib_o.Append(__cib_res);'];
  }
}

export function csharpGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const decls = plan.params.map((p, i) => {
    const type = CSHARP_TYPES[p.type];
    const init = type === 'int' || type === 'long' ? '0' : type === 'double' ? '0.0' : 'null';
    return `${type} ${variable(i)} = ${init};`;
  });
  const body = (n: number) =>
    [
      ...decls,
      'try {',
      ...plan.steps.map((s) => `    ${step(s)}`),
      '} catch (System.Exception __cib_e) when (!(__cib_e is __cib_Error)) {',
      '    throw __cib_fail();',
      '}',
      `${CSHARP_TYPES[ret.type]} __cib_res = new Solution().solution(${vars.join(', ')});`,
      "if (__cib_cases++ > 0) __cib_o.Append('\\n');",
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
        return `        while (__cib_has()) {\n${body(12)}\n        }`;
      case 'until': {
        const words = plan.loop.tokens.map(csharpQuote).join(', ');
        return [
          `        string[] __cib_end = {${words}};`,
          '        while (__cib_has()) {',
          '            int __cib_s = __cib_p;',
          '            bool __cib_stop = true;',
          '            foreach (string __cib_w in __cib_end) {',
          '                if (!__cib_more() || __cib_tok() != __cib_w) { __cib_stop = false; break; }',
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
    '#nullable disable',
    'public static class __cib_Main {',
    RUNTIME,
    ...(usesRows(plan) ? [ROWS] : []),
    '',
    '    static void __cib_run() {',
    '        var __cib_ms = new System.IO.MemoryStream();',
    '        using (var __cib_in = System.Console.OpenStandardInput()) __cib_in.CopyTo(__cib_ms);',
    '        __cib_d = __cib_ms.ToArray();',
    '        __cib_n = __cib_d.Length;',
    '        var __cib_o = new System.Text.StringBuilder();',
    '        int __cib_cases = 0;',
    loop,
    "        if (__cib_cases > 0) __cib_o.Append('\\n');",
    '        var __cib_out = new System.IO.StreamWriter(System.Console.OpenStandardOutput(), new System.Text.UTF8Encoding(false));',
    '        __cib_out.Write(__cib_o.ToString());',
    '        __cib_out.Flush();',
    '    }',
    '',
    '    public static void Main() {',
    '        System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;',
    '        try {',
    '            __cib_run();',
    '        } catch (__cib_Error) {',
    '            System.Console.Error.WriteLine("__cib_input");',
    '            System.Environment.Exit(1);',
    '        }',
    '    }',
    '}',
    '',
  ].join('\n');
}

/** C# keywords a format's parameter name could be (they need `@`). */
const KEYWORDS = new Set(
  (
    'base checked decimal delegate event explicit extern fixed foreach implicit internal lock ' +
    'object operator out override params readonly ref sbyte sealed stackalloc uint ulong ' +
    'unchecked unsafe ushort virtual is as in'
  ).split(' '),
);

function placeholder(type: string): string {
  if (type.endsWith('[]')) return `new ${type} {}`;
  if (type === 'string') return '""';
  if (type === 'bool') return 'true';
  return '0';
}

export function csharpStarter(format: Format): string {
  const params = format.params
    .map((p) => `${CSHARP_TYPES[p.type]} ${KEYWORDS.has(p.name) ? `@${p.name}` : p.name}`)
    .join(', ');
  const type = CSHARP_TYPES[format.ret.type];
  return `// 자동 포함: System, System.Collections.Generic, System.Linq, System.Text\n\npublic class Solution {\n    public ${type} solution(${params}) {\n        ${type} answer = ${placeholder(type)};\n        return answer;\n    }\n}\n`;
}

export const csharpLanguage: GlueLanguage = {
  prefix: CSHARP_PREFIX,
  glue: csharpGlue,
  starter: csharpStarter,
  fileName: 'Solution.cs',
};
