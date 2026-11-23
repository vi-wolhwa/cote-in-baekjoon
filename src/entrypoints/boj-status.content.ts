/**
 * Status page (`/status`): reports the user's newest submission for a problem they sent
 * from the IDE. Reads this document and follows the page's own live updates. When those
 * stop (Baekjoon's realtime server rejects connections over its quota), it asks for that
 * one submission with the page's own `/status/ajax` request at a slow interval until the
 * result is final (ADR-0002, #35).
 */
import {
  findLoggedInUser,
  judgeStatusOf,
  latestRowsForWatches,
  parseStatusRows,
  rowSignature,
  type StatusRow,
  type Watch,
} from '@/boj/status';
import {
  applyAjaxResult,
  fetchSolutionStatus,
  POLL_GRACE_MS,
  POLL_LIMIT_MS,
  pollDelay,
} from '@/boj/status-ajax';
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
    /** Latest known state per watched problem, from the page or from polling. */
    const latest = new Map<number, StatusRow>();
    const startedAt = Date.now();
    let stopped = false;

    const report = (row: StatusRow) => {
      latest.set(row.problemId, row);
      const signature = rowSignature(row);
      if (sent.get(row.problemId) === signature) return;
      sent.set(row.problemId, signature);
      const message: JudgeReportMessage = { type: 'cib:judge-report', row };
      browser.runtime.sendMessage(message).catch(() => {
        sent.delete(row.problemId); // Retry on the next change.
      });
    };

    const allDone = () =>
      latest.size > 0 && [...latest.values()].every((r) => judgeStatusOf(r.resultCode) === 'done');

    const scan = (): boolean => {
      for (const row of latestRowsForWatches(parseStatusRows(document), watches, username)) {
        const known = latest.get(row.problemId);
        // Polling may already know a newer state than the (stale) page.
        if (known?.solutionId === row.solutionId && judgeStatusOf(known.resultCode) === 'done') {
          continue;
        }
        report(row);
      }
      return allDone();
    };

    if (scan()) return;

    let debounce: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const stop = () => {
      stopped = true;
      clearTimeout(debounce);
      clearTimeout(poll);
      clearTimeout(limit);
      observer.disconnect();
    };

    const schedulePoll = (delay: number) => {
      clearTimeout(poll);
      poll = setTimeout(() => void pollOnce(), delay);
    };

    const pollOnce = async () => {
      if (stopped || ctx.isInvalid) return;
      if (Date.now() - startedAt > POLL_LIMIT_MS) return stop();
      const pending = [...latest.values()].filter((r) => judgeStatusOf(r.resultCode) !== 'done');
      for (const row of pending) {
        try {
          const next = applyAjaxResult(row, await fetchSolutionStatus(row.solutionId));
          if (next) {
            report(next);
            updateRowText(next);
          }
        } catch {
          // Network hiccup: try again on the next round.
        }
      }
      if (allDone()) return stop();
      schedulePoll(pollDelay(attempt++));
    };

    const observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (scan()) return stop();
        // The page is updating by itself: push polling back.
        schedulePoll(POLL_GRACE_MS);
      }, DEBOUNCE_MS);
    });
    const limit = setTimeout(stop, OBSERVE_LIMIT_MS);
    ctx.onInvalidated(stop);
    observer.observe(table, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'data-color'],
    });
    schedulePoll(POLL_GRACE_MS);
  },
});

/** Shows the polled result in the page too, so the status table is not left stale. */
function updateRowText(row: StatusRow) {
  const span = document.querySelector(`#solution-${row.solutionId} td.result span.result-text`);
  if (!span) return;
  span.textContent = row.resultText;
  // Swap only the colour class (result-ac, result-wa, ...), keep result-text.
  for (const c of [...span.classList]) {
    if (c.startsWith('result-') && c !== 'result-text') span.classList.remove(c);
  }
  span.classList.add(`result-${row.resultCode}`);
  span.setAttribute('data-color', row.resultCode);
}
