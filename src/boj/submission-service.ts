/**
 * Background side of the submission flow (ADR-0002). Runs in the service worker, keeps no
 * state in globals, and sends no requests to Baekjoon: it only opens the official submit
 * page for the user and relays data between extension pages and Baekjoon content scripts.
 */
import { BOJ_LANGUAGES } from '@/boj/languages';
import { CLOCK_SKEW_MS, judgeStatusOf, type Watch } from '@/boj/status';
import {
  isJudgeResult,
  isSubmitWindow,
  judgeKey,
  pendingKey,
  submitWindowKey,
  watchKey,
  type SubmitWindow,
  type JudgeReportMessage,
  type JudgeResult,
  type PendingQueryMessage,
  type PendingQueryResponse,
  type PendingSubmission,
  type SubmitRequestMessage,
  type SubmitResponse,
  type WatchQueryResponse,
} from '@/shared/submission';

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

const BOJ_PAGE = /^https:\/\/(?:www\.)?acmicpc\.net(\/[^?#]*)?/;

/** `acmicpc.net` is the canonical host: `www.acmicpc.net` redirects there. */
export function submitUrl(problemId: number): string {
  return `https://acmicpc.net/submit/${problemId}`;
}

/** The Baekjoon path (`/submit/1000`, `/status`) a content script message came from. */
export function bojPath(sender: Sender): string | undefined {
  if (sender.id !== browser.runtime.id || !sender.tab || !sender.url) return undefined;
  const m = BOJ_PAGE.exec(sender.url);
  return m ? (m[1] ?? '/') : undefined;
}

/** True for a page of this extension (the IDE frame), not a content script. */
export function isExtensionPage(sender: Sender): boolean {
  if (sender.id !== browser.runtime.id || !sender.url) return false;
  try {
    return /^(chrome|moz)-extension:$/.test(new URL(sender.url).protocol);
  } catch {
    return false;
  }
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
    createdAt: now,
  };
  const watch: Watch = { problemId: message.problemId, since: now };
  // Store first so the new tab can never ask before the code is there.
  await browser.storage.session.set({
    [pendingKey(message.problemId)]: pending,
    [watchKey(message.problemId)]: watch,
  });

  try {
    const tabId = await openSubmitWindow(message.problemId, sender, now);
    if (tabId !== undefined) {
      await browser.storage.session.set({
        [pendingKey(message.problemId)]: { ...pending, tabId },
      });
    }
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
  const { problemId, languageId, languageName, code } = stored;
  return { pending: { problemId, languageId, languageName, code } };
}

export async function handleWatchQuery(
  sender: Sender,
  now = Date.now(),
): Promise<WatchQueryResponse> {
  if (!isStatusPath(bojPath(sender))) return { watches: [] };
  await removeExpired(now);
  return { watches: await activeWatches(now) };
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
  if (status === 'done') await finishSubmitWindow(row.problemId, sender, now);
  return { ok: true };
}

/** Size of the submit popup; it sits over the right side (editor) of the IDE window. */
const POPUP_WIDTH = 760;
const POPUP_HEIGHT = 860;
/** How long the final result stays visible in the popup before it closes. */
export const CLOSE_DELAY_MS = 1500;

/**
 * Opens the official submit page in a small popup window over the IDE, so the user presses
 * Baekjoon's submit button and comes straight back (#35). Falls back to a tab where popup
 * windows are not available. Returns the id of the tab showing the submit page.
 */
export async function openSubmitWindow(
  problemId: number,
  sender: Sender,
  now = Date.now(),
): Promise<number | undefined> {
  const url = submitUrl(problemId);
  if (!browser.windows?.create) {
    const tab = await browser.tabs.create({ url, active: true });
    return tab.id;
  }
  const bounds =
    sender.tab?.windowId !== undefined
      ? await browser.windows.get(sender.tab.windowId).catch(() => undefined)
      : undefined;
  const width = POPUP_WIDTH;
  const height = Math.min(POPUP_HEIGHT, bounds?.height ?? POPUP_HEIGHT);
  const position =
    bounds?.left !== undefined && bounds.top !== undefined && bounds.width !== undefined
      ? { left: bounds.left + Math.max(0, bounds.width - width - 24), top: bounds.top + 80 }
      : {};
  // Chrome rejects bounds it considers off-screen; retry without a position, then use a tab.
  const win =
    (await browser.windows
      .create({ url, type: 'popup', focused: true, width, height, ...position })
      .catch(() => undefined)) ??
    (await browser.windows.create({ url, type: 'popup', focused: true }).catch(() => undefined));
  if (win?.id === undefined) {
    const tab = await browser.tabs.create({
      url,
      active: true,
      ...(sender.tab ? { index: sender.tab.index + 1, openerTabId: sender.tab.id } : {}),
    });
    return tab.id;
  }
  const record: SubmitWindow = {
    problemId,
    windowId: win.id,
    returnTabId: sender.tab?.id,
    returnWindowId: sender.tab?.windowId,
    state: 'open',
    updatedAt: now,
  };
  await browser.storage.session.set({ [submitWindowKey(problemId)]: record });
  return win.tabs?.[0]?.id;
}

/**
 * Judging finished in our popup: let the user see the result for a moment, close the popup
 * and bring the IDE back to the front. Results from other tabs or windows change nothing.
 */
export async function finishSubmitWindow(
  problemId: number,
  sender: Sender,
  now = Date.now(),
  delayMs = CLOSE_DELAY_MS,
): Promise<void> {
  const key = submitWindowKey(problemId);
  const record = (await browser.storage.session.get(key))[key];
  if (!isSubmitWindow(record) || record.state !== 'open') return;
  if (sender.tab?.windowId !== record.windowId) return;

  await browser.storage.session.set({ [key]: { ...record, state: 'done', updatedAt: now } });
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await browser.windows.remove(record.windowId).catch(() => undefined);
  if (record.returnWindowId !== undefined) {
    await browser.windows.update(record.returnWindowId, { focused: true }).catch(() => undefined);
  }
  if (record.returnTabId !== undefined) {
    await browser.tabs.update(record.returnTabId, { active: true }).catch(() => undefined);
  }
}

/** The user closed a submit popup before judging finished. */
export async function handleWindowRemoved(windowId: number, now = Date.now()): Promise<void> {
  const all = await browser.storage.session.get(null);
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('cib:submit-window:') || !isSubmitWindow(value)) continue;
    if (value.windowId !== windowId || value.state !== 'open') continue;
    await browser.storage.session.set({ [key]: { ...value, state: 'closed', updatedAt: now } });
  }
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
    (p.tabId === undefined || typeof p.tabId === 'number')
  );
}

function isWatch(v: unknown): v is Watch {
  if (typeof v !== 'object' || v === null) return false;
  const w = v as Record<string, unknown>;
  return typeof w.problemId === 'number' && typeof w.since === 'number';
}
