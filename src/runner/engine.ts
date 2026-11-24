/**
 * Contract between the sandbox page and the per-language engines (M2, ADR-0004).
 *
 * The sandbox owns the time limit: an engine reports `onRunStart` when the user's program
 * itself starts (after loading a runtime or compiling), and the sandbox times only the run
 * from there. To stop a program the sandbox calls `terminate()`, which must end any worker
 * and leave the engine unusable; the sandbox then creates a fresh one.
 */
import type { JsRunResult } from './js/execute';

/**
 * How an engine family builds one language (ADR-0007). Several Baekjoon languages share an
 * engine (`EngineId`); the compiler mode and standard come from the language.
 * - `clang`: C or C++ with a `-std` value (C99, C11, C++14, C++17, C++20)
 * - `typescript`: strip the types, then run on the JavaScript engine
 */
export type BuildOptions =
  { kind: 'clang'; lang: 'c' | 'c++'; std: string } | { kind: 'typescript' };

export interface EngineInput {
  code: string;
  stdin: string;
  /**
   * URL of the extension's bundled runtimes, ending in `/` (e.g. `chrome-extension://id/runtime/`).
   * Engines load `pyodide/`, `clang/`, `wasi/` and `teavm/` from here; nothing is fetched remotely.
   */
  runtimeBase: string;
  /** The language's build settings; without them an engine uses its first language (C++17, JS). */
  build?: BuildOptions;
}

export interface EngineResult extends JsRunResult {
  /** Compiler output when the program did not compile (C, C++, Java, TypeScript). */
  compileError?: string;
}

export interface Engine {
  run(input: EngineInput, hooks: { onRunStart(): void }): Promise<EngineResult>;
  terminate(): void;
}

export type EngineFactory = () => Engine;

/** Upper bound for loading a runtime or compiling, before the run's own time limit starts. */
export const PREPARE_LIMIT_MS = 60_000;
