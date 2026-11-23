/**
 * Submit page (`/submit/{id}`): fills the language and code the user sent from the IDE and
 * shows a banner asking them to press Baekjoon's submit button themselves (PRD 8.1).
 * Sends nothing to Baekjoon. Filling itself happens in boj-submit-main.content.ts.
 */
import { copyText, showSubmitBanner } from '@/boj/submit-banner';
import {
  FILL_REQUEST_EVENT,
  FILL_RESULT_EVENT,
  MAIN_READY_EVENT,
  isFillResult,
  parseDetail,
  parseSubmitProblemId,
  type FillRequest,
  type FillResult,
} from '@/boj/submit-fill';
import { findBlockedPatterns } from '@/boj/waf';
import {
  isPendingQueryResponse,
  type PendingQueryMessage,
  type PendingSubmission,
} from '@/shared/submission';

/** The MAIN-world script waits up to 5 s for the editor; allow for that plus a margin. */
const FILL_TIMEOUT_MS = 8000;

export default defineContentScript({
  matches: ['https://acmicpc.net/submit/*', 'https://www.acmicpc.net/submit/*'],
  runAt: 'document_idle',
  async main(ctx) {
    const problemId = parseSubmitProblemId(location.href);
    if (problemId === undefined) return;

    const query: PendingQueryMessage = { type: 'cib:pending-query', problemId };
    const response: unknown = await browser.runtime.sendMessage(query).catch(() => undefined);
    if (!isPendingQueryResponse(response) || !response.pending || ctx.isInvalid) return;
    const pending = response.pending;

    const result = await requestFill(pending);
    const copied = result?.code === 'ok' ? false : await copyText(pending.code);
    showSubmitBanner(document, {
      result,
      languageName: pending.languageName,
      blockedPatterns: findBlockedPatterns(pending.code),
      code: pending.code,
      copied,
    });
  },
});

/** Asks the MAIN-world script to fill the form; resolves undefined if it never answers. */
function requestFill(pending: PendingSubmission): Promise<FillResult | undefined> {
  const request: FillRequest = {
    nonce: crypto.randomUUID(),
    languageId: pending.languageId,
    code: pending.code,
  };
  const send = () =>
    document.dispatchEvent(
      new CustomEvent(FILL_REQUEST_EVENT, { detail: JSON.stringify(request) }),
    );

  return new Promise((resolve) => {
    const finish = (result: FillResult | undefined) => {
      clearTimeout(timer);
      document.removeEventListener(FILL_RESULT_EVENT, onResult);
      document.removeEventListener(MAIN_READY_EVENT, send);
      resolve(result);
    };
    const onResult = (event: Event) => {
      const result = parseDetail((event as CustomEvent<unknown>).detail);
      if (isFillResult(result) && result.nonce === request.nonce) finish(result);
    };
    const timer = setTimeout(() => finish(undefined), FILL_TIMEOUT_MS);

    document.addEventListener(FILL_RESULT_EVENT, onResult);
    // The MAIN-world script may load before or after this one: send now, and again when it
    // announces itself. It ignores repeats of the same nonce.
    document.addEventListener(MAIN_READY_EVENT, send);
    send();
  });
}
