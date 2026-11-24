/**
 * Parses one page of Baekjoon's status list for the '제출 기록' tab (ADR-0012). The page is
 * untrusted: values are read as text, cut to length and checked again by the receiver.
 *
 * Columns (status page, 2026-11-25): 제출 번호, 아이디, 문제, 결과, 메모리, 시간, 채점 서버,
 * 언어, 코드 길이, 제출한 시간. Baekjoon added 채점 서버 in 2026-11, so the language and code
 * length cells are found by their header names, not by position. The other values come from
 * the cell classes parseStatusRow reads (status.ts).
 */
import { MAX_STATUS_ROWS, type StatusPage, type StatusPageRow } from '@/shared/status-page';
import { parseStatusRow } from './status';

/**
 * The page's rows (of the query's problem and user only) and paging links, or undefined when it
 * has no status table to read.
 */
export function parseStatusPage(
  doc: Document,
  only: { problemId?: number; userId?: string } = {},
): StatusPage | undefined {
  const user = only.userId?.toLowerCase();
  const table = doc.querySelector('#status-table');
  if (!table) return undefined;
  const headers = [...table.querySelectorAll('tr th')].map((th) =>
    (th.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
  const languageAt = headers.indexOf('언어');
  const lengthAt = headers.indexOf('코드 길이');
  if (languageAt < 0) return undefined;

  const rows: StatusPageRow[] = [];
  for (const tr of table.querySelectorAll('tr[id^="solution-"]')) {
    const base = parseStatusRow(tr);
    if (!base) continue;
    if (only.problemId !== undefined && base.problemId !== only.problemId) continue;
    if (user !== undefined && base.username.toLowerCase() !== user) continue;
    const cells = tr.querySelectorAll(':scope > td');
    const codeLength = lengthAt < 0 ? undefined : readCount(cells[lengthAt]);
    rows.push({
      solutionId: base.solutionId,
      username: base.username.slice(0, 20),
      resultCode: base.resultCode,
      resultText: base.resultText.slice(0, 200),
      ...(base.memoryKb !== undefined ? { memoryKb: base.memoryKb } : {}),
      ...(base.timeMs !== undefined ? { timeMs: base.timeMs } : {}),
      language: readLanguage(cells[languageAt]),
      ...(codeLength !== undefined ? { codeLength } : {}),
      ...(base.submittedAt !== undefined ? { submittedAt: base.submittedAt } : {}),
    });
    if (rows.length === MAX_STATUS_ROWS) break;
  }
  const prevTop = topOf(doc.querySelector('#prev_page'));
  const nextTop = topOf(doc.querySelector('#next_page'));
  return {
    rows,
    ...(prevTop !== undefined ? { prevTop } : {}),
    ...(nextTop !== undefined ? { nextTop } : {}),
  };
}

/** The language name; Baekjoon may add " / 수정" links after it on the user's own rows. */
function readLanguage(cell: Element | undefined): string {
  if (!cell) return '';
  const first = cell.querySelector('a')?.textContent ?? cell.textContent ?? '';
  return (first.split(' / ')[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function readCount(cell: Element | undefined): number | undefined {
  const text = cell?.textContent?.trim();
  return text && /^\d{1,9}$/.test(text) ? Number(text) : undefined;
}

/** `top` of a paging link (`/status?problem_id=1000&top=123`). */
function topOf(link: Element | null): number | undefined {
  const href = link?.getAttribute('href');
  if (!href) return undefined;
  try {
    const top = new URL(href, 'https://www.acmicpc.net').searchParams.get('top');
    return top && /^\d{1,12}$/.test(top) && Number(top) > 0 ? Number(top) : undefined;
  } catch {
    return undefined;
  }
}
