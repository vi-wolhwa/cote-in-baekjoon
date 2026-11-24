/**
 * Reading hints from a problem's input/output description for format inference (#115):
 * variable letters per input line ("첫째 줄에 N과 M이"), value bounds (10^18 → long),
 * name cues ("간선" → edges) and case cues ("테스트 케이스", "0 0이 주어지면 끝"). The text
 * is untrusted HTML; it is only matched with regular expressions, never rendered.
 */

/** HTML (with TeX) → plain text with `^` powers kept, e.g. "1 ≤ N ≤ 10^5". */
export function htmlToText(html: string): string {
  return html
    .replace(/<sup>\s*([^<]*)<\/sup>/gi, '^$1')
    .replace(/<sub>\s*([^<]*)<\/sub>/gi, '_$1')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&le;/g, '≤')
    .replace(/&ge;/g, '≥')
    .replace(/&times;/g, '×')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\\[()[\]]|\$\$?/g, ' ')
    .replace(/\\(?:le|leq)\b/g, '≤')
    .replace(/\\(?:ge|geq)\b/g, '≥')
    .replace(/\\(?:times|cdot)\b/g, '×')
    .replace(/\\(?:ldots|cdots|dots)\b/g, '…')
    .replace(/\\(?:mathrm|text|textrm|mathit)\{([^}]*)\}/g, '$1')
    .replace(/\^\{([^}]*)\}/g, '^$1')
    .replace(/_\{([^}]*)\}/g, '_$1')
    .replace(/\\,|\\;|\\!|~/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

/** Sentences (split at "다." / periods / newlines). */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[다요])\.\s*|\.\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ORDINALS = ['첫', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

/** The 1-based line a sentence talks about ("둘째 줄에", "세 번째 줄"), if any. */
export function sentenceLine(sentence: string): number | undefined {
  const m = /(첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열|두|세|네)\s*(?:째|번째|번 째)?\s*줄/.exec(
    sentence,
  );
  if (!m) return undefined;
  const word = { 두: '둘', 세: '셋', 네: '넷' }[m[1] as string] ?? (m[1] as string);
  const i = ORDINALS.indexOf(word);
  return i >= 0 ? i + 1 : undefined;
}

/** Single-letter variables in order of appearance: "N과 M이" → ["N", "M"]. */
export function variables(sentence: string): string[] {
  const out: string[] = [];
  for (const m of sentence.matchAll(/(?<![A-Za-z0-9_^])([A-Za-z])(?![A-Za-z(])/g)) {
    const v = m[1] as string;
    // "A_1, A_2" names an array, not a scalar.
    if (sentence[(m.index ?? 0) + 1] === '_') continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** Letters used as array names: "A_1, A_2, …, A_N" or "A1 A2 … AN" → ["A"]. */
export function arrayLetters(sentence: string): string[] {
  const out: string[] = [];
  for (const m of sentence.matchAll(/(?<![A-Za-z])([A-Za-z])_?(?:1|0|i)\b/g)) {
    const v = m[1] as string;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** The largest number in a text: "10^18", "2^63", "1,000,000,000" or "10억". */
export function maxBound(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/(\d+)\s*\^\s*(\d+)/g)) {
    max = Math.max(max, Number(m[1]) ** Number(m[2]));
  }
  for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)) {
    const prev = text[(m.index ?? 0) - 1];
    const next = text[(m.index ?? 0) + m[0].length];
    if (prev === '^' || next === '^') continue;
    max = Math.max(max, Number(m[0].replace(/,/g, '')));
  }
  for (const m of text.matchAll(/(\d+)\s*(억|조)/g)) {
    max = Math.max(max, Number(m[1]) * (m[2] === '억' ? 1e8 : 1e12));
  }
  return max;
}

export const INT_LIMIT = 2 ** 31 - 1;

/** Name cues: the first matching word in the sentence that reads an array decides its name. */
const CUES: [RegExp, string][] = [
  [/간선|도로|연결|다리|통로/, 'edges'],
  [/좌표|점의|점이|위치/, 'points'],
  [/명령/, 'cmds'],
  [/단어/, 'words'],
  [/쿼리|질의/, 'queries'],
  [/지도|격자|보드|미로|판|맵|배치|그림/, 'board'],
  [/행렬/, 'matrix'],
  [/카드/, 'cards'],
  [/수열|정수|수가|수를|숫자/, 'arr'],
];

export function cueName(sentence: string): string | undefined {
  for (const [re, name] of CUES) if (re.test(sentence)) return name;
  return undefined;
}

export interface TextHints {
  /** Input description, as sentences. */
  input: string[];
  output: string[];
  testCases: boolean;
  /** "0이 주어지면 끝" or "마지막 줄에는 0 0" style end lines. */
  endLine: boolean;
  /** "입력의 끝" / EOF style input. */
  eof: boolean;
  /** Largest number in the input and output descriptions. */
  inputBound: number;
  outputBound: number;
  /** Words from the output description that can stand for true/false. */
  quoted: string[];
}

export function textHints(inputHtml: string, outputHtml: string): TextHints {
  const inText = htmlToText(inputHtml);
  const outText = htmlToText(outputHtml);
  const quoted = [
    ...outText.matchAll(/["'“”‘’]([^"'“”‘’\n]{1,20})["'“”‘’]|\b([A-Z][A-Za-z]{1,15})\b/g),
  ]
    .map((m) => (m[1] ?? m[2] ?? '').trim())
    .filter(Boolean);
  return {
    input: sentences(inText),
    output: sentences(outText),
    testCases: /테스트\s*케이스|테스트케이스/.test(inText),
    endLine: /마지막\s*(?:줄|입력)|0이\s*(?:두\s*개\s*)?(?:주어지|입력)|입력의\s*끝을|종료/.test(
      inText,
    ),
    eof: /EOF|파일의\s*끝|입력의\s*끝까지|여러\s*(?:개의|줄의)?\s*(?:테스트\s*케이스|줄)/.test(
      inText,
    ),
    inputBound: maxBound(inText),
    outputBound: maxBound(outText),
    quoted,
  };
}

/** Known true/false word pairs, most common first. */
export const BOOL_PAIRS: [string, string][] = [
  ['YES', 'NO'],
  ['Yes', 'No'],
  ['yes', 'no'],
  ['TRUE', 'FALSE'],
  ['True', 'False'],
  ['true', 'false'],
  ['POSSIBLE', 'IMPOSSIBLE'],
  ['Possible', 'Impossible'],
  ['possible', 'impossible'],
  ['가능', '불가능'],
  ['예', '아니오'],
];
