/**
 * The DSL extension cases (tests/native/ext-cases.ts) on the browser engines: JavaScript,
 * Python, C, C++ and Java (tests/helpers/solution-run-shared.ts runs them). C_EXT is also
 * the native gcc suite's code for these cases.
 */
import { describe, expect, it } from 'vitest';
import { buildProgram } from '@/solution/program';
import type { GlueId } from '@/solution/glue';
import { EXT_CASES } from '../native/ext-cases';
import { run } from './solution-run-shared';

type ExtName = keyof typeof EXT_CASES;

export const C_EXT: Record<ExtName, string> = {
  exprFlow: `long long solution(int n, int arr[], size_t arr_len, int** g, size_t g_rows, size_t g_cols) {
    long long s = 0;
    for (size_t i = 0; i < arr_len; i++) s += arr[i];
    return s * 100 + (long long)g_rows * 10 + (long long)g_cols;
}`,
  blockCount: `char** solution(int n, int k[], size_t k_len, const char* name[], size_t name_len, int** items, size_t items_rows, size_t items_cols[], size_t* ret_len) {
    char** r = (char**)malloc(sizeof(char*) * (name_len + 1));
    for (size_t i = 0; i < name_len; i++) {
        int s = 0;
        for (size_t j = 0; j < items_cols[i]; j++) s += items[i][j];
        r[i] = (char*)malloc(strlen(name[i]) + 16);
        sprintf(r[i], "%s:%d", name[i], s);
    }
    *ret_len = name_len;
    return r;
}`,
  blockUntil: `int* solution(int m[], size_t m_len, int** vals, size_t vals_rows, size_t vals_cols[], int x[], size_t x_len, int y[], size_t y_len, size_t* ret_len) {
    int* r = (int*)malloc(sizeof(int) * (vals_rows + x_len + 1));
    size_t k = 0;
    for (size_t i = 0; i < vals_rows; i++) {
        int b = vals[i][0];
        for (size_t j = 1; j < vals_cols[i]; j++) if (vals[i][j] > b) b = vals[i][j];
        r[k++] = b;
    }
    for (size_t i = 0; i < x_len; i++) r[k++] = x[i] * y[i];
    *ret_len = k;
    return r;
}`,
  endConds: `long long solution(int n, const char* words[], size_t words_len, int p[], size_t p_len) {
    long long s = 0;
    for (size_t i = 0; i < p_len; i++) s += p[i];
    return n + (long long)words_len * 10 + s * 100;
}`,
  rawLines: `char** solution(const char* t, int n, const char* ls[], size_t ls_len, const char* mid[], size_t mid_len, const char* rest[], size_t rest_len, size_t* ret_len) {
    const char** all[] = {&t, ls, mid, rest};
    size_t lens[] = {1, ls_len, mid_len, rest_len}, k = 0;
    char** r = (char**)malloc(sizeof(char*) * (1 + ls_len + mid_len + rest_len));
    for (int a = 0; a < 4; a++) {
        for (size_t i = 0; i < lens[a]; i++) {
            r[k] = (char*)malloc(strlen(all[a][i]) + 3);
            sprintf(r[k++], "[%s]", all[a][i]);
        }
    }
    *ret_len = k;
    return r;
}`,
};

const CODE: Record<ExtName, Partial<Record<GlueId, string>>> = {
  exprFlow: {
    js: 'function solution(n, arr, g) {\n  return arr.reduce((a, b) => a + b, 0) * 100 + g.length * 10 + g[0].length;\n}',
    python: 'def solution(n, arr, g):\n    return sum(arr) * 100 + len(g) * 10 + len(g[0])',
    cpp: 'long long solution(int n, vector<int> arr, vector<vector<int>> g) {\n    long long s = 0;\n    for (int x : arr) s += x;\n    return s * 100 + (long long)g.size() * 10 + (long long)g[0].size();\n}',
    java: 'class Solution {\n    public long solution(int n, int[] arr, int[][] g) {\n        long s = 0;\n        for (int x : arr) s += x;\n        return s * 100 + g.length * 10 + g[0].length;\n    }\n}',
  },
  blockCount: {
    js: "function solution(n, k, name, items) {\n  return name.map((s, i) => s + ':' + items[i].reduce((a, b) => a + b, 0));\n}",
    python:
      "def solution(n, k, name, items):\n    return [s + ':' + str(sum(items[i])) for i, s in enumerate(name)]",
    cpp: 'vector<string> solution(int n, vector<int> k, vector<string> name, vector<vector<int>> items) {\n    vector<string> r;\n    for (size_t i = 0; i < name.size(); i++) {\n        int s = 0;\n        for (int x : items[i]) s += x;\n        r.push_back(name[i] + ":" + to_string(s));\n    }\n    return r;\n}',
    java: 'class Solution {\n    public String[] solution(int n, int[] k, String[] name, int[][] items) {\n        String[] r = new String[name.length];\n        for (int i = 0; i < name.length; i++) {\n            int s = 0;\n            for (int x : items[i]) s += x;\n            r[i] = name[i] + ":" + s;\n        }\n        return r;\n    }\n}',
  },
  blockUntil: {
    js: 'function solution(m, vals, x, y) {\n  return [...vals.map((r) => Math.max(...r)), ...x.map((a, i) => a * y[i])];\n}',
    python:
      'def solution(m, vals, x, y):\n    return [max(r) for r in vals] + [a * b for a, b in zip(x, y)]',
    cpp: 'vector<int> solution(vector<int> m, vector<vector<int>> vals, vector<int> x, vector<int> y) {\n    vector<int> r;\n    for (auto& v : vals) r.push_back(*max_element(v.begin(), v.end()));\n    for (size_t i = 0; i < x.size(); i++) r.push_back(x[i] * y[i]);\n    return r;\n}',
    java: 'class Solution {\n    public int[] solution(int[] m, int[][] vals, int[] x, int[] y) {\n        int[] r = new int[vals.length + x.length];\n        for (int i = 0; i < vals.length; i++) {\n            int b = vals[i][0];\n            for (int v : vals[i]) b = Math.max(b, v);\n            r[i] = b;\n        }\n        for (int i = 0; i < x.length; i++) r[vals.length + i] = x[i] * y[i];\n        return r;\n    }\n}',
  },
  endConds: {
    js: 'function solution(n, words, p) {\n  return n + words.length * 10 + p.reduce((a, b) => a + b, 0) * 100;\n}',
    python: 'def solution(n, words, p):\n    return n + len(words) * 10 + sum(p) * 100',
    cpp: 'long long solution(int n, vector<string> words, vector<int> p) {\n    long long s = 0;\n    for (int x : p) s += x;\n    return n + (long long)words.size() * 10 + s * 100;\n}',
    java: 'class Solution {\n    public long solution(int n, String[] words, int[] p) {\n        long s = 0;\n        for (int x : p) s += x;\n        return n + words.length * 10L + s * 100;\n    }\n}',
  },
  rawLines: {
    js: "function solution(t, n, ls, mid, rest) {\n  return [t, ...ls, ...mid, ...rest].map((s) => '[' + s + ']');\n}",
    python:
      "def solution(t, n, ls, mid, rest):\n    return ['[' + s + ']' for s in [t] + ls + mid + rest]",
    cpp: 'vector<string> solution(string t, int n, vector<string> ls, vector<string> mid, vector<string> rest) {\n    vector<string> r = {"[" + t + "]"};\n    for (auto* v : {&ls, &mid, &rest}) for (auto& s : *v) r.push_back("[" + s + "]");\n    return r;\n}',
    java: 'class Solution {\n    public String[] solution(String t, int n, String[] ls, String[] mid, String[] rest) {\n        List<String> r = new ArrayList<>();\n        r.add("[" + t + "]");\n        for (String[] v : new String[][] {ls, mid, rest}) for (String s : v) r.add("[" + s + "]");\n        return r.toArray(new String[0]);\n    }\n}',
  },
};

/** Each extension case's program runs and prints the expected output on these engines. */
export function runExtCases(glues: readonly GlueId[]): void {
  describe('DSL extension programs run', { timeout: 180_000 }, () => {
    for (const [name, c] of Object.entries(EXT_CASES) as [ExtName, (typeof EXT_CASES)[ExtName]][]) {
      for (const glue of glues) {
        const code = glue === 'c' ? C_EXT[name] : CODE[name][glue];
        if (code === undefined) continue;
        it(`${name}: ${glue}`, async () => {
          const program = buildProgram(glue, c.format, code);
          const r = await run(glue, program.source, c.input);
          expect(r.compileError, program.source).toBeUndefined();
          expect(r.error, program.source).toBeUndefined();
          expect(r.stdout).toBe(c.output);
        });
      }
    }
  });
}
