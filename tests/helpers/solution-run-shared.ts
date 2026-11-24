/**
 * Shared by tests/solution-run-*.test.ts: generated solution-mode programs run with the real
 * engines under Node — JavaScript (runJs), Python (Pyodide worker), C and C++ (bundled clang +
 * WASI) and Java (TeaVM). Each case is the user's `solution` plus the glue, as it would be run
 * and submitted. Split by engine so the test files run in parallel; each engine starts the
 * first time a file uses it.
 */
import * as wasi from '@bjorn3/browser_wasi_shim';
import * as clang from '@yowasp/clang';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { compileCpp, type RunClang } from '@/runner/cpp/compile';
import { runWasm } from '@/runner/cpp/run-wasm';
import type { EngineResult } from '@/runner/engine';
import { createJavaToolchain, type JavaToolchain } from '@/runner/java/compile';
import { runJava } from '@/runner/java/run';
import type { TeaVMRuntime } from '@/runner/java/teavm';
import { runJs } from '@/runner/js/execute';
import type { WorkerMessage } from '@/runner/python/engine';
import { checkFormat, type Format } from '@/solution/dsl';
import { buildProgram } from '@/solution/program';
import type { GlueId } from '@/solution/glue';

const f = (x: unknown): Format => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};

export const AB = f({
  v: 1,
  params: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'int' },
  ],
  lines: [['a', 'b']],
  cases: null,
  ret: { type: 'int' },
});
export const SORT = f({
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

// First line "a b"; then a lines read whole (spaces kept), then b rows of numbers.
const BLOCKS = f({
  v: 1,
  params: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'int' },
    { name: 'names', type: 'line[]' },
    { name: 'rows', type: 'long[][]' },
  ],
  lines: [['a', 'b'], { repeat: 'a', of: 'names' }, { repeat: 'b', of: 'rows' }],
  cases: null,
  ret: { type: 'line[]' },
});
// n + m command lines of different lengths, then a line of doubles.
const COMMANDS = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'm', type: 'int' },
    { name: 'cmds', type: 'string[][]' },
    { name: 'w', type: 'double[]' },
  ],
  lines: [['n', 'm'], { repeat: 'n+m', of: 'cmds' }, ['w']],
  cases: null,
  ret: { type: 'int' },
});
// No input; the output keeps leading spaces.
const NO_INPUT = f({ v: 1, params: [], lines: [], cases: null, ret: { type: 'line[]' } });

// Rows up to an end line ("-1 -1"), then whole lines to the end of input.
const UNTIL_EOF = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'pairs', type: 'int[][]', cols: 2 },
    { name: 'names', type: 'line[]' },
  ],
  lines: [['n'], { until: '-1 -1', of: 'pairs' }, { until: 'EOF', of: 'names' }],
  cases: null,
  ret: { type: 'line[]' },
});
// Numbers up to "0", then lines up to "." where " ." is data, not the end line.
const UNTIL_DOT = f({
  v: 1,
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'texts', type: 'line[]' },
  ],
  lines: [
    { until: '0', of: 'nums' },
    { until: '.', of: 'texts' },
  ],
  cases: null,
  ret: { type: 'int' },
});
// An empty array whose line is missing, then numbers to the end of input.
const EMPTY_THEN_EOF = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'arr', type: 'int[]', len: 'n' },
    { name: 'rest', type: 'long[]' },
  ],
  lines: [['n'], ['arr'], { until: 'EOF', of: 'rest' }],
  cases: null,
  ret: { type: 'long' },
});
// "Case #i: " before each answer; a label line before each case's lines and a blank line after.
const LABEL = f({ ...AB, cases: { until: 'EOF' }, ret: { type: 'int', label: 'Case #{i}: ' } });
const SCENARIO = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'names', type: 'line[]' },
  ],
  lines: [['n'], { repeat: 'n', of: 'names' }],
  cases: { count: 'T' },
  ret: { type: 'line[]', label: 'Scenario #{i}:\n', blank: true },
});

interface Case {
  format: Format;
  input: string;
  output: string;
  code: Partial<Record<GlueId, string>>;
}

export const AB_CODE = {
  js: 'function solution(a, b) {\n  return a + b;\n}',
  python: 'def solution(a, b):\n    return a + b',
  cpp: 'int solution(int a, int b) {\n    return a + b;\n}',
  c: 'int solution(int a, int b) {\n    return a + b;\n}',
  java: 'class Solution {\n    public int solution(int a, int b) {\n        return a + b;\n    }\n}',
};

export const CASES: Record<string, Case> = {
  'sorting an array (lines wrapped differently from the format)': {
    format: SORT,
    input: '3\n5\n1 4\n',
    output: '1\n4\n5\n',
    code: {
      js: 'function solution(n, arr) {\n  return arr.slice().sort((x, y) => x - y);\n}',
      python: 'def solution(n, arr):\n    return sorted(arr)',
      cpp: 'vector<int> solution(int n, vector<int> arr) {\n    sort(arr.begin(), arr.end());\n    return arr;\n}',
      c: 'int cmp(const void* x, const void* y) {\n    int a = *(const int*)x, b = *(const int*)y;\n    return (a > b) - (a < b);\n}\n\nint* solution(int n, int arr[], size_t arr_len, size_t* ret_len) {\n    qsort(arr, arr_len, sizeof(int), cmp);\n    *ret_len = arr_len;\n    return arr;\n}',
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
      c: "bool solution(int n, int m, const char* board[], size_t board_rows) {\n    for (size_t i = 0; i < board_rows; i++) if (strchr(board[i], '#')) return true;\n    return false;\n}",
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
      c: 'double solution(const char* title, long long nums[], size_t nums_len, int k, int** rows, size_t rows_rows, size_t rows_cols[]) {\n    long long s = 0;\n    for (size_t i = 0; i < nums_len; i++) s += nums[i];\n    for (size_t i = 0; i < rows_rows; i++) for (size_t j = 0; j < rows_cols[i]; j++) s += rows[i][j];\n    return (double)s / strlen(title);\n}',
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
      c: 'char* solution(const char* name, long long a, long long b) {\n    char* r = (char*)malloc(strlen(name) + 32);\n    sprintf(r, "%s:%lld", name, a + b);\n    return r;\n}',
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
      c: 'int** solution(int n, int m, int** g, size_t g_rows, size_t g_cols, size_t* ret_rows, size_t** ret_cols) {\n    int** t = (int**)malloc(sizeof(int*) * m);\n    *ret_cols = (size_t*)malloc(sizeof(size_t) * m);\n    for (int j = 0; j < m; j++) {\n        t[j] = (int*)malloc(sizeof(int) * n);\n        (*ret_cols)[j] = n;\n        for (int i = 0; i < n; i++) t[j][i] = g[i][j];\n    }\n    *ret_rows = m;\n    return t;\n}',
      java: 'class Solution {\n    public int[][] solution(int n, int m, int[][] g) {\n        int[][] t = new int[m][n];\n        for (int i = 0; i < n; i++) for (int j = 0; j < m; j++) t[j][i] = g[i][j];\n        return t;\n    }\n}',
    },
  },
  'two blocks repeated by counts from the first line, read as whole lines and rows': {
    format: BLOCKS,
    input: '2 2\nAlice Kim\n  Bob\n1 2\n3 4000000000\n',
    output: 'Bob\nAlice Kim\n3\n4000000003\n',
    code: {
      js: 'function solution(a, b, names, rows) {\n  return [...names.reverse(), ...rows.map((r) => String(BigInt(r[0]) + BigInt(r[1])))];\n}',
      python:
        'def solution(a, b, names, rows):\n    return names[::-1] + [str(sum(r)) for r in rows]',
      cpp: 'vector<string> solution(int a, int b, vector<string> names, vector<vector<long long>> rows) {\n    reverse(names.begin(), names.end());\n    for (auto& r : rows) names.push_back(to_string(r[0] + r[1]));\n    return names;\n}',
      c: 'char** solution(int a, int b, const char* names[], size_t names_len, long long** rows, size_t rows_rows, size_t rows_cols[], size_t* ret_len) {\n    char** out = (char**)malloc(sizeof(char*) * (a + b));\n    for (int i = 0; i < a; i++) out[i] = (char*)names[a - 1 - i];\n    for (int i = 0; i < b; i++) {\n        out[a + i] = (char*)malloc(32);\n        sprintf(out[a + i], "%lld", rows[i][0] + rows[i][1]);\n    }\n    *ret_len = a + b;\n    return out;\n}',
      java: 'class Solution {\n    public String[] solution(int a, int b, String[] names, long[][] rows) {\n        List<String> out = new ArrayList<>();\n        for (int i = names.length - 1; i >= 0; i--) out.add(names[i]);\n        for (long[] r : rows) out.add(String.valueOf(r[0] + r[1]));\n        return out.toArray(new String[0]);\n    }\n}',
    },
  },
  'a sum count, ragged string rows and doubles': {
    format: COMMANDS,
    input: '1 2\npush 3\npop\npush 5\n0.5 1.75\n',
    output: '22\n',
    code: {
      js: "function solution(n, m, cmds, w) {\n  return cmds.filter((c) => c[0] === 'push').length * 10 + Math.trunc(w[0] + w[1]);\n}",
      python:
        "def solution(n, m, cmds, w):\n    return sum(c[0] == 'push' for c in cmds) * 10 + int(sum(w))",
      cpp: 'int solution(int n, int m, vector<vector<string>> cmds, vector<double> w) {\n    int p = 0;\n    for (auto& c : cmds) if (c[0] == "push") p++;\n    return p * 10 + (int)(w[0] + w[1]);\n}',
      c: 'int solution(int n, int m, const char*** cmds, size_t cmds_rows, size_t cmds_cols[], double w[], size_t w_len) {\n    int p = 0;\n    for (size_t i = 0; i < cmds_rows; i++) if (strcmp(cmds[i][0], "push") == 0) p++;\n    return p * 10 + (int)(w[0] + w[1]);\n}',
      java: 'class Solution {\n    public int solution(int n, int m, String[][] cmds, double[] w) {\n        int p = 0;\n        for (String[] c : cmds) if (c[0].equals("push")) p++;\n        return p * 10 + (int) (w[0] + w[1]);\n    }\n}',
    },
  },
  'no input, lines with leading spaces out': {
    format: NO_INPUT,
    input: '',
    output: ' *\n***\n',
    code: {
      js: "function solution() {\n  return [' *', '***'];\n}",
      python: "def solution():\n    return [' *', '***']",
      cpp: 'vector<string> solution() {\n    return {" *", "***"};\n}',
      c: 'char** solution(size_t* ret_len) {\n    char** out = (char**)malloc(sizeof(char*) * 2);\n    out[0] = " *";\n    out[1] = "***";\n    *ret_len = 2;\n    return out;\n}',
      java: 'class Solution {\n    public String[] solution() {\n        return new String[] {" *", "***"};\n    }\n}',
    },
  },
  'rows up to an end line, then lines to the end of input': {
    format: UNTIL_EOF,
    input: '2\n1 2\n3 4\n-1 -1\n  Alice Kim\nBob\n',
    output: '3\n7\nAlice Kim\nBob\n',
    code: {
      js: 'function solution(n, pairs, names) {\n  return [...pairs.map((p) => String(p[0] + p[1])), ...names];\n}',
      python: 'def solution(n, pairs, names):\n    return [str(a + b) for a, b in pairs] + names',
      cpp: 'vector<string> solution(int n, vector<vector<int>> pairs, vector<string> names) {\n    vector<string> out;\n    for (auto& p : pairs) out.push_back(to_string(p[0] + p[1]));\n    for (auto& s : names) out.push_back(s);\n    return out;\n}',
      c: 'char** solution(int n, int** pairs, size_t pairs_rows, size_t pairs_cols, const char* names[], size_t names_len, size_t* ret_len) {\n    char** out = (char**)malloc(sizeof(char*) * (pairs_rows + names_len));\n    size_t k = 0;\n    for (size_t i = 0; i < pairs_rows; i++) {\n        out[k] = (char*)malloc(16);\n        sprintf(out[k++], "%d", pairs[i][0] + pairs[i][1]);\n    }\n    for (size_t i = 0; i < names_len; i++) out[k++] = (char*)names[i];\n    *ret_len = k;\n    return out;\n}',
      java: 'class Solution {\n    public String[] solution(int n, int[][] pairs, String[] names) {\n        List<String> out = new ArrayList<>();\n        for (int[] p : pairs) out.add(String.valueOf(p[0] + p[1]));\n        out.addAll(Arrays.asList(names));\n        return out.toArray(new String[0]);\n    }\n}',
    },
  },
  'numbers up to 0 and lines up to "." with " ." as data': {
    format: UNTIL_DOT,
    input: '5\n7\n0\nhello world\n .\n.\n',
    output: '122\n',
    code: {
      js: 'function solution(nums, texts) {\n  return (nums[0] + nums[1]) * 10 + texts.length;\n}',
      python: 'def solution(nums, texts):\n    return sum(nums) * 10 + len(texts)',
      cpp: 'int solution(vector<int> nums, vector<string> texts) {\n    return (nums[0] + nums[1]) * 10 + (int)texts.size();\n}',
      c: 'int solution(int nums[], size_t nums_len, const char* texts[], size_t texts_len) {\n    return (nums[0] + nums[1]) * 10 + (int)texts_len;\n}',
      java: 'class Solution {\n    public int solution(int[] nums, String[] texts) {\n        return (nums[0] + nums[1]) * 10 + texts.length;\n    }\n}',
    },
  },
  'an empty array line left out, then numbers to the end of input': {
    format: EMPTY_THEN_EOF,
    input: '0\n50\n30\n9000000000\n',
    output: '9000000080\n',
    code: {
      js: 'function solution(n, arr, rest) {\n  return rest.reduce((a, b) => BigInt(a) + BigInt(b), 0n).toString();\n}',
      python: 'def solution(n, arr, rest):\n    return sum(rest)',
      cpp: 'long long solution(int n, vector<int> arr, vector<long long> rest) {\n    long long s = 0;\n    for (auto x : rest) s += x;\n    return s;\n}',
      c: 'long long solution(int n, int arr[], size_t arr_len, long long rest[], size_t rest_len) {\n    long long s = 0;\n    for (size_t i = 0; i < rest_len; i++) s += rest[i];\n    return s;\n}',
      java: 'class Solution {\n    public long solution(int n, int[] arr, long[] rest) {\n        long s = 0;\n        for (long x : rest) s += x;\n        return s;\n    }\n}',
    },
  },
  'a case label on the answer line': {
    format: LABEL,
    input: '1 2\n3 4\n',
    output: 'Case #1: 3\nCase #2: 7\n',
    code: AB_CODE,
  },
  'a case label line, multi-line answers and a blank line after each case': {
    format: SCENARIO,
    input: '2\n1\nAlice Kim\n2\nBob\nCarol\n',
    output: 'Scenario #1:\nAlice Kim\n\nScenario #2:\nBob\nCarol\n\n',
    code: {
      js: 'function solution(n, names) {\n  return names;\n}',
      python: 'def solution(n, names):\n    return names',
      cpp: 'vector<string> solution(int n, vector<string> names) {\n    return names;\n}',
      c: 'char** solution(int n, const char* names[], size_t names_len, size_t* ret_len) {\n    *ret_len = names_len;\n    return (char**)names;\n}',
      java: 'class Solution {\n    public String[] solution(int n, String[] names) {\n        return names;\n    }\n}',
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

let pyId = 1;
let python: Promise<ReturnType<typeof startPythonWorker>> | undefined;
let clangReady: Promise<unknown> | undefined;
let javaTools: Promise<{ runtime: TeaVMRuntime; toolchain: JavaToolchain }> | undefined;

function pythonEngine() {
  python ??= (async () => {
    const worker = startPythonWorker();
    worker.send({
      type: 'init',
      moduleUrl: pathToFileURL(path.join(PYODIDE_DIR, 'pyodide.mjs')).href,
      indexURL: PYODIDE_DIR,
      harness: readFileSync('src/runner/python/harness.py', 'utf8'),
    });
    expect(await worker.next()).toMatchObject({ type: 'ready' });
    return worker;
  })();
  return python;
}

function clangEngine() {
  clangReady ??= Promise.resolve(runClang(undefined, {}, { fetchProgress: () => undefined }));
  return clangReady;
}

function javaEngine() {
  javaTools ??= (async () => {
    const bytes = (name: string) => readFileSync(path.join(VENDOR, name));
    const int8 = (b: Buffer) => new Int8Array(b.buffer, b.byteOffset, b.byteLength);
    const runtime = (await import(
      pathToFileURL(path.join(VENDOR, 'compiler.wasm-runtime.js')).href
    )) as TeaVMRuntime;
    const toolchain = await createJavaToolchain({
      runtime,
      compilerWasm: bytes('compiler.wasm'),
      sdk: int8(bytes('compile-classlib-teavm.bin')),
      classlib: int8(bytes('runtime-classlib-teavm.bin')),
      threadShim: readFileSync('src/runner/java/Thread.java', 'utf8'),
      freshPerCompile: true,
    });
    return { runtime, toolchain };
  })();
  return javaTools;
}

export async function run(glue: GlueId, source: string, stdin: string): Promise<EngineResult> {
  switch (glue) {
    case 'js':
      return runJs(source, stdin);
    case 'python': {
      const worker = await pythonEngine();
      const id = pyId++;
      worker.send({ type: 'run', id, code: source, stdin, outputLimit: 1_000_000 });
      const msg = await worker.next();
      if (msg.type !== 'result') throw new Error(JSON.stringify(msg));
      return msg.result;
    }
    case 'c':
    case 'cpp': {
      // C runs as C99 here, the older of the two C standards (the native tests use C11).
      await clangEngine();
      const options = glue === 'c' ? ({ lang: 'c', std: 'gnu99' } as const) : undefined;
      const compiled = await compileCpp(runClang, source, options);
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
      const { runtime, toolchain } = await javaEngine();
      const compiled = await toolchain.compile(source);
      if ('compileError' in compiled)
        return {
          stdout: '',
          stderr: '',
          exitCode: 1,
          outputLimitExceeded: false,
          compileError: compiled.compileError,
        };
      return runJava(runtime.load, compiled.wasm, stdin);
    }
    default:
      throw new Error(`no engine for ${glue}`);
  }
}

/**
 * Every case's program for these glue languages runs and prints the expected output. `part`
 * runs every other case (0 or 1 of 2) so a slow engine can be split over two test files.
 */
export function runCases(glues: readonly GlueId[], part?: { index: number; of: number }): void {
  describe('solution programs run', { timeout: 180_000 }, () => {
    for (const [k, [name, c]] of Object.entries(CASES).entries()) {
      if (part && k % part.of !== part.index) continue;
      for (const [glue, code] of Object.entries(c.code) as [GlueId, string][]) {
        if (!glues.includes(glue)) continue;
        it(`${name}: ${glue}`, async () => {
          const program = buildProgram(glue, c.format, code);
          const r = await run(glue, program.source, c.input);
          expect(r.compileError).toBeUndefined();
          expect(r.error).toBeUndefined();
          expect(r.stdout).toBe(c.output);
        });
      }
    }
  });
}
