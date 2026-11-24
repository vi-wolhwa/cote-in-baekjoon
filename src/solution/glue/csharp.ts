/**
 * C# glue (Baekjoon: .NET console app): one `using` line goes before the user's code (the
 * line offset); the user writes `public class Solution { public <ret> solution(...) }` like
 * the coding-test site, and the glue adds `public static class __cib_Main` with the only
 * `Main`: a byte reader over the whole input, one call per case (a new Solution each time)
 * and one write at the end. 2D arrays are jagged (`int[][]`).
 */
import {
  labelParts,
  retSep,
  type Format,
  type ParamType,
  type RetSpec,
  type RetType,
} from '../dsl';
import { CSHARP_ROWS, CSHARP_RUNTIME } from './csharp-runtime';
import {
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
    line: (end, text) =>
      `__cib_rowsLine(${end.mode}, ${csharpQuote(end.text)}, ${text ? 'true' : 'false'})`,
    phys: (end) => `__cib_rowsPhys(${end.mode}, ${csharpQuote(end.text)})`,
  });

/** A declaration of a variable of this C# type with a default value. */
function declare(type: string, name: string): string {
  const init = type === 'int' || type === 'long' ? '0' : type === 'double' ? '0.0' : 'null';
  return `${type} ${name} = ${init};`;
}

/**
 * A block: each pass reads the block's variables (locals) and adds them to a List buffer per
 * parameter, which becomes the parameter's array after the loop (a negative count is an
 * input error, by __cib_cnt).
 */
function block(plan: Plan, s: Extract<Step, { op: 'block' }>): string {
  const head = (() => {
    switch (s.loop.kind) {
      case 'count':
        return `for (int __cib_b = 0, __cib_bn = ${count(s.loop.n)}; __cib_b < __cib_bn; __cib_b++) {`;
      case 'eof':
        return 'while (__cib_has()) {';
      case 'tok':
        return `while (!__cib_at(new string[] {${s.loop.end.map(csharpQuote).join(', ')}})) {`;
      case 'line':
        return `while (!__cib_endl(${s.loop.end.mode}, ${csharpQuote(s.loop.end.text)})) {`;
    }
  })();
  const type = (v: number) => CSHARP_TYPES[planVar(plan, v).type];
  const buffer = (x: { list: number }) => `__cib_l${x.list}`;
  return [
    '{',
    ...s.items.map(
      (x) => `    var ${buffer(x)} = new System.Collections.Generic.List<${type(x.item)}>();`,
    ),
    `    ${head}`,
    ...s.items.map((x) => `        ${declare(type(x.item), variable(x.item))}`),
    ...s.steps.flatMap((x) => step(plan, x).split('\n')).map((l) => `        ${l}`),
    ...s.items.map((x) => `        ${buffer(x)}.Add(${variable(x.item)});`),
    '    }',
    ...s.items.map((x) => `    ${variable(x.list)} = ${buffer(x)}.ToArray();`),
    '}',
  ].join('\n');
}

function step(plan: Plan, s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
    case 'block':
      return block(plan, s);
    case 'raw':
      return `${v} = __cib_rawl();`;
    case 'rawLines':
      return `${v} = new string[${rows(s.n)}]; for (int __cib_i = 0; __cib_i < ${v}.Length; __cib_i++) ${v}[__cib_i] = __cib_rawl();`;
    case 'endRaw':
      return '__cib_rawl();';
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
  const label = labelParts(ret);
  const decls = plan.params.map((p, i) => declare(CSHARP_TYPES[p.type], variable(i)));
  const body = (n: number) =>
    [
      ...decls,
      'try {',
      ...plan.steps.flatMap((s) => step(plan, s).split('\n')).map((l) => `    ${l}`),
      '} catch (System.Exception __cib_e) when (!(__cib_e is __cib_Error)) {',
      '    throw __cib_fail();',
      '}',
      `${CSHARP_TYPES[ret.type]} __cib_res = new Solution().solution(${vars.join(', ')});`,
      "if (__cib_cases++ > 0) __cib_o.Append('\\n');",
      ...(label
        ? [
            `__cib_o.Append(${csharpQuote(label.pre)}).Append(__cib_cases).Append(${csharpQuote(label.post)});`,
          ]
        : []),
      ...printer(ret),
      ...(ret.blank ? ["__cib_o.Append('\\n');"] : []),
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
        return `        while (__cib_has() && !__cib_endl(${mode}, ${csharpQuote(text)})) {\n${body(12)}\n        }`;
      }
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
    CSHARP_RUNTIME,
    ...(usesRows(plan) ? [CSHARP_ROWS] : []),
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
