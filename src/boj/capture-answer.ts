/**
 * Content script side of reading a Baekjoon page for the '제출 기록' tab (ADR-0012): in a tab
 * the background opened to read this page, parse it and hand it over; the background then
 * closes the tab. A login page answers that the source it was sent from needs a login.
 */
import {
  queryOfUrl,
  type StatusCaptureQuery,
  type StatusCaptureResult,
} from '@/shared/status-page';
import { parsePage } from './status-page';

/** True when this tab was opened to be read (and has answered). */
export async function answerCapture(doc: Document, href: string): Promise<boolean> {
  const ask: StatusCaptureQuery = { type: 'cib:status-capture-query' };
  const answer: unknown = await browser.runtime.sendMessage(ask).catch(() => undefined);
  const capture =
    typeof answer === 'object' && answer !== null && (answer as { capture?: unknown }).capture;
  if (capture !== true) return false;
  const query = queryOfUrl(href);
  const login = new URL(href).pathname === '/login';
  const parsed = !login && query ? parsePage(doc, query) : undefined;
  const result: StatusCaptureResult = {
    type: 'cib:status-capture-result',
    ...(login ? { login: true } : {}),
    ...parsed,
  };
  await browser.runtime.sendMessage(result).catch(() => undefined);
  return true;
}
