/**
 * 'solution 함수' switch in the title row (ADR-0006). Without a usable format it shows off,
 * says why on hover and to screen readers, and offers '형식 만들기' instead.
 */
interface Props {
  on: boolean;
  /** Why it cannot be turned on (no format, or an excluded problem type). */
  reason?: string;
  busy?: boolean;
  onChange: (on: boolean) => void;
  /** Opens the format editor to define a format (only when no format exists). */
  onDefine?: () => void;
}

export function SolutionToggle({ on, reason, busy, onChange, onDefine }: Props) {
  const blocked = reason !== undefined;
  return (
    <div class="solution-toggle" title={reason}>
      <button
        type="button"
        role="switch"
        class={`switch${on ? ' is-on' : ''}`}
        aria-checked={on}
        aria-disabled={blocked || busy}
        aria-describedby={blocked ? 'solution-reason' : undefined}
        onClick={() => {
          if (!blocked && !busy) onChange(!on);
        }}
      >
        <span class="switch-track" aria-hidden="true">
          <span class="switch-thumb" />
        </span>
        solution 함수
      </button>
      {blocked && (
        <span id="solution-reason" class="visually-hidden">
          {reason}
        </span>
      )}
      {blocked && onDefine && (
        <button type="button" class="link-chip" onClick={onDefine}>
          형식 만들기
        </button>
      )}
    </div>
  );
}
