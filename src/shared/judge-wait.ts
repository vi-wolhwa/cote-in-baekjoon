/**
 * A calm note when a submission stays in Baekjoon's queue ("기다리는 중") for a while: the
 * wait depends on Baekjoon's judge servers, not on the extension. Shown only after the judge
 * has been waiting for LONG_WAIT_MS, and gone once judging moves on.
 */
import { useEffect, useState } from 'preact/hooks';
import type { JudgeResult } from './submission';

/** A wait shorter than this is normal; the note would only be noise. */
export const LONG_WAIT_MS = 10_000;

export const LONG_WAIT_NOTE = '기다리는 시간은 백준 채점 서버 상황에 따라 달라져요.';

/**
 * Since when the judge has been waiting in Baekjoon's queue, or undefined when it is not.
 * A report is stored only when the result changes, so `updatedAt` is when the wait began.
 */
export function waitingSince(judge: JudgeResult | undefined): number | undefined {
  return judge?.status === 'pending' ? judge.updatedAt : undefined;
}

export function isLongWait(since: number | undefined, now: number): boolean {
  return since !== undefined && now - since >= LONG_WAIT_MS;
}

/** True once the wait that began at `since` became long; re-renders at that moment. */
export function useLongWait(since: number | undefined): boolean {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (since === undefined) return;
    const left = since + LONG_WAIT_MS - Date.now();
    if (left <= 0) return;
    // A timer that fires a little early re-renders, and this effect schedules the rest.
    const timer = setTimeout(() => setTick((n) => n + 1), left);
    return () => clearTimeout(timer);
  }, [since, tick]);
  return isLongWait(since, Date.now());
}
