/**
 * Glue code per language (ADR-0006). The golden files under tests/fixtures/solution-glue/
 * show the whole generated program; review their diff when the templates change
 * (`npx vitest run tests/solution-glue.test.ts -u` rewrites them).
 */
import { describe, expect, it } from 'vitest';
import { checkFormat, type Format } from '@/solution/dsl';
import type { GlueId } from '@/solution/glue';
import { makePlan, needsLines } from '@/solution/glue/plan';
import {
  buildProgram,
  GLUE_COMPILE_NOTE,
  GLUE_INPUT_MESSAGE,
  mapRunMessages,
  NO_SOLUTION_MESSAGE,
} from '@/solution/program';
import { solutionFileName, starterCode } from '@/solution/starter';
import { EXT_CASES } from './native/ext-cases';

const f = (x: unknown): Format => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};

const AB = f({
  v: 1,
  params: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'int' },
  ],
  lines: [['a', 'b']],
  cases: null,
  ret: { type: 'int' },
});

const GRID = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'm', type: 'int' },
    { name: 'board', type: 'char[][]', cols: 'm' },
  ],
  lines: [['n', 'm'], { repeat: 'n', of: 'board' }],
  cases: { count: 'T' },
  ret: { type: 'bool', yes: 'YES', no: 'NO' },
});

const LINES = f({
  v: 1,
  params: [
    { name: 'title', type: 'line' },
    { name: 'nums', type: 'long[]' },
    { name: 'k', type: 'int' },
    { name: 'rows', type: 'int[][]' },
  ],
  lines: [['title'], ['nums'], ['k'], { repeat: 'k', of: 'rows' }],
  cases: { until: '0 0' },
  ret: { type: 'double', digits: 2 },
});

// A label line before each case and a blank line after it.
const LABEL = f({ ...GRID, ret: { ...GRID.ret, label: 'Scenario #{i}:\n', blank: true } });

// DSL extensions: a count expression and a flow array, a counted block, a block up to an end
// line with a repeat inside, lines up to a prefix, a block up to "<=0", cases up to "<0".
const EXT_FORMAT = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'arr', type: 'int[]', len: '2*n-1', flow: true },
    { name: 'k', type: 'int' },
    { name: 'name', type: 'string' },
    { name: 'items', type: 'int[]', len: 'k' },
    { name: 'm', type: 'long' },
    { name: 'vals', type: 'double[]' },
    { name: 'words', type: 'line[]' },
    { name: 'p', type: 'int' },
  ],
  lines: [
    ['n'],
    ['arr'],
    { repeat: 'n-1', of: [['k', 'name'], ['items']] },
    { until: '0', of: [['m'], { repeat: 'm', of: 'vals' }] },
    { until: '#*', of: 'words' },
    { until: '<=0', of: [['p']] },
  ],
  cases: { until: '<0' },
  ret: { type: 'long' },
});
// Raw lines: one line, lines by a count, up to an end line and to the end of input.
const RAW = EXT_CASES.rawLines.format;

/** Golden file extension per glue language. */
const EXT = {
  js: 'js',
  python: 'py',
  cpp: 'cpp',
  c: 'c',
  java: 'java',
  swift: 'swift',
  csharp: 'cs',
  ruby: 'rb',
  kotlin: 'kt',
  rust: 'rs',
  go: 'go',
} as const;
const ENGINES = Object.keys(EXT) as (keyof typeof EXT)[];

describe('generated programs (golden files)', () => {
  for (const engine of ENGINES) {
    for (const [name, format] of [
      ['ab', AB],
      ['grid', GRID],
      ['lines', LINES],
      ['label', LABEL],
      ['ext', EXT_FORMAT],
      ['raw', RAW],
    ] as const) {
      it(`${name} in ${engine}`, async () => {
        const program = buildProgram(engine, format, starterCode(engine, format));
        await expect(program.source).toMatchFileSnapshot(
          `fixtures/solution-glue/${name}.${EXT[engine] ?? engine}.txt`,
        );
      });
    }
  }
});

describe('buildProgram', () => {
  it('puts the glue after the user code and reports the lines before it', () => {
    const js = buildProgram('js', AB, 'function solution(a, b) { return a + b; }');
    expect(js.source.startsWith('function solution(a, b) { return a + b; }\n\n')).toBe(true);
    expect(js).toMatchObject({ prefixLines: 0, userLines: 1 });

    const cpp = buildProgram('cpp', AB, 'int solution(int a, int b) {\n  return a + b;\n}\n');
    expect(
      cpp.source.startsWith('#include <bits/stdc++.h>\nusing namespace std;\nint solution'),
    ).toBe(true);
    expect(cpp).toMatchObject({ prefixLines: 2, userLines: 3 });

    const java = buildProgram('java', AB, 'public class Solution {}');
    expect(java.source.split('\n')[1]).toBe('       class Solution {}');
    expect(java.source).toContain('public class Main {');
    expect(java.prefixLines).toBe(1);

    const c = buildProgram('c', AB, 'int solution(int a, int b) {\n  return a + b;\n}\n');
    expect(c.source).toMatch(/^#include <stdio.h>\n(#include <\w+\.h>\n){3}int solution/);
    expect(c).toMatchObject({ prefixLines: 4, userLines: 3 });
  });

  it('prefixes every name the glue declares where user code could see it with __cib_', () => {
    const top = (engine: GlueId, pattern: RegExp) => {
      const { source } = buildProgram(engine, LINES, '');
      const names = source.split('\n').flatMap((l) => {
        const m = pattern.exec(l);
        return m ? [(m[1] ?? m[2]) as string] : [];
      });
      expect(names.length).toBeGreaterThan(1);
      return names.filter((n) => n !== 'main');
    };
    for (const name of top('cpp', /^static [^(=;]*?(\w+)\s*[(=;[]/))
      expect(name).toMatch(/^__cib_/);
    for (const name of top('c', /^static [^(=;]*?(\w+)\s*[(=;[]/)) expect(name).toMatch(/^__cib_/);
    for (const name of top('java', /^ {4}static [^(=;]*?(\w+)\s*[(=;,]/))
      expect(name).toMatch(/^__cib_/);
    for (const name of top('python', /^(?:def (\w+)|import \w+ as (\w+))/))
      expect(name).toMatch(/^__cib_/);
    // JavaScript: everything lives inside one arrow function.
    const js = buildProgram('js', LINES, '').source;
    expect(js.slice(js.indexOf('(() => {'))).toMatch(/^\(\(\) => \{[\s\S]*\}\)\(\);\n$/);
  });

  it('uses the fast token path in Python unless line boundaries matter', () => {
    expect(needsLines(makePlan(AB))).toBe(false);
    expect(needsLines(makePlan(LINES))).toBe(true);
    expect(buildProgram('python', AB, '').source).toContain('sys.stdin.buffer.read().split()');
  });
});

describe('starterCode', () => {
  it('writes typed signatures from the format', () => {
    expect(starterCode('python', AB)).toBe(
      'def solution(a, b):\n    answer = 0\n    return answer\n',
    );
    expect(starterCode('js', GRID)).toContain(
      'function solution(n, m, board) {\n    let answer = true;',
    );
    expect(starterCode('cpp', LINES)).toContain(
      'double solution(string title, vector<long long> nums, int k, vector<vector<int>> rows) {',
    );
    expect(starterCode('java', GRID)).toContain(
      'public boolean solution(int n, int m, char[][] board) {',
    );
    expect(solutionFileName('java')).toBe('Solution.java');
    expect(starterCode('c', LINES)).toContain(
      'double solution(const char* title, long long nums[], size_t nums_len, int k, int** rows, size_t rows_rows, size_t rows_cols[]) {',
    );
    expect(solutionFileName('c')).toBe('solution.c');
  });

  it('writes Kotlin, Rust and Go signatures like a coding-test site', () => {
    expect(starterCode('kotlin', LINES)).toContain(
      'fun solution(title: String, nums: LongArray, k: Int, rows: Array<IntArray>): Double {',
    );
    expect(starterCode('rust', GRID)).toContain(
      'fn solution(n: i32, m: i32, board: Vec<Vec<char>>) -> bool {',
    );
    expect(starterCode('go', LINES)).toContain(
      'func solution(title string, nums []int64, k int, rows [][]int) float64 {',
    );
  });

  it('drops a package clause written in Go code', () => {
    const go = buildProgram('go', AB, 'package main\n\nfunc solution(a int, b int) int {}');
    expect(go.source.match(/^package main$/gm)).toHaveLength(1);
    expect(go.prefixLines).toBe(2);
    expect(go.userLines).toBe(3);
  });
});

describe('mapRunMessages', () => {
  const cpp = buildProgram('cpp', AB, 'int solution(int a, int b) {\n  return a + c;\n}\n');

  it('moves C++ line numbers back to the user code', () => {
    const out = mapRunMessages('cpp', cpp, {
      compileError:
        "solution.cpp:4:14: error: use of undeclared identifier 'c'\n    4 |   return a + c;\n      |              ^",
      stderr: '',
    });
    expect(out.compileError).toBe(
      "solution.cpp:2:14: error: use of undeclared identifier 'c'\n    2 |   return a + c;\n      |              ^",
    );
  });

  it('moves C line numbers back to the user code', () => {
    const c = buildProgram('c', AB, 'int solution(int a, int b) {\n  return a + c;\n}\n');
    const out = mapRunMessages('cpp', c, {
      compileError: `solution.c:6:14: error: use of undeclared identifier 'c'\n    6 |   return a + c;\n      |              ^\nsolution.c:${c.prefixLines + c.userLines + 30}:9: error: too many arguments`,
      stderr: '',
    });
    expect(out.compileError).toContain(
      "solution.c:2:14: error: use of undeclared identifier 'c'\n    2 |   return a + c;",
    );
    expect(out.compileError).toContain('solution.c(입출력 코드): error: too many arguments');
    expect(out.compileError).toContain(GLUE_COMPILE_NOTE);
  });

  it('marks errors inside the glue and explains them in Korean', () => {
    const glueLine = cpp.prefixLines + cpp.userLines + 40;
    const out = mapRunMessages('cpp', cpp, {
      compileError: `solution.cpp:${glueLine}:20: error: no matching function for call to 'solution'`,
      stderr: '',
    });
    expect(out.compileError).toContain('solution.cpp(입출력 코드): error: no matching function');
    expect(out.compileError).toContain(GLUE_COMPILE_NOTE);
  });

  it('maps Java and Python lines', () => {
    const java = buildProgram(
      'java',
      AB,
      'class Solution {\n  int solution(int a, int b) { return x; }\n}',
    );
    expect(
      mapRunMessages('java', java, {
        compileError: 'Main.java:3: error: cannot find symbol',
        stderr: '',
      }).compileError,
    ).toBe('Solution.java:2: error: cannot find symbol');

    const py = buildProgram('python', AB, 'def solution(a, b):\n    return a // 0\n');
    const out = mapRunMessages('python', py, {
      error: 'ZeroDivisionError: integer division or modulo by zero',
      stderr: `Traceback (most recent call last):\n  File "solution.py", line 40, in <module>\n  File "solution.py", line 2, in solution\nZeroDivisionError`,
    });
    expect(out.stderr).toContain('File "solution.py" (입출력 코드)');
    expect(out.stderr).toContain('File "solution.py", line 2, in solution');
    expect(out.stderr).not.toContain(GLUE_COMPILE_NOTE);
  });

  it('turns the glue markers into Korean messages', () => {
    const js = buildProgram('js', AB, '');
    expect(mapRunMessages('js', js, { error: 'Error: __cib_input', stderr: '' })).toEqual({
      error: GLUE_INPUT_MESSAGE,
      stderr: '',
    });
    expect(mapRunMessages('js', js, { error: 'Error: __cib_nosolution', stderr: '' }).error).toBe(
      NO_SOLUTION_MESSAGE,
    );
    expect(mapRunMessages('cpp', cpp, { stderr: '__cib_input\n' }).error).toBe(GLUE_INPUT_MESSAGE);
  });
});

describe('Swift, C# and Ruby glue', () => {
  it('prefixes every top-level name the glue declares with __cib_', () => {
    const names = (glue: GlueId, pattern: RegExp) => {
      const { source } = buildProgram(glue, LINES, '');
      const glueCode = source.slice(source.indexOf('입출력 코드'));
      const found = [...glueCode.matchAll(pattern)].map((m) => (m[1] ?? m[2]) as string);
      expect(found.length).toBeGreaterThan(1);
      return found.filter((n) => n !== 'Main');
    };
    for (const name of names('swift', /^(?:final class|func|let|var) (\w+)/gm))
      expect(name).toMatch(/^__cib_/);
    for (const name of names(
      'csharp',
      /^ {0,4}(?:public )?(?:static|sealed) [^(=;]*?(\w+)\s*[(=;,:{]/gm,
    ))
      expect(name).toMatch(/^__cib_/);
    for (const name of names('ruby', /^(?:def (\w+)|\$(\w+))/gm)) expect(name).toMatch(/^__cib_/);
  });

  it('writes typed signatures from the format', () => {
    expect(starterCode('swift', AB)).toContain('func solution(_ a: Int, _ b: Int) -> Int {');
    expect(starterCode('swift', GRID)).toContain(
      'func solution(_ n: Int, _ m: Int, _ board: [String]) -> Bool {',
    );
    expect(starterCode('csharp', LINES)).toContain(
      'public double solution(string title, long[] nums, int k, int[][] rows) {',
    );
    expect(starterCode('ruby', AB)).toContain('def solution(a, b)\n  answer = 0\n');
    expect(solutionFileName('csharp')).toBe('Solution.cs');
  });

  it('keeps words from the format inside string literals', () => {
    const format = f({
      v: 1,
      params: [{ name: 'n', type: 'int' }],
      lines: [['n']],
      cases: null,
      ret: { type: 'bool', yes: 'a"b\\#{x}\'', no: 'no' },
    });
    expect(buildProgram('swift', format, '').source).toContain('"a\\"b\\\\#{x}\'"');
    expect(buildProgram('csharp', format, '').source).toContain('"a\\"b\\\\#{x}\'"');
    expect(buildProgram('ruby', format, '').source).toContain("'a\"b\\\\#{x}\\''");
  });
});
