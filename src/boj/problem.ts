/**
 * Reads a Baekjoon problem from the problem page the user has open.
 * No network requests: everything comes from the current document (ADR-0001).
 */

export interface Sample {
  input: string;
  output: string;
}

export interface ProblemSections {
  description: string;
  input: string;
  output: string;
  limit?: string;
  hint?: string;
}

export interface Problem {
  id: number;
  title: string;
  timeLimitText: string;
  memoryLimitText: string;
  /** Time limit in milliseconds, if it could be read. */
  timeLimitMs?: number;
  /** Raw (unsanitized) HTML per section. Sanitize before rendering. */
  sections: ProblemSections;
  samples: Sample[];
  /** Problem type labels such as "spj", "interactive", "func", "subtask". */
  labels: string[];
}

const BOJ_ORIGIN = 'https://acmicpc.net';

export function parseProblemId(url: string): number | undefined {
  const m = /^https:\/\/(?:www\.)?acmicpc\.net\/problem\/(\d+)(?:[/?#]|$)/.exec(url);
  return m ? Number(m[1]) : undefined;
}

export function parseTimeLimitMs(text: string): number | undefined {
  const m = /([\d.]+)\s*초/.exec(text);
  if (!m) return undefined;
  const seconds = Number(m[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined;
}

export function parseProblem(doc: Document, url: string): Problem | undefined {
  const id = parseProblemId(url);
  const title = doc.querySelector('#problem_title')?.textContent?.trim();
  const description = sectionHtml(doc, '#problem_description');
  if (id === undefined || !title || description === undefined) return undefined;

  const infoCells = doc.querySelectorAll('#problem-info tbody tr:first-child td');
  const timeLimitText = infoCells[0]?.textContent?.trim() ?? '';
  const memoryLimitText = infoCells[1]?.textContent?.trim() ?? '';

  const samples: Sample[] = [];
  for (let n = 1; ; n++) {
    const input = doc.querySelector(`#sample-input-${n}`);
    const output = doc.querySelector(`#sample-output-${n}`);
    if (!input || !output) break;
    samples.push({ input: input.textContent ?? '', output: output.textContent ?? '' });
  }

  const labels = [...doc.querySelectorAll('.problem-label')]
    .flatMap((el) => [...el.classList])
    .filter((c) => c.startsWith('problem-label-'))
    .map((c) => c.slice('problem-label-'.length));

  return {
    id,
    title,
    timeLimitText,
    memoryLimitText,
    timeLimitMs: parseTimeLimitMs(timeLimitText),
    sections: {
      description,
      input: sectionHtml(doc, '#problem_input') ?? '',
      output: sectionHtml(doc, '#problem_output') ?? '',
      limit: nonEmpty(sectionHtml(doc, '#problem_limit')),
      hint: nonEmpty(sectionHtml(doc, '#problem_hint')),
    },
    samples,
    labels: [...new Set(labels)],
  };
}

/** Returns the section's inner HTML with relative URLs made absolute. */
function sectionHtml(doc: Document, selector: string): string | undefined {
  const el = doc.querySelector(selector);
  if (!el) return undefined;
  const copy = el.cloneNode(true) as Element;
  restoreMathSource(copy);
  for (const node of copy.querySelectorAll('[src], [href]')) {
    for (const attr of ['src', 'href']) {
      const value = node.getAttribute(attr);
      if (value && value.startsWith('/') && !value.startsWith('//')) {
        node.setAttribute(attr, BOJ_ORIGIN + value);
      }
    }
  }
  return copy.innerHTML.trim();
}

/**
 * Baekjoon's MathJax replaces TeX with rendered output by the time the user clicks.
 * Its config appends the original source (delimiters included) to every formula as a
 * hidden `.mjx-copytext` span, so put that source back and let the IDE render it again.
 * Without a copy span, fall back to the assistive MathML the browser can draw itself.
 */
export function restoreMathSource(root: Element) {
  for (const container of root.querySelectorAll('mjx-container')) {
    const source = container.querySelector('.mjx-copytext')?.textContent?.replace(/\u200a/g, '');
    if (source) {
      container.replaceWith(root.ownerDocument.createTextNode(source));
      continue;
    }
    const mathml = container.querySelector('mjx-assistive-mml math');
    if (mathml) container.replaceWith(mathml);
  }
}

function nonEmpty(html: string | undefined): string | undefined {
  return html && html.replace(/<[^>]*>/g, '').trim() ? html : undefined;
}
