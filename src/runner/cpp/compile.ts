/**
 * Compiling a C++ solution with the bundled clang (YoWASP, wasm32-wasip1) into a WASI program.
 * Kept free of worker code so it also runs under Node in tests.
 */
import type { Command } from '@yowasp/clang';
import { STDCXX_H } from './header';

/** `runClang` of @yowasp/clang (its typings only declare the shared `Command` type). */
export type RunClang = Command;

/** Source file name; matches the IDE's file tab so diagnostics point at it. */
export const SOURCE_FILE = 'solution.cpp';
const OUTPUT_FILE = 'solution.wasm';
/** 64 MiB of stack for the program, so deep recursion (DFS) works as on Baekjoon. */
export const STACK_SIZE = 64 * 1024 * 1024;
/** Longer compiler output is cut (template errors can run to megabytes). */
const MAX_DIAGNOSTICS = 20_000;

export const EXCEPTIONS_NOTE =
  '예외(throw/try)는 브라우저 실행에서 지원하지 않습니다. 백준 제출에서는 정상 동작합니다.';

/**
 * Close to Baekjoon's `g++ -O2 -std=gnu++17 -DONLINE_JUDGE -DBOJ`. The bundled libc++ has no
 * exception runtime, so exceptions are off (libc++ then aborts where it would throw).
 */
export function compileArgs(): string[] {
  return [
    'clang++',
    '-std=gnu++17',
    '-O2',
    '-fno-exceptions',
    '-DONLINE_JUDGE',
    '-DBOJ',
    '-I',
    'include',
    `-Wl,-z,stack-size=${STACK_SIZE}`,
    SOURCE_FILE,
    '-o',
    OUTPUT_FILE,
  ];
}

export type CompileResult = { wasm: Uint8Array<ArrayBuffer> } | { compileError: string };

export async function compileCpp(runClang: RunClang, code: string): Promise<CompileResult> {
  const decoder = new TextDecoder();
  let log = '';
  const capture = (bytes: Uint8Array | null) => {
    if (bytes) log += decoder.decode(bytes, { stream: true });
  };
  try {
    const files = await runClang(
      compileArgs(),
      { [SOURCE_FILE]: code, include: { bits: { 'stdc++.h': STDCXX_H } } },
      { stdout: capture, stderr: capture, decodeASCII: false },
    );
    const wasm = files?.[OUTPUT_FILE];
    if (wasm instanceof Uint8Array) return { wasm: wasm as Uint8Array<ArrayBuffer> };
    return { compileError: formatCompileError(log) || '컴파일 결과가 없습니다.' };
  } catch (error) {
    // clang/wasm-ld exit with a non-zero status (an `Exit` error) after printing diagnostics.
    if (isExit(error)) return { compileError: formatCompileError(log) || String(error) };
    throw error;
  }
}

function isExit(error: unknown): boolean {
  return error instanceof Error && typeof (error as { code?: unknown }).code === 'number';
}

/**
 * Cleans compiler and linker output for display: drops temporary object paths, keeps
 * `solution.cpp:LINE:COL: error: ...`, and explains failures specific to the browser.
 */
export function formatCompileError(raw: string): string {
  let text = raw
    .replace(/\r\n/g, '\n')
    // wasm-ld: error: /tmp/solution-1234.o: undefined symbol: f(int)
    .replace(/\/tmp\/[\w.-]+\.o: /g, '')
    .replace(/(^|\s)\.?\/?include\/bits\/stdc\+\+\.h/g, '$1bits/stdc++.h')
    .trim();
  if (text.length > MAX_DIAGNOSTICS) text = `${text.slice(0, MAX_DIAGNOSTICS)}\n…`;
  const notes: string[] = [];
  if (/exceptions disabled|__cxa_throw|__cxa_allocate_exception|__cxa_begin_catch/.test(text)) {
    notes.push(EXCEPTIONS_NOTE);
  }
  if (/undefined symbol: (main|__main_argc_argv)\b/.test(text)) {
    notes.push('main 함수가 없습니다.');
  }
  return notes.length ? `${text}\n\n${notes.join('\n')}` : text;
}
