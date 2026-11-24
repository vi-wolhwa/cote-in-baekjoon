/**
 * Reading Baekjoon pages for the '제출 기록' tab (ADR-0012): a page of the status list
 * (`/status`), of the short-coding ranking (`/short/status`) or a submission's source
 * (`/source`). Baekjoon answers scripted requests with an empty page, so the background opens
 * the page in an inactive tab, the page's content script parses it and the background closes
 * the tab. Everything that comes back is page data: it is checked here, on both sides, and
 * shown as text only.
 */
import { isResultCode, type ResultCode } from '@/boj/status';
import { isHandle } from './handle';

/** A page of the status list: a problem's submissions, or one user's, starting at `top`. */
export interface StatusQuery {
  kind: 'status';
  problemId: number;
  /** Only this user's submissions. */
  userId?: string;
  /** Only this Baekjoon language (or language group, 1001–1005). */
  languageId?: number;
  /** Baekjoon's paging key: the page starts at this submission number. */
  top?: number;
}

/** A page (from 1) of the problem's short-coding ranking. */
export interface ShortQuery {
  kind: 'short';
  problemId: number;
  languageId?: number;
  page?: number;
}

/** A submission's source page. */
export interface SourceQuery {
  kind: 'source';
  solutionId: number;
}

export type ListQuery = StatusQuery | ShortQuery;
export type PageQuery = ListQuery | SourceQuery;

/** One row of a status or short-coding list. */
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
  /** The viewer may open the source (Baekjoon links the language to it). */
  sourceOpen?: boolean;
  /** Place in the short-coding ranking. */
  rank?: number;
}

export interface StatusPage {
  rows: StatusPageRow[];
  /** What the next (older, or lower-ranked) page starts at: `top` or a page number. */
  next?: number;
}

export interface SourcePage {
  code: string;
}

export type StatusFailure = 'open' | 'timeout' | 'closed' | 'layout' | 'denied' | 'login';

export type PageResult =
  | { ok: true; page: StatusPage }
  | { ok: true; source: SourcePage }
  | { ok: false; reason: StatusFailure };

/** One list page has 20 rows; anything past that is not from a real page. */
export const MAX_STATUS_ROWS = 20;
/** Sources are at most 64 KB on Baekjoon; anything far past that is not a real page. */
export const MAX_SOURCE_LENGTH = 512 * 1024;

/** How long the background waits for the opened page before closing it. */
export const STATUS_CAPTURE_TIMEOUT_MS = 20_000;

export const STATUS_FAILURE_TEXT: Record<StatusFailure | 'disconnected', string> = {
  open: '백준 페이지를 열지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  timeout: '백준이 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.',
  closed: '백준 페이지를 읽는 탭이 닫혔어요. 다시 시도해 주세요.',
  layout: '백준 페이지의 모양이 달라 읽지 못했어요. 문제 신고로 알려 주세요.',
  denied: '이 화면에서는 백준 페이지를 읽을 수 없어요.',
  login: '코드를 보려면 백준에 로그인해야 해요.',
  disconnected: '확장 프로그램과 연결하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
};

/** Languages offered in the list filters: Baekjoon's groups, then single languages. */
export const LANGUAGE_FILTERS: readonly { id: number; name: string }[] = [
  { id: 1001, name: 'C++' },
  { id: 1002, name: 'Java' },
  { id: 1003, name: 'Python' },
  { id: 1004, name: 'C' },
  { id: 1005, name: 'Rust' },
  { id: 84, name: 'C++17' },
  { id: 95, name: 'C++20' },
  { id: 114, name: 'C++23' },
  { id: 93, name: 'Java 11' },
  { id: 3, name: 'Java 8' },
  { id: 28, name: 'Python 3' },
  { id: 73, name: 'PyPy3' },
  { id: 0, name: 'C99' },
  { id: 75, name: 'C11' },
  { id: 17, name: 'node.js' },
  { id: 106, name: 'TypeScript' },
  { id: 69, name: 'Kotlin (JVM)' },
  { id: 74, name: 'Swift' },
  { id: 12, name: 'Go' },
  { id: 86, name: 'C#' },
  { id: 68, name: 'Ruby' },
];

/** IDE → background: read this page. */
export interface StatusPageRequest {
  type: 'cib:status-page-request';
  query: PageQuery;
}

/** Content script → background: was this tab opened to be read, and as what? */
export interface StatusCaptureQuery {
  type: 'cib:status-capture-query';
}

/** Content script → background: what the page holds. */
export interface StatusCaptureResult {
  type: 'cib:status-capture-result';
  /** Undefined when the page has nothing it can read. */
  page?: StatusPage;
  source?: SourcePage;
  /** Baekjoon sent the tab to its login page. */
  login?: boolean;
}

// acmicpc.net is the canonical host (sender.ts): www redirects there.
const ORIGIN = 'https://acmicpc.net';

export function pageUrl(query: PageQuery): string {
  if (query.kind === 'source') return `${ORIGIN}/source/${query.solutionId}`;
  if (query.kind === 'short') {
    const page = query.page ?? 1;
    const language = query.languageId ?? -1;
    if (language === -1) {
      return page === 1
        ? `${ORIGIN}/short/status/${query.problemId}`
        : `${ORIGIN}/short/status/${query.problemId}/${page}`;
    }
    return `${ORIGIN}/short/status/${query.problemId}/${language}/${page}`;
  }
  const params = new URLSearchParams({ problem_id: String(query.problemId) });
  if (query.userId !== undefined) params.set('user_id', query.userId);
  if (query.languageId !== undefined) params.set('language_id', String(query.languageId));
  if (query.top !== undefined) params.set('top', String(query.top));
  return `${ORIGIN}/status?${params.toString()}`;
}

/**
 * The query a Baekjoon URL answers, when it is one of ours. A login page answers the source
 * page it was redirected from (`/login?next=/source/…`).
 */
export function queryOfUrl(url: string): PageQuery | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!/^(www\.)?acmicpc\.net$/.test(parsed.hostname)) return undefined;
  const path = parsed.pathname;
  const p = parsed.searchParams;
  let query: PageQuery | undefined;
  if (path === '/status') {
    const q: StatusQuery = { kind: 'status', problemId: Number(p.get('problem_id')) };
    if (p.has('user_id')) q.userId = p.get('user_id') ?? '';
    if (p.has('language_id')) q.languageId = Number(p.get('language_id'));
    if (p.has('top')) q.top = Number(p.get('top'));
    query = q;
  } else if (path === '/login') {
    const next = /^\/source\/(\d{1,12})$/.exec(p.get('next') ?? '');
    if (next) query = { kind: 'source', solutionId: Number(next[1]) };
  } else {
    const source = /^\/source\/(\d{1,12})$/.exec(path);
    const short = /^\/short\/status\/(\d{1,7})(?:\/(-?\d{1,5}))?(?:\/(\d{1,7}))?$/.exec(path);
    if (source) query = { kind: 'source', solutionId: Number(source[1]) };
    else if (short) {
      const q: ShortQuery = { kind: 'short', problemId: Number(short[1]) };
      // Two numbers: all languages and a page; three: a language and a page.
      if (short[3] !== undefined) {
        q.languageId = Number(short[2]);
        q.page = Number(short[3]);
      } else if (short[2] !== undefined) {
        q.page = Number(short[2]);
      }
      query = q;
    }
  }
  return query && isPageQuery(query) ? normalize(query) : undefined;
}

/** The same query in one spelling: no default language or first page. */
function normalize(q: PageQuery): PageQuery {
  if (q.kind === 'short') {
    const { languageId, page, ...rest } = q;
    return {
      ...rest,
      ...(languageId !== undefined && languageId !== -1 ? { languageId } : {}),
      ...(page !== undefined && page !== 1 ? { page } : {}),
    };
  }
  if (q.kind === 'status' && q.languageId === -1) {
    const rest = { ...q };
    delete rest.languageId;
    return rest;
  }
  return q;
}

export function sameQuery(a: PageQuery, b: PageQuery): boolean {
  return JSON.stringify(sortKeys(normalize(a))) === JSON.stringify(sortKeys(normalize(b)));
}

function sortKeys(q: PageQuery): [string, unknown][] {
  return Object.entries(q).sort(([x], [y]) => x.localeCompare(y));
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

const isLanguageId = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= -1 && v < 10_000;
const isProblemId = (v: unknown) => isPositiveInt(v) && v < 1_000_000;

export function isPageQuery(v: unknown): v is PageQuery {
  if (!isObject(v)) return false;
  if (v.kind === 'source') return isPositiveInt(v.solutionId);
  if (v.kind === 'short') {
    return (
      isProblemId(v.problemId) &&
      (v.languageId === undefined || isLanguageId(v.languageId)) &&
      (v.page === undefined || (isPositiveInt(v.page) && v.page < 1_000_000))
    );
  }
  return (
    v.kind === 'status' &&
    isProblemId(v.problemId) &&
    (v.userId === undefined || isHandle(v.userId)) &&
    (v.languageId === undefined || isLanguageId(v.languageId)) &&
    (v.top === undefined || isPositiveInt(v.top))
  );
}

export function isStatusPageRequest(v: unknown): v is StatusPageRequest {
  return isObject(v) && v.type === 'cib:status-page-request' && isPageQuery(v.query);
}

export function isStatusCaptureQuery(v: unknown): v is StatusCaptureQuery {
  return isObject(v) && v.type === 'cib:status-capture-query';
}

export function isStatusCaptureResult(v: unknown): v is StatusCaptureResult {
  return (
    isObject(v) &&
    v.type === 'cib:status-capture-result' &&
    (v.page === undefined || isStatusPage(v.page)) &&
    (v.source === undefined || isSourcePage(v.source)) &&
    (v.login === undefined || v.login === true)
  );
}

const FAILURES: readonly unknown[] = ['open', 'timeout', 'closed', 'layout', 'denied', 'login'];

export function isPageResult(v: unknown): v is PageResult {
  if (!isObject(v)) return false;
  if (v.ok === false) return FAILURES.includes(v.reason);
  if (v.ok !== true) return false;
  return 'source' in v ? isSourcePage(v.source) : isStatusPage(v.page);
}

export function isSourcePage(v: unknown): v is SourcePage {
  return isObject(v) && typeof v.code === 'string' && v.code.length <= MAX_SOURCE_LENGTH;
}

export function isStatusPage(v: unknown): v is StatusPage {
  return (
    isObject(v) &&
    Array.isArray(v.rows) &&
    v.rows.length <= MAX_STATUS_ROWS &&
    v.rows.every(isStatusPageRow) &&
    (v.next === undefined || isPositiveInt(v.next))
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
      (typeof v.submittedAt === 'number' && Number.isFinite(v.submittedAt) && v.submittedAt > 0)) &&
    (v.sourceOpen === undefined || typeof v.sourceOpen === 'boolean') &&
    (v.rank === undefined || isPositiveInt(v.rank))
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
