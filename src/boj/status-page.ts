/**
 * Parses the Baekjoon pages the '제출 기록' tab reads (ADR-0012): a status list page, a
 * short-coding ranking page and a source page. Pages are untrusted: values are read as text,
 * cut to length and checked again by the receiver.
 *
 * Status columns (2026-11-25): 제출 번호, 아이디, 문제, 결과, 메모리, 시간, 채점 서버, 언어,
 * 코드 길이, 제출한 시간. Short-coding columns: 등수, 제출 번호, 아이디, 메모리, 시간, 언어,
 * 코드 길이, 제출한 시간. Cells are found by their header names, not by position (Baekjoon
 * added 채점 서버 in 2026-11). When the viewer may read a source, Baekjoon links the language
 * to `/source/{제출 번호}`.
 */
import {
  MAX_SOURCE_LENGTH,
  MAX_STATUS_ROWS,
  type PageQuery,
  type SourcePage,
  type StatusPage,
  type StatusPageRow,
} from '@/shared/status-page';
import { parseStatusRow } from './status';

/** What the page holds for `query`, or undefined when it has nothing to read. */
export function parsePage(
  doc: Document,
  query: PageQuery,
): { page: StatusPage } | { source: SourcePage } | undefined {
  if (query.kind === 'source') {
    const source = parseSourcePage(doc);
    return source && { source };
  }
  const page =
    query.kind === 'short'
      ? parseShortPage(doc, query.page ?? 1)
      : parseStatusPage(doc, { problemId: query.problemId, userId: query.userId });
  return page && { page };
}

function headersOf(table: Element): string[] {
  return [...table.querySelectorAll('tr th')].map((th) =>
    (th.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

/**
 * The page's rows (of the query's problem and user only) and the next page's `top`, or
 * undefined when it has no status table to read.
 */
export function parseStatusPage(
  doc: Document,
  only: { problemId?: number; userId?: string } = {},
): StatusPage | undefined {
  const user = only.userId?.toLowerCase();
  const table = doc.querySelector('#status-table');
  if (!table) return undefined;
  const headers = headersOf(table);
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
      sourceOpen: linksSource(cells[languageAt], base.solutionId),
    });
    if (rows.length === MAX_STATUS_ROWS) break;
  }
  const next = topOf(doc.querySelector('#next_page'));
  return { rows, ...(next !== undefined ? { next } : {}) };
}

/** A short-coding ranking page: every row is an accepted submission. */
export function parseShortPage(doc: Document, page: number): StatusPage | undefined {
  const table = [...doc.querySelectorAll('table')].find((t) => headersOf(t).includes('등수'));
  if (!table) return undefined;
  const h = headersOf(table);
  const at = (name: string) => h.indexOf(name);
  const [rankAt, idAt, userAt, memoryAt, timeAt, languageAt, lengthAt, dateAt] = [
    at('등수'),
    at('제출 번호'),
    at('아이디'),
    at('메모리'),
    at('시간'),
    at('언어'),
    at('코드 길이'),
    at('제출한 시간'),
  ];
  if (idAt < 0 || userAt < 0 || languageAt < 0) return undefined;

  const rows: StatusPageRow[] = [];
  for (const tr of table.querySelectorAll('tbody tr')) {
    const cells = tr.querySelectorAll(':scope > td');
    const solutionId = readCount(cells[idAt]);
    const username = cells[userAt]?.textContent?.trim() ?? '';
    if (!solutionId || !/^[A-Za-z0-9_]{1,20}$/.test(username)) continue;
    const rank = readCount(cells[rankAt]);
    const memoryKb = readCount(cells[memoryAt]);
    const timeMs = readCount(cells[timeAt]);
    const codeLength = readCount(cells[lengthAt]);
    const stamp = Number(
      cells[dateAt]?.querySelector('[data-timestamp]')?.getAttribute('data-timestamp'),
    );
    rows.push({
      solutionId,
      username,
      resultCode: 'ac',
      resultText: '맞았습니다!!',
      ...(memoryKb !== undefined ? { memoryKb } : {}),
      ...(timeMs !== undefined ? { timeMs } : {}),
      language: readLanguage(cells[languageAt]),
      ...(codeLength !== undefined ? { codeLength } : {}),
      ...(Number.isFinite(stamp) && stamp > 0 ? { submittedAt: stamp * 1000 } : {}),
      sourceOpen: linksSource(cells[languageAt], solutionId),
      ...(rank ? { rank } : {}),
    });
    if (rows.length === MAX_STATUS_ROWS) break;
  }
  // A link to the next page number means there is one.
  const nextPage = page + 1;
  const hasNext = [...doc.querySelectorAll('a[href^="/short/status/"]')].some((a) =>
    new RegExp(`/${nextPage}$`).test(a.getAttribute('href') ?? ''),
  );
  return { rows, ...(hasNext && rows.length === MAX_STATUS_ROWS ? { next: nextPage } : {}) };
}

/** The code of a source page (the textarea Baekjoon's code viewer is built on). */
export function parseSourcePage(doc: Document): SourcePage | undefined {
  const area = doc.querySelector<HTMLTextAreaElement>(
    'textarea[name="source"], textarea#source, textarea.codemirror-textarea',
  );
  if (!area) return undefined;
  const code = area.value || area.textContent || '';
  return code.length <= MAX_SOURCE_LENGTH ? { code } : undefined;
}

/** The language name; Baekjoon may add " / 수정" links after it on the user's own rows. */
function readLanguage(cell: Element | undefined): string {
  if (!cell) return '';
  const first = cell.querySelector('a')?.textContent ?? cell.textContent ?? '';
  return (first.split(' / ')[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function linksSource(cell: Element | undefined, solutionId: number): boolean {
  return !!cell?.querySelector(`a[href$="/source/${solutionId}"]`);
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
