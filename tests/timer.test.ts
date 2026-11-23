import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DURATION_MS,
  describeMinutes,
  displayMs,
  durationFrom,
  elapsed,
  formatState,
  formatTime,
  initialTimer,
  isActive,
  isFinished,
  isIdle,
  isValidDuration,
  parseTimer,
  pause,
  remaining,
  reset,
  restart,
  setDuration,
  setMode,
  splitDuration,
  start,
  timerKey,
  type TimerState,
} from '@/ide/timer';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('stopwatch', () => {
  it('starts as an idle stopwatch with a 30-minute countdown ready', () => {
    const s = initialTimer();
    expect(s).toEqual({ mode: 'stopwatch', running: false, elapsedMs: 0, durationMs: 30 * MIN });
    expect(isIdle(s)).toBe(true);
    expect(isActive(s)).toBe(false);
    expect(formatState(s, T0)).toBe('00:00');
  });

  it('counts across pause and resume from timestamps', () => {
    let s = start(initialTimer(), T0);
    expect(s).toMatchObject({ running: true, startedAt: T0 });
    expect(elapsed(s, T0 + 5_000)).toBe(5_000);
    s = pause(s, T0 + 5_000);
    expect(s).toEqual({
      mode: 'stopwatch',
      running: false,
      elapsedMs: 5_000,
      durationMs: 30 * MIN,
    });
    // Paused time does not count.
    expect(elapsed(s, T0 + 60_000)).toBe(5_000);
    s = start(s, T0 + 60_000);
    expect(elapsed(s, T0 + 62_500)).toBe(7_500);
    expect(formatState(s, T0 + 62_500)).toBe('00:07');
    expect(isFinished(s, T0 + 10 * 3_600_000)).toBe(false);
  });

  it('ignores start while running and pause while paused', () => {
    const running = start(initialTimer(), T0);
    expect(start(running, T0 + 1_000)).toBe(running);
    const paused = pause(running, T0 + 1_000);
    expect(pause(paused, T0 + 2_000)).toBe(paused);
  });

  it('treats a start time in the future (clock moved back) as now', () => {
    const s = start(initialTimer(), T0);
    expect(elapsed(s, T0 - 10_000)).toBe(0);
  });

  it('resets to zero and keeps the mode and duration', () => {
    const s = reset(pause(start(setMode(initialTimer(), 'timer'), T0), T0 + 3_000));
    expect(s).toEqual({ mode: 'timer', running: false, elapsedMs: 0, durationMs: 30 * MIN });
  });
});

describe('countdown timer', () => {
  const timer = (minutes = 30) => setDuration(setMode(initialTimer(), 'timer'), minutes * MIN);

  it('counts down and rounds the shown second up', () => {
    const s = start(timer(), T0);
    expect(formatState(s, T0)).toBe('30:00');
    expect(formatState(s, T0 + 400)).toBe('30:00');
    expect(formatState(s, T0 + 1_000)).toBe('29:59');
    expect(remaining(s, T0 + 10 * MIN)).toBe(20 * MIN);
    expect(displayMs(s, T0 + 10 * MIN)).toBe(20 * MIN);
  });

  it('finishes at zero and stays at zero', () => {
    const s = start(timer(1), T0);
    expect(isFinished(s, T0 + MIN - 1)).toBe(false);
    expect(formatState(s, T0 + MIN - 1)).toBe('00:01');
    expect(isFinished(s, T0 + MIN)).toBe(true);
    expect(remaining(s, T0 + 5 * MIN)).toBe(0);
    expect(formatState(s, T0 + 5 * MIN)).toBe('00:00');
    // Cannot start again without a reset; 다시 시작 does that.
    const paused = pause(s, T0 + 5 * MIN);
    expect(paused.elapsedMs).toBe(MIN);
    expect(start(paused, T0 + 6 * MIN)).toBe(paused);
    const again = restart(paused, T0 + 6 * MIN);
    expect(again).toMatchObject({ running: true, startedAt: T0 + 6 * MIN, elapsedMs: 0 });
  });

  it('changes the mode and the duration only while idle', () => {
    const running = start(timer(), T0);
    expect(setMode(running, 'stopwatch')).toBe(running);
    expect(setDuration(running, 60 * MIN)).toBe(running);
    const paused = pause(running, T0 + 1_000);
    expect(setMode(paused, 'stopwatch')).toBe(paused);
    expect(setMode(reset(paused), 'stopwatch').mode).toBe('stopwatch');
    expect(setDuration(timer(), 90 * MIN).durationMs).toBe(90 * MIN);
  });
});

describe('durations', () => {
  it('accepts whole minutes from 1분 to 9시간 59분', () => {
    expect(isValidDuration(MIN)).toBe(true);
    expect(isValidDuration(DEFAULT_DURATION_MS)).toBe(true);
    expect(isValidDuration((9 * 60 + 59) * MIN)).toBe(true);
    for (const bad of [0, -MIN, 30_000, 10 * 60 * MIN, MIN + 1, Number.NaN, '60000', undefined]) {
      expect(isValidDuration(bad)).toBe(false);
    }
    expect(setDuration(setMode(initialTimer(), 'timer'), 0).durationMs).toBe(30 * MIN);
  });

  it('reads the hour and minute fields', () => {
    expect(durationFrom(0, 30)).toBe(30 * MIN);
    expect(durationFrom(1, 30)).toBe(90 * MIN);
    expect(durationFrom(0, 0)).toBeUndefined();
    expect(durationFrom(0, 60)).toBeUndefined();
    expect(durationFrom(10, 0)).toBeUndefined();
    expect(durationFrom(1.5, 0)).toBeUndefined();
    expect(splitDuration(150 * MIN)).toEqual({ hours: 2, minutes: 30 });
  });

  it('describes minutes in Korean', () => {
    expect(describeMinutes(30)).toBe('30분');
    expect(describeMinutes(60)).toBe('1시간');
    expect(describeMinutes(90)).toBe('1시간 30분');
  });
});

describe('formatTime', () => {
  it('uses mm:ss under an hour and h:mm:ss from an hour', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(5_999)).toBe('00:05');
    expect(formatTime(5_001, 'up')).toBe('00:06');
    expect(formatTime(754_000)).toBe('12:34');
    expect(formatTime(3_600_000)).toBe('1:00:00');
    expect(formatTime(3_723_000)).toBe('1:02:03');
    expect(formatTime(-5)).toBe('00:00');
  });
});

describe('stored timer', () => {
  const valid: TimerState = {
    mode: 'timer',
    running: true,
    startedAt: T0,
    elapsedMs: 1_000,
    durationMs: 60 * MIN,
  };

  it('uses timer:{problemId}', () => {
    expect(timerKey(1000)).toBe('timer:1000');
  });

  it('reads a valid state, also after a JSON round trip', () => {
    expect(parseTimer(valid)).toEqual(valid);
    const paused = pause(valid, T0 + 1_000);
    expect(parseTimer(JSON.parse(JSON.stringify(paused)))).toEqual(paused);
  });

  it('refuses anything else', () => {
    for (const bad of [
      undefined,
      null,
      'timer',
      [],
      { ...valid, mode: 'clock' },
      { ...valid, running: 'yes' },
      { ...valid, elapsedMs: -1 },
      { ...valid, elapsedMs: Number.POSITIVE_INFINITY },
      { ...valid, elapsedMs: 1e15 },
      { ...valid, durationMs: 0 },
      { ...valid, durationMs: 12 * 60 * MIN },
      { ...valid, startedAt: undefined },
      { ...valid, startedAt: 'now' },
      { ...valid, startedAt: -5 },
    ]) {
      expect(parseTimer(bad)).toBeUndefined();
    }
  });

  it('drops a start time on a paused state', () => {
    expect(parseTimer({ ...valid, running: false })).toEqual({
      mode: 'timer',
      running: false,
      elapsedMs: 1_000,
      durationMs: 60 * MIN,
    });
  });

  it('is left out of backups', async () => {
    const { isBackupKey } = await import('@/shared/backup');
    expect(isBackupKey(timerKey(1000))).toBe(false);
  });
});
