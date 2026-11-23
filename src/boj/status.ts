/**
 * Reads judge results from the Baekjoon status page (`/status`) the user has open.
 * No network requests: rows come from the current document, and live updates arrive
 * through the page's own realtime connection, which we observe as DOM changes (ADR-0002).
 *
 * Row shape (public status page, 2026-11-23):
 * <tr id="solution-123">
 *   <td>123</td><td><a href="/user/name">name</a></td>
 *   <td><a href="/problem/1000" class="problem_title">1000</a></td>
 *   <td class="result"><span class="result-text result-ac" data-color="ac">맞았습니다!!</span></td>
 *   <td class="memory">12868<span class="kb-text"></span></td><td class="time">72<span class="ms-text"></span></td>
 *   ... <td><a class="real-time-update show-date" data-timestamp="1795439836">…</a></td>
 * </tr>
 */

/**
 * Result colour classes used by Baekjoon (`App.result_colors()` in its public app.min.js),
 * minus duplicates. Index order there: wait, rejudge-wait, compile, judging, ac, pe, wa, tle,
 * mle, ole, rte, ce, del, del, compile, pac, judging.
 */
export const RESULT_CODES = [
  'wait',
  'rejudge-wait',
  'compile',
  'judging',
  'ac',
  'pe',
  'wa',
  'tle',
  'mle',
  'ole',
  'rte',
  'ce',
  'del',
  'pac',
] as const;

export type ResultCode = (typeof RESULT_CODES)[number];

export type JudgeStatus = 'pending' | 'judging' | 'done';

export interface StatusRow {
  solutionId: number;
  username: string;
  problemId: number;
  resultCode: ResultCode;
  resultText: string;
  memoryKb?: number;
  timeMs?: number;
  /** Submission time from `data-timestamp`, in milliseconds since the epoch. */
  submittedAt?: number;
}

export function isResultCode(v: unknown): v is ResultCode {
  return typeof v === 'string' && (RESULT_CODES as readonly string[]).includes(v);
}

export function judgeStatusOf(code: ResultCode): JudgeStatus {
  switch (code) {
    case 'wait':
    case 'rejudge-wait':
      return 'pending';
    case 'compile':
    case 'judging':
      return 'judging';
    default:
      return 'done';
  }
}

export function parseStatusRows(doc: Document): StatusRow[] {
  const rows: StatusRow[] = [];
  for (const tr of doc.querySelectorAll('#status-table tr[id^="solution-"]')) {
    const row = parseStatusRow(tr);
    if (row) rows.push(row);
  }
  return rows;
}

export function parseStatusRow(tr: Element): StatusRow | undefined {
  const idMatch = /^solution-(\d+)$/.exec(tr.id);
  if (!idMatch) return undefined;
  const solutionId = Number(idMatch[1]);

  const userLink = tr.querySelector('a[href^="/user/"]');
  const username = userLink?.textContent?.trim() ?? '';
  const problemHref = tr.querySelector('a.problem_title')?.getAttribute('href') ?? '';
  const problemMatch = /\/problem\/(\d+)$/.exec(problemHref);
  const span = tr.querySelector('td.result span.result-text');
  if (!username || !problemMatch || !span) return undefined;

  const resultCode = readResultCode(span);
  if (!resultCode) return undefined;

  const timestamp = Number(tr.querySelector('[data-timestamp]')?.getAttribute('data-timestamp'));
  return {
    solutionId,
    username,
    problemId: Number(problemMatch[1]),
    resultCode,
    resultText: (span.textContent ?? '').replace(/\s+/g, ' ').trim(),
    memoryKb: readNumber(tr.querySelector('td.memory')),
    timeMs: readNumber(tr.querySelector('td.time')),
    submittedAt: Number.isFinite(timestamp) && timestamp > 0 ? timestamp * 1000 : undefined,
  };
}

/** `data-color` is the source of truth; the `result-{code}` class is the fallback. */
function readResultCode(span: Element): ResultCode | undefined {
  const color = span.getAttribute('data-color')?.replace(/-eng$/, '').trim();
  if (isResultCode(color)) return color;
  for (const c of span.classList) {
    const code = c.startsWith('result-') ? c.slice('result-'.length) : '';
    if (code !== 'text' && isResultCode(code)) return code;
  }
  return undefined;
}

function readNumber(cell: Element | null): number | undefined {
  const text = cell?.textContent?.trim();
  if (!text || !/^\d+$/.test(text)) return undefined;
  return Number(text);
}

/**
 * The logged-in user's id: the header's `a.username` link (as BaekjoonHub reads it), else the
 * `user_id` of a `from_mine=1` status URL, which is where Baekjoon redirects after a submit.
 */
export function findLoggedInUser(doc: Document, url: string): string | undefined {
  const fromHeader = doc.querySelector('a.username')?.textContent?.trim();
  if (fromHeader) return fromHeader;
  try {
    const params = new URL(url).searchParams;
    const userId = params.get('user_id')?.trim();
    if (params.get('from_mine') === '1' && userId) return userId;
  } catch {
    // Invalid URL: no user.
  }
  return undefined;
}

export interface Watch {
  problemId: number;
  /** When the submit page was opened, in milliseconds since the epoch. */
  since: number;
  /** A mock exam submission: the submit window covers the result (ADR-0005). */
  hideResult?: boolean;
}

/** Allowed difference between the local clock and Baekjoon's server clock. */
export const CLOCK_SKEW_MS = 2 * 60 * 1000;

/**
 * The newest row by `username` for the watched problem that was submitted after the watch
 * started. Rows without a timestamp are skipped so an older submission is never reported.
 */
export function pickLatestRow(
  rows: readonly StatusRow[],
  watch: Watch,
  username: string,
): StatusRow | undefined {
  const user = username.toLowerCase();
  let best: StatusRow | undefined;
  for (const row of rows) {
    if (row.problemId !== watch.problemId || row.username.toLowerCase() !== user) continue;
    if (row.submittedAt === undefined || row.submittedAt < watch.since - CLOCK_SKEW_MS) continue;
    if (!best || row.solutionId > best.solutionId) best = row;
  }
  return best;
}

/** The latest qualifying row per watched problem. */
export function latestRowsForWatches(
  rows: readonly StatusRow[],
  watches: readonly Watch[],
  username: string,
): StatusRow[] {
  return watches.flatMap((w) => pickLatestRow(rows, w, username) ?? []);
}

/** Identifies what the IDE would display for a row, to skip duplicate reports. */
export function rowSignature(row: StatusRow): string {
  return [row.solutionId, row.resultCode, row.resultText, row.memoryKb, row.timeMs].join('|');
}
