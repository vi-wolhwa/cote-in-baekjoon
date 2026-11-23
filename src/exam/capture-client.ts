/**
 * Exam page side of reading a problem's statement (capture-contract.ts): ask the background,
 * follow the capture record in `storage.session`, and give up after the timeout. The
 * statement itself arrives in the exam record (`exam:{id}`), which the page already follows.
 */
import {
  captureKey,
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
