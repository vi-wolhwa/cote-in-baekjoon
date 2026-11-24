/**
 * Reads problem sections out of a solution repository's README.md.
 *
 * Two layouts are common (see scripts/formats/README.md):
 * - BaekjoonHub: `### 문제 설명`, `### 입력`, `### 출력` with HTML bodies, no samples.
 * - Sample READMEs: `## 문제`, `## 예제 입력 1` + a code fence, `## 예제 출력 1` + a code fence.
 * Any mix of the two is handled: each heading is classified on its own.
 */
import { decodeEntities, htmlToText, normalizeSample } from './html-text.ts';

export interface Sample {
  input: string;
  output: string;
}

export interface ReadmeSections {
  /** Problem id from a link to acmicpc.net/problem/{id}, when present. */
  linkedId: number | null;
  /** First heading's text, e.g. `[Bronze V] A+B - 1000` or `[1000. A+B](...)`. */
  heading: string | null;
  input: string | null;
  output: string | null;
  constraints: string | null;
  samples: Sample[];
}

type SectionKind =
  | { kind: 'input' }
  | { kind: 'output' }
  | { kind: 'constraints' }
  | { kind: 'sample-in'; n: number }
  | { kind: 'sample-out'; n: number }
  | { kind: 'other' };

/** Heading-like lines: Markdown `#` headings or a line that is only bold text. */
const HEADING = /^(?:#{1,6}[ \t]*(.+?)[ \t#]*|\*\*([^*\n]+)\*\*[ \t]*:?)$/;

export function classifyHeading(raw: string): SectionKind {
  const text = raw
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`:：]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sample = /^예제\s*(입력|출력)\s*(\d+)?$/.exec(text);
  if (sample) {
    const n = Number(sample[2] ?? '1');
    return sample[1] === '입력' ? { kind: 'sample-in', n } : { kind: 'sample-out', n };
  }
  if (/^입력(\s*형식)?$/.test(text) || /^input$/i.test(text)) return { kind: 'input' };
  if (/^출력(\s*형식)?$/.test(text) || /^output$/i.test(text)) return { kind: 'output' };
  if (/^제한(\s*사항)?$/.test(text)) return { kind: 'constraints' };
  return { kind: 'other' };
}

interface RawSection {
  heading: string;
  body: string;
}

/** Splits Markdown into heading + body pairs, ignoring `#` lines inside code fences. */
export function splitSections(markdown: string): { first: string | null; sections: RawSection[] } {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const sections: RawSection[] = [];
  let first: string | null = null;
  let current: RawSection | null = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = inFence ? null : HEADING.exec(line.trim());
    if (match && !/^\s*(```|~~~)/.test(line)) {
      const heading = (match[1] ?? match[2] ?? '').trim();
      first ??= heading;
      current = { heading, body: '' };
      sections.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  return { first, sections };
}

/** First code fence or `<pre>` block in a section body, if any. */
export function extractBlock(raw: string): string | null {
  // Blocks quoted with `> ` (some blogs): the quote marker of the closing line is not sample text.
  const quoted = /(^|\n)[ \t]*>[ \t]?(<pre\b|```|~~~)/i.test(raw);
  const body = quoted ? raw.replace(/^[ \t]*>[ \t]?/gm, '') : raw;
  const fence = /(^|\n)[ \t]*(```|~~~)[^\n]*\n([\s\S]*?)\n?[ \t]*\2[ \t]*(?=\n|$)/.exec(body);
  if (fence) return normalizeSample(fence[3] ?? '');
  const pre = /<pre\b[^>]*>([\s\S]*?)<\/pre>/i.exec(body);
  if (pre) return normalizeSample(decodeEntities((pre[1] ?? '').replace(/<[^>]+>/g, '')));
  return null;
}

/** Text body of a description section (HTML or Markdown) as plain text. */
function sectionText(body: string): string | null {
  const text = htmlToText(body.replace(/^[ \t]*>[ \t]?/gm, ''));
  // BaekjoonHub writes "Empty" when the section on Baekjoon is empty (no input, func problems).
  if (text === 'Empty') return '';
  return text === '' ? null : text;
}

export function parseReadme(markdown: string): ReadmeSections {
  const { first, sections } = splitSections(markdown);
  const result: ReadmeSections = {
    linkedId: null,
    heading: first,
    input: null,
    output: null,
    constraints: null,
    samples: [],
  };
  const link = /acmicpc\.net\/problem\/(\d+)/.exec(markdown);
  if (link) result.linkedId = Number(link[1]);

  const inputs = new Map<number, string>();
  const outputs = new Map<number, string>();
  for (const { heading, body } of sections) {
    const kind = classifyHeading(heading);
    switch (kind.kind) {
      case 'input':
        result.input ??= sectionText(body);
        break;
      case 'output':
        result.output ??= sectionText(body);
        break;
      case 'constraints':
        result.constraints ??= sectionText(body);
        break;
      case 'sample-in': {
        const block = extractBlock(body);
        if (block !== null && !inputs.has(kind.n)) inputs.set(kind.n, block);
        break;
      }
      case 'sample-out': {
        const block = extractBlock(body);
        if (block !== null && !outputs.has(kind.n)) outputs.set(kind.n, block);
        break;
      }
      case 'other':
        break;
    }
  }
  const numbers = [...inputs.keys()].filter((n) => outputs.has(n)).sort((a, b) => a - b);
  result.samples = numbers.map((n) => ({
    input: inputs.get(n) ?? '',
    output: outputs.get(n) ?? '',
  }));
  return result;
}

/**
 * Whether a parsed README belongs to problem `id`: it links to the problem page,
 * or its first heading carries the id as a whole number (`- 1000`, `1000.`).
 */
export function readmeMatchesId(sections: ReadmeSections, id: number): boolean {
  if (sections.linkedId !== null) return sections.linkedId === id;
  return sections.heading !== null && new RegExp(`(^|\\D)${id}(\\D|$)`).test(sections.heading);
}
