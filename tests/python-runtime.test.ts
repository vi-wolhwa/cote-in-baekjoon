/**
 * Runs the real Python worker (worker.js + harness.py) on Pyodide in Node, with a stand-in
 * for the worker global. Covers the Baekjoon input/output idioms and per-run isolation.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EngineResult } from '@/runner/engine';
import type { WorkerMessage } from '@/runner/python/engine';

const WORKER = readFileSync('src/runner/python/worker.js', 'utf8');
const HARNESS = readFileSync('src/runner/python/harness.py', 'utf8');
const PYODIDE_DIR = path.resolve('node_modules/pyodide') + path.sep;

interface FakeWorkerScope {
  onmessage?: (event: { data: unknown }) => void;
  postMessage(message: WorkerMessage): void;
}

function startWorker() {
  const inbox: WorkerMessage[] = [];
  let wake: (() => void) | undefined;
  const scope: FakeWorkerScope = {
    postMessage(message) {
      inbox.push(message);
      wake?.();
    },
  };
  // Compiled with Node's default loader so the worker's import() of Pyodide works under Vitest.
  const factory = vm.runInThisContext(
    `(function (self) {
${WORKER}
})`,
    {
      importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    },
  ) as (scope: FakeWorkerScope) => void;
  factory(scope);
  const next = async (): Promise<WorkerMessage> => {
    while (inbox.length === 0) await new Promise<void>((resolve) => (wake = resolve));
    return inbox.shift() as WorkerMessage;
  };
  const send = (data: unknown) => scope.onmessage?.({ data });
  return { next, send };
}

let worker: ReturnType<typeof startWorker>;
let nextId = 1;

async function run(code: string, stdin = '', outputLimit = 1_000_000): Promise<EngineResult> {
  const id = nextId++;
  worker.send({ type: 'run', id, code, stdin, outputLimit });
  const msg = await worker.next();
  if (msg.type !== 'result' || msg.id !== id) throw new Error(JSON.stringify(msg));
  return msg.result;
}

beforeAll(async () => {
  worker = startWorker();
  worker.send({
    type: 'init',
    moduleUrl: pathToFileURL(path.join(PYODIDE_DIR, 'pyodide.mjs')).href,
    indexURL: PYODIDE_DIR,
    harness: HARNESS,
  });
  const msg = await worker.next();
  expect(msg).toMatchObject({ type: 'ready' });
}, 60_000);

describe('input idioms', () => {
  const twoLines = '1 2\n3 4\n';

  it.each([
    ['input()', 'a, b = map(int, input().split())\nprint(a + b)', '3\n'],
    [
      'sys.stdin.readline alias',
      'import sys\ninput = sys.stdin.readline\nfor _ in range(2):\n    a, b = map(int, input().split())\n    print(a + b)',
      '3\n7\n',
    ],
    ['sys.stdin.read()', 'import sys\nprint(sum(map(int, sys.stdin.read().split())))', '10\n'],
    [
      'sys.stdin.buffer.read()',
      'import sys\nprint(sum(map(int, sys.stdin.buffer.read().split())))',
      '10\n',
    ],
    ['open(0).read()', 'print(sum(map(int, open(0).read().split())))', '10\n'],
    [
      'for line in sys.stdin',
      'import sys\nfor line in sys.stdin:\n    print(len(line.split()))',
      '2\n2\n',
    ],
    [
      'os.read(0, os.fstat(0).st_size)',
      'import io, os\ninput = io.BytesIO(os.read(0, os.fstat(0).st_size)).readline\nprint(int(input().split()[1]))',
      '2\n',
    ],
  ])('%s', async (_name, code, expected) => {
    const r = await run(code, twoLines);
    expect(r).toMatchObject({ stdout: expected, stderr: '', exitCode: 0, error: undefined });
  });

  it('turns CRLF into LF and reads UTF-8', async () => {
    const r = await run('s = input()\nprint(repr(s), input())', '한글\r\nend\r\n');
    expect(r.stdout).toBe("'한글' end\n");
  });

  it('raises EOFError after the last line', async () => {
    const r = await run('input()\ninput()', 'only\n');
    expect(r.error).toBe('EOFError: EOF when reading a line');
  });

  it('opens fd 0 again in the next run after open(0) closed it', async () => {
    expect((await run('print(open(0).read().strip())', 'x\n')).stdout).toBe('x\n');
    expect((await run('print(open(0).read().strip())', 'y\n')).stdout).toBe('y\n');
  });
});

describe('output', () => {
  it('keeps output exactly, without adding newlines', async () => {
    const r = await run(
      "import sys\nprint(1, end='')\nsys.stdout.write('2')\nprint(3, 4, sep='-', end='')",
    );
    expect(r.stdout).toBe('123-4');
  });

  it('captures stderr separately', async () => {
    const r = await run("import sys\nprint('out')\nprint('debug', file=sys.stderr)");
    expect(r).toMatchObject({ stdout: 'out\n', stderr: 'debug\n', exitCode: 0 });
  });

  it('stops a program that prints too much, even inside try/except', async () => {
    const code =
      "while True:\n    try:\n        print('x' * 100)\n    except Exception:\n        pass";
    const r = await run(code, '', 10_000);
    expect(r.outputLimitExceeded).toBe(true);
    expect(r.exitCode).toBe(1);
    expect(r.stdout.length).toBeLessThanOrEqual(10_000);
  });
});

describe('errors and exit codes', () => {
  it('reports the exception line and a traceback without harness frames', async () => {
    const r = await run('a = 1\nprint(a / 0)');
    expect(r.error).toBe('ZeroDivisionError: division by zero');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('File "solution.py", line 2');
    expect(r.stderr).toContain('print(a / 0)');
    expect(r.stderr).not.toContain('_cib_run');
    expect(r.stderr).not.toContain('<exec>');
  });

  it('reports syntax errors', async () => {
    const r = await run('print(1\n');
    expect(r.error).toMatch(/^SyntaxError: /);
    expect(r.stderr).toContain('solution.py');
  });

  it('keeps output printed before an exception', async () => {
    const r = await run("print('before')\nraise ValueError('bad')");
    expect(r).toMatchObject({ stdout: 'before\n', error: 'ValueError: bad', exitCode: 1 });
  });

  it.each([
    ['sys.exit(3)', 'import sys\nprint(1)\nsys.exit(3)', 3, ''],
    ['sys.exit()', 'import sys\nsys.exit()', 0, ''],
    ['exit(0)', 'exit(0)', 0, ''],
    ['sys.exit(message)', "import sys\nsys.exit('bye')", 1, 'bye\n'],
  ])('%s sets the exit code without an error', async (_name, code, exitCode, stderr) => {
    const r = await run(code);
    expect(r).toMatchObject({ exitCode, error: undefined, stderr });
  });
});

describe('isolation between runs', () => {
  it('does not keep globals, builtins, or the recursion limit', async () => {
    await run('import sys, builtins\nleak = 1\nbuiltins.extra = 2\nsys.setrecursionlimit(10**6)');
    const r = await run(
      "import sys\nprint('leak' in globals(), hasattr(__builtins__, 'extra') if isinstance(__builtins__, type(sys)) else 'extra' in __builtins__, sys.getrecursionlimit())",
    );
    expect(r.stdout).toBe('False False 1000\n');
  });

  it('runs as __main__', async () => {
    const r = await run("if __name__ == '__main__':\n    print('main')");
    expect(r.stdout).toBe('main\n');
  });
});

describe('Baekjoon idioms', () => {
  it('allows deep recursion after sys.setrecursionlimit', async () => {
    const code =
      'import sys\nsys.setrecursionlimit(10**6)\ndef f(n):\n    return 0 if n == 0 else f(n - 1) + 1\nprint(f(5000))';
    expect((await run(code)).stdout).toBe('5000\n');
  });

  it('runs a threading.Thread target (used for a bigger stack)', async () => {
    const code =
      "import threading\nthreading.stack_size(2**27)\ndef main():\n    print('in thread')\nt = threading.Thread(target=main)\nt.start()\nt.join()";
    expect((await run(code)).stdout).toBe('in thread\n');
  });
});
