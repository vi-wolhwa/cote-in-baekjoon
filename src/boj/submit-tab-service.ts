/**
 * Background side of the submission tab (ADR-0002, 2026-11-24: a background tab instead of
 * a popup window). Keeps no state in globals: the tab of each problem is a record in
 * `storage.session` (shared/submit-tab.ts).
 *
 * - The submit page opens inactive next to the asking tab; the user stays where they are.
 * - The submit page says when auto-submit handed over to the user, and when the form was
 *   sent; the status page's reports move the record to judging and done.
 * - After the final result the tab closes by itself; nothing is refocused.
 * - '결과 다시 확인' (only on the user's click) opens the user's own status list in a
 *   background tab, which the status content script reads like any status page.
 */
import { isHandle, HANDLE_KEY } from '@/shared/handle';
import {
  isSubmitTab,
  submitTabKey,
  SUBMIT_TAB_PREFIX,
  type RecheckMessage,
  type SubmitProgressMessage,
  type SubmitTab,
} from '@/shared/submit-tab';
import { watchKey } from '@/shared/submission';
import type { JudgeStatus, Watch } from './status';
import { bojPath, isExtensionPage } from './sender';

type Sender = Browser.runtime.MessageSender;

/** How long the final result stays on the tab before it closes. */
export const CLOSE_DELAY_MS = 300;
/** A recheck that found nothing gives up after this long and closes its tab. */
export const RECHECK_GIVE_UP_MS = 60_000;

async function read(problemId: number): Promise<SubmitTab | undefined> {
  const key = submitTabKey(problemId);
  const value = (await browser.storage.session.get(key))[key];
  return isSubmitTab(value) && value.problemId === problemId ? value : undefined;
}

function write(tab: SubmitTab) {
  return browser.storage.session.set({ [submitTabKey(tab.problemId)]: tab });
}

/** The submission tab record whose tab is `tabId`, if any. */
async function recordForTab(tabId: number | undefined): Promise<SubmitTab | undefined> {
  if (tabId === undefined) return undefined;
  const all = await browser.storage.session.get(null);
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(SUBMIT_TAB_PREFIX) && isSubmitTab(value) && value.tabId === tabId) {
      return value;
    }
  }
  return undefined;
}

/**
 * Opens `url` in an inactive tab next to the sender's tab, in the same window, and records
 * it for the problem. Returns the new tab's id.
 */
export async function openSubmitTab(
  problemId: number,
  url: string,
  sender: Sender,
  now: number,
  kind: SubmitTab['kind'] = 'submit',
): Promise<number> {
  const from = sender.tab;
  const tab = await browser.tabs.create({
    url,
    active: false,
    ...(from?.windowId !== undefined ? { windowId: from.windowId } : {}),
    ...(from?.index !== undefined ? { index: from.index + 1 } : {}),
    ...(from?.id !== undefined ? { openerTabId: from.id } : {}),
  });
  if (tab.id === undefined) throw new Error('no tab');
  await write({
    problemId,
    tabId: tab.id,
    ...(tab.windowId !== undefined ? { windowId: tab.windowId } : {}),
    state: kind === 'recheck' ? 'judging' : 'submitting',
    ...(kind === 'recheck' ? { sent: true } : {}),
    kind,
    since: now,
    updatedAt: now,
  });
  return tab.id;
}

/** True when the asking status page is one of our submission tabs still waiting. */
export async function isOwnSubmitTab(tabId: number | undefined): Promise<boolean> {
  const tab = await recordForTab(tabId);
  return tab !== undefined && tab.state !== 'done' && tab.state !== 'closed';
}

/** The submit page: auto-submit handed over to the user, or the form was sent. */
export async function handleSubmitProgress(
  message: SubmitProgressMessage,
  sender: Sender,
  now = Date.now(),
): Promise<{ ok: boolean }> {
  const path = bojPath(sender);
  if (path === undefined || !new RegExp(`^/submit/${message.problemId}/?$`).test(path)) {
    return { ok: false };
  }
  const tab = await read(message.problemId);
  // Only forward: a late message never takes a judging tab back.
  if (
    !tab ||
    tab.tabId !== sender.tab?.id ||
    !['submitting', 'needs-user', 'sent'].includes(tab.state)
  ) {
    return { ok: false };
  }
  if (message.state === 'sent') {
    await write({ ...tab, state: 'sent', sent: true, updatedAt: now });
  } else {
    const next: SubmitTab = { ...tab, state: 'needs-user', updatedAt: now };
    if (message.reason) next.reason = message.reason;
    await write(next);
  }
  return { ok: true };
}

/**
 * A status page reported a result. In our tab: judging, or done and the tab closes after a
 * moment. Nothing is refocused: the user never left their own tab.
 */
export async function noteJudgeReport(
  problemId: number,
  status: JudgeStatus,
  sender: Sender,
  now = Date.now(),
  delayMs = CLOSE_DELAY_MS,
): Promise<void> {
  const tab = await read(problemId);
  if (!tab || tab.tabId !== sender.tab?.id || tab.state === 'done' || tab.state === 'closed') {
    return;
  }
  const done = status === 'done';
  const next: SubmitTab = { ...tab, state: done ? 'done' : 'judging', sent: true, updatedAt: now };
  delete next.reason;
  await write(next);
  if (!done) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await browser.tabs.remove(tab.tabId).catch(() => undefined);
}

/** A tab closed: if it was a submission tab still waiting, its result was not received. */
export async function handleSubmitTabRemoved(tabId: number, now = Date.now()): Promise<void> {
  const tab = await recordForTab(tabId);
  if (!tab || tab.state === 'done' || tab.state === 'closed') return;
  await write({ ...tab, state: 'closed', updatedAt: now });
}

/** The user's own status list for a problem: by id when known, else `from_mine=1`. */
export async function recheckUrl(problemId: number): Promise<string> {
  const handle = (await browser.storage.local.get(HANDLE_KEY))[HANDLE_KEY];
  const user = isHandle(handle) ? `user_id=${handle}` : 'from_mine=1';
  return `https://acmicpc.net/status?problem_id=${problemId}&${user}`;
}

/**
 * '결과 다시 확인' (the user's click): watch the problem again from the submission time and
 * open the user's status list in a background tab; its content script reports the result
 * and the tab closes. A recheck that finds nothing closes after RECHECK_GIVE_UP_MS.
 */
export async function handleRecheck(
  message: RecheckMessage,
  sender: Sender,
  now = Date.now(),
): Promise<{ ok: boolean }> {
  if (!isExtensionPage(sender)) return { ok: false };
  const current = await read(message.problemId);
  if (current && current.state !== 'done' && current.state !== 'closed') return { ok: true };
  const watch: Watch = { problemId: message.problemId, since: Math.min(message.since, now) };
  await browser.storage.session.set({ [watchKey(message.problemId)]: watch });
  try {
    const url = await recheckUrl(message.problemId);
    const tabId = await openSubmitTab(message.problemId, url, sender, watch.since, 'recheck');
    setTimeout(() => void giveUpRecheck(message.problemId, tabId), RECHECK_GIVE_UP_MS);
  } catch {
    return { ok: false };
  }
  return { ok: true };
}

/** Closes a recheck tab that is still waiting (no result found). */
export async function giveUpRecheck(problemId: number, tabId: number, now = Date.now()) {
  const tab = await read(problemId);
  if (!tab || tab.tabId !== tabId || tab.kind !== 'recheck' || tab.state === 'done') return;
  // A report came in (still judging): the status page follows it to the end.
  if (tab.state === 'judging' && tab.updatedAt !== tab.since) return;
  if (tab.state !== 'closed') await write({ ...tab, state: 'closed', updatedAt: now });
  await browser.tabs.remove(tabId).catch(() => undefined);
}
