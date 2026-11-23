/**
 * Runs a compiled Java solution (TeaVM Wasm GC module): stdin passed to the `__Runner` start
 * class, stdout/stderr captured from TeaVM's console imports, failures turned into readable
 * runtime errors. Kept free of worker code so it also runs under Node in tests.
 */
import { STACK_NOTE } from '../cpp/run-wasm';
import type { EngineResult } from '../engine';
import { UNCAUGHT_PREFIX } from './preprocess';
import type { TeaVMLoad } from './teavm';

const DEFAULT_OUTPUT_LIMIT = 1_000_000;

export interface RunJavaOptions {
  /** Maximum combined stdout+stderr length in characters. */
  outputLimit?: number;
  /** Called right before `main` starts (after the module is instantiated). */
  onStart?: () => void;
}

type Promising = (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => Promise<unknown>;

class OutputLimitSignal extends Error {}

export async function runJava(
  load: TeaVMLoad,
  wasm: Uint8Array,
  stdin: string,
  options: RunJavaOptions = {},
): Promise<EngineResult> {
  const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
  const out = new TextSink();
  const err = new TextSink();
  let written = 0;
  let exceeded = false;
  // TeaVM writes UTF-16 code units one at a time.
  const put = (sink: TextSink) => (code: number) => {
    if (exceeded || ++written > outputLimit) {
      exceeded = true;
      throw new OutputLimitSignal();
    }
    sink.push(code);
  };
  /** The Wasm function behind each exported JS wrapper, to start `main` through JSPI. */
  const wasmFunctions = new Map<unknown, unknown>();
  let exitedWith: number | undefined;
  let failure: unknown;

  try {
    const module = await load(wasm, {
      installImports(imports) {
        imports.teavmConsole.putcharStdout = put(out);
        imports.teavmConsole.putcharStderr = put(err);
        const define = imports.teavmJso.defineFunction;
        imports.teavmJso.defineFunction = (fn, varargs) => {
          const wrapper = define(fn, varargs);
          wasmFunctions.set(wrapper, fn);
          return wrapper;
        };
      },
      onExit(code) {
        exitedWith = code;
      },
    });
    const main = module.exports.main as (args: string[]) => unknown;
    options.onStart?.();
    await startOnOwnStack(main, wasmFunctions.get(main), [stdin]);
  } catch (error) {
    failure = error;
  }

  const stdout = out.text();
  const stderr = err.text();
  const result = (exitCode: number, error?: string): EngineResult => ({
    stdout,
    stderr,
    exitCode,
    error,
    outputLimitExceeded: exceeded,
  });
  if (exceeded) return result(1);
  if (exitedWith !== undefined) {
    return result(
      exitedWith,
      exitedWith === 0 ? undefined : `런타임 에러 (종료 코드 ${exitedWith})`,
    );
  }
  if (failure === undefined) return result(0);
  const uncaught = uncaughtException(stderr);
  if (uncaught) return result(1, uncaught);
  return result(1, describeJavaFailure(failure));
}

/**
 * Runs `main` with JSPI (`WebAssembly.promising`) when available, which gives the program a
 * stack of its own: recursion depth about 15,600 instead of 7,800 in Edge (#63).
 */
async function startOnOwnStack(
  main: (args: string[]) => unknown,
  wasmMain: unknown,
  args: string[],
) {
  const promising = (WebAssembly as { promising?: Promising }).promising;
  if (typeof promising === 'function' && typeof wasmMain === 'function') {
    await promising(wasmMain as (...a: unknown[]) => unknown)(args);
  } else {
    main(args);
  }
}

/** "java.lang.ArithmeticException" from the start class's `Exception in thread "main" …` line. */
export function uncaughtException(stderr: string): string | undefined {
  const line = stderr
    .trimEnd()
    .split('\n')
    .reverse()
    .find((l) => l.startsWith(UNCAUGHT_PREFIX));
  return line?.slice(UNCAUGHT_PREFIX.length).trim() || undefined;
}

/** Failures that end the program outside Java's exception handling (Wasm traps, stack). */
export function describeJavaFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/call stack|too much recursion/i.test(message)) {
    return `java.lang.StackOverflowError: 재귀가 너무 깊어 브라우저의 스택 한도를 넘었습니다.\n${STACK_NOTE}`;
  }
  if (/array is too large|out of memory|allocation failed/i.test(message)) {
    return 'java.lang.OutOfMemoryError: 메모리를 너무 많이 요청했습니다. (배열이 너무 큼)';
  }
  return `런타임 에러 — ${message}`;
}

/** Collects UTF-16 code units and joins them in chunks (spreading huge arrays overflows). */
class TextSink {
  private codes: number[] = [];
  push(code: number) {
    this.codes.push(code);
  }
  text(): string {
    let s = '';
    for (let i = 0; i < this.codes.length; i += 8192) {
      s += String.fromCharCode(...this.codes.slice(i, i + 8192));
    }
    return s;
  }
}
