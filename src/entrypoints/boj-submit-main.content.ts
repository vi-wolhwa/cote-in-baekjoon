/**
 * Runs in the submit page's own JavaScript world so it can reach the CodeMirror instance.
 * It has no extension APIs. It only fills the language and code it receives from the
 * isolated content script; it never clicks the submit button or submits the form (PRD 8.1).
 */
import {
  FILL_REQUEST_EVENT,
  FILL_RESULT_EVENT,
  MAIN_READY_EVENT,
  fillCode,
  fillSubmitForm,
  findCodeMirror,
  isEditorReady,
  isFillRequest,
  normalizeNewlines,
  parseDetail,
  type FillRequest,
  type FillResult,
} from '@/boj/submit-fill';

const EDITOR_WAIT_MS = 5000;
const POLL_MS = 100;
/** A language change handler may reset the editor asynchronously; check once more after it. */
const RECHECK_MS = 300;

export default defineContentScript({
  matches: ['https://acmicpc.net/submit/*', 'https://www.acmicpc.net/submit/*'],
  runAt: 'document_idle',
  world: 'MAIN',
  main() {
    const handled = new Set<string>();
    document.addEventListener(FILL_REQUEST_EVENT, (event) => {
      const request = parseDetail((event as CustomEvent<unknown>).detail);
      if (!isFillRequest(request) || handled.has(request.nonce)) return;
      handled.add(request.nonce);
      void fillWhenReady(request).then((result) => {
        document.dispatchEvent(
          new CustomEvent(FILL_RESULT_EVENT, { detail: JSON.stringify(result) }),
        );
      });
    });
    document.dispatchEvent(new CustomEvent(MAIN_READY_EVENT));
  },
});

async function fillWhenReady(request: FillRequest): Promise<FillResult> {
  const deadline = Date.now() + EDITOR_WAIT_MS;
  while (!isEditorReady(document) && Date.now() < deadline) await delay(POLL_MS);

  const result = fillSubmitForm(document, request);
  if (result.code !== 'ok') return result;

  await delay(RECHECK_MS);
  const cm = findCodeMirror(document);
  if (cm && normalizeNewlines(cm.getValue()) !== normalizeNewlines(request.code)) {
    return { ...result, code: fillCode(document, request.code) };
  }
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
