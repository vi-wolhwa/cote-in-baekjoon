/**
 * Compiles and runs real programs with the bundled clang and WASI shim under Node, the same
 * code path the sandbox worker uses (the whole bits/stdc++.h has to compile and link).
 * Loading the compiler (~100 MB) takes a few seconds.
 */
import * as wasi from '@bjorn3/browser_wasi_shim';
import * as clang from '@yowasp/clang';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCpp, EXCEPTIONS_NOTE, type RunClang } from '@/runner/cpp/compile';
import { runWasm } from '@/runner/cpp/run-wasm';

const TIMEOUT = 120_000;
// The package typings only declare the generic `Command` type for it.
const { runClang } = clang as unknown as { runClang: RunClang };

async function build(code: string): Promise<WebAssembly.Module> {
  const result = await compileCpp(runClang, code);
  if ('compileError' in result) throw new Error(result.compileError);
  return WebAssembly.compile(result.wasm);
}

async function run(code: string, stdin = '', options?: Parameters<typeof runWasm>[3]) {
  return runWasm(wasi, await build(code), stdin, options);
}

describe('C++ engine (clang + WASI)', { timeout: TIMEOUT }, () => {
  // Load the compiler once, without its progress logging (like the worker does).
  beforeAll(async () => {
    await runClang(undefined, {}, { fetchProgress: () => undefined });
  }, TIMEOUT);

  it('runs typical competitive programming code with bits/stdc++.h', async () => {
    const code = `#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n; cin >> n;
    vector<ll> v(n);
    for (auto &x : v) cin >> x;
    sort(v.begin(), v.end());
    map<ll, int> cnt; set<ll> s; unordered_map<ll, ll> um; priority_queue<ll> pq; bitset<64> bs;
    for (ll x : v) { cnt[x]++; s.insert(x); um[x] += x; pq.push(x); bs.set(x % 64); }
    char buf[8]; strcpy(buf, "ok");
    cout << accumulate(v.begin(), v.end(), 0LL) << ' ' << s.size() << ' ' << pq.top() << ' '
         << bs.count() << ' ' << gcd(12, 18) << ' ' << fixed << setprecision(2) << sqrt(2.0)
         << ' ' << buf << '\\n';
}
`;
    const r = await run(code, '4\n3 1 3 1000000000000\n');
    expect(r).toEqual({
      stdout: '1000000000007 3 1000000000000 3 6 1.41 ok\n',
      stderr: '',
      exitCode: 0,
      error: undefined,
      outputLimitExceeded: false,
    });
  });

  it('reads stdin with scanf and writes exact output with printf', async () => {
    const r = await run(
      '#include <cstdio>\nint main() { long long a, b; scanf("%lld %lld", &a, &b); printf("%lld", a + b); }',
      '1 2',
    );
    expect(r.stdout).toBe('3');
  });

  it('runs one compiled program for several inputs', async () => {
    const module = await build(
      '#include <iostream>\nint main() { int a; std::cin >> a; std::cout << a * 2; }',
    );
    let started = 0;
    const onStart = () => started++;
    expect((await runWasm(wasi, module, '21', { onStart })).stdout).toBe('42');
    expect((await runWasm(wasi, module, '5', { onStart })).stdout).toBe('10');
    expect(started).toBe(2);
  });

  it('returns compile errors with line numbers', async () => {
    const result = await compileCpp(
      runClang,
      '#include <iostream>\nint main() {\n    int x = ;\n}\n',
    );
    expect(result).toEqual({ compileError: expect.stringContaining('solution.cpp:3:13: error:') });
  });

  it('explains that exceptions are not supported', async () => {
    const result = await compileCpp(
      runClang,
      '#include <stdexcept>\nint main() { throw std::runtime_error("x"); }\n',
    );
    expect(result).toEqual({ compileError: expect.stringContaining(EXCEPTIONS_NOTE) });
  });

  it('reports exit codes', async () => {
    const r = await run(
      '#include <cstdlib>\n#include <cstdio>\nint main() { printf("hi"); exit(3); }',
    );
    expect(r).toMatchObject({ stdout: 'hi', exitCode: 3, error: '런타임 에러 (종료 코드 3)' });
    expect((await run('int main() { return 0; }')).error).toBeUndefined();
  });

  it('turns traps into runtime errors and keeps stderr', async () => {
    const oob = await run('int main() { volatile int *p = (int *)0x7ffffff0; p[100000000] = 3; }');
    expect(oob.error).toContain('런타임 에러 (메모리 접근 오류)');

    const assertion = await run(
      '#include <cassert>\nint main() { volatile int x = 1; assert(x == 2); }',
    );
    expect(assertion.error).toContain('런타임 에러 (비정상 종료');
    expect(assertion.stderr).toContain('Assertion failed');
  });

  it('stops at the output limit', async () => {
    const r = await run("#include <cstdio>\nint main() { for (;;) putchar('x'); }", '', {
      outputLimit: 10_000,
    });
    expect(r.outputLimitExceeded).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(10_000);
  });

  it('gives deep recursion a large stack', async () => {
    // A 1 MB local array per frame would overflow a default 64 KB WASI stack at once.
    const r = await run(`#include <cstdio>
int f(int n) { volatile char big[1 << 20]; big[0] = n; return n == 0 ? 0 : f(n - 1) + big[0] % 2; }
int main() { printf("%d", f(30)); }`);
    expect(r).toMatchObject({ stdout: '15', error: undefined });
  });
});
