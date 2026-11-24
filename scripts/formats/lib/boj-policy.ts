/**
 * Limits for opening acmicpc.net problem pages directly (ADR-0006, CLAUDE.md):
 * at most one page per minute, a daily cap, and a log line for every access.
 */

export interface AccessEntry {
  time: string;
  id: number;
  result: string;
}

export const MIN_INTERVAL_MS = 60_000;
export const DAILY_CAP = 100;

/** Local calendar day (YYYY-MM-DD) of an ISO time. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function accessesOn(log: AccessEntry[], day: string): number {
  return log.filter((entry) => localDay(entry.time) === day).length;
}

/** Milliseconds to wait before the next page may be opened (0 when allowed now). */
export function waitBeforeNext(log: AccessEntry[], nowMs: number): number {
  const last = log[log.length - 1];
  if (!last) return 0;
  return Math.max(0, Date.parse(last.time) + MIN_INTERVAL_MS - nowMs);
}

/** How many more pages may be opened today, given the per-run `limit`. */
export function remainingToday(log: AccessEntry[], nowIso: string, limit: number): number {
  return Math.max(0, Math.min(limit, DAILY_CAP - accessesOn(log, localDay(nowIso))));
}

/** Results after which the run stops instead of opening more pages. */
export function isStopResult(result: string): boolean {
  return result === 'challenge' || result === 'http-403' || result === 'http-429';
}
