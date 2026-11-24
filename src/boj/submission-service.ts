/**
 * Background side of the submission flow (ADR-0002). Runs in the service worker, keeps no
 * state in globals, and sends no requests to Baekjoon: it only opens the official submit
 * page for the user, in a background tab (submit-tab-service.ts), and relays data between
 * extension pages and Baekjoon content scripts.
 */
import { BOJ_LANGUAGES } from '@/boj/languages';
import { CLOCK_SKEW_MS, judgeStatusOf, type Watch } from '@/boj/status';
import {
  isJudgeResult,
  isLanguageMissingQueryResponse,
  judgeKey,
  languageMissingKey,
  pendingKey,
  watchKey,
  type LanguageMissingInfo,
  type LanguageMissingMessage,
  type LanguageMissingQueryResponse,
  type JudgeReportMessage,
  type JudgeResult,
  type PendingQueryMessage,
  type PendingQueryResponse,
  type PendingSubmission,
  type SubmitRequestMessage,
  type SubmitResponse,
  type WatchQueryResponse,
} from '@/shared/submission';
import { bojPath, isExtensionPage, submitUrl } from './sender';
import { isOwnSubmitTab, noteJudgeReport, openSubmitTab } from './submit-tab-service';

export { bojPath, isExtensionPage, submitUrl };

type Sender = Browser.runtime.MessageSender;

/** How long the submit page may still pick up the code after the user pressed 제출하기. */
export const FILL_TTL_MS = 10 * 60 * 1000;
/** How long status pages report results for a problem after the submit page was opened. */
export const WATCH_TTL_MS = 60 * 60 * 1000;

interface StoredPending extends PendingSubmission {
  createdAt: number;
  /** The tab opened for this submission; unset for the moment before the tab exists. */
  tabId?: number;
}

export async function handleSubmitRequest(
  message: SubmitRequestMessage,
  sender: Sender,
  now = Date.now(),
): Promise<SubmitResponse> {
  if (!isExtensionPage(sender)) return { ok: false, reason: '허용되지 않은 요청입니다.' };
  await removeExpired(now);

  const language = BOJ_LANGUAGES[message.language];
  const pending: StoredPending = {
    problemId: message.problemId,
    languageId: language.id,
    languageName: language.name,
    code: message.code,
    autoSubmit: message.autoSubmit === true,
    createdAt: now,
  };
  const watch: Watch = { problemId: message.problemId, since: now };
  // Store first so the new tab can never ask before the code is there.
  await browser.storage.session.set({
    [pendingKey(message.problemId)]: pending,
    [watchKey(message.problemId)]: watch,
  });

  try {
    const tabId = await openSubmitTab(message.problemId, submitUrl(message.problemId), sender, now);
    await browser.storage.session.set({
      [pendingKey(message.problemId)]: { ...pending, tabId },
    });
  } catch {
    await browser.storage.session.remove(pendingKey(message.problemId));
    return { ok: false, reason: '백준 제출 페이지를 열지 못했습니다.' };
  }
  return { ok: true };
}

/** Hands the pending code to the submit page once, then forgets it. */
export async function handlePendingQuery(
  message: PendingQueryMessage,
  sender: Sender,
  now = Date.now(),
): Promise<PendingQueryResponse> {
  const path = bojPath(sender);
  if (path === undefined || !new RegExp(`^/submit/${message.problemId}/?$`).test(path)) {
    return { pending: null };
  }
  const key = pendingKey(message.problemId);
  const stored = (await browser.storage.session.get(key))[key];
  if (!isStoredPending(stored)) return { pending: null };
  if (now - stored.createdAt > FILL_TTL_MS) {
    await browser.storage.session.remove(key);
    return { pending: null };
  }
  if (stored.tabId !== undefined && stored.tabId !== sender.tab?.id) return { pending: null };

  await browser.storage.session.remove(key);
  if (sender.tab?.id !== undefined) {
    // Back on the submit page after fixing the language list: the detour is over.
    await browser.storage.session.remove(languageMissingKey(sender.tab.id));
  }
  const { problemId, languageId, languageName, code, autoSubmit } = stored;
  return { pending: { problemId, languageId, languageName, code, autoSubmit } };
}

/**
 * The submit page has no option for the language (#59): keep the code for this tab again
 * and remember why it is going to the language settings.
 */
export async function handleLanguageMissing(
  message: LanguageMissingMessage,
  sender: Sender,
  now = Date.now(),
): Promise<{ ok: boolean }> {
  const { pending } = message;
  const path = bojPath(sender);
  const tabId = sender.tab?.id;
  if (tabId === undefined || path === undefined) return { ok: false };
  if (!new RegExp(`^/submit/${pending.problemId}/?$`).test(path)) return { ok: false };

  const stored: StoredPending = { ...pending, createdAt: now, tabId };
  const info: LanguageMissingInfo = {
    problemId: pending.problemId,
    languageName: pending.languageName,
  };
  await browser.storage.session.set({
    [pendingKey(pending.problemId)]: stored,
    [languageMissingKey(tabId)]: info,
  });
  return { ok: true };
}

/** The language settings page asks whether it was opened because of a missing language. */
export async function handleLanguageMissingQuery(
  sender: Sender,
): Promise<LanguageMissingQueryResponse> {
  const path = bojPath(sender);
  const tabId = sender.tab?.id;
  if (tabId === undefined || path === undefined || !path.startsWith('/setting')) {
    return { info: null };
  }
  const key = languageMissingKey(tabId);
  const info = (await browser.storage.session.get(key))[key];
  return isLanguageMissingQueryResponse({ info })
    ? { info: info as LanguageMissingInfo }
    : { info: null };
}

export async function handleWatchQuery(
  sender: Sender,
  now = Date.now(),
): Promise<WatchQueryResponse> {
  if (!isStatusPath(bojPath(sender))) return { watches: [] };
  await removeExpired(now);
  const watches = await activeWatches(now);
  return { watches, inSubmitTab: await isOwnSubmitTab(sender.tab?.id) };
}

export async function handleJudgeReport(
  message: JudgeReportMessage,
  sender: Sender,
  now = Date.now(),
): Promise<{ ok: boolean }> {
  const { row } = message;
  if (!isStatusPath(bojPath(sender))) return { ok: false };

  const watch = (await activeWatches(now)).find((w) => w.problemId === row.problemId);
  if (!watch || row.submittedAt === undefined || row.submittedAt < watch.since - CLOCK_SKEW_MS) {
    return { ok: false };
  }

  const key = judgeKey(row.problemId);
  const previous = (await browser.storage.local.get(key))[key];
  const status = judgeStatusOf(row.resultCode);
  if (isJudgeResult(previous) && previous.solutionId !== undefined) {
    if (previous.solutionId > row.solutionId) return { ok: false };
    if (
      previous.solutionId === row.solutionId &&
      previous.resultCode === row.resultCode &&
      previous.resultText === row.resultText &&
      previous.memoryKb === row.memoryKb &&
      previous.timeMs === row.timeMs
    ) {
      return { ok: true };
    }
  }

  const result: JudgeResult = {
    problemId: row.problemId,
    solutionId: row.solutionId,
    status,
    resultText: row.resultText,
    resultCode: row.resultCode,
    updatedAt: now,
    ...(row.memoryKb !== undefined ? { memoryKb: row.memoryKb } : {}),
    ...(row.timeMs !== undefined ? { timeMs: row.timeMs } : {}),
  };
  await browser.storage.local.set({ [key]: result });
  await noteJudgeReport(row.problemId, status, sender, now);
  return { ok: true };
}

function isStatusPath(path: string | undefined): boolean {
  return path !== undefined && /^\/status\/?$/.test(path);
}

async function activeWatches(now: number): Promise<Watch[]> {
  const all = await browser.storage.session.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith('cib:watch:'))
    .map(([, value]) => value)
    .filter(isWatch)
    .filter((w) => now - w.since <= WATCH_TTL_MS);
}

async function removeExpired(now: number): Promise<void> {
  const all = await browser.storage.session.get(null);
  const expired = Object.entries(all)
    .filter(([key, value]) => {
      if (key.startsWith('cib:pending:')) {
        return !isStoredPending(value) || now - value.createdAt > FILL_TTL_MS;
      }
      if (key.startsWith('cib:watch:')) return !isWatch(value) || now - value.since > WATCH_TTL_MS;
      return false;
    })
    .map(([key]) => key);
  if (expired.length > 0) await browser.storage.session.remove(expired);
}

function isStoredPending(v: unknown): v is StoredPending {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.problemId === 'number' &&
    typeof p.languageId === 'number' &&
    typeof p.languageName === 'string' &&
    typeof p.code === 'string' &&
    typeof p.createdAt === 'number' &&
    (p.autoSubmit === undefined || typeof p.autoSubmit === 'boolean') &&
    (p.tabId === undefined || typeof p.tabId === 'number')
  );
}

function isWatch(v: unknown): v is Watch {
  if (typeof v !== 'object' || v === null) return false;
  const w = v as Record<string, unknown>;
  return typeof w.problemId === 'number' && typeof w.since === 'number';
}
