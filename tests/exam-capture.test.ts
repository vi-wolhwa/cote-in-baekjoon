import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Problem } from '@/boj/problem';
import {
  expireCapture,
  handleCaptureCancel,
  handleCaptureQuery,
  handleCaptureRequest,
  handleCaptureResult,
  handleCaptureTabRemoved,
} from '@/exam/capture';
import {
  CAPTURE_TIMEOUT_MS,
  captureKey,
  describeCaptureError,
  isCaptureRecord,
  isCaptureRequestMessage,
  isCaptureResultMessage,
} from '@/exam/capture-contract';
import { createExam, DEFAULT_DRAFT, examKey, setProblemBody, type Exam } from '@/exam/model';

type Sender = Browser.runtime.MessageSender;

const EXT = fakeBrowser.runtime.id;
const NOW = 1_800_000_000_000;
const EXAM_ID = 'abcdefgh12';
const BG_TAB = 91;

const examSender: Sender = {
  id: EXT,
  url: `chrome-extension://${EXT}/exam.html#${EXAM_ID}`,
  tab: { id: 5, index: 2, windowId: 1 } as Browser.tabs.Tab,
};
const pageSender = (tabId: number, path = '/problem/1000'): Sender => ({
  id: EXT,
  url: `https://acmicpc.net${path}`,
  tab: { id: tabId, index: 3, windowId: 1 } as Browser.tabs.Tab,
});

const request = { type: 'cib:capture-request', examId: EXAM_ID, problemId: 1000 } as const;
const key = captureKey(EXAM_ID, 1000);

/** What parseProblem() returns for a synthetic page. */
const body = (patch: Partial<Problem> = {}): Problem => ({
  id: 1000,
  title: '테스트용 덧셈',
  timeLimitText: '1 초',
  memoryLimitText: '256 MB',
  timeLimitMs: 1000,
  sections: { description: '<p>더한다.</p>', input: '<p>두 수</p>', output: '<p>합</p>' },
  samples: [{ input: '1 2\n', output: '3\n' }],
  labels: [],
  ...patch,
});

function exam(): Exam {
  return createExam({
    id: EXAM_ID,
    now: NOW,
    draft: DEFAULT_DRAFT,
    problems: [
      { id: 1000, title: '테스트용 덧셈', level: 3 },
      { id: 1001, title: '테스트 뺄셈', level: 4 },
    ],
  });
}

const session = async () => (await fakeBrowser.storage.session.get(key))[key];
const storedExam = async () =>
  (await fakeBrowser.storage.local.get(examKey(EXAM_ID)))[examKey(EXAM_ID)] as Exam;

let create: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.useRealTimers();
  create = vi.fn(async () => ({ id: BG_TAB }));
  remove = vi.fn(async () => undefined);
  Object.assign(fakeBrowser.tabs, { create, remove });
  await fakeBrowser.storage.local.set({ [examKey(EXAM_ID)]: exam() });
});

describe('capture messages', () => {
  it('validates requests and results', () => {
    expect(isCaptureRequestMessage(request)).toBe(true);
    expect(isCaptureRequestMessage({ ...request, examId: 'BAD ID' })).toBe(false);
    expect(isCaptureRequestMessage({ ...request, problemId: 0 })).toBe(false);
    expect(isCaptureResultMessage({ type: 'cib:capture-result', problemId: 1000 })).toBe(true);
    expect(
      isCaptureResultMessage({ type: 'cib:capture-result', problemId: 1000, error: 'other' }),
    ).toBe(false);
    expect(describeCaptureError('timeout')).toContain('20초');
  });
});

describe('starting a capture', () => {
  it('opens the problem in an inactive tab next to the exam and remembers it', async () => {
    await expect(handleCaptureRequest(request, examSender, NOW)).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({
      url: 'https://acmicpc.net/problem/1000',
      active: false,
      windowId: 1,
      index: 3,
      openerTabId: 5,
    });
    const record = await session();
    expect(record).toEqual({
      examId: EXAM_ID,
      problemId: 1000,
      state: 'pending',
      tabId: BG_TAB,
      startedAt: NOW,
    });
    expect(isCaptureRecord(record)).toBe(true);
  });

  it('opens no second tab while one is running, but replaces an expired one', async () => {
    await handleCaptureRequest(request, examSender, NOW);
    await handleCaptureRequest(request, examSender, NOW + 1000);
    expect(create).toHaveBeenCalledTimes(1);
    create.mockResolvedValueOnce({ id: 92 });
    await handleCaptureRequest(request, examSender, NOW + CAPTURE_TIMEOUT_MS + 1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith(BG_TAB);
    expect(await session()).toMatchObject({ state: 'pending', tabId: 92 });
  });

  it('does nothing for a problem already read, and refuses others', async () => {
    await fakeBrowser.storage.local.set({ [examKey(EXAM_ID)]: setProblemBody(exam(), body()) });
    await expect(handleCaptureRequest(request, examSender, NOW)).resolves.toEqual({ ok: true });
    expect(create).not.toHaveBeenCalled();
    const other = await handleCaptureRequest({ ...request, problemId: 2000 }, examSender, NOW);
    expect(other.ok).toBe(false);
    // Only extension pages may ask.
    expect((await handleCaptureRequest(request, pageSender(4), NOW)).ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('reports a tab that could not be opened', async () => {
    create.mockRejectedValueOnce(new Error('no'));
    const response = await handleCaptureRequest(request, examSender, NOW);
    expect(response.ok).toBe(false);
    expect(await session()).toMatchObject({ state: 'error', error: 'open' });
  });
});

describe('the background tab', () => {
  beforeEach(async () => {
    await handleCaptureRequest(request, examSender, NOW);
  });

  it('is told to read only when it is the capture tab on that problem', async () => {
    expect(await handleCaptureQuery(pageSender(BG_TAB), NOW + 1000)).toEqual({
      capture: { problemId: 1000 },
    });
    expect(await handleCaptureQuery(pageSender(7), NOW + 1000)).toEqual({ capture: null });
    expect(await handleCaptureQuery(pageSender(BG_TAB, '/problem/1001'), NOW + 1000)).toEqual({
      capture: null,
    });
    expect(await handleCaptureQuery({ id: EXT, tab: { id: BG_TAB } as never }, NOW)).toEqual({
      capture: null,
    });
  });

  it('stores a valid problem in the exam and closes the tab', async () => {
    const message = { type: 'cib:capture-result', problemId: 1000, problem: body() } as const;
    await expect(handleCaptureResult(message, pageSender(BG_TAB), NOW + 2000)).resolves.toEqual({
      ok: true,
    });
    expect((await storedExam()).problems[0]?.body).toEqual(body());
    expect(await session()).toBeUndefined();
    expect(remove).toHaveBeenCalledWith(BG_TAB);
    // Closing it afterwards is not an error.
    await handleCaptureTabRemoved(BG_TAB);
    expect(await session()).toBeUndefined();
  });

  it('ignores answers from other tabs and for other problems', async () => {
    const message = { type: 'cib:capture-result', problemId: 1000, problem: body() } as const;
    expect(await handleCaptureResult(message, pageSender(7), NOW + 2000)).toEqual({ ok: false });
    const wrong = { ...message, problemId: 1001, problem: body({ id: 1001 }) };
    expect(await handleCaptureResult(wrong, pageSender(BG_TAB), NOW + 2000)).toEqual({
      ok: false,
    });
    expect((await storedExam()).problems[0]?.body).toBeUndefined();
    expect(await session()).toMatchObject({ state: 'pending' });
  });

  it('treats a page without the problem, or a malformed one, as a parse error', async () => {
    const bad = {
      type: 'cib:capture-result',
      problemId: 1000,
      problem: { ...body(), sections: { description: 5 } },
    } as const;
    expect(await handleCaptureResult(bad, pageSender(BG_TAB), NOW + 2000)).toEqual({ ok: false });
    expect(await session()).toMatchObject({ state: 'error', error: 'parse' });
    expect(remove).toHaveBeenCalledWith(BG_TAB);
    expect((await storedExam()).problems[0]?.body).toBeUndefined();
  });

  it('reports a parse error sent by the page', async () => {
    const message = { type: 'cib:capture-result', problemId: 1000, error: 'parse' } as const;
    await handleCaptureResult(message, pageSender(BG_TAB), NOW + 2000);
    expect(await session()).toMatchObject({ state: 'error', error: 'parse' });
  });

  it('gives up after the timeout and closes the tab', async () => {
    await expireCapture(key, NOW - 1);
    expect(await session()).toMatchObject({ state: 'pending' });
    await expireCapture(key, NOW);
    expect(await session()).toMatchObject({ state: 'error', error: 'timeout' });
    expect(remove).toHaveBeenCalledWith(BG_TAB);
  });

  it('refuses a late answer and a late query', async () => {
    const message = { type: 'cib:capture-result', problemId: 1000, problem: body() } as const;
    const late = NOW + CAPTURE_TIMEOUT_MS;
    expect(await handleCaptureQuery(pageSender(BG_TAB), late)).toEqual({ capture: null });
    expect(await session()).toMatchObject({ state: 'error', error: 'timeout' });
    expect(await handleCaptureResult(message, pageSender(BG_TAB), late)).toEqual({ ok: false });
  });

  it('is cancelled by the exam page', async () => {
    const cancel = { type: 'cib:capture-cancel', examId: EXAM_ID, problemId: 1000 } as const;
    expect(await handleCaptureCancel(cancel, pageSender(4))).toEqual({ ok: false });
    expect(await handleCaptureCancel(cancel, examSender)).toEqual({ ok: true });
    expect(await session()).toMatchObject({ state: 'error', error: 'timeout' });
    expect(remove).toHaveBeenCalledWith(BG_TAB);
  });

  it('notices when the user closes the tab first', async () => {
    await handleCaptureTabRemoved(7);
    expect(await session()).toMatchObject({ state: 'pending' });
    await handleCaptureTabRemoved(BG_TAB);
    expect(await session()).toMatchObject({ state: 'error', error: 'closed' });
    // A retry starts a new capture.
    create.mockResolvedValueOnce({ id: 93 });
    await handleCaptureRequest(request, examSender, NOW + 3000);
    expect(await session()).toMatchObject({ state: 'pending', tabId: 93 });
  });
});
