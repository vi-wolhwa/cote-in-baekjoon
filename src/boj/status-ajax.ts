/**
 * Fallback for Baekjoon's realtime judging updates (#35).
 *
 * The status page normally gets live updates over Pusher. When Baekjoon's Pusher plan is
 * over its connection quota (error 4004) the page only says "새로고침을 통해 채점 결과를
 * 확인하세요", so results never arrive. In that case we ask for the one submission the user
 * just made with the same request the page itself sends (`POST /status/ajax`), at a slow,
 * growing interval, only until the result is final (ADR-0002).
 */
import type { ResultCode, StatusRow } from './status';

/** Index = Baekjoon's numeric result (`App.result_colors()` in app.min.js). */
const RESULT_CODE_BY_NUMBER: readonly ResultCode[] = [
  'wait',
  'rejudge-wait',
  'compile',
  'judging',
  'ac',
  'pe',
  'wa',
  'tle',
  'mle',
  'ole',
  'rte',
  'ce',
  'del',
  'del',
  'compile',
  'pac',
  'judging',
];

/** Index = Baekjoon's numeric result (Korean `result_names` in app.min.js). */
const RESULT_NAME_BY_NUMBER: readonly string[] = [
  '기다리는 중',
  '재채점을 기다리는 중',
  '채점 준비 중',
  '채점 중',
  '맞았습니다!!',
  '출력 형식이 잘못되었습니다',
  '틀렸습니다',
  '시간 초과',
  '메모리 초과',
  '출력 초과',
  '런타임 에러',
  '컴파일 에러',
  '채점 불가',
  '삭제된 제출',
  '%(remain)초 후 채점 시작',
  '맞았습니다!!',
  '런타임 에러 이유를 찾는 중',
];

/** Delays between requests: quick at first, then every 5 seconds. */
export const POLL_DELAYS_MS = [1000, 1000, 2000, 2000, 3000, 5000];
/** Give up after this long; the user can still refresh the page. */
export const POLL_LIMIT_MS = 10 * 60 * 1000;
/** Start polling only if the page shows no change for this long. */
export const POLL_GRACE_MS = 3000;

export function pollDelay(attempt: number): number {
  return POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)] ?? 5000;
}

/** Applies a `/status/ajax` answer to the row it was asked for. Unknown shapes return undefined. */
export function applyAjaxResult(row: StatusRow, answer: unknown): StatusRow | undefined {
  if (typeof answer !== 'object' || answer === null) return undefined;
  const a = answer as Record<string, unknown>;
  if (a.error) return undefined;
  const result = Number(a.result);
  const resultCode = RESULT_CODE_BY_NUMBER[result];
  const baseName = RESULT_NAME_BY_NUMBER[result];
  if (!Number.isInteger(result) || !resultCode || !baseName) return undefined;

  let resultText =
    typeof a.custom_result === 'string' && a.custom_result
      ? a.custom_result
      : baseName.replace('%(remain)', String(Number(a.remain) || 0));
  const progress = Number(a.progress);
  if (Number.isFinite(progress) && progress > 0 && result < 4) resultText += ` (${progress}%)`;
  if (result === 6 && typeof a.feedback === 'string' && a.feedback) {
    resultText += ` [${a.feedback}]`;
  }
  if (result === 10 && typeof a.rte_reason === 'string' && a.rte_reason) {
    resultText += ` (${a.rte_reason})`;
  }

  const memoryKb = Number(a.memory);
  const timeMs = Number(a.time);
  const next: StatusRow = { ...row, resultCode, resultText };
  delete next.memoryKb;
  delete next.timeMs;
  if ('memory' in a && Number.isFinite(memoryKb)) next.memoryKb = memoryKb;
  if ('time' in a && Number.isFinite(timeMs)) next.timeMs = timeMs;
  return next;
}

/** Same request the status page sends for one submission. Runs in the page's origin. */
export async function fetchSolutionStatus(solutionId: number): Promise<unknown> {
  const response = await fetch('/status/ajax', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ solution_id: String(solutionId) }),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.json();
}
