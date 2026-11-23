/**
 * Runs a compiled WASI program (C++ solution) with browser_wasi_shim: stdin from the sample
 * input, stdout/stderr captured, traps turned into readable runtime errors.
 * Kept free of worker code so it also runs under Node in tests.
 */
import type * as WasiShim from '@bjorn3/browser_wasi_shim';
import type { EngineResult } from '../engine';

export type Wasi = typeof WasiShim;

const DEFAULT_OUTPUT_LIMIT = 1_000_000;

class OutputLimitSignal extends Error {}

export interface RunWasmOptions {
  /** Maximum combined stdout+stderr length in characters. */
  outputLimit?: number;
  /** Called right before the program starts (after instantiation). */
  onStart?: () => void;
}

export async function runWasm(
  wasi: Wasi,
  module: WebAssembly.Module,
  stdin: string,
  options: RunWasmOptions = {},
): Promise<EngineResult> {
  const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
  const out = { text: '', decoder: new TextDecoder() };
  const err = { text: '', decoder: new TextDecoder() };
  let written = 0;
  const sink = (target: typeof out) => (bytes: Uint8Array) => {
    const text = target.decoder.decode(bytes, { stream: true });
    written += text.length;
    // Throwing out of fd_write unwinds the program.
    if (written > outputLimit) throw new OutputLimitSignal();
    target.text += text;
  };

  const fds = [
    new wasi.OpenFile(new wasi.File(new TextEncoder().encode(stdin))),
    new wasi.ConsoleStdout(sink(out)),
    new wasi.ConsoleStdout(sink(err)),
  ];
  const shim = new wasi.WASI(['solution'], [], fds);

  let exitCode = 0;
  let error: string | undefined;
  let outputLimitExceeded = false;
  try {
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: shim.wasiImport,
    });
    shim.inst = instance as unknown as typeof shim.inst;
    const start = instance.exports._start as () => unknown;
    options.onStart?.();
    await startOnOwnStack(start);
  } catch (e) {
    if (e instanceof wasi.WASIProcExit) exitCode = e.code;
    else if (e instanceof OutputLimitSignal) {
      exitCode = 1;
      outputLimitExceeded = true;
    } else {
      exitCode = 1;
      error = describeRuntimeError(e);
    }
  }
  if (exitCode !== 0 && !error && !outputLimitExceeded) {
    error = `런타임 에러 (종료 코드 ${exitCode})`;
  }
  out.text += out.decoder.decode();
  err.text += err.decoder.decode();
  return { stdout: out.text, stderr: err.text, exitCode, error, outputLimitExceeded };
}

type Promising = (fn: () => unknown) => () => Promise<unknown>;

/**
 * Runs `_start`. With JSPI (`WebAssembly.promising`) the program gets a stack of its own,
 * about 2.5 times deeper than a worker's (measured in Edge: recursion depth 6,000 → 15,000).
 */
async function startOnOwnStack(start: () => unknown): Promise<void> {
  const promising = (WebAssembly as { promising?: Promising }).promising;
  if (typeof promising === 'function') await promising(start)();
  else start();
}

export const STACK_NOTE =
  '브라우저 실행은 재귀 깊이가 약 1만 단계로 제한됩니다. 백준에서는 더 깊은 재귀도 동작할 수 있습니다.';

/** [trap message pattern, reason, note] */
const TRAPS: [RegExp, string, string?][] = [
  [/out of bounds/i, '메모리 접근 오류'],
  [/unreachable/i, '비정상 종료: abort, assert 실패 등'],
  [/divide by zero|remainder by zero/i, '0으로 나누기'],
  [/integer overflow/i, '정수 오버플로'],
  [/call stack|too much recursion/i, '스택 오버플로', STACK_NOTE],
  [/indirect call|signature mismatch|null function/i, '잘못된 함수 호출'],
  [/memory/i, '메모리 부족'],
];

/** Turns a WebAssembly trap (or other failure) into a message like "런타임 에러 (메모리 접근 오류)". */
export function describeRuntimeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const trap = TRAPS.find(([pattern]) => pattern.test(message));
  if (!trap) return `런타임 에러 — ${message}`;
  const [, reason, note] = trap;
  return `런타임 에러 (${reason}) — ${message}${note ? `\n${note}` : ''}`;
}
