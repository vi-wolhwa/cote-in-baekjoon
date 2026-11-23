/**
 * Contract between the sandbox page and the per-language engines (M2, ADR-0004).
 *
 * The sandbox owns the time limit: an engine reports `onRunStart` when the user's program
 * itself starts (after loading a runtime or compiling), and the sandbox times only the run
 * from there. To stop a program the sandbox calls `terminate()`, which must end any worker
 * and leave the engine unusable; the sandbox then creates a fresh one.
 */
import type { JsRunResult } from './js/execute';

export interface EngineInput {
  code: string;
  stdin: string;
  /**
   * URL of the extension's bundled runtimes, ending in `/` (e.g. `chrome-extension://id/runtime/`).
   * Engines load `pyodide/`, `clang/` and `wasi/` from here; nothing is fetched remotely.
   */
  runtimeBase: string;
}

export interface EngineResult extends JsRunResult {
  /** Compiler output when the program did not compile (C++). */
  compileError?: string;
}

export interface Engine {
  run(input: EngineInput, hooks: { onRunStart(): void }): Promise<EngineResult>;
  terminate(): void;
}

export type EngineFactory = () => Engine;

/** Upper bound for loading a runtime or compiling, before the run's own time limit starts. */
export const PREPARE_LIMIT_MS = 60_000;
