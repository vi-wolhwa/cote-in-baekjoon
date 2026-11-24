// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  MIN_INTERVAL_MS,
  createHistoryGate,
  fetchBojHistory,
  parseHistoryRows,
  type HistoryFetcher,
} from '@/boj/status-history';
import {
  isBojHistoryAnswer,
  isBojHistoryRequest,
  isBojHistoryResult,
  sourceUrl,
} from '@/shared/boj-history';
import { absoluteTime, metricsText, relativeTime, resultTone } from '@/ide/history/format';

const html = readFileSync('tests/fixtures/status-history.html', 'utf8');
const problemHtml = readFileSync('tests/fixtures/problem-sample.html', 'utf8');
const parse = (text: string) => new DOMParser().parseFromString(text, 'text/html');

const ok =
  (body: string): HistoryFetcher =>
  async () => ({ ok: true, text: async () => body });

describe('parseHistoryRows', () => {
  it("reads the user's rows of the problem only", () => {
    const rows = parseHistoryRows(parse(html), 1000, 'tester');
    expect(rows.map((r) => r.solutionId)).toEqual([7003, 7002, 7001]);
    expect(rows[0]).toEqual({
      solutionId: 7003,
      resultCode: 'ac',
      resultText: '맞았습니다!!',
      memoryKb: 31120,
      timeMs: 40,
      language: 'Python 3',
      codeLength: 58,
      submittedAt: 1_800_000_300_000,
    });
    // " / 수정" after the language name is left out; empty memory and time stay unset.
    expect(rows[1]).toMatchObject({ language: 'C++17', codeLength: 213 });
    expect(rows[1]).not.toHaveProperty('memoryKb');
    expect(rows[2]).toMatchObject({
      resultCode: 'ce',
      resultText: '컴파일 에러',
      language: 'node.js',
    });
  });

  it('matches the id without case and keeps to one page', () => {
    expect(parseHistoryRows(parse(html), 1000, 'TESTER')).toHaveLength(3);
    const many = html.replace(
      '<tbody>',
      `<tbody>${Array.from({ length: 30 }, (_, i) =>
        html
          .match(/<tr id="solution-7003">[\s\S]*?<\/tr>/)?.[0]
          .replaceAll('7003', String(8000 + i)),
      ).join('')}`,
    );
    expect(parseHistoryRows(parse(many), 1000, 'tester')).toHaveLength(20);
  });

  it('caps text taken from the page', () => {
    const long = html.replace('>Python 3<', `>${'P'.repeat(100)}<`);
    expect(parseHistoryRows(parse(long), 1000, 'tester')[0]?.language).toHaveLength(40);
  });
});

describe('fetchBojHistory', () => {
  it("asks for one page of the logged-in user's status list of the problem", async () => {
    const fetcher = vi.fn(ok(html));
    const result = await fetchBojHistory(parse(problemHtml), 1000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/status?problem_id=1000&user_id=tester');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' });
    expect(result).toMatchObject({ ok: true, handle: 'tester' });
    expect(isBojHistoryResult(result)).toBe(true);
  });

  it('sends nothing when the problem page shows no logged-in user', async () => {
    const fetcher = vi.fn(ok(html));
    const loggedOut = problemHtml.replace(/<ul class="loginbar">[\s\S]*?<\/ul>/, '');
    expect(await fetchBojHistory(parse(loggedOut), 1000, fetcher)).toEqual({
      ok: false,
      reason: 'login',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports a logged-out answer, a changed page and network errors', async () => {
    const doc = parse(problemHtml);
    const noUser = html.replace(/<ul class="loginbar">[\s\S]*?<\/ul>/, '');
    expect(await fetchBojHistory(doc, 1000, ok(noUser))).toEqual({ ok: false, reason: 'login' });
    expect(await fetchBojHistory(doc, 1000, ok('<p>점검 중</p>'))).toEqual({
      ok: false,
      reason: 'layout',
    });
    const failed: HistoryFetcher = async () => ({ ok: false, text: async () => '' });
    expect(await fetchBojHistory(doc, 1000, failed)).toEqual({ ok: false, reason: 'network' });
    const thrown: HistoryFetcher = () => Promise.reject(new Error('offline'));
    expect(await fetchBojHistory(doc, 1000, thrown)).toEqual({ ok: false, reason: 'network' });
  });

  it('never runs scripts from the answer', async () => {
    const evil = html.replace('</body>', '<script>window.__ran = true</script></body>');
    await fetchBojHistory(parse(problemHtml), 1000, ok(evil));
    expect((window as unknown as { __ran?: boolean }).__ran).toBeUndefined();
  });
});

describe('createHistoryGate', () => {
  it('allows one request at a time, a few seconds apart', async () => {
    let now = 0;
    const gate = createHistoryGate(() => now);
    let release: () => void = () => undefined;
    const task = vi.fn(
      () =>
        new Promise<{ ok: true; handle: string; rows: [] }>((resolve) => {
          release = () => resolve({ ok: true, handle: 'tester', rows: [] });
        }),
    );
    const first = gate(task);
    now = 1;
    expect(await gate(task)).toEqual({ ok: false, reason: 'busy' });
    release();
    await first;
    now = MIN_INTERVAL_MS - 1;
    expect(await gate(task)).toEqual({ ok: false, reason: 'busy' });
    now = MIN_INTERVAL_MS + 10;
    const third = gate(task);
    release();
    expect(await third).toMatchObject({ ok: true });
    expect(task).toHaveBeenCalledTimes(2);
  });
});

describe('messages', () => {
  it('checks requests and answers', () => {
    expect(
      isBojHistoryRequest({ type: 'cib:boj-history-request', nonce: crypto.randomUUID() }),
    ).toBe(true);
    expect(isBojHistoryRequest({ type: 'cib:boj-history-request', nonce: '<x>' })).toBe(false);
    const rows = parseHistoryRows(parse(html), 1000, 'tester');
    const answer = {
      type: 'cib:boj-history-result',
      nonce: 'n',
      result: { ok: true, handle: 'tester', rows },
    };
    expect(isBojHistoryAnswer(answer)).toBe(true);
    expect(isBojHistoryResult({ ok: true, handle: 'a b', rows })).toBe(false);
    expect(
      isBojHistoryResult({ ok: true, handle: 'tester', rows: [{ ...rows[0], solutionId: -1 }] }),
    ).toBe(false);
    expect(isBojHistoryResult({ ok: false, reason: 'login' })).toBe(true);
    expect(isBojHistoryResult({ ok: false, reason: 'other' })).toBe(false);
    expect(sourceUrl(7003)).toBe('https://www.acmicpc.net/source/7003');
  });
});

describe('history text', () => {
  it('colours results like the run output', () => {
    expect(resultTone('ac')).toBe('pass');
    expect(resultTone('wa')).toBe('fail');
    expect(resultTone('tle')).toBe('fail');
    expect(resultTone('pac')).toBe('partial');
    expect(resultTone('judging')).toBe('wait');
    expect(resultTone(undefined)).toBe('none');
  });

  it('writes time and memory like the judge result', () => {
    expect(metricsText({ timeMs: 44, memoryKb: 9216 })).toBe('44ms · 9.0MB');
    expect(metricsText({})).toBe('');
  });

  it('writes relative times, then the date', () => {
    const now = new Date(2026, 10, 25, 12, 0).getTime();
    expect(relativeTime(now - 10_000, now)).toBe('방금');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5분 전');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3시간 전');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2일 전');
    expect(relativeTime(new Date(2026, 0, 2, 9, 5).getTime(), now)).toBe('2026-01-02');
    expect(absoluteTime(new Date(2026, 0, 2, 9, 5).getTime())).toBe('2026-01-02 09:05');
  });
});
