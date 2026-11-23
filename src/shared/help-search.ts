/**
 * Search over the help page's questions (#80). Pure functions, no DOM: the help page renders
 * the hits and highlights them as text nodes and <mark> elements, never as HTML.
 *
 * A query is split into words. A section matches when every word is found somewhere in it:
 * its title, text or keywords (synonyms people search with). Sections whose title matches
 * come first.
 */
import { HELP_SECTIONS, inlineParts, type HelpSection } from './help-content.ts';

/** Lower case, NFC, runs of whitespace as one space, trimmed. */
export function normalize(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The distinct words of a query, normalized. */
export function queryTerms(query: string): string[] {
  const text = normalize(query);
  return text ? [...new Set(text.split(' '))] : [];
}

/** Help text without its inline marks: `code`, **bold** and links become their label. */
export function plainText(text: string): string {
  return inlineParts(text)
    .map((part) => part.text)
    .join('');
}

/** Whether normalized text has the word, also with spaces ignored ("자동제출" finds "자동 제출"). */
function has(text: string, term: string): boolean {
  return text.includes(term) || text.replaceAll(' ', '').includes(term);
}

export interface HelpHit {
  section: HelpSection;
  /** The section's items to show, in their order. */
  items: string[];
  /** Every word is in the title. */
  titleMatch: boolean;
  score: number;
}

const TITLE_SCORE = 10;
const KEYWORD_SCORE = 5;
const TEXT_SCORE = 1;
const FULL_TITLE_BONUS = 20;

/**
 * The sections that match the query, best first. An empty query matches everything in
 * order. Items are filtered to the ones that have a word, unless the title or keywords
 * already answer the whole query (then the section is shown whole).
 */
export function searchHelp(
  query: string,
  sections: readonly HelpSection[] = HELP_SECTIONS,
): HelpHit[] {
  const terms = queryTerms(query);
  if (!terms.length) {
    return sections.map((section) => ({
      section,
      items: section.items,
      titleMatch: false,
      score: 0,
    }));
  }
  const hits: HelpHit[] = [];
  for (const section of sections) {
    const title = normalize(section.title);
    const keywords = (section.keywords ?? []).map(normalize);
    const items = section.items.map((item) => normalize(plainText(item)));
    const text = [section.intro, section.outro]
      .filter((t): t is string => Boolean(t))
      .map((t) => normalize(plainText(t)));
    const body = [...items, ...text];

    let score = 0;
    let all = true;
    for (const term of terms) {
      const inTitle = has(title, term);
      const inKeywords = keywords.some((k) => has(k, term));
      const inBody = body.some((t) => has(t, term));
      if (!inTitle && !inKeywords && !inBody) {
        all = false;
        break;
      }
      if (inTitle) score += TITLE_SCORE;
      if (inKeywords) score += KEYWORD_SCORE;
      if (inBody) score += TEXT_SCORE;
    }
    if (!all) continue;

    const titleMatch = terms.every((term) => has(title, term));
    if (titleMatch) score += FULL_TITLE_BONUS;
    const head = terms.every((term) => has(title, term) || keywords.some((k) => has(k, term)));
    const matching = section.items.filter((_, i) =>
      terms.some((term) => has(items[i] ?? '', term)),
    );
    hits.push({
      section,
      items: head || !matching.length ? section.items : matching,
      titleMatch,
      score,
    });
  }
  // Array.prototype.sort is stable, so equal scores keep the page order.
  return hits.sort((a, b) => b.score - a.score);
}

export interface Segment {
  text: string;
  mark: boolean;
}

/**
 * Splits text into plain and marked runs where the query words occur (case-insensitive).
 * Words found only with spaces ignored are not marked.
 */
export function highlight(text: string, terms: readonly string[]): Segment[] {
  const lower = text.toLowerCase();
  // Lower-casing a few characters changes the length; then offsets would not line up.
  if (!terms.length || !text || lower.length !== text.length)
    return text ? [{ text, mark: false }] : [];
  const ranges: [number, number][] = [];
  for (const term of terms) {
    if (!term) continue;
    for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + term.length)) {
      ranges.push([at, at + term.length]);
    }
  }
  if (!ranges.length) return [{ text, mark: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const segments: Segment[] = [];
  let pos = 0;
  for (const [start, end] of merged) {
    if (start > pos) segments.push({ text: text.slice(pos, start), mark: false });
    segments.push({ text: text.slice(start, end), mark: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), mark: false });
  return segments;
}
