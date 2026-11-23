/**
 * Problem page side of reading a mock exam problem (ADR-0005): in the inactive tab the
 * background opened, parse the page like the IDE overlay does and hand the result over.
 * The tab shows nothing of ours (no menu buttons, no diagnosis notice); the background
 * closes it once it has the answer.
 */
import { parseProblem } from '@/boj/problem';
import {
  isCaptureQueryResponse,
  type CaptureQueryMessage,
  type CaptureResultMessage,
} from '@/exam/capture-contract';

/** The problem this tab was opened to read, or undefined for a tab the user opened. */
export async function askCapture(): Promise<number | undefined> {
  const query: CaptureQueryMessage = { type: 'cib:capture-query' };
  const response: unknown = await browser.runtime.sendMessage(query).catch(() => undefined);
  return isCaptureQueryResponse(response) ? response.capture?.problemId : undefined;
}

/**
 * Resolves once `root` has had no changes for `quietMs`, or after `maxMs`. Baekjoon's
 * MathJax rewrites formulas after load; parsing after it settled reads them the way the
 * IDE overlay does (the user clicks long after MathJax finished there).
 */
export function waitForQuiet(root: Node, quietMs = 400, maxMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(limit);
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, quietMs);
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    timer = setTimeout(done, quietMs);
    const limit = setTimeout(done, maxMs);
  });
}

/** Parses this page as `problemId` and sends the problem (or the failure) to the background. */
export async function captureProblem(doc: Document, url: string, problemId: number) {
  await waitForQuiet(doc.body ?? doc.documentElement);
  const problem = parseProblem(doc, url);
  const message: CaptureResultMessage =
    problem && problem.id === problemId
      ? { type: 'cib:capture-result', problemId, problem }
      : { type: 'cib:capture-result', problemId, error: 'parse' };
  await browser.runtime.sendMessage(message).catch(() => undefined);
}
