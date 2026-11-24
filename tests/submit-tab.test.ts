import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleSubmitRequest, handleWatchQuery } from '@/boj/submission-service';
import {
  giveUpRecheck,
  handleRecheck,
  handleSubmitProgress,
  handleSubmitTabRemoved,
  noteJudgeReport,
} from '@/boj/submit-tab-service';
import {
  focusSubmitTab,
  isRecheckMessage,
  isSubmitProgressMessage,
  submitTabKey,
  submitView,
  type SubmitTab,
} from '@/shared/submit-tab';
import { watchKey, type JudgeResult, type SubmitRequestMessage } from '@/shared/submission';

type Sender = Browser.runtime.MessageSender;

const EXT = fakeBrowser.runtime.id;
const NOW = 1_800_000_000_000;
const TAB = 77;

const ideSender: Sender = {
  id: EXT,
  url: `chrome-extension://${EXT}/ide.html`,
  tab: { id: 7, index: 2, windowId: 1 } as Browser.tabs.Tab,
};
const pageSender = (tabId: number, path: string): Sender => ({
  id: EXT,
  url: `https://acmicpc.net${path}`,
  tab: { id: tabId, index: 3, windowId: 1 } as Browser.tabs.Tab,
});
const submitMessage: SubmitRequestMessage = {
  type: 'cib:submit-request',
  problemId: 1000,
  language: 'javascript',
  code: 'console.log(1);',
  autoSubmit: true,
};
const record = async () =>
  (await fakeBrowser.storage.session.get(submitTabKey(1000)))[submitTabKey(1000)] as
    SubmitTab | undefined;

let create: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeBrowser.reset();
  create = vi.fn(async () => ({ id: TAB, windowId: 1 }));
  remove = vi.fn(async () => undefined);
  Object.assign(fakeBrowser.tabs, { create, remove });
});

describe('the submission tab', () => {
  it('goes submitting → sent → judging → done and closes, focusing nothing', async () => {
    await handleSubmitRequest(submitMessage, ideSender, NOW);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ active: false, windowId: 1 }));
    expect(await record()).toMatchObject({ state: 'submitting', tabId: TAB, since: NOW });

    const sent = { type: 'cib:submit-progress', problemId: 1000, state: 'sent' } as const;
    expect(await handleSubmitProgress(sent, pageSender(TAB, '/submit/1000'), NOW + 3000)).toEqual({
      ok: true,
    });
    expect(await record()).toMatchObject({ state: 'sent', sent: true });

    const status = pageSender(TAB, '/status');
    await noteJudgeReport(1000, 'judging', status, NOW + 5000, 0);
    expect(await record()).toMatchObject({ state: 'judging' });
    expect(remove).not.toHaveBeenCalled();
    // A late message from the submit page never takes it back.
    expect(await handleSubmitProgress(sent, pageSender(TAB, '/submit/1000'), NOW + 6000)).toEqual({
      ok: false,
    });
    expect(await record()).toMatchObject({ state: 'judging' });
    await noteJudgeReport(1000, 'done', status, NOW + 9000, 0);
    expect(await record()).toMatchObject({ state: 'done', sent: true });
    expect(remove).toHaveBeenCalledWith(TAB);
    // Closing it now changes nothing.
    await handleSubmitTabRemoved(TAB, NOW + 9500);
    expect(await record()).toMatchObject({ state: 'done' });
  });

  it('records why auto-submit handed over to the user', async () => {
    await handleSubmitRequest(submitMessage, ideSender, NOW);
    const message = {
      type: 'cib:submit-progress',
      problemId: 1000,
      state: 'needs-user',
      reason: 'check',
    } as const;
    await handleSubmitProgress(message, pageSender(TAB, '/submit/1000'), NOW + 1000);
    expect(await record()).toMatchObject({ state: 'needs-user', reason: 'check' });
    // The status page later reports it: the user's turn is over.
    await noteJudgeReport(1000, 'judging', pageSender(TAB, '/status'), NOW + 9000, 0);
    const after = await record();
    expect(after?.state).toBe('judging');
    expect(after?.reason).toBeUndefined();
  });

  it('listens only to the submission tab, on the submit page of that problem', async () => {
    await handleSubmitRequest(submitMessage, ideSender, NOW);
    const sent = { type: 'cib:submit-progress', problemId: 1000, state: 'sent' } as const;
    expect(await handleSubmitProgress(sent, pageSender(5, '/submit/1000'), NOW)).toEqual({
      ok: false,
    });
    expect(await handleSubmitProgress(sent, pageSender(TAB, '/submit/1001'), NOW)).toEqual({
      ok: false,
    });
    expect(await handleSubmitProgress(sent, ideSender, NOW)).toEqual({ ok: false });
    await noteJudgeReport(1000, 'done', pageSender(5, '/status'), NOW, 0);
    expect(await record()).toMatchObject({ state: 'submitting' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('notices a tab closed before the final result', async () => {
    await handleSubmitRequest(submitMessage, ideSender, NOW);
    await handleSubmitTabRemoved(12, NOW + 1000);
    expect(await record()).toMatchObject({ state: 'submitting' });
    await handleSubmitTabRemoved(TAB, NOW + 2000);
    expect(await record()).toMatchObject({ state: 'closed', updatedAt: NOW + 2000 });
  });

  it('brings the tab to the front for 직접 확인', async () => {
    await handleSubmitRequest(submitMessage, ideSender, NOW);
    const update = vi.fn(async () => ({}));
    const focus = vi.fn(async () => ({}));
    Object.assign(fakeBrowser.tabs, { update });
    Object.assign(fakeBrowser.windows, { update: focus });
    expect(await focusSubmitTab(1000)).toBe(true);
    expect(update).toHaveBeenCalledWith(TAB, { active: true });
    expect(focus).toHaveBeenCalledWith(1, { focused: true });
    await handleSubmitTabRemoved(TAB, NOW + 1);
    expect(await focusSubmitTab(1000)).toBe(false);
  });
});

describe('결과 다시 확인', () => {
  const recheck = { type: 'cib:recheck', problemId: 1000, since: NOW } as const;

  it('watches again and opens the user status list in a background tab', async () => {
    await fakeBrowser.storage.local.set({ 'boj:handle': 'tester' });
    expect(await handleRecheck(recheck, ideSender, NOW + 60_000)).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({
      url: 'https://acmicpc.net/status?problem_id=1000&user_id=tester',
      active: false,
      windowId: 1,
      index: 3,
      openerTabId: 7,
    });
    expect((await fakeBrowser.storage.session.get(watchKey(1000)))[watchKey(1000)]).toEqual({
      problemId: 1000,
      since: NOW,
    });
    expect(await record()).toMatchObject({ kind: 'recheck', state: 'judging', sent: true });
    // The status page in that tab is ours: it reports and the tab closes after the result.
    const status = pageSender(TAB, '/status');
    expect(await handleWatchQuery(status, NOW + 61_000)).toMatchObject({ inSubmitTab: true });
    await noteJudgeReport(1000, 'done', status, NOW + 62_000, 0);
    expect(remove).toHaveBeenCalledWith(TAB);
  });

  it('uses from_mine=1 when the Baekjoon id is not known', async () => {
    await handleRecheck(recheck, ideSender, NOW + 60_000);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://acmicpc.net/status?problem_id=1000&from_mine=1' }),
    );
  });

  it('only on a page of the extension, and not twice at once', async () => {
    expect(await handleRecheck(recheck, pageSender(3, '/status'), NOW)).toEqual({ ok: false });
    await handleRecheck(recheck, ideSender, NOW + 1000);
    await handleRecheck(recheck, ideSender, NOW + 2000);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('gives up and closes a recheck that found nothing', async () => {
    await handleRecheck(recheck, ideSender, NOW + 1000);
    await giveUpRecheck(1000, TAB, NOW + 70_000);
    expect(await record()).toMatchObject({ state: 'closed' });
    expect(remove).toHaveBeenCalledWith(TAB);
  });

  it('validates its messages', () => {
    expect(isRecheckMessage(recheck)).toBe(true);
    expect(isRecheckMessage({ ...recheck, since: -1 })).toBe(false);
    expect(isRecheckMessage({ ...recheck, problemId: 0 })).toBe(false);
    expect(
      isSubmitProgressMessage({ type: 'cib:submit-progress', problemId: 1, state: 'sent' }),
    ).toBe(true);
    expect(
      isSubmitProgressMessage({
        type: 'cib:submit-progress',
        problemId: 1,
        state: 'needs-user',
        reason: 'magic',
      }),
    ).toBe(false);
  });
});

describe('what the IDE shows', () => {
  const tab = (patch: Partial<SubmitTab>): SubmitTab => ({
    problemId: 1000,
    tabId: TAB,
    state: 'submitting',
    kind: 'submit',
    since: NOW,
    updatedAt: NOW,
    ...patch,
  });
  const judge = (status: JudgeResult['status'], at: number): JudgeResult => ({
    problemId: 1000,
    solutionId: 5,
    status,
    resultText: status === 'done' ? '맞았습니다!!' : '채점 중 (30%)',
    resultCode: status === 'done' ? 'ac' : 'judging',
    updatedAt: at,
  });

  it('follows the tab and the results of this submission', () => {
    expect(submitView(undefined, undefined, undefined)).toEqual({ kind: 'idle' });
    expect(submitView(tab({}), undefined, NOW).kind).toBe('submitting');
    expect(submitView(tab({ state: 'sent' }), undefined, NOW).kind).toBe('submitting');
    expect(submitView(tab({ state: 'needs-user' }), undefined, NOW).kind).toBe('needs-user');
    expect(submitView(tab({ state: 'judging' }), judge('judging', NOW + 5), NOW)).toMatchObject({
      kind: 'judging',
      judge: { resultText: '채점 중 (30%)' },
    });
    expect(submitView(tab({ state: 'done' }), judge('done', NOW + 9), NOW).kind).toBe('done');
    // A result older than the submission is someone else's (an earlier one).
    expect(submitView(tab({}), judge('done', NOW - 1), NOW).kind).toBe('submitting');
  });

  it('offers 결과 다시 확인 when the tab closed before the final result', () => {
    expect(submitView(tab({ state: 'closed' }), undefined, NOW)).toEqual({
      kind: 'lost',
      since: NOW,
    });
    expect(submitView(tab({ state: 'closed' }), judge('judging', NOW + 5), NOW).kind).toBe('lost');
    expect(submitView(tab({ state: 'closed' }), judge('done', NOW + 5), NOW).kind).toBe('done');
    // Opened again later: the closed tab's own time is used.
    expect(submitView(tab({ state: 'closed' }), undefined, undefined).kind).toBe('lost');
    // A tab of an older submission says nothing about this one.
    expect(submitView(tab({ since: NOW - 60_000 }), undefined, NOW).kind).toBe('lost');
  });
});
