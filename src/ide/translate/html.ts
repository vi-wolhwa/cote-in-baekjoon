/**
 * Translates a problem statement's HTML sentence by sentence while keeping its structure
 * (ADR-0010). Each block with text (a paragraph, a list item, a table cell) is translated as
 * one string, with math (`$…$`, `\(…\)`, `\[…\]`), code, sub/superscripts, images and nested
 * blocks replaced by name-like markers (`ZQX3`) that translators keep in place in the
 * sentence, and put back afterwards. When the translator loses or repeats a marker, that block
 * falls back to translating its text pieces one by one, so the markup always survives.
 */

import { fitParticle } from './josa';

/** Translates several texts at once (one request where the engine allows it), in order. */
export type TranslateMany = (texts: string[]) => Promise<string[]>;

/** Elements kept as they are (not translated) inside a block. */
const KEEP = new Set([
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'VAR',
  'SUP',
  'SUB',
  'IMG',
  'BR',
  'SVG',
  'MATH',
  'SCRIPT',
  'STYLE',
]);
/** Blocks translated on their own. */
const BLOCK = new Set([
  'P',
  'LI',
  'TD',
  'TH',
  'DD',
  'DT',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'DIV',
  'BLOCKQUOTE',
  'CAPTION',
  'FIGCAPTION',
  'UL',
  'OL',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'SECTION',
]);
/** TeX math in text. */
const MATH = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;

const marker = (k: number) => `ZQX${k}`;
const MARKER = /ZQX(\d+)/g;
const hasLetters = (text: string) => /\p{L}/u.test(text.replace(MARKER, ''));

type Part =
  { kind: 'text'; text: string } | { kind: 'keep'; node: Node } | { kind: 'math'; text: string };

/** Whether an element holds translatable text of its own (not only inside child blocks). */
function hasOwnText(el: Element): boolean {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && /[^\s$\\]/.test((n.textContent ?? '').replace(MATH, ''))) return true;
    if (
      n.nodeType === 1 &&
      !BLOCK.has((n as Element).tagName) &&
      !KEEP.has((n as Element).tagName)
    ) {
      if (/\S/.test(n.textContent ?? '')) return true;
    }
  }
  return false;
}

/** Splits a block's inline content into text, math and kept nodes (inline formatting flattened). */
function partsOf(el: Element): Part[] {
  const parts: Part[] = [];
  const walk = (node: Node) => {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) {
        const text = n.textContent ?? '';
        let last = 0;
        for (const m of text.matchAll(MATH)) {
          if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
          parts.push({ kind: 'math', text: m[0] });
          last = m.index + m[0].length;
        }
        if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
      } else if (n.nodeType === 1) {
        const tag = (n as Element).tagName;
        if (KEEP.has(tag) || BLOCK.has(tag)) parts.push({ kind: 'keep', node: n });
        else walk(n); // <b>, <a>, <span>…: their text joins the sentence
      }
    }
  };
  walk(el);
  return parts;
}

const nodeOf = (doc: Document, part: Part): Node =>
  part.kind === 'keep' ? part.node : doc.createTextNode(part.text);

/** Puts the markers' nodes back into the translated sentence; false when a marker is off. */
function rebuild(el: Element, parts: Part[], translated: string): boolean {
  const pieces = translated.split(MARKER); // text, index, text, index, …
  const used = new Set<number>();
  const nodes: Node[] = [];
  const doc = el.ownerDocument;
  let kept: string | undefined; // the text of the piece just put back, for the particle after it
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i] as string;
    if (i % 2 === 0) {
      const text = kept === undefined ? piece : fitParticle(kept, piece);
      if (text) nodes.push(doc.createTextNode(text));
      kept = undefined;
      continue;
    }
    const k = Number(piece);
    const part = parts[k];
    if (!part || part.kind === 'text' || used.has(k)) return false;
    used.add(k);
    nodes.push(nodeOf(doc, part));
    kept = part.kind === 'math' ? part.text : (part.node.textContent ?? '');
  }
  if (used.size !== parts.filter((p) => p.kind !== 'text').length) return false;
  el.replaceChildren(...nodes);
  return true;
}

interface Job {
  el: Element;
  parts: Part[];
  source: string;
}

/** The statement HTML in the target language; structure, math and code unchanged. */
export async function translateHtml(html: string, translateMany: TranslateMany): Promise<string> {
  if (!html.trim()) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  // A section body without block elements is one block itself.
  const wrapper = document.createElement('div');
  wrapper.append(...Array.from(template.content.childNodes));
  const blocks: Element[] = [];
  const visit = (el: Element) => {
    if (KEEP.has(el.tagName)) return;
    if (hasOwnText(el)) blocks.push(el);
    for (const child of Array.from(el.children)) {
      if (BLOCK.has(child.tagName) || !hasOwnText(el)) visit(child);
    }
  };
  visit(wrapper);
  const jobs: Job[] = blocks
    .map((el) => {
      const parts = partsOf(el);
      const source = parts
        .map((p, k) => (p.kind === 'text' ? p.text : marker(k)))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      return { el, parts, source };
    })
    .filter((j) => hasLetters(j.source));
  if (jobs.length === 0) return html;
  const translated = await translateMany(jobs.map((j) => j.source));
  const failed = jobs.filter((j, i) => !rebuild(j.el, j.parts, translated[i] ?? ''));
  if (failed.length > 0) {
    // Markers did not survive: translate those blocks' text pieces one by one, in order.
    const pieces = failed.flatMap((j) =>
      j.parts.flatMap((p) => (p.kind === 'text' && hasLetters(p.text) ? [p.text.trim()] : [])),
    );
    const done = await translateMany(pieces);
    let k = 0;
    for (const j of failed) {
      const doc = j.el.ownerDocument;
      j.el.replaceChildren(
        ...j.parts.map((p) => {
          if (p.kind !== 'text' || !hasLetters(p.text)) return nodeOf(doc, p);
          const lead = /^\s*/.exec(p.text)?.[0] ?? '';
          const trail = /\s*$/.exec(p.text)?.[0] ?? '';
          return doc.createTextNode(`${lead}${done[k++] ?? p.text.trim()}${trail}`);
        }),
      );
    }
  }
  return wrapper.innerHTML;
}

/** Plain text of statement HTML, for detecting its language. */
export function statementText(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const el of Array.from(template.content.querySelectorAll('pre, code, script, style')))
    el.remove();
  return (template.content.textContent ?? '').replace(MATH, ' ').replace(/\s+/g, ' ').trim();
}

/** A guess at the language of a text from its scripts, for when no detector is available. */
export function guessLanguage(text: string): string | undefined {
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const hangul = count(/\p{Script=Hangul}/gu);
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const han = count(/\p{Script=Han}/gu);
  const latin = count(/\p{Script=Latin}/gu);
  const cyrillic = count(/\p{Script=Cyrillic}/gu);
  const total = hangul + kana + han + latin + cyrillic;
  if (total < 20) return undefined;
  if (hangul / total > 0.2) return 'ko';
  if (kana / total > 0.1) return 'ja';
  if (han / total > 0.3) return 'zh';
  if (cyrillic / total > 0.3) return 'ru';
  if (latin / total > 0.5) return 'en';
  return undefined;
}
