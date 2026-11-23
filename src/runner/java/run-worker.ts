/// <reference lib="webworker" />
/**
 * Java run worker: one per run. Runs the compiled solution with TeaVM's runtime from the
 * extension's `runtime/teavm/`; the engine terminates the worker to stop a program (ADR-0004).
 */
import type { EngineResult } from '../engine';
import { runJava } from './run';
import { TEAVM_FILES, type TeaVMRuntime } from './teavm';

export interface JavaRunRequest {
  wasm: Uint8Array;
  stdin: string;
  runtimeBase: string;
  outputLimit?: number;
}

export type JavaRunMessage = { type: 'run-start' } | { type: 'result'; result: EngineResult };

const post = (message: JavaRunMessage) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<JavaRunRequest>) => {
  const { wasm, stdin, runtimeBase, outputLimit } = event.data;
  let result: EngineResult;
  try {
    const { load } = (await import(
      /* @vite-ignore */ `${runtimeBase}teavm/${TEAVM_FILES.runtime}`
    )) as TeaVMRuntime;
    result = await runJava(load, wasm, stdin, {
      outputLimit,
      onStart: () => post({ type: 'run-start' }),
    });
  } catch (error) {
    result = {
      stdout: '',
      stderr: '',
      exitCode: 1,
      error: `Java 실행 환경을 불러오지 못했습니다: ${String(error)}`,
      outputLimitExceeded: false,
    };
  }
  post({ type: 'result', result });
};
