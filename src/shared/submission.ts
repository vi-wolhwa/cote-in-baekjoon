/**
 * Submission contract between the IDE, the background service worker and the Baekjoon
 * content scripts (ADR-0002, PRD 8.1).
 *
 * The extension never submits: it opens the official submit page, fills the language and
 * code, and the user presses Baekjoon's submit button. Judge results are read from the
 * status page the user has open and stored under `judge:{problemId}` in `storage.local`.
 */
import { isSubmitLanguage, type SubmitLanguage } from '@/boj/languages';
import { MAX_CODE_LENGTH } from '@/boj/submit-fill';
import {
  isResultCode,
  type JudgeStatus,
  type ResultCode,
  type StatusRow,
  type Watch,
} from '@/boj/status';

export type { JudgeStatus, ResultCode, SubmitLanguage, Watch };

export interface JudgeResult {
  problemId: number;
  solutionId?: number;
  status: JudgeStatus;
  /** Text Baekjoon shows, e.g. "맞았습니다!!", "틀렸습니다", "채점 중 (35%)". */
  resultText: string;
  /** Baekjoon result colour class, e.g. 'ac', 'wa', 'tle', 'judging'. */
  resultCode: ResultCode;
  memoryKb?: number;
  timeMs?: number;
  /** When the extension last saw this result change, in milliseconds since the epoch. */
  updatedAt: number;
}

export interface SubmitInput {
  problemId: number;
  language: SubmitLanguage;
  code: string;
  /** Press Baekjoon's submit button after filling (#41, the user opted in). */
  autoSubmit?: boolean;
}

export type SubmitResponse = { ok: true } | { ok: false; reason: string };

export { MAX_CODE_LENGTH };

// ---------------------------------------------------------------------------
// Runtime messages

/** IDE → background. */
export interface SubmitRequestMessage extends SubmitInput {
  type: 'cib:submit-request';
}

/** Submit page content script → background. */
export interface PendingQueryMessage {
  type: 'cib:pending-query';
  problemId: number;
}

export interface PendingSubmission {
  problemId: number;
  /** Baekjoon language id (the language `<option>` value). */
  languageId: number;
  languageName: string;
  code: string;
  autoSubmit?: boolean;
}

export interface PendingQueryResponse {
  pending: PendingSubmission | null;
}

/** Status page content script → background. */
export interface WatchQueryMessage {
  type: 'cib:watch-query';
}

export interface WatchQueryResponse {
  watches: Watch[];
}

/** Status page content script → background. */
export interface JudgeReportMessage {
  type: 'cib:judge-report';
  row: StatusRow;
}

export function isSubmitRequestMessage(v: unknown): v is SubmitRequestMessage {
  return (
    isObject(v) &&
    v.type === 'cib:submit-request' &&
    isProblemId(v.problemId) &&
    isSubmitLanguage(v.language) &&
    typeof v.code === 'string' &&
    v.code.length > 0 &&
    v.code.length <= MAX_CODE_LENGTH &&
    (v.autoSubmit === undefined || typeof v.autoSubmit === 'boolean')
  );
}

export function isSubmitResponse(v: unknown): v is SubmitResponse {
  if (!isObject(v)) return false;
  return v.ok === true || (v.ok === false && typeof v.reason === 'string');
}

export function isPendingQueryMessage(v: unknown): v is PendingQueryMessage {
  return isObject(v) && v.type === 'cib:pending-query' && isProblemId(v.problemId);
}

export function isPendingSubmission(v: unknown): v is PendingSubmission {
  return (
    isObject(v) &&
    isProblemId(v.problemId) &&
    Number.isInteger(v.languageId) &&
    typeof v.languageName === 'string' &&
    typeof v.code === 'string' &&
    v.code.length <= MAX_CODE_LENGTH &&
    (v.autoSubmit === undefined || typeof v.autoSubmit === 'boolean')
  );
}

export function isPendingQueryResponse(v: unknown): v is PendingQueryResponse {
  return isObject(v) && (v.pending === null || isPendingSubmission(v.pending));
}

export function isWatchQueryMessage(v: unknown): v is WatchQueryMessage {
  return isObject(v) && v.type === 'cib:watch-query';
}

export function isWatchQueryResponse(v: unknown): v is WatchQueryResponse {
  return (
    isObject(v) &&
    Array.isArray(v.watches) &&
    v.watches.every((w) => isObject(w) && isProblemId(w.problemId) && isTimestamp(w.since))
  );
}

export function isJudgeReportMessage(v: unknown): v is JudgeReportMessage {
  return isObject(v) && v.type === 'cib:judge-report' && isStatusRow(v.row);
}

export function isStatusRow(v: unknown): v is StatusRow {
  return (
    isObject(v) &&
    isPositiveInt(v.solutionId) &&
    typeof v.username === 'string' &&
    isProblemId(v.problemId) &&
    isResultCode(v.resultCode) &&
    typeof v.resultText === 'string' &&
    v.resultText.length <= 200 &&
    isOptionalCount(v.memoryKb) &&
    isOptionalCount(v.timeMs) &&
    (v.submittedAt === undefined || isTimestamp(v.submittedAt))
  );
}

export function isJudgeResult(v: unknown): v is JudgeResult {
  return (
    isObject(v) &&
    isProblemId(v.problemId) &&
    (v.solutionId === undefined || isPositiveInt(v.solutionId)) &&
    (v.status === 'pending' || v.status === 'judging' || v.status === 'done') &&
    typeof v.resultText === 'string' &&
    isResultCode(v.resultCode) &&
    isOptionalCount(v.memoryKb) &&
    isOptionalCount(v.timeMs) &&
    isTimestamp(v.updatedAt)
  );
}

// ---------------------------------------------------------------------------
// Storage keys

/** `storage.session`: the code waiting to be filled into the submit page. */
export const pendingKey = (problemId: number) => `cib:pending:${problemId}`;
/** `storage.session`: a problem whose judge result the status page should report. */
export const watchKey = (problemId: number) => `cib:watch:${problemId}`;
/** `storage.local`: the latest judge result for a problem. */
export const judgeKey = (problemId: number) => `judge:${problemId}`;
/** `storage.session`: the popup window opened for submitting a problem (#35). */
export const submitWindowKey = (problemId: number) => `cib:submit-window:${problemId}`;

export type SubmitWindowState = 'open' | 'done' | 'closed';

export interface SubmitWindow {
  problemId: number;
  windowId: number;
  /** The tab and window to bring back to the front after judging (the IDE's tab). */
  returnTabId?: number;
  returnWindowId?: number;
  state: SubmitWindowState;
  updatedAt: number;
}

export function isSubmitWindow(v: unknown): v is SubmitWindow {
  if (typeof v !== 'object' || v === null) return false;
  const w = v as Record<string, unknown>;
  return (
    typeof w.problemId === 'number' &&
    typeof w.windowId === 'number' &&
    (w.returnTabId === undefined || typeof w.returnTabId === 'number') &&
    (w.returnWindowId === undefined || typeof w.returnWindowId === 'number') &&
    (w.state === 'open' || w.state === 'done' || w.state === 'closed') &&
    typeof w.updatedAt === 'number'
  );
}

/** Calls `onChange` when the submit window for `problemId` changes state. */
export function watchSubmitWindow(
  problemId: number,
  onChange: (state: SubmitWindowState) => void,
): () => void {
  const key = submitWindowKey(problemId);
  const listener = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
    const next = changes[key]?.newValue;
    if (area === 'session' && isSubmitWindow(next)) onChange(next.state);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

// ---------------------------------------------------------------------------
// IDE API

/**
 * Asks the background to open Baekjoon's submit page for `problemId` in a new tab next to
 * the current one and fill it with `code`. The user still presses Baekjoon's submit button.
 */
export async function requestSubmit(input: SubmitInput): Promise<SubmitResponse> {
  const message: SubmitRequestMessage = { type: 'cib:submit-request', ...input };
  if (!isSubmitRequestMessage(message)) {
    return { ok: false, reason: '제출할 코드가 비어 있거나 너무 깁니다.' };
  }
  try {
    const response: unknown = await browser.runtime.sendMessage(message);
    return isSubmitResponse(response)
      ? response
      : { ok: false, reason: '확장 프로그램이 응답하지 않습니다. 페이지를 새로고침해 주세요.' };
  } catch {
    return {
      ok: false,
      reason: '확장 프로그램과 연결하지 못했습니다. 페이지를 새로고침해 주세요.',
    };
  }
}

/**
 * Calls `onResult` with the latest stored judge result for `problemId` (if any) and again
 * whenever the status page reports a change. Returns a function that stops watching.
 */
export function watchJudgeResult(
  problemId: number,
  onResult: (result: JudgeResult) => void,
): () => void {
  const key = judgeKey(problemId);
  let active = true;
  let lastUpdatedAt = -1;

  const deliver = (value: unknown) => {
    if (!active || !isJudgeResult(value) || value.problemId !== problemId) return;
    if (value.updatedAt < lastUpdatedAt) return;
    lastUpdatedAt = value.updatedAt;
    onResult(value);
  };

  const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName === 'local' && key in changes) deliver(changes[key]?.newValue);
  };

  browser.storage.onChanged.addListener(listener);
  browser.storage.local
    .get(key)
    .then((items) => deliver(items[key]))
    .catch(() => {
      // Storage unavailable: live updates still arrive through onChanged.
    });

  return () => {
    active = false;
    browser.storage.onChanged.removeListener(listener);
  };
}

// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

function isProblemId(v: unknown): v is number {
  return isPositiveInt(v) && v < 10_000_000;
}

function isTimestamp(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function isOptionalCount(v: unknown): boolean {
  return v === undefined || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
}
