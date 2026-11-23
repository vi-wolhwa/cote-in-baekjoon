/**
 * Compares program output with the expected output, ignoring trailing
 * whitespace on each line and trailing blank lines (as most judges do).
 */
export function outputsMatch(actual: string, expected: string): boolean {
  return normalize(actual) === normalize(expected);
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}
