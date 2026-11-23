/// <reference lib="webworker" />
/**
 * Java compile worker: loads teavm-javac from the extension's `runtime/teavm/` once and keeps
 * it warm. The engine keeps this worker across run timeouts and replaces it when it crashes
 * (ADR-0004).
 */
import { createJavaToolchain, type JavaCompileResult, type JavaToolchain } from './compile';
import { TEAVM_FILES, type TeaVMRuntime } from './teavm';
import THREAD_SHIM from './Thread.java?raw';

export interface JavaCompileRequest {
  id: number;
  code: string;
  runtimeBase: string;
}

/** A compile result, or why the compiler could not run. */
export type CompileOutcome = JavaCompileResult | { failure: string };

export type JavaCompileResponse = CompileOutcome & { id: number };

let toolchain: Promise<JavaToolchain> | undefined;

function loadToolchain(runtimeBase: string): Promise<JavaToolchain> {
  toolchain ??= (async () => {
    const base = `${runtimeBase}teavm/`;
    const archive = (name: string) =>
      fetch(base + name)
        .then((r) => r.arrayBuffer())
        .then((b) => new Int8Array(b));
    const [runtime, sdk, classlib] = await Promise.all([
      import(/* @vite-ignore */ base + TEAVM_FILES.runtime) as Promise<TeaVMRuntime>,
      archive(TEAVM_FILES.sdk),
      archive(TEAVM_FILES.classlib),
    ]);
    return createJavaToolchain({
      runtime,
      compilerWasm: base + TEAVM_FILES.compiler,
      sdk,
      classlib,
      threadShim: THREAD_SHIM,
    });
  })();
  toolchain.catch(() => (toolchain = undefined));
  return toolchain;
}

async function handle({ code, runtimeBase }: JavaCompileRequest): Promise<CompileOutcome> {
  let tools: JavaToolchain;
  try {
    tools = await loadToolchain(runtimeBase);
  } catch (error) {
    return { failure: `Java 컴파일러를 불러오지 못했습니다: ${String(error)}` };
  }
  try {
    return await tools.compile(code);
  } catch (error) {
    return { failure: `Java 컴파일러 실행에 실패했습니다: ${String(error)}` };
  }
}

self.onmessage = async (event: MessageEvent<JavaCompileRequest>) => {
  const response: JavaCompileResponse = { id: event.data.id, ...(await handle(event.data)) };
  const transfer = 'wasm' in response ? [response.wasm.buffer] : [];
  self.postMessage(response, transfer);
};
