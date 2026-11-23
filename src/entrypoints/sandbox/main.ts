/**
 * Sandbox page (manifest "sandbox"): no extension APIs, opaque origin, network
 * blocked by CSP. Runs each request in a fresh Blob-URL worker and enforces the
 * time limit by terminating it (ADR-0004).
 */
import JsWorker from '@/runner/js/worker?worker&inline';
import type { JsRunResult } from '@/runner/js/execute';
import { isRunRequest, type RunRequest, type RunResponse } from '@/shared/messages';

const MAX_TIME_LIMIT_MS = 10_000;

window.addEventListener('message', (event) => {
  // Only the IDE page that embeds this sandbox may ask it to run code.
  if (event.source !== window.parent || !isRunRequest(event.data)) return;
  run(event.data);
});

function run(req: RunRequest) {
  const worker = new JsWorker();
  const started = performance.now();
  const reply = (status: RunResponse['status'], result?: JsRunResult) => {
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
    () => {
      worker.terminate();
      reply('timeout');
    },
    Math.min(Math.max(req.timeLimitMs, 100), MAX_TIME_LIMIT_MS),
  );

  worker.onmessage = (event: MessageEvent<JsRunResult>) => {
    clearTimeout(timer);
    worker.terminate();
    const r = event.data;
    reply(r.outputLimitExceeded ? 'output-limit' : r.error ? 'error' : 'ok', r);
  };
  worker.onerror = (event) => {
    clearTimeout(timer);
    worker.terminate();
    reply('error', {
      stdout: '',
      stderr: '',
      exitCode: 1,
      error: event.message || 'Worker error',
      outputLimitExceeded: false,
    });
  };
  worker.postMessage({ code: req.code, stdin: req.stdin });
}
