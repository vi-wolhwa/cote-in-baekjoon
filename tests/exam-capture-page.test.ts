// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { askCapture, captureProblem, waitForQuiet } from '@/boj/exam-capture';

const html = readFileSync('tests/fixtures/problem-sample.html', 'utf8');
const URL_1000 = 'https://acmicpc.net/problem/1000';

let send: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeBrowser.reset();
  send = vi.fn(async () => ({ capture: { problemId: 1000 } }));
  Object.assign(fakeBrowser.runtime, { sendMessage: send });
});

describe('capture tab (problem page side)', () => {
  it('asks whether this tab is a capture tab', async () => {
    await expect(askCapture()).resolves.toBe(1000);
    send.mockResolvedValueOnce({ capture: null });
    await expect(askCapture()).resolves.toBeUndefined();
    send.mockResolvedValueOnce({ capture: { problemId: 'x' } });
    await expect(askCapture()).resolves.toBeUndefined();
    send.mockRejectedValueOnce(new Error('no background'));
    await expect(askCapture()).resolves.toBeUndefined();
  });

  it('sends the parsed problem once the page is quiet', async () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    await captureProblem(doc, URL_1000, 1000);
    const message = send.mock.calls.at(-1)?.[0] as { problem: { title: string; samples: unknown } };
    expect(message).toMatchObject({ type: 'cib:capture-result', problemId: 1000 });
    expect(message.problem.title).toBe('테스트용 덧셈');
    expect(message.problem.samples).toEqual([
      { input: '1 2\n', output: '3\n' },
      { input: '10 20\n', output: '30\n' },
    ]);
  });

  it('reports a page without the problem as a parse error', async () => {
    const doc = new DOMParser().parseFromString('<html><body>점검 중</body></html>', 'text/html');
    await captureProblem(doc, URL_1000, 1000);
    expect(send).toHaveBeenLastCalledWith({
      type: 'cib:capture-result',
      problemId: 1000,
      error: 'parse',
    });
  });

  it('waits until changes stop, but not forever', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const started = Date.now();
    const changes = setInterval(() => root.append('x'), 20);
    await waitForQuiet(root, 100, 400);
    clearInterval(changes);
    expect(Date.now() - started).toBeGreaterThanOrEqual(380);
    const quiet = Date.now();
    await waitForQuiet(root, 50, 1000);
    expect(Date.now() - quiet).toBeLessThan(500);
  });
});
