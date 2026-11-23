/**
 * Compiling a Java solution with the bundled teavm-javac (javac + TeaVM, Wasm GC).
 * Kept free of worker code so it also runs under Node in tests.
 */
import { formatDiagnostics, MAIN_CLASS, prepareSources } from './preprocess';
import type { CompilerExports, JavaCompiler, JavaDiagnostic, TeaVMRuntime } from './teavm';

export type JavaCompileResult = { wasm: Uint8Array<ArrayBuffer> } | { compileError: string };

export interface JavaToolchain {
  compile(code: string): Promise<JavaCompileResult>;
}

export interface ToolchainFiles {
  runtime: TeaVMRuntime;
  compilerWasm: string | Uint8Array;
  sdk: Int8Array;
  classlib: Int8Array;
  /** Source of the synchronous Thread stand-in (Thread.java). */
  threadShim: string;
  /**
   * A new Compiler for every compile. Reusing one keeps TeaVM's caches (compiles take about
   * 0.2 s instead of 0.8 s) but crashed for some program sequences under Node (ADR-0004).
   */
  freshPerCompile?: boolean;
}

export async function createJavaToolchain(files: ToolchainFiles): Promise<JavaToolchain> {
  const module = await files.runtime.load(files.compilerWasm);
  const exports = module.exports as unknown as CompilerExports;
  let diagnostics: JavaDiagnostic[] = [];
  let compiler: JavaCompiler | undefined;

  const newCompiler = () => {
    const c = exports.createCompiler();
    c.setSdk(files.sdk);
    c.setTeaVMClasslib(files.classlib);
    c.onDiagnostic((d) => {
      // Copy out of the Wasm objects before they can be collected.
      diagnostics.push({
        severity: String(d.severity),
        type: String(d.type),
        fileName: d.fileName == null ? null : String(d.fileName),
        lineNumber: Number(d.lineNumber),
        message: String(d.message),
      });
    });
    return c;
  };

  return {
    async compile(code) {
      const prepared = prepareSources(code, files.threadShim);
      if ('compileError' in prepared) return prepared;
      if (!compiler || files.freshPerCompile) compiler = newCompiler();
      const c = compiler;
      diagnostics = [];
      c.clearSourceFiles();
      c.clearInputClassFiles();
      c.clearOutputFiles();
      for (const [path, content] of Object.entries(prepared.files)) c.addSourceFile(path, content);
      if (!c.compile()) return { compileError: formatDiagnostics(diagnostics) };
      // strictMode: array bounds, null and division checks throw Java exceptions.
      const ok = await c.generateWebAssembly({
        outputName: 'app',
        mainClass: MAIN_CLASS,
        strictMode: true,
      });
      if (!ok) return { compileError: formatDiagnostics(diagnostics) };
      const bytes = c.getWebAssemblyOutputFile('app.wasm');
      return { wasm: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice() };
    },
  };
}
