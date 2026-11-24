/**
 * '백준 기록 불러오기' on the problem page (ADR-0012): when the user presses the button in
 * the IDE, reads one page of their own status list for the problem,
 * `/status?problem_id={id}&user_id={아이디}`, and parses it as untrusted HTML. One request
 * per press, at most one every few seconds, never in the background.
 *
 * Row columns (public status page, 2026-11): 제출 번호, 아이디, 문제, 결과, 메모리, 시간,
 * 언어, 코드 길이, 제출한 시간. The shared cells are read by parseStatusRow (status.ts); the
 * language and code length are the 7th and 8th cells. In the language cell Baekjoon may add
 * " / 수정" links after the name for the user's own rows.
 */
import { readHandle } from '@/shared/handle';
import { MAX_BOJ_ROWS, type BojHistoryResult, type BojHistoryRow } from '@/shared/boj-history';
import { parseStatusRow } from './status';

/** A second press within this time gets 'busy' instead of another request. */
export const MIN_INTERVAL_MS = 3000;

export function parseHistoryRows(
  doc: Document,
  problemId: number,
  handle: string,
): BojHistoryRow[] {
  const rows: BojHistoryRow[] = [];
  const user = handle.toLowerCase();
  for (const tr of doc.querySelectorAll('#status-table tr[id^="solution-"]')) {
    const base = parseStatusRow(tr);
    if (!base || base.problemId !== problemId || base.username.toLowerCase() !== user) continue;
    const cells = tr.querySelectorAll(':scope > td');
    const codeLength = readCount(cells[7]);
    rows.push({
      solutionId: base.solutionId,
      resultCode: base.resultCode,
      resultText: base.resultText.slice(0, 200),
      ...(base.memoryKb !== undefined ? { memoryKb: base.memoryKb } : {}),
      ...(base.timeMs !== undefined ? { timeMs: base.timeMs } : {}),
      language: readLanguage(cells[6]),
      ...(codeLength !== undefined ? { codeLength } : {}),
      ...(base.submittedAt !== undefined ? { submittedAt: base.submittedAt } : {}),
    });
    if (rows.length === MAX_BOJ_ROWS) break;
  }
  return rows;
}

function readLanguage(cell: Element | undefined): string {
  if (!cell) return '';
  const first = cell.querySelector('a')?.textContent ?? cell.textContent ?? '';
  return (first.split(' / ')[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function readCount(cell: Element | undefined): number | undefined {
  const text = cell?.textContent?.trim();
  return text && /^\d{1,9}$/.test(text) ? Number(text) : undefined;
}

export interface HistoryFetcher {
  (url: string, init: RequestInit): Promise<Pick<Response, 'ok' | 'text'>>;
}

/**
 * Fetches and parses the logged-in user's status list for `problemId`. `doc` is the problem
 * page, whose header names the logged-in user.
 */
export async function fetchBojHistory(
  doc: Document,
  problemId: number,
  fetcher: HistoryFetcher = (url, init) => fetch(url, init),
): Promise<BojHistoryResult> {
  const handle = readHandle(doc);
  if (!handle) return { ok: false, reason: 'login' };
  const params = new URLSearchParams({ problem_id: String(problemId), user_id: handle });
  let text: string;
  try {
    const response = await fetcher(`/status?${params.toString()}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, reason: 'network' };
    text = await response.text();
  } catch {
    return { ok: false, reason: 'network' };
  }
  // An inert document: nothing in it runs or loads.
  const page = new DOMParser().parseFromString(text, 'text/html');
  if (!page.querySelector('#status-table')) return { ok: false, reason: 'layout' };
  // Logged out since the problem page loaded: the list is public, but say so.
  if (!readHandle(page)) return { ok: false, reason: 'login' };
  return { ok: true, handle, rows: parseHistoryRows(page, problemId, handle) };
}

/** Allows one request at a time and at most one per MIN_INTERVAL_MS. */
export function createHistoryGate(now: () => number = Date.now) {
  let last = -Infinity;
  let running = false;
  return async (task: () => Promise<BojHistoryResult>): Promise<BojHistoryResult> => {
    if (running || now() - last < MIN_INTERVAL_MS) return { ok: false, reason: 'busy' };
    running = true;
    last = now();
    try {
      return await task();
    } finally {
      running = false;
    }
  };
}
