/**
 * The timer popover (docs/design/ide-spec.md §10): 스톱워치 | 타이머, a large time, and the
 * controls. Not modal: the rest of the screen stays usable. Before a countdown starts its
 * time is two fields (시간, 분) with quick picks; the default is 30분.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  describeMinutes,
  DURATION_PRESETS_MIN,
  durationFrom,
  formatState,
  isFinished,
  isIdle,
  pause,
  reset,
  restart,
  setDuration,
  setMode,
  splitDuration,
  start,
  type TimerMode,
  type TimerState,
} from './timer';
import type { TimerAction } from './useTimer';

interface Props {
  state: TimerState;
  now: number;
  update: (action: TimerAction) => void;
}

const MODES: { value: TimerMode; label: string }[] = [
  { value: 'stopwatch', label: '스톱워치' },
  { value: 'timer', label: '타이머' },
];

export function TimerPopover({ state, now, update }: Props) {
  const idle = isIdle(state);
  const finished = isFinished(state, now);
  const editing = state.mode === 'timer' && idle;
  const [draftValid, setDraftValid] = useState(true);
  const primary = useRef<HTMLButtonElement>(null);

  // Keyboard users land on the main action.
  useEffect(() => primary.current?.focus(), []);

  let main: { label: string; action: TimerAction; disabled?: boolean };
  if (finished) main = { label: '다시 시작', action: restart };
  else if (state.running) main = { label: '일시정지', action: pause };
  else main = { label: '시작', action: start, disabled: editing && !draftValid };

  const minutes = Math.round(state.durationMs / 60_000);
  return (
    <div
      class={`timer-pop${finished ? ' is-done' : ''}`}
      role="dialog"
      aria-label="타이머"
      data-mode={state.mode}
    >
      <div
        class="timer-modes"
        role="radiogroup"
        aria-label="종류"
        title={idle ? undefined : '초기화하면 바꿀 수 있어요'}
      >
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={state.mode === m.value}
            disabled={!idle && state.mode !== m.value}
            onClick={() => update((s) => setMode(s, m.value))}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Fixed height: the popover keeps its size in every mode and state. */}
      <div class="timer-body">
        {editing ? (
          <DurationFields
            durationMs={state.durationMs}
            onDuration={(ms) => update((s) => setDuration(s, ms))}
            onValidity={setDraftValid}
          />
        ) : (
          <p class="timer-display" aria-live="off" data-testid="timer-display">
            {formatState(state, now)}
          </p>
        )}

        {state.mode === 'timer' && !idle && !finished && (
          <p class="timer-note">{describeMinutes(minutes)} 타이머</p>
        )}
        {finished && (
          <p class="timer-note timer-done">시간 종료 · {describeMinutes(minutes)}이 지났어요.</p>
        )}
      </div>

      <div class="timer-actions">
        <button
          ref={primary}
          type="button"
          class="btn btn-primary"
          disabled={main.disabled}
          onClick={() => update(main.action)}
        >
          {main.label}
        </button>
        <button
          type="button"
          class="btn btn-dark"
          disabled={idle}
          onClick={() => update((s) => reset(s))}
        >
          초기화
        </button>
      </div>
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "0시간 30분" with both numbers editable. Arrow keys step by one. */
function DurationFields(props: {
  durationMs: number;
  onDuration: (ms: number) => void;
  onValidity: (valid: boolean) => void;
}) {
  const { durationMs, onDuration, onValidity } = props;
  const parts = splitDuration(durationMs);
  const [hours, setHours] = useState(String(parts.hours));
  const [minutes, setMinutes] = useState(pad2(parts.minutes));
  /** The duration these fields last sent; anything else (a quick pick) refills them. */
  const sent = useRef(durationMs);
  // Fields left half-typed must not keep 시작 disabled once they are gone.
  useEffect(() => () => onValidity(true), []);

  useEffect(() => {
    if (durationMs === sent.current) return;
    sent.current = durationMs;
    const p = splitDuration(durationMs);
    setHours(String(p.hours));
    setMinutes(pad2(p.minutes));
    onValidity(true);
  }, [durationMs]);

  const apply = (h: string, m: string) => {
    setHours(h);
    setMinutes(m);
    const ms = durationFrom(Number(h || '0'), Number(m || '0'));
    onValidity(ms !== undefined);
    if (ms !== undefined && ms !== durationMs) {
      sent.current = ms;
      onDuration(ms);
    }
  };

  const field = (which: 'h' | 'm') => {
    const value = which === 'h' ? hours : minutes;
    const max = which === 'h' ? 9 : 59;
    const set = (v: string) => (which === 'h' ? apply(v, minutes) : apply(hours, v));
    return (
      <input
        class="timer-field"
        type="text"
        inputMode="numeric"
        maxLength={which === 'h' ? 1 : 2}
        aria-label={which === 'h' ? '시간' : '분'}
        value={value}
        onInput={(e) => {
          const digits = e.currentTarget.value.replace(/\D/g, '');
          // Preact skips the update when the state does not change, so drop non-digits here.
          e.currentTarget.value = digits;
          set(digits);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const n = Math.min(
            max,
            Math.max(0, Number(value || '0') + (e.key === 'ArrowUp' ? 1 : -1)),
          );
          set(which === 'h' ? String(n) : pad2(n));
        }}
        onBlur={() => {
          // Tidy up: "5" becomes "05" and an empty field "0". An invalid total stays as typed
          // (시작 is disabled and a note says why), so it can be fixed in the other field.
          if (which === 'm') setMinutes(pad2(Number(minutes || '0')));
          else setHours(String(Number(hours || '0')));
        }}
      />
    );
  };

  const valid = durationFrom(Number(hours || '0'), Number(minutes || '0'));
  return (
    <>
      <div class="timer-display timer-edit">
        {field('h')}
        <span class="timer-unit">시간</span>
        {field('m')}
        <span class="timer-unit">분</span>
      </div>
      <div class="timer-presets" role="group" aria-label="빠른 선택">
        {DURATION_PRESETS_MIN.map((m) => (
          <button
            key={m}
            type="button"
            class="timer-chip"
            aria-pressed={valid === m * 60_000}
            onClick={() => apply(String(Math.floor(m / 60)), pad2(m % 60))}
          >
            {m}분
          </button>
        ))}
      </div>
      {valid === undefined && <p class="timer-note">1분에서 9시간 59분 사이로 정해 주세요.</p>}
    </>
  );
}
