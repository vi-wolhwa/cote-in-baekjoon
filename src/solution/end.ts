/**
 * End lines of the format DSL (ADR-0006): where `until` stops reading cases or lines.
 * "EOF" reads to the end of input; "<0" stops at a line whose first token is a negative
 * number, "<=0" at zero or a negative number; text ending in "*" ("#*") stops at a line that
 * starts with the text before it; anything else is the exact end line ("0 0"). The end line
 * is read and is not part of any value.
 */

export type End =
  | { kind: 'eof' }
  /** The whole line (tokens joined by one space; line[]: its text). */
  | { kind: 'line'; text: string }
  /** The first token is a number below zero, or with `zero`, at most zero. */
  | { kind: 'neg'; zero: boolean }
  /** The line starts with `text`. */
  | { kind: 'prefix'; text: string };

/** "#*": a prefix; "***" stays an exact line (its text before the last "*" ends in "*"). */
const PREFIX = /^(.*[^*])\*$/s;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseEnd(until: string): End {
  if (until === 'EOF') return { kind: 'eof' };
  if (until === '<0') return { kind: 'neg', zero: false };
  if (until === '<=0') return { kind: 'neg', zero: true };
  const prefix = PREFIX.exec(until);
  if (prefix) return { kind: 'prefix', text: prefix[1] as string };
  return { kind: 'line', text: until };
}

/** True for end lines found by tokens alone: an exact line (the glue may use its fast path). */
export const isExactEnd = (end: End): end is { kind: 'line'; text: string } => end.kind === 'line';

/**
 * Whether a line ends the reading. `text` is the line as compared: tokens joined by one
 * space, or for line[] its text with only the end trimmed.
 */
export function matchesEnd(end: End, text: string): boolean {
  switch (end.kind) {
    case 'eof':
      return false;
    case 'line':
      return text === end.text;
    case 'prefix':
      return text.startsWith(end.text);
    case 'neg': {
      const first = text.trim().split(/\s+/)[0] ?? '';
      if (!NUMBER.test(first)) return false;
      const x = Number(first);
      return end.zero ? x <= 0 : x < 0;
    }
  }
}

/** An end line written back as input when the one actually read is not known. */
export function endText(end: End): string {
  switch (end.kind) {
    case 'eof':
      return '';
    case 'line':
      return end.text;
    case 'prefix':
      return end.text;
    case 'neg':
      return end.zero ? '0' : '-1';
  }
}
