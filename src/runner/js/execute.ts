/**
 * Runs a user's Node.js-style stdin/stdout program in the current JS realm.
 *
 * Meant to run inside a dedicated Worker in the extension sandbox page, where
 * the host enforces the time limit by terminating the worker. It emulates the
 * parts of Node that Baekjoon solutions use: `fs.readFileSync('/dev/stdin')`,
 * `readline`, `process.stdin` events, `process.stdout.write` and `console`.
 */

export interface JsRunOptions {
  /** Maximum combined stdout+stderr length in characters. */
  outputLimit?: number;
}

export interface JsRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Uncaught error as "Name: message", if the program crashed. */
  error?: string;
  outputLimitExceeded: boolean;
}

const DEFAULT_OUTPUT_LIMIT = 1_000_000;

class ExitSignal {
  constructor(readonly code: number) {}
}
class OutputLimitSignal {
  readonly kind = 'output-limit';
}

type Listener = (...args: unknown[]) => void;

export async function runJs(
  code: string,
  stdin: string,
  options: JsRunOptions = {},
): Promise<JsRunResult> {
  const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
  let stdout = '';
  let stderr = '';
  let written = 0;
  let exitCode = 0;
  let error: string | undefined;
  let outputLimitExceeded = false;
  let halted = false;

  const realSetTimeout = globalThis.setTimeout.bind(globalThis);
  const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const realSetInterval = globalThis.setInterval.bind(globalThis);
  const realClearInterval = globalThis.clearInterval.bind(globalThis);

  const timers = new Map<unknown, 'timeout' | 'interval'>();
  let onIdle: (() => void) | undefined;

  const halt = () => {
    halted = true;
    for (const [id, kind] of timers) {
      if (kind === 'timeout') realClearTimeout(id as ReturnType<typeof setTimeout>);
      else realClearInterval(id as ReturnType<typeof setInterval>);
    }
    timers.clear();
    onIdle?.();
  };

  const handle = (e: unknown) => {
    if (halted) return;
    if (e instanceof ExitSignal) {
      exitCode = e.code;
    } else if (e instanceof OutputLimitSignal) {
      outputLimitExceeded = true;
      exitCode = 1;
    } else {
      error = formatError(e);
      exitCode = 1;
    }
    halt();
  };

  const write = (target: 'out' | 'err', text: string) => {
    if (halted) return;
    written += text.length;
    if (written > outputLimit) throw new OutputLimitSignal();
    if (target === 'out') stdout += text;
    else stderr += text;
  };

  const guard =
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
    (...args: A) => {
      if (halted) return;
      try {
        const r = fn(...args);
        if (isThenable(r)) r.then(undefined, handle);
      } catch (e) {
        handle(e);
      }
    };

  const checkIdle = () => {
    if (timers.size > 0 || !onIdle) return;
    // Let pending microtasks (promise chains) run before deciding we are done.
    realSetTimeout(() => {
      if (timers.size === 0) onIdle?.();
    }, 0);
  };

  const shimSetTimeout = (fn: unknown, ms?: number, ...args: unknown[]) => {
    if (typeof fn !== 'function' || halted) return 0;
    const id: ReturnType<typeof setTimeout> = realSetTimeout(() => {
      timers.delete(id);
      guard(fn as Listener)(...args);
      checkIdle();
    }, ms ?? 0);
    timers.set(id, 'timeout');
    return id;
  };
  const shimSetInterval = (fn: unknown, ms?: number, ...args: unknown[]) => {
    if (typeof fn !== 'function' || halted) return 0;
    const id = realSetInterval(() => guard(fn as Listener)(...args), ms ?? 0);
    timers.set(id, 'interval');
    return id;
  };
  const shimClear = (id: unknown) => {
    const kind = timers.get(id);
    if (!kind) return;
    timers.delete(id);
    if (kind === 'timeout') realClearTimeout(id as ReturnType<typeof setTimeout>);
    else realClearInterval(id as ReturnType<typeof setInterval>);
    checkIdle();
  };
  const defer = (fn: () => void) => shimSetTimeout(fn, 0);

  const lines = splitLines(stdin);

  const fs = {
    readFileSync(path: unknown, encoding?: unknown) {
      if (path === 0 || path === '/dev/stdin' || path === '/dev/fd/0') {
        return encoding ? stdin : bufferLike(stdin);
      }
      throw Object.assign(new Error(`ENOENT: no such file or directory, open '${String(path)}'`), {
        code: 'ENOENT',
      });
    },
  };

  const readline = {
    createInterface() {
      const listeners: Record<string, Listener[]> = {};
      let closed = false;
      const emit = (event: string, ...args: unknown[]) => {
        for (const fn of listeners[event] ?? []) guard(fn)(...args);
      };
      const rl = {
        on(event: string, fn: Listener) {
          (listeners[event] ??= []).push(fn);
          return rl;
        },
        once(event: string, fn: Listener) {
          const wrapped: Listener = (...args) => {
            listeners[event] = (listeners[event] ?? []).filter((f) => f !== wrapped);
            fn(...args);
          };
          return rl.on(event, wrapped);
        },
        close() {
          if (closed) return;
          closed = true;
          emit('close');
        },
        async *[Symbol.asyncIterator]() {
          for (const line of lines) {
            if (closed) return;
            yield line;
          }
          rl.close();
        },
      };
      defer(() => {
        for (const line of lines) {
          if (closed || halted) return;
          emit('line', line);
        }
        rl.close();
      });
      return rl;
    },
  };

  const stdinListeners: Record<string, Listener[]> = {};
  let stdinStarted = false;
  const startStdin = () => {
    if (stdinStarted) return;
    stdinStarted = true;
    defer(() => {
      for (const fn of stdinListeners['data'] ?? []) guard(fn)(stdin);
      for (const fn of stdinListeners['end'] ?? []) guard(fn)();
    });
  };

  const processShim = {
    argv: ['node', 'main.js'],
    env: {},
    platform: 'linux',
    exitCode: undefined as number | undefined,
    stdin: {
      fd: 0,
      on(event: string, fn: Listener) {
        (stdinListeners[event] ??= []).push(fn);
        if (event === 'data' || event === 'end') startStdin();
        return processShim.stdin;
      },
      setEncoding() {
        return processShim.stdin;
      },
      resume() {
        return processShim.stdin;
      },
    },
    stdout: {
      write(chunk: unknown) {
        write('out', String(chunk));
        return true;
      },
    },
    stderr: {
      write(chunk: unknown) {
        write('err', String(chunk));
        return true;
      },
    },
    exit(code?: number) {
      throw new ExitSignal(code ?? processShim.exitCode ?? 0);
    },
    nextTick(fn: Listener, ...args: unknown[]) {
      queueMicrotask(() => guard(fn)(...args));
    },
  };

  const consoleShim = {
    log: (...args: unknown[]) => write('out', formatArgs(args) + '\n'),
    info: (...args: unknown[]) => write('out', formatArgs(args) + '\n'),
    error: (...args: unknown[]) => write('err', formatArgs(args) + '\n'),
    warn: (...args: unknown[]) => write('err', formatArgs(args) + '\n'),
    debug: (...args: unknown[]) => write('out', formatArgs(args) + '\n'),
  };

  const modules: Record<string, unknown> = {
    fs,
    'node:fs': fs,
    readline,
    'node:readline': readline,
    os: { EOL: '\n' },
    'node:os': { EOL: '\n' },
  };
  const requireShim = (name: string) => {
    if (name in modules) return modules[name];
    throw new Error(`Cannot find module '${name}'`);
  };

  const unhandled = (event: { reason?: unknown; preventDefault?: () => void }) => {
    event.preventDefault?.();
    handle(event.reason);
  };
  const nodeProcess = (globalThis as { process?: NodeLikeProcess }).process;
  const nodeUnhandled = (reason: unknown) => handle(reason);
  const target = globalThis as {
    addEventListener?: AddListener;
    removeEventListener?: AddListener;
  };
  if (typeof target.addEventListener === 'function') {
    target.addEventListener('unhandledrejection', unhandled);
  } else {
    nodeProcess?.on?.('unhandledRejection', nodeUnhandled);
  }

  const module = { exports: {} };
  try {
    const fn = new Function(
      'require',
      'process',
      'console',
      'module',
      'exports',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'setImmediate',
      code,
    ) as (...args: unknown[]) => unknown;
    const result = fn(
      requireShim,
      processShim,
      consoleShim,
      module,
      module.exports,
      shimSetTimeout,
      shimSetInterval,
      shimClear,
      shimClear,
      (cb: unknown, ...args: unknown[]) => shimSetTimeout(cb, 0, ...args),
    );
    if (isThenable(result)) result.then(undefined, handle);
  } catch (e) {
    handle(e);
  }

  if (!halted) {
    await new Promise<void>((resolve) => {
      onIdle = resolve;
      checkIdle();
    });
  }

  if (typeof target.removeEventListener === 'function') {
    target.removeEventListener('unhandledrejection', unhandled);
  } else {
    nodeProcess?.off?.('unhandledRejection', nodeUnhandled);
  }

  if (!error && !outputLimitExceeded && exitCode === 0 && processShim.exitCode) {
    exitCode = processShim.exitCode;
  }
  return { stdout, stderr, exitCode, error, outputLimitExceeded };
}

type AddListener = (type: string, fn: (event: { reason?: unknown }) => void) => void;
interface NodeLikeProcess {
  on?: (event: string, fn: (reason: unknown) => void) => void;
  off?: (event: string, fn: (reason: unknown) => void) => void;
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function'
  );
}

function bufferLike(text: string) {
  return {
    toString: () => text,
    valueOf: () => text,
    [Symbol.toPrimitive]: () => text,
    get length() {
      return text.length;
    },
  };
}

/** Splits input the way Node's readline does: no trailing empty line after a final newline. */
export function splitLines(input: string): string[] {
  if (input === '') return [];
  const parts = input.split(/\r?\n/);
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function formatError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return `Uncaught ${inspect(e)}`;
}

function formatArgs(args: unknown[]): string {
  return args.map((a) => (typeof a === 'string' ? a : inspect(a))).join(' ');
}

/** A small subset of Node's util.inspect, enough for typical debug prints. */
export function inspect(value: unknown, depth = 0): string {
  if (typeof value === 'string') return depth === 0 ? value : `'${value}'`;
  if (typeof value === 'bigint') return `${value}n`;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') return `[Function: ${value.name || '(anonymous)'}]`;
    return String(value);
  }
  if (depth > 2) return Array.isArray(value) ? '[Array]' : '[Object]';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[ ${value.map((v) => inspect(v, depth + 1)).join(', ')} ]`;
  }
  if (value instanceof Map) {
    const items = [...value].map(
      ([k, v]) => `${inspect(k, depth + 1)} => ${inspect(v, depth + 1)}`,
    );
    return `Map(${value.size}) {${items.length ? ` ${items.join(', ')} ` : ''}}`;
  }
  if (value instanceof Set) {
    const items = [...value].map((v) => inspect(v, depth + 1));
    return `Set(${value.size}) {${items.length ? ` ${items.join(', ')} ` : ''}}`;
  }
  const entries = Object.entries(value).map(([k, v]) => `${k}: ${inspect(v, depth + 1)}`);
  return entries.length ? `{ ${entries.join(', ')} }` : '{}';
}
