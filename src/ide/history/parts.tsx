import { useEffect, useState } from 'preact/hooks';
import type { ResultCode } from '@/boj/status';
import { resultTone } from './format';

/** A judge result as a small outlined label in the run output's pass/fail colours. */
export function ResultBadge({ code, text }: { code: ResultCode | undefined; text: string }) {
  return (
    <span class={`history-badge is-${resultTone(code)}`} title={text}>
      {text}
    </span>
  );
}

/** The current time, refreshed every minute so "n분 전" stays right. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
