/**
 * The background tab a submission runs in (ADR-0002, 2026-11-24: no popup window). The user
 * stays on their tab: Baekjoon's submit page opens inactive next to it, is filled and
 * submitted, its status page reports the result, and the tab closes. The IDE and the mock
 * exam show a spinner meanwhile, with '직접 확인' to bring the tab to the front.
 *
 * `storage.session` → `cib:submit-tab:{problemId}`: the latest submission tab of a problem.
 * The service worker can stop at any time, so everything about it lives here.
 */
import type { JudgeResult } from './submission';

export const submitTabKey = (problemId: number) => `cib:submit-tab:${problemId}`;
export const SUBMIT_TAB_PREFIX = 'cib:submit-tab:';

/**
 * - submitting: the submit page is open, being filled and submitted
 * - needs-user: auto-submit stopped; the user has to look (human check, firewall, language)
 * - sent: the form was submitted; the status page comes next
 * - judging: the status page reported the submission and follows it
 * - done: the final result is in; the tab closes a moment later
 * - closed: the tab closed before the final result (user, crash)
 */
export type SubmitTabState = 'submitting' | 'needs-user' | 'sent' | 'judging' | 'done' | 'closed';

const STATES: readonly SubmitTabState[] = [
  'submitting',
  'needs-user',
  'sent',
  'judging',
  'done',
  'closed',
];

/** Why auto-submit handed over to the user. */
export type NeedsUserReason = 'check' | 'firewall' | 'language' | 'fill' | 'button' | 'cancelled';

const REASONS: readonly NeedsUserReason[] = [
  'check',
  'firewall',
  'language',
  'fill',
  'button',
  'cancelled',
];

export interface SubmitTab {
  problemId: number;
  tabId: number;
  windowId?: number;
  state: SubmitTabState;
  reason?: NeedsUserReason;
  /** The form was submitted (or the status page saw it): Baekjoon has the submission. */
  sent?: boolean;
  /** 'recheck': a status page opened by '결과 다시 확인'. */
  kind: 'submit' | 'recheck';
  /** When the submission was asked for: results before it are older submissions. */
  since: number;
  updatedAt: number;
}

export const ACTIVE_STATES: readonly SubmitTabState[] = [
  'submitting',
  'needs-user',
  'sent',
  'judging',
];

export function isActiveTab(tab: SubmitTab | undefined): boolean {
  return tab !== undefined && ACTIVE_STATES.includes(tab.state);
}

export function isSubmitTab(v: unknown): v is SubmitTab {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.problemId === 'number' &&
    typeof t.tabId === 'number' &&
    (t.windowId === undefined || typeof t.windowId === 'number') &&
    STATES.includes(t.state as SubmitTabState) &&
    (t.reason === undefined || REASONS.includes(t.reason as NeedsUserReason)) &&
    (t.sent === undefined || typeof t.sent === 'boolean') &&
    (t.kind === 'submit' || t.kind === 'recheck') &&
    typeof t.since === 'number' &&
    typeof t.updatedAt === 'number'
  );
}

/** "보안 확인", "방화벽" …: why the user has to look, for the IDE and the exam results. */
export function describeNeedsUser(reason: NeedsUserReason | undefined): string {
  switch (reason) {
    case 'check':
      return '백준이 보안 확인을 요청했어요. 직접 확인해서 제출해 주세요.';
    case 'firewall':
      return '코드에 백준 방화벽이 막을 수 있는 문자열이 있어 자동으로 제출하지 않았어요.';
    case 'language':
      return '고른 언어가 백준 언어 목록에 없어요. 언어를 추가하면 다시 제출합니다.';
    case 'cancelled':
      return '자동 제출이 취소됐어요. 직접 제출해 주세요.';
    default:
      return '자동으로 제출하지 못했어요. 직접 확인해서 제출해 주세요.';
  }
}

/** What the IDE and the exam results show for a submission. */
export type SubmitView =
  | { kind: 'idle' }
  | { kind: 'submitting'; tab: SubmitTab }
  | { kind: 'needs-user'; tab: SubmitTab }
  | { kind: 'judging'; tab?: SubmitTab; judge?: JudgeResult }
  | { kind: 'done'; judge: JudgeResult }
  | { kind: 'lost'; since: number };

/**
 * The state of the submission made at `since` (or of the latest tab when `since` is not
 * known): a final judge result after it wins; then the tab's state; a tab closed before the
 * final result means the result was not received ('lost': offer '결과 다시 확인').
 */
export function submitView(
  tab: SubmitTab | undefined,
  judge: JudgeResult | undefined,
  since: number | undefined,
): SubmitView {
  const from = since ?? tab?.since;
  if (from === undefined) return { kind: 'idle' };
  // The tab of an older submission says nothing about this one.
  const current = tab && tab.since >= from - 5_000 ? tab : undefined;
  const fresh = judge && judge.updatedAt >= from ? judge : undefined;
  if (fresh?.status === 'done') return { kind: 'done', judge: fresh };
  if (current?.state === 'needs-user') return { kind: 'needs-user', tab: current };
  if (current?.state === 'submitting' || current?.state === 'sent') {
    return fresh
      ? { kind: 'judging', tab: current, judge: fresh }
      : { kind: 'submitting', tab: current };
  }
  if (current?.state === 'judging' || current?.state === 'done') {
    return { kind: 'judging', tab: current, ...(fresh ? { judge: fresh } : {}) };
  }
  if (!current && fresh) return { kind: 'judging', judge: fresh };
  return { kind: 'lost', since: from };
}

/** Calls `onTab` with the problem's submission tab now and whenever it changes. */
export function watchSubmitTab(
  problemId: number,
  onTab: (tab: SubmitTab | undefined) => void,
): () => void {
  const key = submitTabKey(problemId);
  let live = true;
  const deliver = (value: unknown) => {
    if (live) onTab(isSubmitTab(value) && value.problemId === problemId ? value : undefined);
  };
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'session' && key in changes) deliver(changes[key]?.newValue);
  };
  browser.storage.onChanged.addListener(listener);
  browser.storage.session
    .get(key)
    .then((items) => deliver(items[key]))
    .catch(() => undefined);
  return () => {
    live = false;
    browser.storage.onChanged.removeListener(listener);
  };
}

/** '직접 확인': brings the problem's submission tab (and its window) to the front. */
export async function focusSubmitTab(problemId: number): Promise<boolean> {
  const key = submitTabKey(problemId);
  const tab = (await browser.storage.session.get(key))[key];
  if (!isSubmitTab(tab) || !isActiveTab(tab)) return false;
  try {
    await browser.tabs.update(tab.tabId, { active: true });
    if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
    return true;
  } catch {
    return false;
  }
}

/** Extension page → background: '결과 다시 확인' after the tab closed before the result. */
export interface RecheckMessage {
  type: 'cib:recheck';
  problemId: number;
  /** When the submission was asked for. */
  since: number;
}

export function isRecheckMessage(v: unknown): v is RecheckMessage {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    m.type === 'cib:recheck' &&
    typeof m.problemId === 'number' &&
    Number.isInteger(m.problemId) &&
    m.problemId >= 1 &&
    m.problemId <= 9_999_999 &&
    typeof m.since === 'number' &&
    Number.isFinite(m.since) &&
    m.since > 0
  );
}

export async function requestRecheck(problemId: number, since: number): Promise<boolean> {
  const message: RecheckMessage = { type: 'cib:recheck', problemId, since };
  const reply: unknown = await browser.runtime.sendMessage(message).catch(() => undefined);
  return (reply as { ok?: unknown } | undefined)?.ok === true;
}

/** Submit page content script → background: auto-submit handed over, or the form was sent. */
export interface SubmitProgressMessage {
  type: 'cib:submit-progress';
  problemId: number;
  state: 'needs-user' | 'sent';
  reason?: NeedsUserReason;
}

export function isSubmitProgressMessage(v: unknown): v is SubmitProgressMessage {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    m.type === 'cib:submit-progress' &&
    typeof m.problemId === 'number' &&
    Number.isInteger(m.problemId) &&
    m.problemId >= 1 &&
    (m.state === 'needs-user' || m.state === 'sent') &&
    (m.reason === undefined || REASONS.includes(m.reason as NeedsUserReason))
  );
}
