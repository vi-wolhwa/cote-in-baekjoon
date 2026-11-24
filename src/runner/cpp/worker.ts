/// <reference lib="webworker" />
/**
 * C++ worker: compiles with the bundled clang and runs the program in the same worker.
 * The compiler stays loaded between runs; the engine terminates the whole worker to stop a
 * program. Runtimes are imported from the extension's `runtime/` folder (ADR-0004).
 */
import type { EngineResult } from '../engine';
import { compileCpp, CPP17, type ClangOptions, type RunClang } from './compile';
import { runWasm, type Wasi } from './run-wasm';

export interface CppWorkerRequest {
  code: string;
  stdin: string;
  runtimeBase: string;
  /** C or C++ and the standard (C99 … C++20); C++17 without it. */
  options?: ClangOptions;
}

export type CppWorkerMessage = { type: 'run-start' } | { type: 'result'; result: EngineResult };

interface Toolchain {
  runClang: RunClang;
  wasi: Wasi;
}

let toolchain: Promise<Toolchain> | undefined;
/**
 * The last compiled program, so running the next sample case skips compiling. The key holds
 * the options too: the same code is compiled again as another standard (C++14 → C++20).
 */
let compiled: { key: string; module: WebAssembly.Module } | undefined;

function loadToolchain(runtimeBase: string): Promise<Toolchain> {
  toolchain ??= (async () => {
    const [clang, wasi] = (await Promise.all([
      import(/* @vite-ignore */ `${runtimeBase}clang/bundle.js`),
      import(/* @vite-ignore */ `${runtimeBase}wasi/index.js`),
    ])) as [{ runClang: RunClang }, Wasi];
    // No arguments: only fetch the compiler (~100 MB), without the default progress logging.
    await clang.runClang(undefined, {}, { fetchProgress: () => undefined });
    return { runClang: clang.runClang, wasi };
  })();
  toolchain.catch(() => (toolchain = undefined));
  return toolchain;
}

const post = (message: CppWorkerMessage) => self.postMessage(message);

const failure = (error: string): EngineResult => ({
  stdout: '',
  stderr: '',
  exitCode: 1,
  error,
  outputLimitExceeded: false,
});

async function handle(request: CppWorkerRequest): Promise<EngineResult> {
  const { code, stdin, runtimeBase, options = CPP17 } = request;
  const name = options.lang === 'c' ? 'C' : 'C++';
  let tools: Toolchain;
  try {
    tools = await loadToolchain(runtimeBase);
  } catch (error) {
    return failure(`${name} 컴파일러를 불러오지 못했습니다: ${String(error)}`);
  }
  const key = `${options.lang} ${options.std}\n${code}`;
  if (compiled?.key !== key) {
    compiled = undefined;
    let result;
    try {
      result = await compileCpp(tools.runClang, code, options);
    } catch (error) {
      return failure(`${name} 컴파일러 실행에 실패했습니다: ${String(error)}`);
    }
    if ('compileError' in result) {
      const { compileError } = result;
      return { stdout: '', stderr: '', exitCode: 1, outputLimitExceeded: false, compileError };
    }
    compiled = { key, module: await WebAssembly.compile(result.wasm) };
  }
  return runWasm(tools.wasi, compiled.module, stdin, {
    onStart: () => post({ type: 'run-start' }),
  });
}

self.onmessage = async (event: MessageEvent<CppWorkerRequest>) => {
  post({ type: 'result', result: await handle(event.data) });
};
