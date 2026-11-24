/**
 * TypeScript glue: the JavaScript glue with types, so it compiles with `tsc` whether or not
 * the compiler is strict and whether or not Node's type definitions are installed. `require`
 * and `BigInt` are looked up at run time (`eval`) for the same reason: declaring them would
 * clash with @types/node or an ES2020 lib, and using them bare fails without those.
 */
import type { Format, ParamType, RetSpec, RetType } from '../dsl';
import { jsGlue } from './js';
import type { Plan } from './plan';
import type { GlueLanguage } from './types';

export const TS_TYPES: Record<ParamType | RetType, string> = {
  int: 'number',
  long: 'number',
  double: 'number',
  string: 'string',
  line: 'string',
  bool: 'boolean',
  'int[]': 'number[]',
  'long[]': 'number[]',
  'double[]': 'number[]',
  'string[]': 'string[]',
  'line[]': 'string[]',
  'int[][]': 'number[][]',
  'long[][]': 'number[][]',
  'double[][]': 'number[][]',
  'string[][]': 'string[][]',
  'char[][]': 'string[]',
};

/** `(a, b) =>` → `(a: any, b: any) =>`. */
function typeArrows(code: string): string {
  return code.replace(
    /\(((?:[A-Za-z_$][\w$]*)(?:, [A-Za-z_$][\w$]*)*)\) =>/g,
    (_, list: string) => {
      const typed = list
        .split(', ')
        .map((name) => `${name}: any`)
        .join(', ');
      return `(${typed}) =>`;
    },
  );
}

export function tsGlue(plan: Plan, ret: RetSpec): string {
  const js = jsGlue(plan, ret);
  const typed = typeArrows(js)
    .replace("require('fs')", "__cib_req('fs')")
    .replace(/\bBigInt\(/g, '__cib_big(')
    .replace(/let (__cib_v\d+(?:, __cib_v\d+)*);/, (_, vars: string) => {
      return `let ${vars
        .split(', ')
        .map((v) => `${v}: any`)
        .join(', ')};`;
    })
    .replace('const __cib_o = [];', 'const __cib_o: string[] = [];')
    .replace(
      '(() => {\n',
      "(() => {\n  const __cib_req: any = eval('require');\n  const __cib_big: any = eval('BigInt');\n",
    );
  return typed;
}

export function tsStarter(format: Format): string {
  const params = format.params.map((p) => `${p.name}: ${TS_TYPES[p.type]}`).join(', ');
  const type = TS_TYPES[format.ret.type];
  const answer = type.endsWith('[]')
    ? '[]'
    : type === 'string'
      ? "''"
      : type === 'boolean'
        ? 'true'
        : '0';
  return `function solution(${params}): ${type} {\n    let answer: ${type} = ${answer};\n    return answer;\n}\n`;
}

export const tsLanguage: GlueLanguage = {
  prefix: '',
  glue: tsGlue,
  starter: tsStarter,
  fileName: 'solution.ts',
};
