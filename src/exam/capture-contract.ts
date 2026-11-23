/**
 * Reading an exam problem's statement (ADR-0005 '문제 본문'). Baekjoon answers scripted
 * requests for problem pages with an empty body, so the statement is read the way a user
 * reads it: the background opens the problem page in an inactive tab, the problem page
 * content script parses it (parseProblem, as for the IDE overlay) and the tab closes.
 *
 * Shared by the exam page, the background and the problem page content script: messages,
 * the `storage.session` record and the error texts. No extension APIs here.
 */

/** The page that is read: `acmicpc.net` is canonical (`www.` redirects there). */
export const capturePageUrl = (problemId: number) => `https://acmicpc.net/problem/${problemId}`;

/** How long the background tab may take before the capture is given up. */
export const CAPTURE_TIMEOUT_MS = 20_000;

export type CaptureError = 'parse' | 'timeout' | 'closed' | 'open';

/** `storage.session`, one per exam problem: `cib:capture:{examId}:{problemId}`. */
export interface CaptureRecord {
  examId: string;
  problemId: number;
  state: 'pending' | 'error';
  /** The background tab; unset for the moment before it exists. */
  tabId?: number;
  error?: CaptureError;
  startedAt: number;
}

export const CAPTURE_PREFIX = 'cib:capture:';
export const captureKey = (examId: string, problemId: number) =>
  `${CAPTURE_PREFIX}${examId}:${problemId}`;

/** Exam page → background: read this problem's statement now (the user opened it). */
export interface CaptureRequestMessage {
  type: 'cib:capture-request';
  examId: string;
  problemId: number;
}

/** Exam page → background: the capture took too long; close its tab. */
export interface CaptureCancelMessage {
  type: 'cib:capture-cancel';
  examId: string;
  problemId: number;
}

/** Problem page content script → background: is this tab one the extension opened to read? */
export interface CaptureQueryMessage {
  type: 'cib:capture-query';
}

export interface CaptureQueryResponse {
  capture: { problemId: number } | null;
}

/** Problem page content script → background: the parsed problem, or why there is none. */
export interface CaptureResultMessage {
  type: 'cib:capture-result';
  problemId: number;
  /** parseProblem()'s result. Untrusted page data: the background checks its shape. */
  problem?: unknown;
  error?: 'parse';
}

export type CaptureResponse = { ok: true } | { ok: false; reason: string };

const EXAM_ID = /^[a-z0-9]{8,24}$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isProblemNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 9_999_999;
}

function isExamTarget(v: Record<string, unknown>): boolean {
  return typeof v.examId === 'string' && EXAM_ID.test(v.examId) && isProblemNumber(v.problemId);
}

export function isCaptureRequestMessage(v: unknown): v is CaptureRequestMessage {
  return isObject(v) && v.type === 'cib:capture-request' && isExamTarget(v);
}

export function isCaptureCancelMessage(v: unknown): v is CaptureCancelMessage {
  return isObject(v) && v.type === 'cib:capture-cancel' && isExamTarget(v);
}

export function isCaptureQueryMessage(v: unknown): v is CaptureQueryMessage {
  return isObject(v) && v.type === 'cib:capture-query';
}

export function isCaptureQueryResponse(v: unknown): v is CaptureQueryResponse {
  return (
    isObject(v) &&
    (v.capture === null || (isObject(v.capture) && isProblemNumber(v.capture.problemId)))
  );
}

export function isCaptureResultMessage(v: unknown): v is CaptureResultMessage {
  return (
    isObject(v) &&
    v.type === 'cib:capture-result' &&
    isProblemNumber(v.problemId) &&
    (v.error === undefined || v.error === 'parse')
  );
}

export function isCaptureResponse(v: unknown): v is CaptureResponse {
  return isObject(v) && (v.ok === true || (v.ok === false && typeof v.reason === 'string'));
}

export function isCaptureRecord(v: unknown): v is CaptureRecord {
  return (
    isObject(v) &&
    isExamTarget(v) &&
    (v.state === 'pending' || v.state === 'error') &&
    (v.tabId === undefined || typeof v.tabId === 'number') &&
    (v.error === undefined ||
      v.error === 'parse' ||
      v.error === 'timeout' ||
      v.error === 'closed' ||
      v.error === 'open') &&
    typeof v.startedAt === 'number'
  );
}

export function describeCaptureError(error: CaptureError | undefined): string {
  switch (error) {
    case 'parse':
      return '문제 내용을 읽지 못했습니다. 백준 페이지 구조가 바뀌었을 수 있습니다.';
    case 'timeout':
      return '백준 문제 페이지를 20초 안에 읽지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
    case 'closed':
      return '문제를 읽던 백준 탭이 닫혔습니다. 다시 시도해 주세요.';
    default:
      return '백준 문제 페이지를 열지 못했습니다. 다시 시도해 주세요.';
  }
}
