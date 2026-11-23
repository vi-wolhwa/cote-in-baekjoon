import { describe, expect, it } from 'vitest';
import { compileArgs, EXCEPTIONS_NOTE, formatCompileError, STACK_SIZE } from '@/runner/cpp/compile';
import { STDCXX_H, STDCXX_HEADERS, STDCXX20_HEADERS } from '@/runner/cpp/header';
import { describeRuntimeError, STACK_NOTE } from '@/runner/cpp/run-wasm';

describe('bits/stdc++.h', () => {
  it('includes every header the bundled libc++ builds for wasi', () => {
    for (const name of STDCXX_HEADERS) expect(STDCXX_H).toContain(`#include <${name}>\n`);
    for (const name of ['iostream', 'vector', 'map', 'unordered_map', 'queue', 'bitset']) {
      expect(STDCXX_HEADERS).toContain(name);
    }
  });

  it('leaves out headers that do not compile for wasi', () => {
    expect(STDCXX_H).not.toContain('<csetjmp>');
    expect(STDCXX_H).not.toContain('<csignal>');
  });

  it('includes C++20 headers only when compiling as C++20', () => {
    const cxx20 = STDCXX_H.slice(STDCXX_H.indexOf('#if __cplusplus >= 202002L'));
    for (const name of STDCXX20_HEADERS) expect(cxx20).toContain(`#include <${name}>`);
    expect(STDCXX_H.trimEnd().endsWith('#endif')).toBe(true);
  });
});

describe('compileArgs', () => {
  it('compiles like Baekjoon C++17 with a large stack and no exceptions', () => {
    const args = compileArgs();
    expect(args).toEqual(
      expect.arrayContaining(['-std=gnu++17', '-O2', '-DONLINE_JUDGE', '-fno-exceptions']),
    );
    expect(args).toContain(`-Wl,-z,stack-size=${STACK_SIZE}`);
    expect(STACK_SIZE).toBeGreaterThanOrEqual(64 * 1024 * 1024);
  });
});

describe('formatCompileError', () => {
  it('keeps file:line:col diagnostics', () => {
    const raw =
      'solution.cpp:3:13: error: expected expression\n    3 |     int x = ;\n      |             ^\n1 error generated.\n';
    expect(formatCompileError(raw)).toBe(
      'solution.cpp:3:13: error: expected expression\n    3 |     int x = ;\n      |             ^\n1 error generated.',
    );
  });

  it('drops temporary object paths from linker errors', () => {
    const raw = 'wasm-ld: error: /tmp/solution-517874.o: undefined symbol: f(int)\n';
    expect(formatCompileError(raw)).toBe('wasm-ld: error: undefined symbol: f(int)');
  });

  it('explains that exceptions are not supported', () => {
    const raw = "solution.cpp:3:19: error: cannot use 'throw' with exceptions disabled\n";
    expect(formatCompileError(raw)).toContain(`\n\n${EXCEPTIONS_NOTE}`);
    expect(formatCompileError('wasm-ld: error: /tmp/a.o: undefined symbol: __cxa_throw')).toContain(
      EXCEPTIONS_NOTE,
    );
  });

  it('points out a missing main', () => {
    const raw = 'wasm-ld: error: /tmp/crt1.o: undefined symbol: __main_argc_argv';
    expect(formatCompileError(raw)).toContain('main 함수가 없습니다.');
  });

  it('shows our header as bits/stdc++.h', () => {
    expect(formatCompileError('In file included from include/bits/stdc++.h:3:')).toBe(
      'In file included from bits/stdc++.h:3:',
    );
  });

  it('cuts very long output', () => {
    expect(formatCompileError('x'.repeat(50_000)).length).toBeLessThan(21_000);
  });
});

describe('describeRuntimeError', () => {
  const trap = (message: string) => describeRuntimeError(new WebAssembly.RuntimeError(message));

  it('names common WebAssembly traps', () => {
    expect(trap('memory access out of bounds')).toBe(
      '런타임 에러 (메모리 접근 오류) — memory access out of bounds',
    );
    expect(trap('unreachable')).toContain('런타임 에러 (비정상 종료');
    expect(trap('divide by zero')).toContain('런타임 에러 (0으로 나누기)');
    expect(trap('integer overflow')).toContain('런타임 에러 (정수 오버플로)');
  });

  it('explains the browser recursion limit on stack overflow', () => {
    const message = describeRuntimeError(new RangeError('Maximum call stack size exceeded'));
    expect(message).toBe(
      `런타임 에러 (스택 오버플로) — Maximum call stack size exceeded\n${STACK_NOTE}`,
    );
  });

  it('falls back to the raw message', () => {
    expect(describeRuntimeError('raised signal 6')).toBe('런타임 에러 — raised signal 6');
  });
});
