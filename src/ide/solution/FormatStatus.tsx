/**
 * The format check at the right end of the '입출력 형식' header: a yellow warning triangle
 * when the format does not fit the samples, a green check when it does. The messages show
 * in a tooltip on hover or focus. The card scrolls (overflow), so the tooltip is fixed to
 * the viewport next to the icon instead of being clipped by the card.
 */
import { useId, useRef, useState } from 'preact/hooks';

interface Props {
  /** Problems to show; empty means the format fits. */
  messages: string[];
  /** Shown in the tooltip when there are no problems. */
  okText: string;
}

const MAX_SHOWN = 5;

export function FormatStatus({ messages, okText }: Props) {
  const warn = messages.length > 0;
  const tipId = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; right: number }>();

  const show = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  };
  const hide = () => setAt(undefined);

  return (
    <span class="format-status">
      <button
        type="button"
        ref={anchor}
        class={`format-status-icon ${warn ? 'is-warn' : 'is-ok'}`}
        aria-label={
          warn ? `형식이 예제와 맞지 않아요 (${messages.length}개)` : '형식이 예제와 맞아요'
        }
        aria-describedby={tipId}
        data-testid={warn ? 'format-warning' : 'format-check'}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {warn ? <WarnIcon /> : <CheckIcon />}
      </button>
      <span
        id={tipId}
        role="tooltip"
        class={`format-tip${at ? ' is-shown' : ''}`}
        style={at ? { top: `${at.top}px`, right: `${at.right}px` } : undefined}
      >
        {warn ? (
          <ul data-testid="format-errors">
            {messages.slice(0, MAX_SHOWN).map((m) => (
              <li key={m}>{m}</li>
            ))}
            {messages.length > MAX_SHOWN && <li>외 {messages.length - MAX_SHOWN}개</li>}
          </ul>
        ) : (
          <span data-testid="format-ok">{okText}</span>
        )}
      </span>
    </span>
  );
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.5 15 14H1z"
        fill="var(--format-warn-icon)"
        stroke="var(--format-warn-icon)"
        stroke-linejoin="round"
      />
      <rect x="7.25" y="5.5" width="1.5" height="4.6" rx="0.5" fill="#2b2200" />
      <circle cx="8" cy="12" r="0.9" fill="#2b2200" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        fill="none"
        stroke="var(--pass)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
