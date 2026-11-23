/**
 * "타이머" in the right sidebar (docs/design/ide-spec.md §10): a stopwatch by default, or a
 * countdown. The button keeps its 32×32 size; the time shows under it once started. Clicking
 * opens a popover to the left. The time keeps counting while the popover is closed, and the
 * popover opens by itself when a countdown ends, so a focused user notices.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { TimerIcon } from './icons';
import { isActive, isFinished, formatState } from './timer';
import { TimerPopover } from './TimerPopover';
import { useTimer } from './useTimer';

export function TimerTool({ problemId }: { problemId: number }) {
  const { state, now, update } = useTimer(problemId);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const finished = isFinished(state, now);
  const active = isActive(state);

  // "시간 종료" is announced once when the countdown ends, never every second.
  const [announcement, setAnnouncement] = useState('');
  const wasFinished = useRef(finished);
  useEffect(() => {
    if (finished && !wasFinished.current) {
      setAnnouncement('시간 종료');
      setOpen(true);
    }
    if (!finished) setAnnouncement('');
    wasFinished.current = finished;
  }, [finished]);

  // Clicking anywhere else closes the popover.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };

  const status = finished ? 'done' : state.running ? 'running' : 'paused';
  return (
    <div
      class="timer-tool"
      ref={root}
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        class={`sidebar-button timer-button${active ? ` is-${status}` : ''}`}
        title="타이머"
        aria-label="타이머"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <TimerIcon />
      </button>
      {active && (
        <span class={`timer-badge is-${status}`} data-testid="timer-badge" aria-hidden="true">
          {formatState(state, now)}
        </span>
      )}
      <p class="visually-hidden" role="status">
        {announcement}
      </p>
      {open && <TimerPopover state={state} now={now} update={update} />}
    </div>
  );
}
