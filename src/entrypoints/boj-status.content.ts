/**
 * Status page (`/status`): reports the user's newest submission for a problem they sent
 * from the IDE, following the page's own live updates and, when those do not arrive,
 * Baekjoon's `/status/ajax` for that one submission (ADR-0002, #35, #39).
 */
import {
  findLoggedInUser,
  latestRowsForWatches,
  parseStatusRows,
  type StatusRow,
} from '@/boj/status';
import { diagnoseStatusPage } from '@/boj/diagnosis';
import { showExamCover } from '@/boj/exam-cover';
import { rememberHandle } from '@/shared/handle';
import { showDiagnosisNotice } from '@/boj/diagnosis-notice';
import { fetchSolutionStatus } from '@/boj/status-ajax';
import { showJudgingNotice } from '@/boj/submit-banner';
import { StatusPoller } from '@/boj/status-poller';
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
  // Early, so a mock exam's result is covered before the table is drawn (ADR-0005).
  runAt: 'document_start',
  async main(ctx) {
    const query: WatchQueryMessage = { type: 'cib:watch-query' };
    const answer: unknown = await browser.runtime.sendMessage(query).catch(() => undefined);
    const response = isWatchQueryResponse(answer) && answer.watches.length > 0 ? answer : undefined;
    if (response?.hideResult) showExamCover(document);
    await domReady(document);
    void rememberHandle(document);
    if (!response) return;
    // A result is awaited but the table cannot be read: the layout changed (#87).
    const layoutProblem = diagnoseStatusPage(document, parseStatusRows(document).length);
    if (layoutProblem) {
      log(`페이지 구조 문제: ${layoutProblem.missing.join(', ')}`);
      showDiagnosisNotice(document, layoutProblem, {
        version: browser.runtime.getManifest().version,
        problemId: response.watches[0]?.problemId,
      });
    }
    const table = document.querySelector('#status-table');
    if (!table) return;
    const username = findLoggedInUser(document, location.href);
    if (!username) {
      log('로그인한 사용자를 찾지 못해 채점 결과를 전달하지 않습니다.');
      return;
    }
    if (ctx.isInvalid) return;

    const watches = response.watches;
    // Inside the submit popup: ask the user to keep the window open until judging ends (#47).
    let notice: { finish(): void } | undefined;
    const poller: StatusPoller = new StatusPoller({
      readRows: () => latestRowsForWatches(parseStatusRows(document), watches, username),
      fetchStatus: fetchSolutionStatus,
      report: (row) => {
        const message: JudgeReportMessage = { type: 'cib:judge-report', row };
        browser.runtime.sendMessage(message).catch(() => poller.forget(row.problemId));
      },
      showInPage: updateRowText,
      onDone: () => notice?.finish(),
      log,
    });

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (poller.scan()) stop();
      }, DEBOUNCE_MS);
    });
    const stop = () => {
      poller.stop();
      clearTimeout(debounce);
      clearTimeout(limit);
      observer.disconnect();
    };
    const limit = setTimeout(stop, OBSERVE_LIMIT_MS);
    ctx.onInvalidated(stop);

    // Under the exam cover the judging notice would only repeat what the cover says.
    if (response.inSubmitWindow && !response.hideResult) notice = showJudgingNotice(document);
    poller.start();
    if (poller.isStopped) return stop();
    log('채점 결과를 기다립니다.');
    observer.observe(table, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'data-color'],
    });
  },
});

function domReady(doc: Document): Promise<void> {
  if (doc.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) =>
    doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
  );
}

function log(message: string) {
  console.info(`[코딩테스트 in 백준] ${message}`);
}

/** Shows a polled result in the page too, so the status table is not left stale. */
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
  const memory = document.querySelector(`#solution-${row.solutionId} td.memory`);
  const time = document.querySelector(`#solution-${row.solutionId} td.time`);
  if (memory && row.memoryKb !== undefined) memory.textContent = String(row.memoryKb);
  if (time && row.timeMs !== undefined) time.textContent = String(row.timeMs);
}
