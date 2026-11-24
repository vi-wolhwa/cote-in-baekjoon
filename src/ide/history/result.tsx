/**
 * Judge results in the 제출 기록 tab (ADR-0012): a two-letter label with an icon in a chip of
 * one width, instead of Baekjoon's sentences of every length ("맞았습니다!!", "런타임 에러
 * (OutOfBounds)"). Green 정답, red 오답 and 초과, yellow 에러; Baekjoon's text is the tooltip.
 */
import type { ComponentChildren } from 'preact';
import type { ResultCode } from '@/boj/status';

export type Tone = 'pass' | 'fail' | 'error' | 'partial' | 'wait' | 'none';
type Glyph = 'check' | 'cross' | 'clock' | 'memory' | 'output' | 'alert' | 'code' | 'dots' | 'half';

export interface ResultView {
  label: string;
  tone: Tone;
  glyph: Glyph;
}

/**
 * The label, colour and icon for a result; `text` is Baekjoon's wording. Labels are two
 * letters (or a short number) so every chip has the same width; the icon tells kinds apart
 * (시간·메모리·출력 초과, 런타임·컴파일 에러) and the tooltip has Baekjoon's words.
 */
export function describeResult(code: ResultCode | undefined, text = ''): ResultView {
  const percent = /(\d{1,3})\s*%/.exec(text)?.[1];
  const points = /(\d{1,3}(?:\.\d+)?)\s*점/.exec(text)?.[1];
  switch (code) {
    case 'ac':
      return { label: '정답', tone: 'pass', glyph: 'check' };
    case 'pac':
      return { label: points ? `${points}점` : '부분', tone: 'partial', glyph: 'half' };
    case 'wa':
      return { label: '오답', tone: 'fail', glyph: 'cross' };
    case 'pe':
      return { label: '형식', tone: 'fail', glyph: 'output' };
    case 'tle':
      return { label: '초과', tone: 'fail', glyph: 'clock' };
    case 'mle':
      return { label: '초과', tone: 'fail', glyph: 'memory' };
    case 'ole':
      return { label: '초과', tone: 'fail', glyph: 'output' };
    case 'rte':
      return { label: '에러', tone: 'error', glyph: 'alert' };
    case 'ce':
      return { label: '에러', tone: 'error', glyph: 'code' };
    case 'wait':
    case 'rejudge-wait':
      return { label: '대기', tone: 'wait', glyph: 'dots' };
    case 'compile':
    case 'judging':
      return { label: percent ? `${percent}%` : '채점', tone: 'wait', glyph: 'dots' };
    case 'del':
      return { label: '불가', tone: 'none', glyph: 'cross' };
    default:
      return { label: '없음', tone: 'none', glyph: 'dots' };
  }
}

const GLYPHS: Record<Glyph, ComponentChildren> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M7 7l10 10M17 7L7 17" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
  memory: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  output: <path d="M5 6h14M5 10h14M5 14h9M5 18h6" />,
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.01" />
    </>
  ),
  code: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />,
  dots: <path d="M6 12h.01M12 12h.01M18 12h.01" />,
  half: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </>
  ),
};

/** A result as a small tinted chip with an icon. */
export function ResultChip({ code, text }: { code: ResultCode | undefined; text: string }) {
  const view = describeResult(code, text);
  return (
    <span class={`result-chip is-${view.tone}`} title={text || view.label}>
      <svg
        class="result-chip-icon"
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {GLYPHS[view.glyph]}
      </svg>
      {view.label}
    </span>
  );
}
