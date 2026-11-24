/**
 * Reading one page of Baekjoon's status list (`/status?problem_id=…[&user_id=…][&top=…]`) for
 * the '제출 기록' tab (ADR-0012, amended 2026-11-25). Baekjoon answers scripted requests with
 * an empty page, so the background opens the page in an inactive tab, the status page's
 * content script parses it and the background closes the tab. Everything that comes back
 * is page data: it is checked here, on both sides, and shown as text only.
 */
import { isResultCode, type ResultCode } from '@/boj/status';
import { isHandle } from './handle';

/** Which page: all submissions of a problem, or one user's, starting at `top`. */
export interface StatusQuery {
  problemId: number;
  /** Only this user's submissions. */
  userId?: string;
  /** Baekjoon's paging key: the page starts at this submission number. */
  top?: number;
}

/** One row of Baekjoon's status list. */
export interface StatusPageRow {
  solutionId: number;
  username: string;
  resultCode: ResultCode;
  resultText: string;
  memoryKb?: number;
  timeMs?: number;
  /** Baekjoon's language name, e.g. "C++17". */
  language: string;
  /** Source length in bytes. */
  codeLength?: number;
  /** Milliseconds since the epoch. */
  submittedAt?: number;
}

export interface StatusPage {
  rows: StatusPageRow[];
  /** `top` of the newer page ('이전 페이지'), if any. */
  prevTop?: number;
  /** `top` of the older page ('다음 페이지'), if any. */
  nextTop?: number;
}

export type StatusFailure = 'open' | 'timeout' | 'closed' | 'layout' | 'denied';

export type StatusPageResult =
  { ok: true; page: StatusPage } | { ok: false; reason: StatusFailure };

/** One status page has 20 rows; anything past that is not from a real page. */
export const MAX_STATUS_ROWS = 20;

/** How long the background waits for the opened page before closing it. */
export const STATUS_CAPTURE_TIMEOUT_MS = 20_000;

export const STATUS_FAILURE_TEXT: Record<StatusFailure | 'disconnected', string> = {
  open: '백준 채점 현황을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  timeout: '백준이 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.',
  closed: '채점 현황을 읽는 탭이 닫혔어요. 다시 시도해 주세요.',
  layout: '백준 채점 현황의 모양이 달라 읽지 못했어요. 문제 신고로 알려 주세요.',
  denied: '이 화면에서는 백준 채점 현황을 읽을 수 없어요.',
  disconnected: '확장 프로그램과 연결하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
};

/** IDE → background: read this status page. */
export interface StatusPageRequest {
  type: 'cib:status-page-request';
  query: StatusQuery;
}

/** Status page content script → background: was this tab opened to be read? */
export interface StatusCaptureQuery {
  type: 'cib:status-capture-query';
}

/** Status page content script → background: what the page holds. */
export interface StatusCaptureResult {
  type: 'cib:status-capture-result';
  /** Undefined when the page has no status table it can read. */
  page?: StatusPage;
}

export function statusPageUrl(query: StatusQuery): string {
  const params = new URLSearchParams({ problem_id: String(query.problemId) });
  if (query.userId !== undefined) params.set('user_id', query.userId);
  if (query.top !== undefined) params.set('top', String(query.top));
  // acmicpc.net is the canonical host (sender.ts): www redirects there.
  return `https://acmicpc.net/status?${params.toString()}`;
}

/** The query a status page URL asks for, when it is one of ours. */
export function queryOfUrl(url: string): StatusQuery | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!/^(www\.)?acmicpc\.net$/.test(parsed.hostname) || parsed.pathname !== '/status') {
    return undefined;
  }
  const p = parsed.searchParams;
  const problemId = Number(p.get('problem_id'));
  const userId = p.get('user_id') ?? undefined;
  const top = p.has('top') ? Number(p.get('top')) : undefined;
  const query: StatusQuery = { problemId };
  if (userId !== undefined) query.userId = userId;
  if (top !== undefined) query.top = top;
  return isStatusQuery(query) ? query : undefined;
}

export function sameQuery(a: StatusQuery, b: StatusQuery): boolean {
  return a.problemId === b.problemId && a.userId === b.userId && a.top === b.top;
}

/** Baekjoon's page for a submission's source, opened in a new tab by a plain link. */
export function sourceUrl(solutionId: number): string {
  return `https://www.acmicpc.net/source/${solutionId}`;
}

/** Baekjoon's page of a user, opened in a new tab by a plain link. */
export function userUrl(username: string): string {
  return `https://www.acmicpc.net/user/${encodeURIComponent(username)}`;
}

// ---------------------------------------------------------------------------
// Checks

export function isStatusQuery(v: unknown): v is StatusQuery {
  return (
    isObject(v) &&
    isPositiveInt(v.problemId) &&
    v.problemId < 1_000_000 &&
    (v.userId === undefined || isHandle(v.userId)) &&
    (v.top === undefined || isPositiveInt(v.top))
  );
}

export function isStatusPageRequest(v: unknown): v is StatusPageRequest {
  return isObject(v) && v.type === 'cib:status-page-request' && isStatusQuery(v.query);
}

export function isStatusCaptureQuery(v: unknown): v is StatusCaptureQuery {
  return isObject(v) && v.type === 'cib:status-capture-query';
}

export function isStatusCaptureResult(v: unknown): v is StatusCaptureResult {
  return (
    isObject(v) &&
    v.type === 'cib:status-capture-result' &&
    (v.page === undefined || isStatusPage(v.page))
  );
}

export function isStatusPageResult(v: unknown): v is StatusPageResult {
  if (!isObject(v)) return false;
  if (v.ok === false) {
    return (
      v.reason === 'open' ||
      v.reason === 'timeout' ||
      v.reason === 'closed' ||
      v.reason === 'layout' ||
      v.reason === 'denied'
    );
  }
  return v.ok === true && isStatusPage(v.page);
}

export function isStatusPage(v: unknown): v is StatusPage {
  return (
    isObject(v) &&
    Array.isArray(v.rows) &&
    v.rows.length <= MAX_STATUS_ROWS &&
    v.rows.every(isStatusPageRow) &&
    (v.prevTop === undefined || isPositiveInt(v.prevTop)) &&
    (v.nextTop === undefined || isPositiveInt(v.nextTop))
  );
}

export function isStatusPageRow(v: unknown): v is StatusPageRow {
  return (
    isObject(v) &&
    isPositiveInt(v.solutionId) &&
    typeof v.username === 'string' &&
    /^[A-Za-z0-9_]{1,20}$/.test(v.username) &&
    isResultCode(v.resultCode) &&
    isShortText(v.resultText, 200) &&
    isOptionalCount(v.memoryKb) &&
    isOptionalCount(v.timeMs) &&
    isShortText(v.language, 40) &&
    isOptionalCount(v.codeLength) &&
    (v.submittedAt === undefined ||
      (typeof v.submittedAt === 'number' && Number.isFinite(v.submittedAt) && v.submittedAt > 0))
  );
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

function isOptionalCount(v: unknown): boolean {
  return v === undefined || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
}

function isShortText(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}
