/**
 * Turns the small HTML subset found in problem statements (BaekjoonHub README
 * sections, Baekjoon problem pages) into plain text for format inference.
 * Not a general HTML parser: it only needs to keep words, numbers and line breaks.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  le: '≤',
  ge: '≥',
  ne: '≠',
  times: '×',
  middot: '·',
  hellip: '…',
  minus: '−',
  leq: '≤',
  geq: '≥',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Plain text from an HTML fragment: block ends become line breaks, tags are dropped. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|ul|ol|tr|table|h[1-6]|pre|blockquote)>/gi, '\n')
    .replace(/<(p|div|ul|ol|tr|table|h[1-6]|pre|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<sup\b[^>]*>/gi, '^')
    .replace(/<sub\b[^>]*>/gi, '_')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return normalizeLines(decodeEntities(text));
}

/** Trims each line, collapses runs of blank lines and inner spaces. */
export function normalizeLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sample data keeps its spacing (tokens and line structure matter) but loses
 * CR characters, trailing spaces on each line and leading/trailing blank lines.
 * HTML sources (`<pre>`) must be decoded with `decodeEntities` first; Markdown
 * code fences are literal and must not be.
 */
export function normalizeSample(text: string, copied = true): string {
  const lines = (
    copied
      ? // Blog editors leave zero-width spaces and no-break spaces in copied samples.
        text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ')
      : text
  )
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));
  // Copied code blocks indented as a whole: drop the indent every line shares. Samples read
  // from Baekjoon itself (`copied` false) are kept as they are.
  const indents = lines.filter((l) => l !== '').map((l) => /^[ \t]*/.exec(l)?.[0].length ?? 0);
  const common = copied && indents.length > 0 ? Math.min(...indents) : 0;
  return lines
    .map((l) => l.slice(common))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}
