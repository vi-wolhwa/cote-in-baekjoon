/**
 * TypeScript in solution-function mode: the program (user code + glue) must compile with
 * `tsc` however Baekjoon configures it (strict or not, with or without Node's types), and
 * run like the JavaScript glue once the types are stripped (what '코드 실행' does).
 */
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { runJs } from '@/runner/js/execute';
import { stripTypes } from '@/runner/js/typescript';
import { checkFormat, type Format } from '@/solution/dsl';
import { buildProgram } from '@/solution/program';
import { starterCode } from '@/solution/starter';
import { EXT_CASES } from './native/ext-cases';

const f = (x: unknown): Format => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};

const SORT = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'arr', type: 'long[]', len: 'n' },
  ],
  lines: [['n'], ['arr']],
  cases: null,
  ret: { type: 'long[]', sep: ' ' },
});
const BLOCKS = f({
  v: 1,
  params: [
    { name: 'names', type: 'line[]' },
    { name: 'grid', type: 'char[][]' },
  ],
  lines: [
    { until: '.', of: 'names' },
    { until: 'EOF', of: 'grid' },
  ],
  cases: null,
  ret: { type: 'line[]' },
});
const CASES = f({
  v: 1,
  params: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'int' },
  ],
  lines: [['a', 'b']],
  cases: { count: 'T' },
  ret: { type: 'bool', yes: 'YES', no: 'NO' },
});

const SORT_CODE = `function solution(n: number, arr: number[]): number[] {
    return [...arr].sort((x, y) => x - y);
}`;
const BLOCKS_CODE = `function solution(names: string[], grid: string[]): string[] {
    return [...names.map((s) => s.toUpperCase()), String(grid.length)];
}`;
const CASES_CODE = `function solution(a: number, b: number): boolean {
    return a < b;
}`;
// The same with a case label line and a blank line after each case.
const LABELED = f({ ...CASES, ret: { ...CASES.ret, label: 'Case #{i}:\n', blank: true } });

/** Parsed lib and @types files per setup: parsing them is most of each compile's time. */
const libFiles = new Map<ts.CompilerOptions, Map<string, ts.SourceFile | undefined>>();

/**
 * Type errors of a program, compiled as a script like Baekjoon's single file. Only
 * solution.ts is checked (with the global and option diagnostics): a clash between the glue
 * and a lib declaration is still reported there.
 */
function typeErrors(source: string, options: ts.CompilerOptions): string[] {
  const file = 'solution.ts';
  const cache = libFiles.get(options) ?? new Map<string, ts.SourceFile | undefined>();
  libFiles.set(options, cache);
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  host.readFile = (name) => (name === file ? source : read(name));
  const exists = host.fileExists.bind(host);
  host.fileExists = (name) => name === file || exists(name);
  const get = host.getSourceFile.bind(host);
  host.getSourceFile = (name, lang) => {
    if (name === file) return ts.createSourceFile(file, source, lang);
    if (!cache.has(name)) cache.set(name, get(name, lang));
    return cache.get(name);
  };
  const program = ts.createProgram([file], options, host);
  const solution = program.getSourceFile(file);
  return [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSyntacticDiagnostics(solution),
    ...program.getSemanticDiagnostics(solution),
  ].map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

const SETUPS: Record<string, ts.CompilerOptions> = {
  'strict, Node types': {
    strict: true,
    target: ts.ScriptTarget.ES2020,
    lib: ['lib.es2020.d.ts'],
    types: ['node'],
    noEmit: true,
  },
  'strict, no Node types': {
    strict: true,
    target: ts.ScriptTarget.ES2020,
    lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
    types: [],
    noEmit: true,
  },
  'defaults, ES2015': {
    target: ts.ScriptTarget.ES2015,
    lib: ['lib.es2015.d.ts', 'lib.dom.d.ts'],
    types: [],
    noEmit: true,
  },
};

describe('TypeScript glue compiles with tsc', { timeout: 120_000 }, () => {
  for (const [name, options] of Object.entries(SETUPS)) {
    it(name, () => {
      const programs: [Format, string][] = [
        [SORT, SORT_CODE],
        [BLOCKS, BLOCKS_CODE],
        [CASES, CASES_CODE],
        [LABELED, CASES_CODE],
        // DSL extensions (blocks, raw lines, end conditions) from their typed starting code.
        ...Object.values(EXT_CASES).map(
          (c) => [c.format, starterCode('ts', c.format)] as [Format, string],
        ),
      ];
      for (const [format, code] of programs) {
        expect(typeErrors(buildProgram('ts', format, code).source, options)).toEqual([]);
      }
    });
  }

  it('starts from typed code that compiles too', () => {
    const starter = starterCode('ts', SORT);
    expect(starter).toBe(
      'function solution(n: number, arr: number[]): number[] {\n    let answer: number[] = [];\n    return answer;\n}\n',
    );
    const options = SETUPS['strict, Node types'] as ts.CompilerOptions;
    expect(typeErrors(buildProgram('ts', SORT, starter).source, options)).toEqual([]);
  });

  it('still reports a type error with the cached libs', () => {
    const options = SETUPS['strict, Node types'] as ts.CompilerOptions;
    const wrong = 'function solution(n: number, arr: number[]): number[] {\n    return n;\n}\n';
    expect(typeErrors(buildProgram('ts', SORT, wrong).source, options)).not.toEqual([]);
  });
});

describe('TypeScript glue runs once types are stripped', () => {
  const run = (format: Format, code: string, input: string) => {
    const stripped = stripTypes(buildProgram('ts', format, code).source);
    if ('compileError' in stripped) throw new Error(stripped.compileError);
    return runJs(stripped.code, input);
  };

  it('reads arrays with values past 2^53 as BigInt-safe numbers', async () => {
    const r = await run(SORT, SORT_CODE, '3\n5 1 4\n');
    expect(r.error).toBeUndefined();
    expect(r.stdout).toBe('1 4 5\n');
  });

  it('reads lines up to an end line and rows to the end of input', async () => {
    const r = await run(BLOCKS, BLOCKS_CODE, 'ab c\nd\n.\n#.\n..\n');
    expect(r.stdout).toBe('AB C\nD\n2\n');
  });

  it('calls solution per case', async () => {
    const r = await run(CASES, CASES_CODE, '2\n1 2\n3 1\n');
    expect(r.stdout).toBe('YES\nNO\n');
    const labeled = await run(LABELED, CASES_CODE, '2\n1 2\n3 1\n');
    expect(labeled.stdout).toBe('Case #1:\nYES\n\nCase #2:\nNO\n\n');
  });
});
