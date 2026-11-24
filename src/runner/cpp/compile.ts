/**
 * Compiling a C or C++ solution with the bundled clang (YoWASP, wasm32-wasip1) into a WASI
 * program. The language (C or C++) and its standard come from the IDE language (ADR-0007).
 * Kept free of worker code so it also runs under Node in tests.
 */
import type { Command, Tree } from '@yowasp/clang';
import { STDCXX_H } from './header';

/** `runClang` of @yowasp/clang (its typings only declare the shared `Command` type). */
export type RunClang = Command;

/** Which compiler mode and standard to use, from LanguageInfo.build. */
export interface ClangOptions {
  lang: 'c' | 'c++';
  /** The `-std` value, e.g. `gnu11` or `gnu++20`. */
  std: string;
}

/** C++17, the engine's first language (and the default when no options are given). */
export const CPP17: ClangOptions = { lang: 'c++', std: 'gnu++17' };

/** Source file name; matches the IDE's file tab so diagnostics point at it. */
export const SOURCE_FILE = 'solution.cpp';
export const C_SOURCE_FILE = 'solution.c';
const OUTPUT_FILE = 'solution.wasm';
/** 64 MiB of stack for the program, so deep recursion (DFS) works as on Baekjoon. */
export const STACK_SIZE = 64 * 1024 * 1024;
/** Longer compiler output is cut (template errors can run to megabytes). */
const MAX_DIAGNOSTICS = 20_000;

export const EXCEPTIONS_NOTE =
  '예외(throw/try)는 브라우저 실행에서 지원하지 않습니다. 백준 제출에서는 정상 동작합니다.';

export const sourceFile = (options: ClangOptions) =>
  options.lang === 'c' ? C_SOURCE_FILE : SOURCE_FILE;

/**
 * Close to Baekjoon's `g++ -O2 -std=gnu++17 -DONLINE_JUDGE -DBOJ` and
 * `gcc -O2 -std=gnu11 -DONLINE_JUDGE -DBOJ -lm`. The bundled libc++ has no exception
 * runtime, so C++ exceptions are off (libc++ then aborts where it would throw). The WASI libc
 * already contains the math functions; `-lm` is kept so the command matches Baekjoon's.
 */
export function compileArgs(options: ClangOptions = CPP17): string[] {
  const c = options.lang === 'c';
  return [
    c ? 'clang' : 'clang++',
    `-std=${options.std}`,
    '-O2',
    ...(c ? [] : ['-fno-exceptions']),
    '-DONLINE_JUDGE',
    '-DBOJ',
    ...(c ? [] : ['-I', 'include']),
    `-Wl,-z,stack-size=${STACK_SIZE}`,
    sourceFile(options),
    '-o',
    OUTPUT_FILE,
    ...(c ? ['-lm'] : []),
  ];
}

export type CompileResult = { wasm: Uint8Array<ArrayBuffer> } | { compileError: string };

export async function compileCpp(
  runClang: RunClang,
  code: string,
  options: ClangOptions = CPP17,
): Promise<CompileResult> {
  const decoder = new TextDecoder();
  let log = '';
  const capture = (bytes: Uint8Array | null) => {
    if (bytes) log += decoder.decode(bytes, { stream: true });
  };
  const files: Tree =
    options.lang === 'c'
      ? { [C_SOURCE_FILE]: code }
      : { [SOURCE_FILE]: code, include: { bits: { 'stdc++.h': STDCXX_H } } };
  try {
    const out = await runClang(compileArgs(options), files, {
      stdout: capture,
      stderr: capture,
      decodeASCII: false,
    });
    const wasm = out?.[OUTPUT_FILE];
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
