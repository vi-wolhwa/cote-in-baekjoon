/**
 * Runs generated solution-mode programs with the real engines under Node: JavaScript
 * (runJs), Python (Pyodide worker), C++ (bundled clang + WASI) and Java (TeaVM). Each case
 * is the user's `solution` plus the glue, as it would be run and submitted.
 */
import * as wasi from '@bjorn3/browser_wasi_shim';
import * as clang from '@yowasp/clang';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCpp, type RunClang } from '@/runner/cpp/compile';
import { runWasm } from '@/runner/cpp/run-wasm';
import type { EngineResult } from '@/runner/engine';
import { createJavaToolchain, type JavaToolchain } from '@/runner/java/compile';
import { runJava } from '@/runner/java/run';
import type { TeaVMRuntime } from '@/runner/java/teavm';
import { runJs } from '@/runner/js/execute';
import type { WorkerMessage } from '@/runner/python/engine';
import { checkFormat, type Format } from '@/solution/dsl';
import {
  buildProgram,
  GLUE_INPUT_MESSAGE,
  mapRunMessages,
  NO_SOLUTION_MESSAGE,
} from '@/solution/program';
import type { EngineId } from '@/shared/languages';

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
const SORT = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'arr', type: 'int[]', len: 'n' },
  ],
  lines: [['n'], ['arr']],
  cases: null,
  ret: { type: 'int[]', sep: '\n' },
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
const EOF_LONG = f({
  v: 1,
  params: [
    { name: 'name', type: 'string' },
    { name: 'a', type: 'long' },
    { name: 'b', type: 'long' },
  ],
  lines: [['name', 'a', 'b']],
  cases: { until: 'EOF' },
  ret: { type: 'string' },
});
const TRANSPOSE = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'm', type: 'int' },
    { name: 'g', type: 'int[][]', cols: 'm' },
  ],
  lines: [['n', 'm'], { repeat: 'n', of: 'g' }],
  cases: null,
  ret: { type: 'int[][]' },
});

interface Case {
  format: Format;
  input: string;
  output: string;
  code: Partial<Record<EngineId, string>>;
}

const CASES: Record<string, Case> = {
  'A+B': {
    format: AB,
    input: '1 2\n',
    output: '3\n',
    code: {
      js: 'function solution(a, b) {\n  return a + b;\n}',
      python: 'def solution(a, b):\n    return a + b',
      cpp: 'int solution(int a, int b) {\n    return a + b;\n}',
      java: 'class Solution {\n    public int solution(int a, int b) {\n        return a + b;\n    }\n}',
    },
  },
  'sorting an array (lines wrapped differently from the format)': {
    format: SORT,
    input: '3\n5\n1 4\n',
    output: '1\n4\n5\n',
    code: {
      js: 'function solution(n, arr) {\n  return arr.slice().sort((x, y) => x - y);\n}',
      python: 'def solution(n, arr):\n    return sorted(arr)',
      cpp: 'vector<int> solution(int n, vector<int> arr) {\n    sort(arr.begin(), arr.end());\n    return arr;\n}',
      java: 'public class Solution {\n    public int[] solution(int n, int[] arr) {\n        Arrays.sort(arr);\n        return arr;\n    }\n}',
    },
  },
  'test cases with character grids': {
    format: GRID,
    input: '2\n2 2\n..\n.#\n1 3\n...\n',
    output: 'YES\nNO\n',
    code: {
      js: "function solution(n, m, board) {\n  return board.some((r) => r.includes('#'));\n}",
      python: "def solution(n, m, board):\n    return any('#' in r for r in board)",
      cpp: "bool solution(int n, int m, vector<string> board) {\n    for (auto& r : board) if (r.find('#') != string::npos) return true;\n    return false;\n}",
      java: "class Solution {\n    public boolean solution(int n, int m, char[][] board) {\n        for (char[] r : board) for (char c : r) if (c == '#') return true;\n        return false;\n    }\n}",
    },
  },
  'lines, rest-of-line arrays, ragged rows and an end line': {
    format: LINES,
    input: 'hello world\n10000000000 2\n2\n1 2 3\n4\n\nab\n1\n0\n0 0\n',
    output: '909090910.18\n0.50\n',
    code: {
      js: 'function solution(title, nums, k, rows) {\n  let s = nums.reduce((x, y) => x + Number(y), 0);\n  for (const r of rows) for (const x of r) s += x;\n  return s / title.length;\n}',
      python:
        'def solution(title, nums, k, rows):\n    return (sum(nums) + sum(map(sum, rows))) / len(title)',
      cpp: 'double solution(string title, vector<long long> nums, int k, vector<vector<int>> rows) {\n    long long s = 0;\n    for (auto x : nums) s += x;\n    for (auto& r : rows) for (int x : r) s += x;\n    return (double)s / title.size();\n}',
      java: 'class Solution {\n    public double solution(String title, long[] nums, int k, int[][] rows) {\n        long s = 0;\n        for (long x : nums) s += x;\n        for (int[] r : rows) for (int x : r) s += x;\n        return (double) s / title.length();\n    }\n}',
    },
  },
  'cases until EOF with long values': {
    format: EOF_LONG,
    input: 'x 9000000000000000000 1\ny -5 5\n',
    output: 'x:9000000000000000001\ny:0\n',
    code: {
      js: "function solution(name, a, b) {\n  return name + ':' + (BigInt(a) + BigInt(b));\n}",
      python: "def solution(name, a, b):\n    return f'{name}:{a + b}'",
      cpp: 'string solution(string name, long long a, long long b) {\n    return name + ":" + to_string(a + b);\n}',
      java: 'class Solution {\n    public String solution(String name, long a, long b) {\n        return name + ":" + (a + b);\n    }\n}',
    },
  },
  'a 2D array in and out': {
    format: TRANSPOSE,
    input: '2 3\n1 2 3\n4 5 6\n',
    output: '1 4\n2 5\n3 6\n',
    code: {
      js: 'function solution(n, m, g) {\n  return Array.from({ length: m }, (_, j) => g.map((r) => r[j]));\n}',
      python: 'def solution(n, m, g):\n    return [list(c) for c in zip(*g)]',
      cpp: 'vector<vector<int>> solution(int n, int m, vector<vector<int>> g) {\n    vector<vector<int>> t(m, vector<int>(n));\n    for (int i = 0; i < n; i++) for (int j = 0; j < m; j++) t[j][i] = g[i][j];\n    return t;\n}',
      java: 'class Solution {\n    public int[][] solution(int n, int m, int[][] g) {\n        int[][] t = new int[m][n];\n        for (int i = 0; i < n; i++) for (int j = 0; j < m; j++) t[j][i] = g[i][j];\n        return t;\n    }\n}',
    },
  },
};

// ---- Engines ----

const PYODIDE_DIR = path.resolve('node_modules/pyodide') + path.sep;
const VENDOR = path.resolve('vendor/teavm-javac');
const { runClang } = clang as unknown as { runClang: RunClang };

function startPythonWorker() {
  const inbox: WorkerMessage[] = [];
  let wake: (() => void) | undefined;
  const scope = {
    onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
    postMessage(message: WorkerMessage) {
      inbox.push(message);
      wake?.();
    },
  };
  const factory = vm.runInThisContext(
    `(function (self) {\n${readFileSync('src/runner/python/worker.js', 'utf8')}\n})`,
    { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER },
  ) as (s: typeof scope) => void;
  factory(scope);
  const next = async () => {
    while (inbox.length === 0) await new Promise<void>((resolve) => (wake = resolve));
    return inbox.shift() as WorkerMessage;
  };
  return { next, send: (data: unknown) => scope.onmessage?.({ data }) };
}

let python: ReturnType<typeof startPythonWorker>;
let pyId = 1;
let javaRuntime: TeaVMRuntime;
let java: JavaToolchain;

async function run(engine: EngineId, source: string, stdin: string): Promise<EngineResult> {
  switch (engine) {
    case 'js':
      return runJs(source, stdin);
    case 'python': {
      const id = pyId++;
      python.send({ type: 'run', id, code: source, stdin, outputLimit: 1_000_000 });
      const msg = await python.next();
      if (msg.type !== 'result') throw new Error(JSON.stringify(msg));
      return msg.result;
    }
    case 'cpp': {
      const compiled = await compileCpp(runClang, source);
      if ('compileError' in compiled)
        return {
          stdout: '',
          stderr: '',
          exitCode: 1,
          outputLimitExceeded: false,
          compileError: compiled.compileError,
        };
      return runWasm(wasi, await WebAssembly.compile(compiled.wasm), stdin);
    }
    case 'java': {
      const compiled = await java.compile(source);
      if ('compileError' in compiled)
        return {
          stdout: '',
          stderr: '',
          exitCode: 1,
          outputLimitExceeded: false,
          compileError: compiled.compileError,
        };
      return runJava(javaRuntime.load, compiled.wasm, stdin);
    }
  }
}

beforeAll(async () => {
  python = startPythonWorker();
  python.send({
    type: 'init',
    moduleUrl: pathToFileURL(path.join(PYODIDE_DIR, 'pyodide.mjs')).href,
    indexURL: PYODIDE_DIR,
    harness: readFileSync('src/runner/python/harness.py', 'utf8'),
  });
  expect(await python.next()).toMatchObject({ type: 'ready' });
  await runClang(undefined, {}, { fetchProgress: () => undefined });
  const bytes = (name: string) => readFileSync(path.join(VENDOR, name));
  const int8 = (b: Buffer) => new Int8Array(b.buffer, b.byteOffset, b.byteLength);
  javaRuntime = (await import(
    pathToFileURL(path.join(VENDOR, 'compiler.wasm-runtime.js')).href
  )) as TeaVMRuntime;
  java = await createJavaToolchain({
    runtime: javaRuntime,
    compilerWasm: bytes('compiler.wasm'),
    sdk: int8(bytes('compile-classlib-teavm.bin')),
    classlib: int8(bytes('runtime-classlib-teavm.bin')),
    threadShim: readFileSync('src/runner/java/Thread.java', 'utf8'),
    freshPerCompile: true,
  });
}, 180_000);

describe('solution programs run on every engine', { timeout: 120_000 }, () => {
  for (const [name, c] of Object.entries(CASES)) {
    for (const [engine, code] of Object.entries(c.code) as [EngineId, string][]) {
      it(`${name}: ${engine}`, async () => {
        const program = buildProgram(engine, c.format, code);
        const r = await run(engine, program.source, c.input);
        expect(r.compileError).toBeUndefined();
        expect(r.error).toBeUndefined();
        expect(r.stdout).toBe(c.output);
      });
    }
  }
});

describe('errors point at the user code', { timeout: 120_000 }, () => {
  it('JavaScript: input that does not match the format', async () => {
    const program = buildProgram('js', AB, CASES['A+B']?.code.js ?? '');
    const r = await run('js', program.source, '1\n');
    expect(mapRunMessages('js', program, { error: r.error, stderr: r.stderr }).error).toBe(
      GLUE_INPUT_MESSAGE,
    );
  });

  it('Python: no solution function, and a traceback line in the user code', async () => {
    const missing = buildProgram('python', AB, 'def solve(a, b):\n    return a + b');
    const r1 = await run('python', missing.source, '1 2\n');
    expect(mapRunMessages('python', missing, { error: r1.error, stderr: r1.stderr }).error).toBe(
      NO_SOLUTION_MESSAGE,
    );

    const broken = buildProgram('python', AB, '# 주석\ndef solution(a, b):\n    return a // 0');
    const r2 = await run('python', broken.source, '1 2\n');
    const mapped = mapRunMessages('python', broken, { error: r2.error, stderr: r2.stderr });
    expect(mapped.stderr).toContain('File "solution.py", line 3, in solution');
    expect(mapped.stderr).toContain('(입출력 코드)');
  });

  it('C++: a compile error is reported at the line the user wrote', async () => {
    const program = buildProgram('cpp', AB, 'int solution(int a, int b) {\n    return a + c;\n}');
    const r = await run('cpp', program.source, '1 2\n');
    const mapped = mapRunMessages('cpp', program, { compileError: r.compileError, stderr: '' });
    expect(mapped.compileError).toMatch(
      /^solution\.cpp:2:\d+: error: use of undeclared identifier 'c'/,
    );
  });

  it('Java: a wrong return type is reported in the glue with a Korean note', async () => {
    const program = buildProgram(
      'java',
      AB,
      'class Solution {\n    public String solution(int a, int b) {\n        return "x";\n    }\n}',
    );
    const r = await run('java', program.source, '1 2\n');
    const mapped = mapRunMessages('java', program, { compileError: r.compileError, stderr: '' });
    expect(mapped.compileError).toContain('Solution.java(입출력 코드)');
    expect(mapped.compileError).toContain('반환 타입');
  });
});
