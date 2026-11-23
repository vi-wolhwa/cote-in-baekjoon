/**
 * The sidebar timer's state for one problem: loaded from and saved to `timer:{id}`, kept in
 * step with other tabs showing the same problem, and a clock that ticks only while needed.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import * as store from './storage';
import { initialTimer, isFinished, parseTimer, timerKey, type TimerState } from './timer';

export type TimerAction = (state: TimerState, now: number) => TimerState;

export function useTimer(problemId: number) {
  const [state, setState] = useState<TimerState>(initialTimer);
  const current = useRef(state);
  current.current = state;

  useEffect(() => {
    let live = true;
    setState(initialTimer());
    store.loadTimer(problemId).then(
      (saved) => {
        if (live && saved) setState(saved);
      },
      () => undefined,
    );
    // Another tab with the same problem started or reset it.
    const key = timerKey(problemId);
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local' || problemId <= 0 || !(key in changes)) return;
      setState(parseTimer(changes[key]?.newValue) ?? initialTimer());
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      live = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [problemId]);

  const update = (action: TimerAction) => {
    const next = action(current.current, Date.now());
    if (next === current.current) return;
    current.current = next;
    setState(next);
    store.saveTimer(problemId, next).catch(() => undefined);
  };

  const now = useNow(state.running && !isFinished(state, Date.now()));
  return { state, now, update };
}

/**
 * The current time, refreshed four times a second while `active` so the shown second never
 * lags by much. The time itself always comes from Date.now(), not from counting ticks.
 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return active ? now : Date.now();
}
