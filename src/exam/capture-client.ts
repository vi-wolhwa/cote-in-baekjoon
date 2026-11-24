/**
 * Exam page side of reading a problem's statement (capture-contract.ts): ask the background,
 * follow the capture record in `storage.session`, and give up after the timeout. The
 * statement itself arrives in the exam record (`exam:{id}`), which the page already follows.
 */
import {
  CAPTURE_TIMEOUT_MS,
  captureKey,
  describeCaptureError,
  isCaptureRecord,
  isCaptureResponse,
  type CaptureCancelMessage,
  type CaptureRecord,
  type CaptureRequestMessage,
  type CaptureResponse,
} from './capture-contract';

export async function requestCapture(examId: string, problemId: number): Promise<CaptureResponse> {
  const message: CaptureRequestMessage = { type: 'cib:capture-request', examId, problemId };
  try {
    const response: unknown = await browser.runtime.sendMessage(message);
    return isCaptureResponse(response)
      ? response
      : { ok: false, reason: '확장 프로그램이 응답하지 않습니다. 페이지를 새로고침해 주세요.' };
  } catch {
    return {
      ok: false,
      reason: '확장 프로그램과 연결하지 못했습니다. 페이지를 새로고침해 주세요.',
    };
  }
}

export function cancelCapture(examId: string, problemId: number): Promise<unknown> {
  const message: CaptureCancelMessage = { type: 'cib:capture-cancel', examId, problemId };
  return browser.runtime.sendMessage(message).catch(() => undefined);
}

/** Calls `onRecord` with the capture record now and whenever it changes. */
export function watchCapture(
  examId: string,
  problemId: number,
  onRecord: (record: CaptureRecord | undefined) => void,
): () => void {
  const key = captureKey(examId, problemId);
  let live = true;
  const deliver = (value: unknown) => {
    if (live) onRecord(isCaptureRecord(value) ? value : undefined);
  };
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'session' && key in changes) deliver(changes[key]?.newValue);
  };
  browser.storage.onChanged.addListener(listener);
  browser.storage.session
    .get(key)
    .then((items) => deliver(items[key]))
    .catch(() => undefined);
  return () => {
    live = false;
    browser.storage.onChanged.removeListener(listener);
  };
}

export type CaptureOutcome = { ok: true } | { ok: false; reason: string };

/**
 * Reads one problem and resolves once its statement is in the exam record, or with the
 * reason it could not be read. Gives up after the timeout and closes the background tab.
 */
export function captureAndWait(
  examId: string,
  problemId: number,
  hasBody: (storedExam: unknown) => boolean,
): Promise<CaptureOutcome> {
  return new Promise((resolve) => {
    const examKey = `exam:${examId}`;
    let settled = false;
    let stopWatch = () => {};
    const onExam = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && examKey in changes && hasBody(changes[examKey]?.newValue)) {
        finish({ ok: true });
      }
    };
    const timer = setTimeout(() => {
      void cancelCapture(examId, problemId);
      finish({ ok: false, reason: describeCaptureError('timeout') });
    }, CAPTURE_TIMEOUT_MS + 1000);
    function finish(outcome: CaptureOutcome) {
      if (settled) return;
      settled = true;
      stopWatch();
      browser.storage.onChanged.removeListener(onExam);
      clearTimeout(timer);
      resolve(outcome);
    }
    browser.storage.onChanged.addListener(onExam);
    void requestCapture(examId, problemId).then(async (response) => {
      if (!response.ok) return finish(response);
      // Read already (another tab), or before the listener started.
      const stored = (await browser.storage.local.get(examKey))[examKey];
      if (hasBody(stored)) return finish({ ok: true });
      if (settled) return;
      stopWatch = watchCapture(examId, problemId, (record) => {
        if (record?.state === 'error') {
          finish({ ok: false, reason: describeCaptureError(record.error) });
        }
      });
    });
  });
}
