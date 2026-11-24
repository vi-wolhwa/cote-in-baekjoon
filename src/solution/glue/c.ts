/**
 * C99/C11 glue: four standard headers go before the user's code (the line offset); after it,
 * a reader over the whole input, a `main` that calls `solution` per case and the printing.
 *
 * C has no containers, so signatures follow the usual coding-test C template: an array is a
 * pointer plus its length (`int arr[], size_t arr_len`), a 2D array is `int** g` with
 * `size_t g_rows` and `size_t g_cols` (rows of different lengths: `size_t g_cols[]`, one
 * length per row), strings are `const char*`. An array is returned as a malloc'd pointer with
 * its length written to `*ret_len`; a 2D array with `*ret_rows` and `*ret_cols` (a malloc'd
 * array of row lengths).
 */
import {
  retSep,
  type Format,
  type Param,
  type ParamType,
  type RetSpec,
  type RetType,
} from '../dsl';
import { C_ROWS, C_RUNTIME } from './c-runtime';
import {
  quote,
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

export const C_PREFIX =
  '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <stdbool.h>\n';

const ELEMENT: Record<Scalar, string> = {
  int: 'int',
  long: 'long long',
  double: 'double',
  string: 'const char*',
};

/** Reader function suffix per element type: __cib_int(), __cib_ints(k), __cib_intr(&k). */
const READ: Record<Scalar, string> = { int: 'int', long: 'll', double: 'dbl', string: 'str' };

const variable = (v: number) => `__cib_v${v}`;
/** Length of a 1D array, or rows of a 2D one. */
const length = (v: number) => `__cib_n${v}`;
/** Columns of a 2D array: one count, or one per row. */
const columns = (v: number) => `__cib_c${v}`;
const count = (c: CountRef) => `__cib_cnt((long long)(${renderCount(c, variable)}))`;
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) =>
      end.length === 0
        ? `__cib_rowsTok(NULL, 0, ${k})`
        : `__cib_rowsTok((const char* const[]){${end.map(quote).join(', ')}}, ${end.length}, ${k})`,
    line: (end, raw) =>
      `__cib_rowsLine(${end === null ? 'NULL' : quote(end)}, ${raw ? 'true' : 'false'})`,
  });
const each = (v: number, body: string) =>
  `for (size_t __cib_i = 0; __cib_i < ${length(v)}; __cib_i++) ${body}`;

function step(s: Step): string {
  if (s.op === 'nl') return '__cib_nl();';
  if (s.op === 'endTok') return Array(s.k).fill('__cib_skip();').join(' ');
  if (s.op === 'endLine') return '__cib_nl(); __cib_skipline();';
  const v = variable(s.v);
  const n = length(s.v);
  switch (s.op) {
    case 'scalar':
      return `${v} = __cib_${READ[s.t]}();`;
    case 'line':
      return `${v} = __cib_line();`;
    case 'array':
      return `${n} = ${rows(s.n)}; ${v} = __cib_${READ[s.t]}s(${n});`;
    case 'rest':
      return `${v} = __cib_${READ[s.t]}r(&${n});`;
    case 'chars':
      return `${n} = ${rows(s.n)}; ${v} = __cib_strs(${n});`;
    case 'lines':
      return `${n} = ${rows(s.n)}; ${v} = (const char**)__cib_alloc(${n}, sizeof(const char*)); ${each(s.v, `{ __cib_nl(); ${v}[__cib_i] = __cib_line(); }`)}`;
    case 'grid': {
      const c = columns(s.v);
      const row = `${ELEMENT[s.t]}*`;
      const alloc = `${v} = (${row}*)__cib_alloc(${n}, sizeof(${row}));`;
      return s.cols
        ? `${n} = ${rows(s.n)}; ${c} = ${count(s.cols)}; ${alloc} ${each(s.v, `${v}[__cib_i] = __cib_${READ[s.t]}s(${c});`)}`
        : `${n} = ${rows(s.n)}; ${alloc} ${c} = (size_t*)__cib_alloc(${n}, sizeof(size_t)); ${each(s.v, `{ __cib_nl(); ${v}[__cib_i] = __cib_${READ[s.t]}r(&${c}[__cib_i]); }`)}`;
    }
  }
}

type Shape = 'scalar' | 'array' | 'rect' | 'ragged' | 'chars';

function shape(p: Param): Shape {
  if (p.type === 'char[][]') return 'chars';
  if (p.type.endsWith('[][]')) return p.cols === undefined ? 'ragged' : 'rect';
  if (p.type.endsWith('[]')) return 'array';
  return 'scalar';
}

/** The glue's variables for one parameter, and the arguments passed to `solution`. */
function param(p: Param, i: number): { decls: string[]; args: string[] } {
  const v = variable(i);
  const n = `size_t ${length(i)} = 0;`;
  const t = elementTypeOf(p.type);
  switch (shape(p)) {
    case 'scalar':
      return { decls: [`${t} ${v} = 0;`], args: [v] };
    case 'array':
    case 'chars':
      return { decls: [`${t}* ${v} = NULL;`, n], args: [v, length(i)] };
    case 'rect':
      return {
        decls: [`${t}** ${v} = NULL;`, n, `size_t ${columns(i)} = 0;`],
        args: [v, length(i), columns(i)],
      };
    case 'ragged':
      return {
        decls: [`${t}** ${v} = NULL;`, n, `size_t* ${columns(i)} = NULL;`],
        args: [v, length(i), columns(i)],
      };
  }
}

/** C type of a parameter's scalars (`line`, `string` and `char[][]` rows: const char*). */
function elementTypeOf(type: ParamType): string {
  if (type.startsWith('int')) return 'int';
  if (type.startsWith('long')) return 'long long';
  if (type.startsWith('double')) return 'double';
  return 'const char*';
}

/** Declaring the result, calling `solution`, and printing it. */
function callAndPrint(ret: RetSpec, args: string[]): string[] {
  const call = (extra: string[]) => `solution(${[...args, ...extra].join(', ')})`;
  const sep = quote(retSep(ret));
  const len = 'size_t __cib_rn = 0;';
  const join = (put: string) =>
    `for (size_t __cib_i = 0; __cib_i < __cib_rn; __cib_i++) { if (__cib_i) __cib_puts(${sep}); ${put}; }`;
  switch (ret.type) {
    case 'int':
    case 'long':
      return [`long long __cib_r = ${call([])};`, '__cib_putll(__cib_r);'];
    case 'double':
      return [`double __cib_r = ${call([])};`, `__cib_putdbl(__cib_r, ${ret.digits ?? 6});`];
    case 'bool':
      return [
        `bool __cib_r = ${call([])};`,
        `__cib_puts(__cib_r ? ${quote(ret.yes ?? 'true')} : ${quote(ret.no ?? 'false')});`,
      ];
    case 'string':
      return [`const char* __cib_r = ${call([])};`, '__cib_puts(__cib_r);'];
    case 'int[]':
    case 'long[]': {
      const t = ret.type === 'int[]' ? 'int' : 'long long';
      return [
        len,
        `${t}* __cib_r = ${call(['&__cib_rn'])};`,
        join('__cib_putll(__cib_r[__cib_i])'),
      ];
    }
    case 'string[]':
    case 'line[]':
      return [
        len,
        `const char** __cib_r = (const char**)${call(['&__cib_rn'])};`,
        join('__cib_puts(__cib_r[__cib_i])'),
      ];
    case 'char[][]':
      return [
        len,
        `const char** __cib_r = (const char**)${call(['&__cib_rn'])};`,
        `for (size_t __cib_i = 0; __cib_i < __cib_rn; __cib_i++) { if (__cib_i) __cib_putc('\\n'); __cib_putrow(__cib_r[__cib_i], ${sep}); }`,
      ];
    case 'int[][]':
      return [
        len,
        'size_t* __cib_rc = NULL;',
        `int** __cib_r = ${call(['&__cib_rn', '&__cib_rc'])};`,
        `for (size_t __cib_i = 0; __cib_i < __cib_rn; __cib_i++) { if (__cib_i) __cib_putc('\\n'); for (size_t __cib_j = 0; __cib_rc && __cib_j < __cib_rc[__cib_i]; __cib_j++) { if (__cib_j) __cib_puts(${sep}); __cib_putll(__cib_r[__cib_i][__cib_j]); } }`,
      ];
  }
}

export function cGlue(plan: Plan, ret: RetSpec): string {
  const params = plan.params.map(param);
  const body = (n: number) =>
    [
      ...params.flatMap((p) => p.decls),
      ...plan.steps.map(step),
      ...callAndPrint(
        ret,
        params.flatMap((p) => p.args),
      ),
    ]
      .map((l) => ' '.repeat(n) + l)
      .join('\n');
  const loop = (() => {
    const each = (head: string) =>
      `    ${head ? `${head} ` : ''}{\n        if (__cib_cases++) __cib_putc('\\n');\n${body(8)}\n    }`;
    switch (plan.loop.kind) {
      case 'once':
        return each('');
      case 'count':
        return `    int __cib_t = __cib_int();\n${each('for (int __cib_c = 0; __cib_c < __cib_t; __cib_c++)')}`;
      case 'eof':
        return each('while (__cib_has())');
      case 'until': {
        const words = plan.loop.tokens.map(quote).join(', ');
        return [
          `    static const char* const __cib_end[] = {${words}};`,
          each(`while (__cib_has() && !__cib_at(__cib_end, ${plan.loop.tokens.length}))`),
        ].join('\n');
      }
    }
  })();
  return [
    '/* ---- 입출력 코드 ---- */',
    C_RUNTIME,
    ...(usesRows(plan) ? [C_ROWS] : []),
    'int main(void) {',
    '    {',
    '        size_t __cib_cap = 1 << 16, __cib_k;',
    '        __cib_d = (char*)__cib_alloc(__cib_cap, 1);',
    '        while ((__cib_k = fread(__cib_d + __cib_n, 1, __cib_cap - __cib_n, stdin)) > 0) {',
    '            __cib_n += __cib_k;',
    '            if (__cib_n == __cib_cap) {',
    '                __cib_cap *= 2;',
    '                __cib_d = (char*)realloc(__cib_d, __cib_cap);',
    '                if (!__cib_d) __cib_fail();',
    '            }',
    '        }',
    "        __cib_d[__cib_n] = '\\0';",
    '    }',
    '    int __cib_cases = 0;',
    loop,
    "    if (__cib_cases) __cib_putc('\\n');",
    '    if (__cib_on) fwrite(__cib_o, 1, __cib_on, stdout);',
    '    return 0;',
    '}',
    '',
  ].join('\n');
}

// ---- Starting code ----

/** Return types as the starter writes them; the glue also accepts `const char**`. */
const RET_TYPES: Record<RetType, string> = {
  int: 'int',
  long: 'long long',
  double: 'double',
  string: 'char*',
  bool: 'bool',
  'int[]': 'int*',
  'long[]': 'long long*',
  'string[]': 'char**',
  'line[]': 'char**',
  'int[][]': 'int**',
  'char[][]': 'char**',
};

/** Parameter declarations, with lengths named after the parameter (`arr_len`, `g_rows`). */
function starterParams(format: Format): string[] {
  const taken = new Set(format.params.map((p) => p.name));
  const name = (base: string) => {
    let n = base;
    while (taken.has(n)) n += '_';
    taken.add(n);
    return n;
  };
  return format.params.flatMap((p) => {
    const t = elementTypeOf(p.type);
    switch (shape(p)) {
      case 'scalar':
        return [`${t} ${p.name}`];
      case 'array':
        return [`${t} ${p.name}[]`, `size_t ${name(`${p.name}_len`)}`];
      case 'chars':
        return [`${t} ${p.name}[]`, `size_t ${name(`${p.name}_rows`)}`];
      case 'rect':
        return [
          `${t}** ${p.name}`,
          `size_t ${name(`${p.name}_rows`)}`,
          `size_t ${name(`${p.name}_cols`)}`,
        ];
      case 'ragged':
        return [
          `${t}** ${p.name}`,
          `size_t ${name(`${p.name}_rows`)}`,
          `size_t ${name(`${p.name}_cols`)}[]`,
        ];
    }
  });
}

export function cStarter(format: Format): string {
  const type = format.ret.type;
  const ret = RET_TYPES[type];
  const shapes = format.params.map(shape);
  const comments = ['// stdio.h, stdlib.h, string.h, stdbool.h는 자동으로 포함됩니다.'];
  if (shapes.includes('array')) comments.push('// 배열은 포인터와 길이(이름_len)로 받습니다.');
  if (shapes.includes('chars'))
    comments.push('// 문자 격자는 한 행씩 문자열로, 행 수는 이름_rows로 받습니다.');
  if (shapes.includes('rect'))
    comments.push('// 2차원 배열은 행 수(이름_rows)와 열 수(이름_cols)를 함께 받습니다.');
  if (shapes.includes('ragged'))
    comments.push(
      '// 2차원 배열은 행 수(이름_rows)와 i번째 행의 길이(이름_cols[i])를 함께 받습니다.',
    );
  const extra: string[] = [];
  let init: string[];
  if (type === 'int[][]') {
    comments.push(
      '// 2차원 배열을 반환할 때는 malloc으로 만든 배열을 돌려주고, 행 수를 *ret_rows에,',
      '// 행마다의 길이를 담은 배열(malloc)을 *ret_cols에 넣어 주세요.',
    );
    extra.push('size_t* ret_rows', 'size_t** ret_cols');
    init = [
      'int** answer = (int**)malloc(sizeof(int*) * 1);',
      '*ret_rows = 0;',
      '*ret_cols = (size_t*)malloc(sizeof(size_t) * 1);',
    ];
  } else if (type.endsWith('[]')) {
    const element = ret.slice(0, -1);
    comments.push(
      type === 'char[][]' || type === 'string[]' || type === 'line[]'
        ? '// 문자열 배열을 반환할 때는 malloc으로 만든 배열을 돌려주고, 길이를 *ret_len에 넣어 주세요.'
        : '// 배열을 반환할 때는 malloc으로 만든 배열을 돌려주고, 길이를 *ret_len에 넣어 주세요.',
    );
    extra.push('size_t* ret_len');
    init = [`${ret} answer = (${ret})malloc(sizeof(${element}) * 1);`, '*ret_len = 0;'];
  } else if (type === 'string') {
    comments.push('// 문자열은 malloc으로 만들어 돌려주세요.');
    init = ['char* answer = (char*)malloc(sizeof(char) * 1);', "answer[0] = '\\0';"];
  } else {
    init = [`${ret} answer = ${type === 'bool' ? 'true' : '0'};`];
  }
  const params = [...starterParams(format), ...extra];
  const lines = [...init, 'return answer;'].map((l) => `    ${l}`).join('\n');
  return `${comments.join('\n')}\n\n${ret} solution(${params.length ? params.join(', ') : 'void'}) {\n${lines}\n}\n`;
}

export const cLanguage: GlueLanguage = {
  prefix: C_PREFIX,
  glue: cGlue,
  starter: cStarter,
  fileName: 'solution.c',
};
