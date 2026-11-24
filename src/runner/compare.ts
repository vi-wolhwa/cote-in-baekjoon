/**
 * Compares program output with the expected output, ignoring trailing
 * whitespace on each line and trailing blank lines (as most judges do).
 *
 * With `tol` (problems that accept real answers within an error, "오차 10^-6까지 허용"), tokens
 * that are both numbers match when their absolute or relative difference is at most `tol`;
 * everything else must still be equal.
 */
export function outputsMatch(actual: string, expected: string, tol?: number): boolean {
  const a = normalize(actual);
  const e = normalize(expected);
  if (a === e) return true;
  if (tol === undefined) return false;
  const at = a.split(/\s+/).filter(Boolean);
  const et = e.split(/\s+/).filter(Boolean);
  if (at.length !== et.length) return false;
  return at.every((x, i) => {
    const y = et[i] as string;
    if (x === y) return true;
    if (!NUMBER.test(x) || !NUMBER.test(y)) return false;
    const p = Number(x);
    const q = Number(y);
    const diff = Math.abs(p - q);
    return diff <= tol || diff <= tol * Math.abs(q);
  });
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}
