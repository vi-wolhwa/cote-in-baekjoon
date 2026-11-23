/**
 * Status page (`/status`): reports the user's newest submission for a problem they sent
 * from the IDE. Reads only this document; live updates come from the page's own realtime
 * connection and are seen as DOM changes. No requests and no polling (ADR-0002).
 */
import {
  findLoggedInUser,
  judgeStatusOf,
  latestRowsForWatches,
  parseStatusRows,
  rowSignature,
  type Watch,
} from '@/boj/status';
import {
  isWatchQueryResponse,
  type JudgeReportMessage,
  type WatchQueryMessage,
} from '@/shared/submission';

/** Stop observing after this long even if judging never finishes. */
const OBSERVE_LIMIT_MS = 15 * 60 * 1000;
const DEBOUNCE_MS = 100;

export default defineContentScript({
  matches: ['https://acmicpc.net/status*', 'https://www.acmicpc.net/status*'],
  runAt: 'document_idle',
  async main(ctx) {
    const table = document.querySelector('#status-table');
    if (!table) return;

    const query: WatchQueryMessage = { type: 'cib:watch-query' };
    const response: unknown = await browser.runtime.sendMessage(query).catch(() => undefined);
    if (!isWatchQueryResponse(response) || response.watches.length === 0) return;
    const username = findLoggedInUser(document, location.href);
    if (!username || ctx.isInvalid) return;

    const watches: Watch[] = response.watches;
    const sent = new Map<number, string>();

    const scan = (): boolean => {
      const rows = latestRowsForWatches(parseStatusRows(document), watches, username);
      for (const row of rows) {
        const signature = rowSignature(row);
        if (sent.get(row.problemId) === signature) continue;
        sent.set(row.problemId, signature);
        const report: JudgeReportMessage = { type: 'cib:judge-report', row };
        browser.runtime.sendMessage(report).catch(() => {
          sent.delete(row.problemId); // Retry on the next change.
        });
      }
      // Done when every watched problem that has a row here reached a final result.
      return rows.length > 0 && rows.every((r) => judgeStatusOf(r.resultCode) === 'done');
    };

    if (scan()) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (scan()) stop();
      }, DEBOUNCE_MS);
    });
    const stop = () => {
      clearTimeout(timer);
      clearTimeout(limit);
      observer.disconnect();
    };
    const limit = setTimeout(stop, OBSERVE_LIMIT_MS);
    ctx.onInvalidated(stop);
    observer.observe(table, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'data-color'],
    });
  },
});
