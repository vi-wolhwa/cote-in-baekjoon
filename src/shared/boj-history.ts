/**
 * '백준 기록 불러오기' (ADR-0012): the IDE asks the problem page's content script, which
 * reads one page of the user's own status list for the problem from Baekjoon, only when the
 * user presses the button. The rows come from Baekjoon's page and are untrusted: both sides
 * check them, and the IDE shows them as text only.
 */
import { isResultCode, type ResultCode } from '@/boj/status';

/** One row of Baekjoon's status list, as shown under '백준 기록'. */
export interface BojHistoryRow {
  solutionId: number;
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

export type BojHistoryFailure = 'login' | 'network' | 'layout' | 'busy';

export type BojHistoryResult =
  { ok: true; handle: string; rows: BojHistoryRow[] } | { ok: false; reason: BojHistoryFailure };

/** One status page has 20 rows; anything past that is not from a real page. */
export const MAX_BOJ_ROWS = 20;

/** IDE iframe → problem page content script. */
export interface BojHistoryRequest {
  type: 'cib:boj-history-request';
  /** Matches the answer to the request. */
  nonce: string;
}

/** Problem page content script → IDE iframe. */
export interface BojHistoryAnswer {
  type: 'cib:boj-history-result';
  nonce: string;
  result: BojHistoryResult;
}

export const FAILURE_TEXT: Record<BojHistoryFailure | 'timeout' | 'standalone', string> = {
  login:
    '백준에 로그인하지 않은 상태예요. 백준에 로그인한 뒤 문제 페이지를 새로고침하고 다시 눌러 주세요.',
  network: '백준 채점 현황을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  layout: '백준 채점 현황의 모양이 달라 읽지 못했어요. 문제 신고로 알려 주세요.',
  busy: '방금 불러왔어요. 몇 초 뒤에 다시 눌러 주세요.',
  timeout: '백준이 응답하지 않아요. 잠시 뒤 다시 눌러 주세요.',
  standalone: '백준 문제 페이지에서 연 풀이 화면에서만 불러올 수 있어요.',
};

export function isBojHistoryRequest(v: unknown): v is BojHistoryRequest {
  return (
    isObject(v) &&
    v.type === 'cib:boj-history-request' &&
    typeof v.nonce === 'string' &&
    /^[a-z0-9-]{8,64}$/i.test(v.nonce)
  );
}

export function isBojHistoryAnswer(v: unknown): v is BojHistoryAnswer {
  return (
    isObject(v) &&
    v.type === 'cib:boj-history-result' &&
    typeof v.nonce === 'string' &&
    isBojHistoryResult(v.result)
  );
}

export function isBojHistoryResult(v: unknown): v is BojHistoryResult {
  if (!isObject(v)) return false;
  if (v.ok === false) {
    return (
      v.reason === 'login' || v.reason === 'network' || v.reason === 'layout' || v.reason === 'busy'
    );
  }
  return (
    v.ok === true &&
    typeof v.handle === 'string' &&
    /^[a-z0-9_]{1,20}$/.test(v.handle) &&
    Array.isArray(v.rows) &&
    v.rows.length <= MAX_BOJ_ROWS &&
    v.rows.every(isBojHistoryRow)
  );
}

export function isBojHistoryRow(v: unknown): v is BojHistoryRow {
  return (
    isObject(v) &&
    isPositiveInt(v.solutionId) &&
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

/** Baekjoon's page for a submission's source, opened in a new tab by a plain link. */
export function sourceUrl(solutionId: number): string {
  return `https://www.acmicpc.net/source/${solutionId}`;
}

// ---------------------------------------------------------------------------
// IDE side

/** How long the IDE waits for the content script's answer. */
export const ANSWER_TIMEOUT_MS = 20_000;

const BOJ_ORIGIN = /^https:\/\/(www\.)?acmicpc\.net$/;

/**
 * Asks the problem page around the IDE for the user's Baekjoon status list of the problem.
 * One request per call; the caller calls it only when the user presses the button.
 */
export function requestBojHistory(
  win: Window = window,
): Promise<BojHistoryResult | { ok: false; reason: 'timeout' | 'standalone' }> {
  if (win.parent === win) return Promise.resolve({ ok: false, reason: 'standalone' });
  const nonce = crypto.randomUUID();
  return new Promise((resolve) => {
    const done = (result: Parameters<typeof resolve>[0]) => {
      clearTimeout(timer);
      win.removeEventListener('message', onMessage);
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== win.parent || !BOJ_ORIGIN.test(event.origin)) return;
      if (isBojHistoryAnswer(event.data) && event.data.nonce === nonce) done(event.data.result);
    };
    const timer = setTimeout(() => done({ ok: false, reason: 'timeout' }), ANSWER_TIMEOUT_MS);
    win.addEventListener('message', onMessage);
    const request: BojHistoryRequest = { type: 'cib:boj-history-request', nonce };
    win.parent.postMessage(request, '*');
  });
}

// ---------------------------------------------------------------------------

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
