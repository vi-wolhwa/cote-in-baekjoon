/**
 * Types for the bundled teavm-javac files (`vendor/teavm-javac/`, copied to `runtime/teavm/`).
 * The files ship without typings; these cover only what the Java engine uses (ADR-0004).
 */

/** Imports the runtime passes to a module; `installImports` may replace them. */
export interface TeaVMImports {
  teavmConsole: {
    putcharStdout(code: number): void;
    putcharStderr(code: number): void;
  };
  teavmJso: {
    defineFunction(fn: unknown, varargs: unknown): unknown;
  };
}

export interface TeaVMLoadOptions {
  installImports?(imports: TeaVMImports): void;
  /** Called by `System.exit` (outside Node, where the runtime calls process.exit instead). */
  onExit?(code: number): void;
}

export interface TeaVMModule {
  exports: Record<string, unknown>;
}

/** `load` of `compiler.wasm-runtime.js`: a URL is fetched, bytes are compiled directly. */
export type TeaVMLoad = (
  source: string | Uint8Array | Int8Array,
  options?: TeaVMLoadOptions,
) => Promise<TeaVMModule>;

export interface TeaVMRuntime {
  load: TeaVMLoad;
}

export interface JavaDiagnostic {
  severity: string;
  /** 'javac' or 'teavm'. */
  type: string;
  fileName: string | null;
  lineNumber: number;
  message: string;
}

/** `createCompiler()` of compiler.wasm: OpenJDK javac followed by TeaVM's Wasm GC backend. */
export interface JavaCompiler {
  setSdk(archive: Int8Array): void;
  setTeaVMClasslib(archive: Int8Array): void;
  addSourceFile(path: string, content: string): void;
  clearSourceFiles(): void;
  clearInputClassFiles(): void;
  clearOutputFiles(): void;
  listOutputFiles(): string[];
  getOutputFile(path: string): Int8Array | Uint8Array;
  onDiagnostic(listener: (diagnostic: JavaDiagnostic) => void): unknown;
  /** Runs javac; true when it produced class files. */
  compile(): boolean;
  generateWebAssembly(options: {
    outputName: string;
    mainClass: string;
    strictMode?: boolean;
  }): Promise<boolean>;
  getWebAssemblyOutputFile(path: string): Int8Array | Uint8Array;
}

export interface CompilerExports {
  createCompiler(): JavaCompiler;
}

/** Files under `runtime/teavm/`. */
export const TEAVM_FILES = {
  runtime: 'compiler.wasm-runtime.js',
  compiler: 'compiler.wasm',
  sdk: 'compile-classlib-teavm.bin',
  classlib: 'runtime-classlib-teavm.bin',
} as const;
