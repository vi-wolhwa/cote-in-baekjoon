/**
 * Background side of reading an exam problem's statement (capture-contract.ts, ADR-0005).
 * Keeps no state in globals: the service worker can stop at any time, so each capture is a
 * record in `storage.session` keyed by exam and problem, holding the background tab's id.
 *
 * - One capture per problem: asking again while one is running opens no second tab.
 * - Only the tab the extension opened, on that problem's page, may answer, and its answer
 *   is checked like any page data before it goes into the exam record.
 * - A capture that takes longer than CAPTURE_TIMEOUT_MS is given up and its tab closed.
 */
import { bojPath, isExtensionPage } from '@/boj/submission-service';
import { isProblemBody, setProblemBody } from './model';
import { loadExam, updateExam } from './storage';
import {
  CAPTURE_PREFIX,
  CAPTURE_TIMEOUT_MS,
  captureKey,
  capturePageUrl,
  isCaptureRecord,
  type CaptureCancelMessage,
  type CaptureError,
  type CaptureQueryResponse,
  type CaptureRecord,
  type CaptureRequestMessage,
  type CaptureResponse,
  type CaptureResultMessage,
} from './capture-contract';

type Sender = Browser.runtime.MessageSender;

async function readRecord(key: string): Promise<CaptureRecord | undefined> {
  const value = (await browser.storage.session.get(key))[key];
  return isCaptureRecord(value) ? value : undefined;
}

/** The running capture whose background tab is `tabId`. */
async function recordForTab(
  tabId: number | undefined,
): Promise<{ key: string; record: CaptureRecord } | undefined> {
  if (tabId === undefined) return undefined;
  const all = await browser.storage.session.get(null);
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(CAPTURE_PREFIX) || !isCaptureRecord(value)) continue;
    if (value.state === 'pending' && value.tabId === tabId) return { key, record: value };
  }
  return undefined;
}

const isExpired = (record: CaptureRecord, now: number) =>
  now - record.startedAt >= CAPTURE_TIMEOUT_MS;

function closeTab(tabId: number | undefined) {
  return tabId === undefined ? Promise.resolve() : browser.tabs.remove(tabId).catch(() => {});
}

/** Marks a running capture failed and closes its tab. */
async function fail(key: string, record: CaptureRecord, error: CaptureError) {
  await browser.storage.session.set({ [key]: { ...record, state: 'error', error } });
  await closeTab(record.tabId);
}

/** Gives up the capture started at `startedAt` if it is still running. */
export async function expireCapture(key: string, startedAt: number): Promise<void> {
  const record = await readRecord(key);
  if (record?.state === 'pending' && record.startedAt === startedAt) {
    await fail(key, record, 'timeout');
  }
}

export async function handleCaptureRequest(
  message: CaptureRequestMessage,
  sender: Sender,
  now = Date.now(),
): Promise<CaptureResponse> {
  if (!isExtensionPage(sender)) return { ok: false, reason: '허용되지 않은 요청입니다.' };
  const { examId, problemId } = message;
  const exam = await loadExam(examId);
  const problem = exam?.problems.find((p) => p.id === problemId);
  if (!problem) return { ok: false, reason: '시험 기록에서 이 문제를 찾지 못했습니다.' };
  if (problem.body) return { ok: true };

  const key = captureKey(examId, problemId);
  const existing = await readRecord(key);
  if (existing?.state === 'pending') {
    // Asked twice (another click, the user came back to the problem): no second tab.
    if (!isExpired(existing, now)) return { ok: true };
    await closeTab(existing.tabId);
  }

  const record: CaptureRecord = { examId, problemId, state: 'pending', startedAt: now };
  await browser.storage.session.set({ [key]: record });
  const from = sender.tab;
  try {
    // Inactive, next to the exam: the user stays on the exam screen.
    const tab = await browser.tabs.create({
      url: capturePageUrl(problemId),
      active: false,
      ...(from?.windowId !== undefined ? { windowId: from.windowId } : {}),
      ...(from?.index !== undefined ? { index: from.index + 1 } : {}),
      ...(from?.id !== undefined ? { openerTabId: from.id } : {}),
    });
    if (tab.id === undefined) throw new Error('no tab');
    await browser.storage.session.set({ [key]: { ...record, tabId: tab.id } });
  } catch {
    await browser.storage.session.set({ [key]: { ...record, state: 'error', error: 'open' } });
    return { ok: false, reason: '백준 문제 페이지를 열지 못했습니다. 다시 시도해 주세요.' };
  }
  // Best effort while the worker lives; the exam page also cancels after the timeout.
  setTimeout(() => void expireCapture(key, now).catch(() => undefined), CAPTURE_TIMEOUT_MS);
  return { ok: true };
}

/** The exam page waited long enough. */
export async function handleCaptureCancel(
  message: CaptureCancelMessage,
  sender: Sender,
): Promise<{ ok: boolean }> {
  if (!isExtensionPage(sender)) return { ok: false };
  const key = captureKey(message.examId, message.problemId);
  const record = await readRecord(key);
  if (record?.state !== 'pending') return { ok: false };
  await fail(key, record, 'timeout');
  return { ok: true };
}

/** The problem page content script asks whether its tab was opened to be read. */
export async function handleCaptureQuery(
  sender: Sender,
  now = Date.now(),
): Promise<CaptureQueryResponse> {
  const found = await recordForTab(sender.tab?.id);
  if (!found || bojPath(sender) === undefined) return { capture: null };
  if (isExpired(found.record, now)) {
    await fail(found.key, found.record, 'timeout');
    return { capture: null };
  }
  if (!problemPathMatches(sender, found.record.problemId)) return { capture: null };
  return { capture: { problemId: found.record.problemId } };
}

/** The parsed problem from the background tab: checked, stored in the exam, tab closed. */
export async function handleCaptureResult(
  message: CaptureResultMessage,
  sender: Sender,
  now = Date.now(),
): Promise<{ ok: boolean }> {
  const found = await recordForTab(sender.tab?.id);
  if (!found || bojPath(sender) === undefined) return { ok: false };
  const { key, record } = found;
  if (message.problemId !== record.problemId || !problemPathMatches(sender, record.problemId)) {
    return { ok: false };
  }
  if (isExpired(record, now)) {
    await fail(key, record, 'timeout');
    return { ok: false };
  }
  if (message.error || !isProblemBody(message.problem, record.problemId)) {
    await fail(key, record, 'parse');
    return { ok: false };
  }
  const body = message.problem;
  const saved = await updateExam(record.examId, (exam) => setProblemBody(exam, body));
  // Removed before the tab closes, so closing it is not taken for the user closing it.
  await browser.storage.session.remove(key);
  await closeTab(record.tabId);
  return { ok: saved !== undefined };
}

/** The user (or anything else) closed a background tab before it was read. */
export async function handleCaptureTabRemoved(tabId: number): Promise<void> {
  const found = await recordForTab(tabId);
  if (!found) return;
  await browser.storage.session.set({
    [found.key]: { ...found.record, state: 'error', error: 'closed' },
  });
}

function problemPathMatches(sender: Sender, problemId: number): boolean {
  const path = bojPath(sender);
  return path !== undefined && new RegExp(`^/problem/${problemId}/?$`).test(path);
}
