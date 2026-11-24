/**
 * C99, C11, C++14 and C++20 on the bundled clang (ADR-0007): the compiler mode and standard
 * come from the language, the engine is the same as C++17's. Runs under Node like
 * cpp-run.test.ts (loading the compiler takes a few seconds).
 */
import * as wasi from '@bjorn3/browser_wasi_shim';
import * as clang from '@yowasp/clang';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compileArgs,
  compileCpp,
  CPP17,
  type ClangOptions,
  type RunClang,
} from '@/runner/cpp/compile';
import { runWasm } from '@/runner/cpp/run-wasm';
import type { BuildOptions } from '@/runner/engine';
import { languageInfo, type LanguageId } from '@/shared/languages';
import { buildProgram } from '@/solution/program';
import { checkFormat } from '@/solution/dsl';

const TIMEOUT = 120_000;
const { runClang } = clang as unknown as { runClang: RunClang };

function options(id: LanguageId): ClangOptions {
  const build = languageInfo(id).build as BuildOptions;
  if (build.kind !== 'clang') throw new Error(id);
  return { lang: build.lang, std: build.std };
}

async function run(id: LanguageId, code: string, stdin = '') {
  const result = await compileCpp(runClang, code, options(id));
  if ('compileError' in result) return { compileError: result.compileError };
  return runWasm(wasi, await WebAssembly.compile(result.wasm), stdin);
}

describe('compile arguments per language', () => {
  it('compiles C as C with the math library, like Baekjoon gcc', () => {
    const args = compileArgs(options('c11'));
    expect(args[0]).toBe('clang');
    expect(args).toEqual(
      expect.arrayContaining(['-std=gnu11', '-O2', '-DONLINE_JUDGE', '-DBOJ', 'solution.c', '-lm']),
    );
    expect(args).not.toContain('-fno-exceptions');
    expect(compileArgs(options('c99'))).toContain('-std=gnu99');
  });

  it('compiles each C++ standard with clang++', () => {
    expect(compileArgs(options('cpp14'))).toEqual(
      expect.arrayContaining(['clang++', '-std=gnu++14', 'solution.cpp', '-fno-exceptions']),
    );
    expect(compileArgs(options('cpp20'))).toContain('-std=gnu++20');
    expect(compileArgs(options('cpp17'))).toEqual(compileArgs(CPP17));
    expect(compileArgs()).toEqual(compileArgs(CPP17));
  });
});

describe('C and C++ standards on clang', { timeout: TIMEOUT }, () => {
  beforeAll(async () => {
    await runClang(undefined, {}, { fetchProgress: () => undefined });
  }, TIMEOUT);

  it('runs a C11 program with scanf, math.h and _Static_assert', async () => {
    const code = `#include <stdio.h>
#include <math.h>
#include <stdbool.h>
_Static_assert(sizeof(int) == 4, "int");
int main(void) {
    int n; scanf("%d", &n);
    bool ok = n > 0;
    for (int i = 0; i < n; i++) printf("%d ", i);
    printf("%.3f %d\\n", sqrt((double)n), ok);
    return 0;
}
`;
    expect(await run('c11', code, '4')).toMatchObject({
      stdout: '0 1 2 3 2.000 1\n',
      exitCode: 0,
      error: undefined,
    });
  });

  it('compiles C99 as C, not C++', async () => {
    // `new` is a plain identifier in C and implicit void* conversion is allowed.
    const code = `#include <stdio.h>
#include <stdlib.h>
int main(void) { int *new = malloc(sizeof(int) * 2); new[0] = 7; printf("%d", new[0]); return 0; }
`;
    expect(await run('c99', code)).toMatchObject({ stdout: '7', error: undefined });
    const cpp = await compileCpp(runClang, code);
    expect(cpp).toHaveProperty('compileError');
  });

  it('reports C compile errors at solution.c', async () => {
    const r = await run('c11', 'int main(void) {\n    int x = ;\n}\n');
    expect(r).toEqual({ compileError: expect.stringContaining('solution.c:2:13: error:') });
  });

  it('runs C++20 features only as C++20', async () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> v{3, 1, 2};
    ranges::sort(v);
    span<int> s(v);
    auto cmp = (1 <=> 2) < 0;
    cout << s[0] << s[2] << cmp << '\\n';
}
`;
    expect(await run('cpp20', code)).toMatchObject({ stdout: '131\n', error: undefined });
    expect(await run('cpp17', code)).toHaveProperty('compileError');
  });

  it('compiles bits/stdc++.h and C++14 code as C++14, without C++17 features', async () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
int main() { auto f = [](auto x) { return x * 2; }; cout << f(21) << '\\n'; }
`;
    expect(await run('cpp14', code)).toMatchObject({ stdout: '42\n', error: undefined });
    // Language features like `if constexpr` are only warnings (as with g++); the library is C++14.
    const cxx17 = '#include <bits/stdc++.h>\nint main() { std::optional<int> o = 3; return *o; }';
    expect(await run('cpp14', cxx17)).toHaveProperty('compileError');
    expect(await run('cpp17', cxx17)).toMatchObject({ exitCode: 3 });
  });

  it('compiles the solution-function glue as C++14', async () => {
    const r = checkFormat({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'arr', type: 'long[]', len: 'n' },
      ],
      lines: [['n'], ['arr']],
      cases: { count: 'T' },
      ret: { type: 'long[]', sep: ' ' },
    });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const user =
      'vector<long long> solution(int n, vector<long long> arr) {\n    sort(arr.begin(), arr.end());\n    return arr;\n}\n';
    const program = buildProgram('cpp', r.format, user);
    expect(await run('cpp14', program.source, '2\n3\n3 1 2\n1\n5\n')).toMatchObject({
      stdout: '1 2 3\n5\n',
      error: undefined,
    });
  });
});
