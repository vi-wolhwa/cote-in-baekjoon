/**
 * Self-diagnosis (#87, docs/ops/maintenance.md §2): when Baekjoon's pages change and the
 * extension cannot find what it needs, say so on the page with a pre-filled report link
 * instead of failing silently. Only the page kind and the names of the missing parts go into
 * the report, never the user's code or the page's content.
 */
import { parseProblemId, parseTimeLimitMs } from './problem';
import type { FillResult } from './submit-fill';

export type PageKind = 'problem' | 'submit' | 'status';

export const PAGE_LABEL: Record<PageKind, string> = {
  problem: '문제 페이지',
  submit: '제출 페이지',
  status: '채점 현황',
};

export interface Diagnosis {
  page: PageKind;
  /** Korean names of the parts that were not found, e.g. "문제 제목". */
  missing: string[];
}

const diagnosis = (page: PageKind, missing: string[]): Diagnosis | undefined =>
  missing.length > 0 ? { page, missing } : undefined;

/**
 * True when the page is a problem page by its URL and tab title ("1000번: A+B"), so a
 * missing title means a changed layout rather than, say, a problem that does not exist.
 */
export function looksLikeProblemPage(doc: Document, url: string): boolean {
  return parseProblemId(url) !== undefined && /^\s*\d+번\s*:/.test(doc.title);
}

/** What the problem page parser needs (src/boj/problem.ts). */
export function diagnoseProblemPage(doc: Document, url: string): Diagnosis | undefined {
  if (!looksLikeProblemPage(doc, url)) return undefined;
  const missing: string[] = [];
  if (!doc.querySelector('#problem_title')?.textContent?.trim()) missing.push('문제 제목');
  if (!doc.querySelector('#problem_description')) missing.push('문제 설명');
  const timeLimit = doc.querySelector('#problem-info tbody tr:first-child td')?.textContent ?? '';
  if (parseTimeLimitMs(timeLimit) === undefined) missing.push('시간 제한');
  // Every problem page has a sample section; its boxes are numbered from 1.
  const hasSampleBoxes = doc.querySelector('pre.sampledata') !== null;
  if (hasSampleBoxes && !doc.querySelector('#sample-input-1')) missing.push('예제');
  return diagnosis('problem', missing);
}

/**
 * The submit form, from the fill result of the MAIN-world script. `undefined` means that
 * script never answered. A language missing from the user's list is not a layout problem.
 */
export function diagnoseSubmitFill(result: FillResult | undefined): Diagnosis | undefined {
  if (!result) return diagnosis('submit', ['제출 양식']);
  const missing: string[] = [];
  if (result.language === 'select-missing') missing.push('언어 선택');
  if (result.code === 'editor-missing') missing.push('코드 입력 칸');
  if (result.code === 'mismatch') missing.push('코드 입력 칸(채운 내용이 다름)');
  return diagnosis('submit', missing);
}

/** The submit button never appeared although no human check was on the page. */
export function diagnoseSubmitButton(): Diagnosis {
  return { page: 'submit', missing: ['제출 버튼'] };
}

/**
 * The status table while the extension waits for a result. Rows that exist but cannot be
 * read mean the row layout changed.
 */
export function diagnoseStatusPage(doc: Document, parsedRows: number): Diagnosis | undefined {
  const table = doc.querySelector('#status-table');
  if (!table) return diagnosis('status', ['채점 현황 표']);
  const rows = table.querySelectorAll('tr[id^="solution-"]').length;
  if (rows > 0 && parsedRows === 0) return diagnosis('status', ['채점 결과 행']);
  return undefined;
}

/** One line for the report form's "무엇이 잘못되었나요?" field. */
export function describeDiagnosis(d: Diagnosis): string {
  return `[자가 진단] 백준 ${PAGE_LABEL[d.page]}에서 찾지 못함: ${d.missing.join(', ')}`;
}
