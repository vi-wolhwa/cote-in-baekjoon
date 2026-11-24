/**
 * Standard input as lines, for the strict reader (reader.ts), the writer (writer.ts) and the
 * round-trip comparison of sample validation (validate.ts).
 */

/** A line with its number (1-based). */
export interface Line {
  no: number;
  /** The line without trailing spaces. */
  text: string;
  /** The line exactly as given (only "\r" dropped), for `raw` parameters. */
  raw: string;
  tokens: string[];
  blank: boolean;
}

/** Every physical line; a final newline does not start another line. */
export function physicalLines(text: string): Line[] {
  const parts = text.replace(/\r\n?/g, '\n').split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.map((raw, i) => {
    const trimmed = raw.trim();
    return {
      no: i + 1,
      text: raw.trimEnd(),
      raw,
      tokens: trimmed === '' ? [] : trimmed.split(/\s+/),
      blank: trimmed === '',
    };
  });
}

/** Lines with their numbers; blank lines are left out. */
export function inputLines(text: string): Line[] {
  return physicalLines(text).filter((l) => !l.blank);
}

/** Tokens compare as numbers when both are numbers: "3.10" and "3.1", "+5" and "5". */
function sameToken(t: string, u: string): boolean {
  if (t === u) return true;
  const x = Number(t);
  const y = Number(u);
  return /^[+-]?[\d.]/.test(t) && /^[+-]?[\d.]/.test(u) && Number.isFinite(x) && x === y;
}

const sameTokens = (a: string[], b: string[]) =>
  a.length === b.length && a.every((t, k) => sameToken(t, b[k] as string));

/**
 * True when two inputs hold the same tokens on the same lines. Numbers compare by value,
 * so "3.10" and "3.1", or "+5" and "5", are the same.
 */
export function sameInput(a: string, b: string): boolean {
  const la = inputLines(a);
  const lb = inputLines(b);
  if (la.length !== lb.length) return false;
  return la.every((line, i) => sameTokens(line.tokens, (lb[i] as Line).tokens));
}

/** True when two inputs hold the same tokens in order, wherever the lines break (flow arrays). */
export function sameTokenStream(a: string, b: string): boolean {
  const ta = inputLines(a).flatMap((l) => l.tokens);
  const tb = inputLines(b).flatMap((l) => l.tokens);
  return sameTokens(ta, tb);
}

/**
 * True when two inputs have the same physical lines, blank lines included (raw parameters).
 * A line is the same when its text is, or its tokens are; blank lines at the end are ignored.
 */
export function sameRawLines(a: string, b: string): boolean {
  const trim = (lines: Line[]) => {
    while (lines.length > 0 && (lines[lines.length - 1] as Line).blank) lines.pop();
    return lines;
  };
  const la = trim(physicalLines(a));
  const lb = trim(physicalLines(b));
  if (la.length !== lb.length) return false;
  return la.every((line, i) => {
    const other = lb[i] as Line;
    return line.raw === other.raw || sameTokens(line.tokens, other.tokens);
  });
}
