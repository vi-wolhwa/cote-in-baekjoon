/**
 * Python worker (#50). Loaded as raw text and started from a Blob URL as a CLASSIC worker:
 * module workers do not start inside the sandbox page. It cannot import npm modules, so it is
 * plain, self-contained JavaScript. Pyodide itself is imported at runtime from the bundled
 * `runtime/pyodide/` (nothing is fetched remotely).
 *
 * Messages in:  { type: 'init', moduleUrl, indexURL, harness }
 *               { type: 'run', id, code, stdin, outputLimit }
 * Messages out: { type: 'ready', loadMs } | { type: 'init-error', message }
 *               { type: 'result', id, result } | { type: 'fatal', id, message }
 */
'use strict';

let pyodide;
let runHarness;
let stdout = '';
let stderr = '';
let outDecoder = new TextDecoder();
let errDecoder = new TextDecoder();

function capture(fd) {
  return {
    isatty: false,
    write(buffer) {
      if (fd === 1) stdout += outDecoder.decode(buffer, { stream: true });
      else stderr += errDecoder.decode(buffer, { stream: true });
      return buffer.length;
    },
  };
}

function message(error) {
  return error && error.message ? String(error.message) : String(error);
}

async function init(msg) {
  const started = performance.now();
  try {
    const { loadPyodide } = await import(msg.moduleUrl);
    pyodide = await loadPyodide({ indexURL: msg.indexURL });
    pyodide.setStdout(capture(1));
    pyodide.setStderr(capture(2));
    // The harness points fd 0 at a file per run; the terminal stdin is never read.
    pyodide.setStdin({ stdin: () => null });
    pyodide.runPython(msg.harness);
    runHarness = pyodide.globals.get('_cib_run');
    self.postMessage({ type: 'ready', loadMs: Math.round(performance.now() - started) });
  } catch (error) {
    self.postMessage({ type: 'init-error', message: message(error) });
  }
}

function run(msg) {
  stdout = '';
  stderr = '';
  outDecoder = new TextDecoder();
  errDecoder = new TextDecoder();
  let ret;
  try {
    ret = runHarness(msg.code, msg.stdin, msg.outputLimit);
    const [exitCode, error, trace, exceeded] = ret.toJs();
    stdout += outDecoder.decode();
    stderr += errDecoder.decode();
    if (trace) stderr += trace;
    self.postMessage({
      type: 'result',
      id: msg.id,
      result: {
        stdout,
        stderr,
        exitCode,
        error: error ?? undefined,
        outputLimitExceeded: Boolean(exceeded),
      },
    });
  } catch (error) {
    // The interpreter itself failed (e.g. the JS stack overflowed) and is unusable now. Its
    // output is dropped: it ends with Pyodide's crash dump, not the program's output.
    self.postMessage({ type: 'fatal', id: msg.id, message: message(error) });
  } finally {
    ret?.destroy?.();
  }
}

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'init') void init(msg);
  else if (msg.type === 'run') run(msg);
};
