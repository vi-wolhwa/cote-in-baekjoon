import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { StatusRow } from '@/boj/status';
import { submitTabKey } from '@/shared/submit-tab';
import {
  FILL_TTL_MS,
  WATCH_TTL_MS,
  handleJudgeReport,
  handlePendingQuery,
  handleLanguageMissing,
  handleLanguageMissingQuery,
  handleSubmitRequest,
  handleWatchQuery,
} from '@/boj/submission-service';
import {
  isJudgeReportMessage,
  isJudgeResult,
  isPendingQueryMessage,
  isSubmitRequestMessage,
  isSubmitResponse,
  isWatchQueryResponse,
  judgeKey,
  pendingKey,
  requestSubmit,
  watchJudgeResult,
  type JudgeResult,
  type SubmitRequestMessage,
} from '@/shared/submission';

type Sender = Browser.runtime.MessageSender;

const EXT = 'test-extension-id';
const NOW = 1_800_000_000_000;

const ideSender: Sender = {
  id: EXT,
  url: `chrome-extension://${EXT}/ide.html`,
  tab: { id: 7, index: 2, windowId: 1 } as Browser.tabs.Tab,
};
const SUBMIT_TAB = 77;
/** The background tab the background opens for the submit page. */
function mockTab() {
  return vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({
    id: SUBMIT_TAB,
    windowId: 1,
  } as never);
}
const submitSender = (tabId: number, path = '/submit/1000'): Sender => ({
  id: EXT,
  url: `https://www.acmicpc.net${path}`,
  tab: { id: tabId, index: 3 } as Browser.tabs.Tab,
});
const statusSender: Sender = {
  id: EXT,
  url: 'https://www.acmicpc.net/status?from_mine=1&problem_id=1000&user_id=tester',
  tab: { id: 9, index: 4 } as Browser.tabs.Tab,
};

const submitMessage: SubmitRequestMessage = {
  type: 'cib:submit-request',
  problemId: 1000,
  language: 'javascript',
  code: 'console.log(1);',
};

const row = (patch: Partial<StatusRow> = {}): StatusRow => ({
  solutionId: 5004,
  username: 'tester',
  problemId: 1000,
  resultCode: 'judging',
  resultText: '채점 중 (35%)',
  submittedAt: NOW + 30_000,
  ...patch,
});

beforeEach(() => {
  fakeBrowser.reset();
});

describe('message guards', () => {
  it('accepts a valid submit request only', () => {
    expect(isSubmitRequestMessage(submitMessage)).toBe(true);
    expect(isSubmitRequestMessage({ ...submitMessage, code: '' })).toBe(false);
    expect(isSubmitRequestMessage({ ...submitMessage, language: 'python3' })).toBe(true);
    expect(isSubmitRequestMessage({ ...submitMessage, language: 'java11' })).toBe(true);
    expect(isSubmitRequestMessage({ ...submitMessage, language: 'kotlin' })).toBe(false);
    expect(isSubmitRequestMessage({ ...submitMessage, problemId: -1 })).toBe(false);
    expect(isSubmitRequestMessage({ ...submitMessage, problemId: 1.5 })).toBe(false);
    expect(isSubmitRequestMessage({ ...submitMessage, code: 'x'.repeat(600_000) })).toBe(false);
    expect(isSubmitRequestMessage({ ...submitMessage, autoSubmit: true })).toBe(true);
    expect(isSubmitRequestMessage({ ...submitMessage, autoSubmit: 'yes' })).toBe(false);
  });

  it('validates the other messages', () => {
    expect(isSubmitResponse({ ok: true })).toBe(true);
    expect(isSubmitResponse({ ok: false })).toBe(false);
    expect(isPendingQueryMessage({ type: 'cib:pending-query', problemId: 1000 })).toBe(true);
    expect(isPendingQueryMessage({ type: 'cib:pending-query', problemId: '1000' })).toBe(false);
    expect(isWatchQueryResponse({ watches: [{ problemId: 1, since: 5 }] })).toBe(true);
    expect(isWatchQueryResponse({ watches: [{ problemId: 1 }] })).toBe(false);
    expect(isJudgeReportMessage({ type: 'cib:judge-report', row: row() })).toBe(true);
    expect(
      isJudgeReportMessage({ type: 'cib:judge-report', row: { ...row(), resultCode: 'x' } }),
    ).toBe(false);
    expect(
      isJudgeReportMessage({ type: 'cib:judge-report', row: { ...row(), memoryKb: -1 } }),
    ).toBe(false);
  });
});

describe('handleSubmitRequest', () => {
  it('stores the pending code and opens the submit page in a background tab next to the IDE', async () => {
    const create = mockTab();
    await expect(handleSubmitRequest(submitMessage, ideSender, NOW)).resolves.toEqual({
      ok: true,
    });
    expect(create).toHaveBeenCalledWith({
      url: 'https://acmicpc.net/submit/1000',
      active: false,
      windowId: 1,
      index: 3,
      openerTabId: 7,
    });
    const stored = (await fakeBrowser.storage.session.get(pendingKey(1000)))[pendingKey(1000)];
    expect(stored).toMatchObject({ problemId: 1000, languageId: 17, tabId: SUBMIT_TAB });
    const tab = (await fakeBrowser.storage.session.get(submitTabKey(1000)))[submitTabKey(1000)];
    expect(tab).toEqual({
      problemId: 1000,
      tabId: SUBMIT_TAB,
      windowId: 1,
      state: 'submitting',
      kind: 'submit',
      since: NOW,
      updatedAt: NOW,
    });
  });

  it('rejects requests from content scripts', async () => {
    const res = await handleSubmitRequest(submitMessage, submitSender(1), NOW);
    expect(res.ok).toBe(false);
  });
});

describe('handlePendingQuery', () => {
  async function openedTabId(): Promise<number> {
    mockTab();
    await handleSubmitRequest(submitMessage, ideSender, NOW);
    return SUBMIT_TAB;
  }

  it('hands the code to the opened tab once', async () => {
    const tabId = await openedTabId();
    const query = { type: 'cib:pending-query', problemId: 1000 } as const;
    await expect(handlePendingQuery(query, submitSender(tabId), NOW + 1000)).resolves.toEqual({
      pending: {
        problemId: 1000,
        languageId: 17,
        languageName: 'node.js',
        code: 'console.log(1);',
        autoSubmit: false,
      },
    });
    await expect(handlePendingQuery(query, submitSender(tabId), NOW + 2000)).resolves.toEqual({
      pending: null,
    });
  });

  it('refuses other tabs, other pages and expired entries', async () => {
    const tabId = await openedTabId();
    const query = { type: 'cib:pending-query', problemId: 1000 } as const;
    expect((await handlePendingQuery(query, submitSender(tabId + 100), NOW)).pending).toBeNull();
    expect(
      (await handlePendingQuery(query, submitSender(tabId, '/submit/2000'), NOW)).pending,
    ).toBeNull();
    expect((await handlePendingQuery(query, ideSender, NOW)).pending).toBeNull();
    expect(
      (await handlePendingQuery(query, submitSender(tabId), NOW + FILL_TTL_MS + 1)).pending,
    ).toBeNull();
  });
});

describe('judge results', () => {
  beforeEach(async () => {
    await handleSubmitRequest(submitMessage, ideSender, NOW);
  });

  it('lists active watches to status pages only', async () => {
    expect(await handleWatchQuery(statusSender, NOW + 1000)).toEqual({
      watches: [{ problemId: 1000, since: NOW }],
      inSubmitTab: false,
    });
    expect(await handleWatchQuery(submitSender(1), NOW + 1000)).toEqual({ watches: [] });
    expect(await handleWatchQuery(statusSender, NOW + WATCH_TTL_MS + 1)).toMatchObject({
      watches: [],
    });
  });

  it('stores reports from the status page', async () => {
    const report = { type: 'cib:judge-report', row: row() } as const;
    expect(await handleJudgeReport(report, statusSender, NOW + 40_000)).toEqual({ ok: true });
    const done = {
      type: 'cib:judge-report',
      row: row({ resultCode: 'ac', resultText: '맞았습니다!!', memoryKb: 9000, timeMs: 40 }),
    } as const;
    await handleJudgeReport(done, statusSender, NOW + 50_000);

    const stored = (await fakeBrowser.storage.local.get(judgeKey(1000)))[judgeKey(1000)];
    expect(stored).toEqual({
      problemId: 1000,
      solutionId: 5004,
      status: 'done',
      resultText: '맞았습니다!!',
      resultCode: 'ac',
      memoryKb: 9000,
      timeMs: 40,
      updatedAt: NOW + 50_000,
    });
    expect(isJudgeResult(stored)).toBe(true);
  });

  it('ignores old submissions, older solution ids and unwatched problems', async () => {
    const send = (r: StatusRow, sender = statusSender) =>
      handleJudgeReport({ type: 'cib:judge-report', row: r }, sender, NOW + 60_000);
    expect(await send(row({ submittedAt: NOW - 10 * 60_000 }))).toEqual({ ok: false });
    expect(await send(row({ problemId: 2000 }))).toEqual({ ok: false });
    expect(await send(row(), submitSender(1))).toEqual({ ok: false });
    expect(await send(row({ solutionId: 6000 }))).toEqual({ ok: true });
    expect(await send(row({ solutionId: 5004 }))).toEqual({ ok: false });
  });
});

describe('requestSubmit', () => {
  it('sends the request to the background and returns its answer', async () => {
    const received: unknown[] = [];
    fakeBrowser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      received.push(message);
      sendResponse({ ok: true });
      return true;
    });
    await expect(
      requestSubmit({ problemId: 1000, language: 'javascript', code: 'x' }),
    ).resolves.toEqual({ ok: true });
    expect(received).toEqual([
      { type: 'cib:submit-request', problemId: 1000, language: 'javascript', code: 'x' },
    ]);
  });

  it('rejects empty code without messaging', async () => {
    const res = await requestSubmit({ problemId: 1000, language: 'javascript', code: '' });
    expect(res.ok).toBe(false);
  });
});

describe('watchJudgeResult', () => {
  const result = (patch: Partial<JudgeResult> = {}): JudgeResult => ({
    problemId: 1000,
    solutionId: 5004,
    status: 'judging',
    resultText: '채점 중',
    resultCode: 'judging',
    updatedAt: NOW,
    ...patch,
  });

  it('delivers the stored result and later changes until stopped', async () => {
    await fakeBrowser.storage.local.set({ [judgeKey(1000)]: result() });
    const seen: JudgeResult[] = [];
    const stop = watchJudgeResult(1000, (r) => seen.push(r));
    await vi.waitFor(() => expect(seen).toHaveLength(1));

    await fakeBrowser.storage.local.set({
      [judgeKey(1000)]: result({ status: 'done', resultCode: 'ac', updatedAt: NOW + 1 }),
    });
    await fakeBrowser.storage.local.set({ [judgeKey(2000)]: result({ problemId: 2000 }) });
    expect(seen.map((r) => r.resultCode)).toEqual(['judging', 'ac']);

    stop();
    await fakeBrowser.storage.local.set({ [judgeKey(1000)]: result({ updatedAt: NOW + 2 }) });
    expect(seen).toHaveLength(2);
  });
});

describe('submission tab', () => {
  const tabSender: Sender = {
    ...statusSender,
    tab: { id: SUBMIT_TAB, index: 3, windowId: 1 } as Browser.tabs.Tab,
  };

  it('tells the status page whether it is the background submission tab', async () => {
    mockTab();
    await handleSubmitRequest(submitMessage, ideSender, NOW);
    await expect(handleWatchQuery(tabSender, NOW + 1000)).resolves.toMatchObject({
      inSubmitTab: true,
    });
    await expect(handleWatchQuery(statusSender, NOW + 1000)).resolves.toMatchObject({
      inSubmitTab: false,
    });
  });

  it('closes the tab after the final result, without focusing anything', async () => {
    mockTab();
    await handleSubmitRequest(submitMessage, ideSender, NOW);
    vi.useFakeTimers({ now: NOW });
    const remove = vi.spyOn(fakeBrowser.tabs, 'remove').mockResolvedValue();
    const focus = vi.spyOn(fakeBrowser.windows, 'update');
    const activate = vi.spyOn(fakeBrowser.tabs, 'update');
    const judging = handleJudgeReport(
      { type: 'cib:judge-report', row: row() },
      tabSender,
      NOW + 40_000,
    );
    await judging;
    expect(
      (await fakeBrowser.storage.session.get(submitTabKey(1000)))[submitTabKey(1000)],
    ).toMatchObject({
      state: 'judging',
      sent: true,
    });
    const done = handleJudgeReport(
      { type: 'cib:judge-report', row: row({ resultCode: 'ac', resultText: '맞았습니다!!' }) },
      tabSender,
      NOW + 50_000,
    );
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();
    expect(remove).toHaveBeenCalledWith(SUBMIT_TAB);
    expect(focus).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    expect(
      (await fakeBrowser.storage.session.get(submitTabKey(1000)))[submitTabKey(1000)],
    ).toMatchObject({
      state: 'done',
    });
  });
});

describe('language missing detour (#59)', () => {
  const settingsSender = (tabId: number): Sender => ({
    id: EXT,
    url: 'https://acmicpc.net/setting/language',
    tab: { id: tabId, index: 3 } as Browser.tabs.Tab,
  });

  it('keeps the code, tells the settings page why, and refills on return', async () => {
    mockTab();
    await handleSubmitRequest(submitMessage, ideSender, NOW);
    const query = { type: 'cib:pending-query', problemId: 1000 } as const;
    const first = await handlePendingQuery(query, submitSender(SUBMIT_TAB), NOW + 1000);
    if (!first.pending) throw new Error('expected pending code');

    const missing = { type: 'cib:language-missing', pending: first.pending } as const;
    await expect(
      handleLanguageMissing(missing, submitSender(SUBMIT_TAB), NOW + 2000),
    ).resolves.toEqual({ ok: true });

    await expect(handleLanguageMissingQuery(settingsSender(SUBMIT_TAB))).resolves.toEqual({
      info: { problemId: 1000, languageName: 'node.js' },
    });
    await expect(handleLanguageMissingQuery(settingsSender(999))).resolves.toEqual({
      info: null,
    });

    // Back on the submit page: the code is handed out again and the detour is cleared.
    const again = await handlePendingQuery(query, submitSender(SUBMIT_TAB), NOW + 60_000);
    expect(again.pending?.code).toBe('console.log(1);');
    await expect(handleLanguageMissingQuery(settingsSender(SUBMIT_TAB))).resolves.toEqual({
      info: null,
    });
  });

  it('only accepts the report from the submit page of that problem', async () => {
    const pending = {
      problemId: 1000,
      languageId: 17,
      languageName: 'node.js',
      code: 'x',
    };
    const message = { type: 'cib:language-missing', pending } as const;
    await expect(handleLanguageMissing(message, statusSender, NOW)).resolves.toEqual({
      ok: false,
    });
    await expect(
      handleLanguageMissing(message, submitSender(1, '/submit/2000'), NOW),
    ).resolves.toEqual({ ok: false });
  });
});
