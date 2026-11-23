/**
 * Stopwatch and countdown timer in the IDE sidebar (docs/design/ide-spec.md §10). Pure
 * logic: every function takes the current time, so tests need no fake clock. The shown time
 * is always computed from timestamps, never from counting interval ticks, so a stopped
 * service worker, a closed overlay or a reload does not lose time.
 */
export type TimerMode = 'stopwatch' | 'timer';

export interface TimerState {
  mode: TimerMode;
  running: boolean;
  /** Epoch ms when the current run started. Only set while running. */
  startedAt?: number;
  /** Time counted before the current run. */
  elapsedMs: number;
  /** Countdown length (timer mode). Kept when switching to the stopwatch. */
  durationMs: number;
}

const MINUTE = 60_000;
export const DEFAULT_DURATION_MS = 30 * MINUTE;
export const MIN_DURATION_MS = MINUTE;
/** 9시간 59분: the hour field takes one digit. */
export const MAX_DURATION_MS = (9 * 60 + 59) * MINUTE;
export const DURATION_PRESETS_MIN = [30, 60, 90, 120] as const;
/** Stored elapsed time above this is treated as corrupt (100 days). */
const MAX_ELAPSED_MS = 100 * 24 * 60 * MINUTE;

export const timerKey = (problemId: number) => `timer:${problemId}`;

export function initialTimer(): TimerState {
  return { mode: 'stopwatch', running: false, elapsedMs: 0, durationMs: DEFAULT_DURATION_MS };
}

/** Time counted so far. A start time in the future (clock moved back) counts as now. */
export function elapsed(s: TimerState, now: number): number {
  const run = s.running && s.startedAt !== undefined ? Math.max(0, now - s.startedAt) : 0;
  return s.elapsedMs + run;
}

export function remaining(s: TimerState, now: number): number {
  return Math.max(0, s.durationMs - elapsed(s, now));
}

/** The countdown reached 0. A stopwatch never finishes. */
export function isFinished(s: TimerState, now: number): boolean {
  return s.mode === 'timer' && elapsed(s, now) >= s.durationMs;
}

/** Nothing counted yet: the mode and the duration can change. */
export function isIdle(s: TimerState): boolean {
  return !s.running && s.elapsedMs === 0;
}

/** Started and not reset: the sidebar shows the time under its icon. */
export function isActive(s: TimerState): boolean {
  return s.running || s.elapsedMs > 0;
}

/** The time to show: counted up for the stopwatch, left for the timer. */
export function displayMs(s: TimerState, now: number): number {
  return s.mode === 'stopwatch' ? elapsed(s, now) : remaining(s, now);
}

export function start(s: TimerState, now: number): TimerState {
  if (s.running || isFinished(s, now)) return s;
  return { ...s, running: true, startedAt: now };
}

export function pause(s: TimerState, now: number): TimerState {
  if (!s.running) return s;
  const counted = elapsed(s, now);
  return {
    mode: s.mode,
    running: false,
    elapsedMs: s.mode === 'timer' ? Math.min(counted, s.durationMs) : counted,
    durationMs: s.durationMs,
  };
}

export function reset(s: TimerState): TimerState {
  return { mode: s.mode, running: false, elapsedMs: 0, durationMs: s.durationMs };
}

/** Starts the same countdown again from the full duration. */
export function restart(s: TimerState, now: number): TimerState {
  return start(reset(s), now);
}

/** Only while idle, so a running count is never lost by a misclick. */
export function setMode(s: TimerState, mode: TimerMode): TimerState {
  if (!isIdle(s) || s.mode === mode) return s;
  return { ...s, mode };
}

/** Only while idle. Values outside 1분…9시간 59분 or not whole minutes are refused. */
export function setDuration(s: TimerState, durationMs: number): TimerState {
  if (!isIdle(s) || !isValidDuration(durationMs)) return s;
  return { ...s, durationMs };
}

export function isValidDuration(ms: unknown): ms is number {
  return (
    typeof ms === 'number' &&
    Number.isInteger(ms) &&
    ms % MINUTE === 0 &&
    ms >= MIN_DURATION_MS &&
    ms <= MAX_DURATION_MS
  );
}

/** Hours and minutes typed in the timer fields, as a duration, or undefined if invalid. */
export function durationFrom(hours: number, minutes: number): number | undefined {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined;
  if (hours < 0 || hours > 9 || minutes < 0 || minutes > 59) return undefined;
  const ms = (hours * 60 + minutes) * MINUTE;
  return isValidDuration(ms) ? ms : undefined;
}

/** Whole hours and minutes of a duration, for the timer fields. */
export function splitDuration(ms: number): { hours: number; minutes: number } {
  const total = Math.floor(ms / MINUTE);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/**
 * "05:07" under an hour, "1:02:03" from an hour. A countdown rounds up, so it shows 30:00
 * right after starting and 00:00 only when the time is over; a stopwatch rounds down.
 */
export function formatTime(ms: number, round: 'down' | 'up' = 'down'): string {
  const seconds = Math.max(0, round === 'up' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "30분", "1시간", "1시간 30분" */
export function describeMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** The shown time of a state, formatted. */
export function formatState(s: TimerState, now: number): string {
  return formatTime(displayMs(s, now), s.mode === 'timer' ? 'up' : 'down');
}

/** A stored value (untrusted: older versions, other tabs, hand edits) as a state. */
export function parseTimer(v: unknown): TimerState | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (o.mode !== 'stopwatch' && o.mode !== 'timer') return undefined;
  if (typeof o.running !== 'boolean') return undefined;
  const elapsedMs = o.elapsedMs;
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs)) return undefined;
  if (elapsedMs < 0 || elapsedMs > MAX_ELAPSED_MS) return undefined;
  if (!isValidDuration(o.durationMs)) return undefined;
  const state: TimerState = {
    mode: o.mode,
    running: o.running,
    elapsedMs,
    durationMs: o.durationMs,
  };
  if (o.running) {
    if (typeof o.startedAt !== 'number' || !Number.isFinite(o.startedAt) || o.startedAt <= 0) {
      return undefined;
    }
    state.startedAt = o.startedAt;
  }
  return state;
}
