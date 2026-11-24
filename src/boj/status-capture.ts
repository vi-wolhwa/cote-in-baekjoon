/**
 * Background side of reading a Baekjoon page for the '제출 기록' tab (ADR-0012): a status
 * list, short-coding ranking or source page. Baekjoon answers scripted requests with an empty
 * page, so the page is opened in an inactive tab next to the problem, its content script
 * parses it and the tab is closed.
 *
 * - Only pages of this extension (the IDE) may ask, and only for those pages.
 * - One page at a time, at least MIN_GAP_MS apart; later requests wait their turn.
 * - Only the tab opened for the request, on that page (or the login page Baekjoon sent it
 *   to), may answer.
 * - A page that does not answer in STATUS_CAPTURE_TIMEOUT_MS is given up and closed.
 *
 * The state lives in this worker only: a request lasts seconds and the IDE is waiting on
 * the open message channel. If the worker stops, the IDE gets no answer and offers a retry.
 */
import {
  STATUS_CAPTURE_TIMEOUT_MS,
  queryOfUrl,
  sameQuery,
  pageUrl,
  type StatusCaptureResult,
  type StatusPageRequest,
  type PageResult,
  type PageQuery,
} from '@/shared/status-page';
import { bojPath, isExtensionPage } from './sender';

type Sender = Browser.runtime.MessageSender;

/** Least time between two page loads, to stay well under a person's pace. */
export const MIN_GAP_MS = 1000;

interface Pending {
  query: PageQuery;
  tabId?: number;
  finish: (result: PageResult) => void;
}

let pending: Pending | undefined;
let queue: Promise<unknown> = Promise.resolve();
let lastEnd = -Infinity;

export async function handleStatusPageRequest(
  message: StatusPageRequest,
  sender: Sender,
): Promise<PageResult> {
  if (!isExtensionPage(sender)) return { ok: false, reason: 'denied' };
  const run = queue.then(() => capture(message.query, sender));
  queue = run.catch(() => undefined);
  return run;
}

async function capture(query: PageQuery, sender: Sender): Promise<PageResult> {
  const wait = lastEnd + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const result = await new Promise<PageResult>((resolve) => {
    const entry: Pending = {
      query,
      finish: (r) => {
        if (pending !== entry) return;
        pending = undefined;
        clearTimeout(timer);
        if (entry.tabId !== undefined) browser.tabs.remove(entry.tabId).catch(() => {});
        resolve(r);
      },
    };
    pending = entry;
    const timer = setTimeout(
      () => entry.finish({ ok: false, reason: 'timeout' }),
      STATUS_CAPTURE_TIMEOUT_MS,
    );
    const from = sender.tab;
    // Inactive, next to the problem: the user stays where they are.
    browser.tabs
      .create({
        url: pageUrl(query),
        active: false,
        ...(from?.windowId !== undefined ? { windowId: from.windowId } : {}),
        ...(from?.index !== undefined ? { index: from.index + 1 } : {}),
        ...(from?.id !== undefined ? { openerTabId: from.id } : {}),
      })
      .then(
        (tab) => {
          if (tab.id === undefined) return entry.finish({ ok: false, reason: 'open' });
          entry.tabId = tab.id;
          // Answered or given up before the tab existed: it is not needed any more.
          if (pending !== entry) browser.tabs.remove(tab.id).catch(() => {});
        },
        () => entry.finish({ ok: false, reason: 'open' }),
      );
  });
  lastEnd = Date.now();
  return result;
}

/** The pending request whose tab sent this message from its status page. */
function pendingFor(sender: Sender): Pending | undefined {
  const tabId = sender.tab?.id;
  if (!pending || tabId === undefined || pending.tabId !== tabId) return undefined;
  // queryOfUrl only knows the pages this reads (and the login page of a source).
  if (bojPath(sender) === undefined || !sender.url) return undefined;
  const query = queryOfUrl(sender.url);
  return query && sameQuery(query, pending.query) ? pending : undefined;
}

/** The content script asks whether its tab was opened to be read. */
export async function handleStatusCaptureQuery(sender: Sender): Promise<{ capture: boolean }> {
  return { capture: pendingFor(sender) !== undefined };
}

/** The parsed page from the opened tab; the tab is closed. */
export async function handleStatusCaptureResult(
  message: StatusCaptureResult,
  sender: Sender,
): Promise<{ ok: boolean }> {
  const entry = pendingFor(sender);
  if (!entry) return { ok: false };
  entry.finish(resultOf(message, entry.query));
  return { ok: true };
}

/** The answer for `query`: only the kind of content it asked for counts. */
function resultOf(message: StatusCaptureResult, query: PageQuery): PageResult {
  if (message.login) return { ok: false, reason: 'login' };
  if (query.kind === 'source') {
    return message.source ? { ok: true, source: message.source } : { ok: false, reason: 'layout' };
  }
  return message.page ? { ok: true, page: message.page } : { ok: false, reason: 'layout' };
}

/** The user (or anything else) closed the tab before it was read. */
export function handleStatusTabRemoved(tabId: number): void {
  if (pending?.tabId === tabId) pending.finish({ ok: false, reason: 'closed' });
}

/** For tests: forgets the state of earlier requests. */
export function resetStatusCapture(): void {
  pending = undefined;
  queue = Promise.resolve();
  lastEnd = -Infinity;
}
