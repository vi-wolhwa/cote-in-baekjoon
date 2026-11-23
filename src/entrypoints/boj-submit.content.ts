/**
 * Submit page (`/submit/{id}`): fills the language and code the user sent from the IDE.
 * By default it shows a banner asking the user to press Baekjoon's submit button. When the
 * user opted in to auto-submit (#41) it presses that button for them after a short,
 * cancellable countdown. Filling itself happens in boj-submit-main.content.ts.
 */
import { copyText, showAutoSubmitCountdown, showSubmitBanner } from '@/boj/submit-banner';
import {
  FILL_REQUEST_EVENT,
  FILL_RESULT_EVENT,
  MAIN_READY_EVENT,
  hasInteractiveChallenge,
  isClickable,
  waitForSubmitButton,
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
    const blockedPatterns = findBlockedPatterns(pending.code);
    if (!pending.autoSubmit) log('자동 제출이 꺼져 있어 직접 제출을 안내합니다.');
    else if (await tryAutoSubmit(result, blockedPatterns)) return;

    const copied = result?.code === 'ok' ? false : await copyText(pending.code);
    showSubmitBanner(document, {
      result,
      languageName: pending.languageName,
      blockedPatterns,
      code: pending.code,
      copied,
    });
  },
});

/** Time the user has to cancel before the submit button is pressed. */
const AUTO_SUBMIT_DELAY_MS = 1200;
/** How long to wait for Baekjoon to show its submit button (reCAPTCHA v3 token). */
const SUBMIT_BUTTON_WAIT_MS = 10_000;

/**
 * Auto-submit (#41, opted in by the user in the IDE): presses Baekjoon's own submit button
 * once the form is fully filled. Falls back to the manual banner when anything is off:
 * the fill was incomplete, the code has strings the firewall rejects, the page shows a
 * human check, the button is missing, or the user cancels.
 */
async function tryAutoSubmit(
  result: FillResult | undefined,
  blockedPatterns: string[],
): Promise<boolean> {
  if (result?.code !== 'ok' || result.language !== 'ok') {
    log('언어나 코드를 다 채우지 못해 자동 제출하지 않습니다.');
    return false;
  }
  if (blockedPatterns.length > 0) {
    log(
      `방화벽에 막힐 수 있는 문자열이 있어 자동 제출하지 않습니다: ${blockedPatterns.join(', ')}`,
    );
    return false;
  }
  if (hasInteractiveChallenge(document)) {
    log('사람이 직접 풀어야 하는 보안 확인이 있어 자동 제출하지 않습니다.');
    return false;
  }
  // Baekjoon shows the real button only once its reCAPTCHA v3 token is ready (#45).
  const submit = await waitForSubmitButton(document, SUBMIT_BUTTON_WAIT_MS);
  if (!submit) {
    log('제출 버튼이 준비되지 않아 자동 제출하지 않습니다.');
    return false;
  }
  if (!(await showAutoSubmitCountdown(document, AUTO_SUBMIT_DELAY_MS))) {
    log('사용자가 자동 제출을 취소했습니다.');
    return false;
  }
  if (!isClickable(submit) || hasInteractiveChallenge(document)) {
    log('카운트다운 중 페이지가 바뀌어 자동 제출하지 않습니다.');
    return false;
  }
  log('제출 버튼을 누릅니다.');
  submit.click();
  return true;
}

function log(message: string) {
  console.info(`[코딩테스트 in 백준] ${message}`);
}

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
