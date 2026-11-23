/**
 * Sandbox page (manifest "sandbox"): no extension APIs, opaque origin, network blocked by
 * CSP. Runs each request in the engine for its language and enforces the time limit by
 * terminating the engine (ADR-0004).
 */
import { createCppEngine } from '@/runner/cpp/engine';
import {
  PREPARE_LIMIT_MS,
  type Engine,
  type EngineFactory,
  type EngineResult,
} from '@/runner/engine';
import { createJavaEngine } from '@/runner/java/engine';
import { createJsEngine } from '@/runner/js/engine';
import { createPythonEngine } from '@/runner/python/engine';
import { languageInfo, type EngineId } from '@/shared/languages';
import {
  isCancelRequest,
  isRunRequest,
  type RunRequest,
  type RunResponse,
} from '@/shared/messages';

const MAX_TIME_LIMIT_MS = 10_000;

const FACTORIES: Record<EngineId, EngineFactory> = {
  js: createJsEngine,
  python: createPythonEngine,
  cpp: createCppEngine,
  java: createJavaEngine,
};

/** Engines are kept warm between runs (a loaded Python runtime, a ready compiler). */
const engines = new Map<EngineId, Engine>();
/** Running programs, so a cancel request can stop them. */
const active = new Map<number, () => void>();

window.addEventListener('message', (event) => {
  // Only the IDE page that embeds this sandbox may talk to it.
  if (event.source !== window.parent) return;
  if (isRunRequest(event.data)) void run(event.data);
  else if (isCancelRequest(event.data)) for (const cancel of [...active.values()]) cancel();
});

async function run(req: RunRequest) {
  const engineId = languageInfo(req.language).engine;
  let engine = engines.get(engineId);
  if (!engine) {
    engine = FACTORIES[engineId]();
    engines.set(engineId, engine);
  }
  const started = performance.now();
  let runStartedAt: number | undefined;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = (status: RunResponse['status'], result?: EngineResult) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    active.delete(req.id);
    const response: RunResponse = {
      type: 'cib:run-result',
      id: req.id,
      status,
      result,
      elapsedMs: Math.round(performance.now() - (runStartedAt ?? started)),
    };
    window.parent.postMessage(response, '*');
  };
  /** Stops the program and throws the engine away; the next run gets a fresh one. */
  const kill = (status: RunResponse['status']) => {
    engine?.terminate();
    engines.delete(engineId);
    finish(status);
  };

  active.set(req.id, () => kill('cancelled'));
  // Loading a runtime or compiling has its own, larger budget.
  timer = setTimeout(() => kill('timeout'), PREPARE_LIMIT_MS);
  const limit = Math.min(Math.max(req.timeLimitMs, 100), MAX_TIME_LIMIT_MS);

  try {
    const result = await engine.run(
      { code: req.code, stdin: req.stdin, runtimeBase: req.runtimeBase },
      {
        onRunStart() {
          runStartedAt = performance.now();
          clearTimeout(timer);
          timer = setTimeout(() => kill('timeout'), limit);
        },
      },
    );
    if (result.compileError !== undefined) finish('compile-error', result);
    else {
      finish(result.outputLimitExceeded ? 'output-limit' : result.error ? 'error' : 'ok', result);
    }
  } catch (error) {
    engines.delete(engineId);
    finish('error', {
      stdout: '',
      stderr: '',
      exitCode: 1,
      error: error instanceof Error ? error.message : String(error),
      outputLimitExceeded: false,
    });
  }
}
