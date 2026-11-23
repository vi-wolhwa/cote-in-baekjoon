/**
 * Sandbox page (manifest "sandbox"): no extension APIs, opaque origin, network
 * blocked by CSP. Runs each request in a fresh Blob-URL worker and enforces the
 * time limit by terminating it (ADR-0004).
 */
import JsWorker from '@/runner/js/worker?worker&inline';
import type { JsRunResult } from '@/runner/js/execute';
import {
  isCancelRequest,
  isRunRequest,
  type RunRequest,
  type RunResponse,
} from '@/shared/messages';

const MAX_TIME_LIMIT_MS = 10_000;

/** Running programs, so a cancel request can stop them. */
const active = new Map<number, () => void>();

window.addEventListener('message', (event) => {
  // Only the IDE page that embeds this sandbox may talk to it.
  if (event.source !== window.parent) return;
  if (isRunRequest(event.data)) run(event.data);
  else if (isCancelRequest(event.data)) for (const cancel of [...active.values()]) cancel();
});

function run(req: RunRequest) {
  const worker = new JsWorker();
  const started = performance.now();
  let done = false;

  const finish = (status: RunResponse['status'], result?: JsRunResult) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    worker.terminate();
    active.delete(req.id);
    const response: RunResponse = {
      type: 'cib:run-result',
      id: req.id,
      status,
      result,
      elapsedMs: Math.round(performance.now() - started),
    };
    window.parent.postMessage(response, '*');
  };

  const timer = setTimeout(
    () => finish('timeout'),
    Math.min(Math.max(req.timeLimitMs, 100), MAX_TIME_LIMIT_MS),
  );
  active.set(req.id, () => finish('cancelled'));

  worker.onmessage = (event: MessageEvent<JsRunResult>) => {
    const r = event.data;
    finish(r.outputLimitExceeded ? 'output-limit' : r.error ? 'error' : 'ok', r);
  };
  worker.onerror = (event) => {
    finish('error', {
      stdout: '',
      stderr: '',
      exitCode: 1,
      error: event.message || 'Worker error',
      outputLimitExceeded: false,
    });
  };
  worker.postMessage({ code: req.code, stdin: req.stdin });
}
