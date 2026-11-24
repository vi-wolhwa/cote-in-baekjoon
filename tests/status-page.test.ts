// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { parsePage, parseRankingPage, parseSourcePage, parseStatusPage } from '@/boj/status-page';
import {
  MIN_GAP_MS,
  handleStatusCaptureQuery,
  handleStatusCaptureResult,
  handleStatusPageRequest,
  handleStatusTabRemoved,
  resetStatusCapture,
} from '@/boj/status-capture';
import {
  STATUS_CAPTURE_TIMEOUT_MS,
  isPageResult,
  isStatusPage,
  isStatusPageRequest,
  pageUrl,
  queryOfUrl,
  sameQuery,
  type StatusPage,
} from '@/shared/status-page';

const html = readFileSync('tests/fixtures/status-page.html', 'utf8');
const shortHtml = readFileSync('tests/fixtures/short-page.html', 'utf8');
const sourceHtml = readFileSync('tests/fixtures/source-page.html', 'utf8');
const doc = (text: string) => new DOMParser().parseFromString(text, 'text/html');

describe('parseStatusPage', () => {
  it('reads every row of the problem, finding language and length by header', () => {
    const page = parseStatusPage(doc(html), { problemId: 1000 });
    expect(page?.rows.map((r) => r.solutionId)).toEqual([7003, 7002, 7001, 7000]);
    expect(page?.rows[0]).toEqual({
      solutionId: 7003,
      username: 'tester',
      resultCode: 'ac',
      resultText: '맞았습니다!!',
      memoryKb: 31120,
      timeMs: 40,
      language: 'Python 3',
      codeLength: 58,
      submittedAt: 1_800_000_300_000,
      sourceOpen: true,
    });
    expect(page?.rows[2]).toMatchObject({ resultCode: 'ce', language: 'node.js', codeLength: 40 });
    expect(page?.rows[2]?.sourceOpen).toBe(false);
    expect(page?.rows[3]?.username).toBe('someone');
    expect(page?.next).toBe(6990);
    expect(isStatusPage(page)).toBe(true);
  });

  it('keeps only the rows of the asked user', () => {
    const page = parseStatusPage(doc(html), { problemId: 1000, userId: 'Tester' });
    expect(page?.rows.map((r) => r.solutionId)).toEqual([7003, 7002, 7001]);
  });

  it('keeps rows of any problem without a filter', () => {
    expect(parseStatusPage(doc(html))?.rows).toHaveLength(5);
  });

  it('reads the old layout without 채점 서버 too', () => {
    const old = html
      .replace('<th>채점 서버</th>', '')
      .replace(/<td class="judge-platform">.*?<\/td>/g, '');
    expect(parseStatusPage(doc(old), { problemId: 1000 })?.rows[0]).toMatchObject({
      language: 'Python 3',
      codeLength: 58,
    });
  });

  it('has no next page on the last one', () => {
    const last = html.replace(/<a [^>]*id="next_page"[^>]*>.*?<\/a>/, '');
    expect(parseStatusPage(doc(last), { problemId: 1000 })?.next).toBeUndefined();
  });

  it('gives undefined without a status table or a language column', () => {
    expect(parseStatusPage(doc('<p>empty</p>'))).toBeUndefined();
    expect(parseStatusPage(doc(html.replace('<th>언어</th>', '<th>lang</th>')))).toBeUndefined();
  });
});

describe('short-coding and source pages', () => {
  it('reads the ranking with ranks, open sources and the next page', () => {
    const page = parseRankingPage(doc(shortHtml), 1);
    expect(page?.rows).toHaveLength(2);
    expect(page?.rows[0]).toEqual({
      solutionId: 8001,
      username: 'alice',
      resultCode: 'ac',
      resultText: '맞았습니다!!',
      memoryKb: 1116,
      timeMs: 0,
      language: 'C++14',
      codeLength: 62,
      submittedAt: 1_700_000_000_000,
      sourceOpen: true,
      rank: 1,
    });
    expect(page?.rows[1]?.sourceOpen).toBe(false);
    // Fewer than 20 rows: the last page, whatever the links say.
    expect(page?.next).toBeUndefined();
    expect(isStatusPage(page)).toBe(true);
  });

  it('reads the code of a source page', () => {
    const source = parseSourcePage(doc(sourceHtml));
    expect(source?.code).toContain('scanf("%d %d", &a, &b);');
    expect(parseSourcePage(doc('<p>login</p>'))).toBeUndefined();
    expect(parsePage(doc(sourceHtml), { kind: 'source', solutionId: 8001 })).toHaveProperty(
      'source',
    );
  });
});

describe('page contract', () => {
  it('builds and reads the URLs of its queries', () => {
    const url = pageUrl({ kind: 'status', problemId: 1000, userId: 'tester', top: 7003 });
    expect(url).toBe('https://acmicpc.net/status?problem_id=1000&user_id=tester&top=7003');
    expect(queryOfUrl(url)).toEqual({
      kind: 'status',
      problemId: 1000,
      userId: 'tester',
      top: 7003,
    });
    expect(queryOfUrl('https://www.acmicpc.net/status?problem_id=1000&language_id=-1')).toEqual({
      kind: 'status',
      problemId: 1000,
    });
    const short = { kind: 'short', problemId: 1000, languageId: 1001, page: 2 } as const;
    expect(pageUrl(short)).toBe('https://acmicpc.net/short/status/1000/1001/2');
    expect(queryOfUrl(pageUrl(short))).toEqual(short);
    expect(pageUrl({ kind: 'short', problemId: 1000 })).toBe(
      'https://acmicpc.net/short/status/1000',
    );
    expect(queryOfUrl('https://acmicpc.net/short/status/1000/3')).toEqual({
      kind: 'short',
      problemId: 1000,
      page: 3,
    });
    const allFirst = queryOfUrl('https://acmicpc.net/short/status/1000/-1/1');
    expect(allFirst && sameQuery(allFirst, { kind: 'short', problemId: 1000 })).toBe(true);
    expect(queryOfUrl('https://acmicpc.net/source/8001')).toEqual({
      kind: 'source',
      solutionId: 8001,
    });
    // Baekjoon sends a logged-out reader of a source to its login page.
    expect(queryOfUrl('https://acmicpc.net/login?next=%2Fsource%2F8001')).toEqual({
      kind: 'source',
      solutionId: 8001,
    });
    expect(queryOfUrl('https://acmicpc.net/status?problem_id=x')).toBeUndefined();
    expect(queryOfUrl('https://example.com/status?problem_id=1000')).toBeUndefined();
  });

  it('checks requests and results', () => {
    const query = { kind: 'status', problemId: 1000, userId: 'tester' };
    expect(isStatusPageRequest({ type: 'cib:status-page-request', query })).toBe(true);
    expect(
      isStatusPageRequest({
        type: 'cib:status-page-request',
        query: { kind: 'status', problemId: 1000, userId: '<b>' },
      }),
    ).toBe(false);
    expect(isPageResult({ ok: false, reason: 'timeout' })).toBe(true);
    expect(isPageResult({ ok: false, reason: 'other' })).toBe(false);
    expect(isPageResult({ ok: true, source: { code: 'x' } })).toBe(true);
    const row = { solutionId: 1, username: 'a', resultCode: 'ac', resultText: 'x', language: 'C' };
    expect(isPageResult({ ok: true, page: { rows: [row] } })).toBe(true);
    expect(isPageResult({ ok: true, page: { rows: Array(21).fill(row) } })).toBe(false);
    expect(isPageResult({ ok: true, page: { rows: [{ ...row, resultCode: 'x' }] } })).toBe(false);
  });
});

describe('status capture (background)', () => {
  type Sender = Browser.runtime.MessageSender;
  const EXT = fakeBrowser.runtime.id;
  const ide: Sender = {
    id: EXT,
    url: `chrome-extension://${EXT}/ide.html`,
    tab: { id: 5, index: 2, windowId: 1 } as Browser.tabs.Tab,
  };
  const page: StatusPage = { rows: [], next: 9 };
  const statusSender = (tabId: number, url: string): Sender => ({
    id: EXT,
    url,
    tab: { id: tabId, index: 3, windowId: 1 } as Browser.tabs.Tab,
  });
  const request = (userId?: string) =>
    ({
      type: 'cib:status-page-request',
      query: { kind: 'status', problemId: 1000, ...(userId ? { userId } : {}) },
    }) as const;

  let created: { url?: string; active?: boolean; index?: number }[];
  let removed: number[];

  beforeEach(() => {
    vi.useFakeTimers();
    resetStatusCapture();
    created = [];
    removed = [];
    let nextId = 100;
    vi.spyOn(fakeBrowser.tabs, 'create').mockImplementation(async (props) => {
      created.push(props);
      return { id: nextId++ } as Browser.tabs.Tab;
    });
    vi.spyOn(fakeBrowser.tabs, 'remove').mockImplementation(async (id) => {
      removed.push(...[id].flat());
    });
  });

  const flush = () => vi.advanceTimersByTimeAsync(0);

  it('opens the page in an inactive tab next to the IDE and answers with what it read', async () => {
    const answer = handleStatusPageRequest(request('tester'), ide);
    await flush();
    expect(created).toEqual([
      {
        url: 'https://acmicpc.net/status?problem_id=1000&user_id=tester',
        active: false,
        windowId: 1,
        index: 3,
        openerTabId: 5,
      },
    ]);
    const tab = statusSender(100, 'https://acmicpc.net/status?problem_id=1000&user_id=tester');
    // Another tab, or the same tab on another page, is not the one.
    expect(await handleStatusCaptureQuery(statusSender(7, tab.url as string))).toEqual({
      capture: false,
    });
    expect(
      await handleStatusCaptureQuery(statusSender(100, 'https://acmicpc.net/status?problem_id=1')),
    ).toEqual({ capture: false });
    expect(await handleStatusCaptureQuery(tab)).toEqual({ capture: true });
    await handleStatusCaptureResult({ type: 'cib:status-capture-result', page }, tab);
    expect(await answer).toEqual({ ok: true, page });
    expect(removed).toEqual([100]);
  });

  it('turns down pages that are not the extension', async () => {
    const result = await handleStatusPageRequest(
      request(),
      statusSender(3, 'https://acmicpc.net/problem/1000'),
    );
    expect(result).toEqual({ ok: false, reason: 'denied' });
    expect(created).toEqual([]);
  });

  it('reads one page at a time, a moment apart', async () => {
    const first = handleStatusPageRequest(request('tester'), ide);
    const second = handleStatusPageRequest(request(), ide);
    await flush();
    expect(created).toHaveLength(1);
    const tab = statusSender(100, 'https://acmicpc.net/status?problem_id=1000&user_id=tester');
    await handleStatusCaptureResult({ type: 'cib:status-capture-result' }, tab);
    expect(await first).toEqual({ ok: false, reason: 'layout' });
    await flush();
    expect(created).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(MIN_GAP_MS);
    expect(created).toHaveLength(2);
    handleStatusTabRemoved(101);
    expect(await second).toEqual({ ok: false, reason: 'closed' });
  });

  it('reads a source page, and says when Baekjoon asks to log in', async () => {
    const source = {
      type: 'cib:status-page-request',
      query: { kind: 'source', solutionId: 8001 },
    } as const;
    let answer = handleStatusPageRequest(source, ide);
    await flush();
    expect(created[0]?.url).toBe('https://acmicpc.net/source/8001');
    const tab = statusSender(100, 'https://acmicpc.net/source/8001');
    await handleStatusCaptureResult(
      { type: 'cib:status-capture-result', source: { code: 'x' } },
      tab,
    );
    expect(await answer).toEqual({ ok: true, source: { code: 'x' } });

    await vi.advanceTimersByTimeAsync(MIN_GAP_MS);
    answer = handleStatusPageRequest(source, ide);
    await flush();
    const login = statusSender(101, 'https://acmicpc.net/login?next=%2Fsource%2F8001');
    expect(await handleStatusCaptureQuery(login)).toEqual({ capture: true });
    await handleStatusCaptureResult({ type: 'cib:status-capture-result', login: true }, login);
    expect(await answer).toEqual({ ok: false, reason: 'login' });
  });

  it('gives up a page that does not answer', async () => {
    const answer = handleStatusPageRequest(request(), ide);
    await flush();
    await vi.advanceTimersByTimeAsync(STATUS_CAPTURE_TIMEOUT_MS);
    expect(await answer).toEqual({ ok: false, reason: 'timeout' });
    expect(removed).toEqual([100]);
  });
});
