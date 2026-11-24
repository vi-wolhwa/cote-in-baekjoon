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

/**
 * Sentences (split at "다." / periods / newlines), and clauses about different lines
 * ("첫째 줄에 N, 둘째 줄에 M이 주어진다" → two).
 */
export function sentences(text: string): string[] {
  return text
    .split(
      /(?<=[다요])\.\s*|\.\s+|\n+|,\s*(?=(?:첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열|두|세|네)\s*(?:째|번째|번 째)\s*(?:줄|행))/,
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

const ORDINALS = ['첫', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

/** The 1-based line a sentence talks about ("둘째 줄에", "세 번째 줄", "2행에는"), if any. */
export function sentenceLine(sentence: string): number | undefined {
  const m =
    /(첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열|두|세|네)\s*(?:째|번째|번 째)?\s*줄|(첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열|두|세|네)\s*(?:째|번째|번 째)\s*행|(?<!\d)(\d)\s*(?:번째|번 째)\s*(?:줄|행)|(?<!\d)(\d)행/.exec(
      sentence,
    );
  if (!m) return undefined;
  const digit = m[3] ?? m[4];
  if (digit !== undefined) return Number(digit) || undefined;
  const raw = (m[1] ?? m[2]) as string;
  const word = { 두: '둘', 세: '셋', 네: '넷' }[raw] ?? raw;
  const i = ORDINALS.indexOf(word);
  return i >= 0 ? i + 1 : undefined;
}

/**
 * Letters used as array names: "A_1, A_2, …, A_N", "A1 A2 … AN", "A[1]", "A_i" → ["A"].
 * Numbered letters without a list ("x_1, y_1, x_2, y_2") are scalars, see `scalarNames`.
 */
export function arrayLetters(sentence: string): string[] {
  const found: { at: number; v: string }[] = [];
  const listed = /…|\.\.\.|⋯/.test(sentence);
  for (const m of sentence.matchAll(
    /(?<![A-Za-z])([A-Za-z])(?:(_?[01])\b|_?i\b|_[NnMmKkj]\b|\[)/g,
  )) {
    const v = m[1] as string;
    if (m[2] !== undefined && !listed && !indexed(sentence, v)) continue;
    found.push({ at: m.index ?? 0, v });
  }
  // "수열 A", "배열 A의 원소", "A에 있는 N개의 수".
  for (const m of sentence.matchAll(NAMED_ARRAY)) {
    found.push({ at: m.index ?? 0, v: (m[1] ?? m[2]) as string });
  }
  const out: string[] = [];
  for (const { v } of found.sort((a, b) => a.at - b.at)) if (!out.includes(v)) out.push(v);
  return out;
}

const NAMED_ARRAY =
  /(?:배열|수열|집합|순열)\s*([A-Z])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])([A-Z])(?:에\s*(?:있는|들어|포함)|의\s*(?:원소|내용|모든\s*원소))/g;

const indexed = (sentence: string, v: string) =>
  new RegExp(`(?<![A-Za-z])${v}(?:_?i\\b|_[NnMmKkj]\\b|\\[)`).test(sentence);

/**
 * Scalar names in order of appearance: "N과 M이" → ["N", "M"], "x_1, y_1, x_2" →
 * ["x1", "y1", "x2"]. Array letters ("A_1, …, A_N") are left out.
 */
export function scalarNames(sentence: string, { counts = true } = {}): string[] {
  const arrays = new Set(arrayLetters(sentence));
  const out: string[] = [];
  for (const m of sentence.matchAll(
    /(?<![A-Za-z0-9_^])([A-Za-z])(?:_?(\d)(?!\d))?(?![A-Za-z(_\d[])/g,
  )) {
    const v = m[1] as string;
    if (arrays.has(v)) continue;
    const after = sentence.slice((m.index ?? 0) + m[0].length);
    // "L_1의 양 끝 점", "X사의 요금", "A진법": labels, not values (a particle may follow a
    // value: "N과 M이"). Without `counts`, "N개의 줄" is not read here.
    if (/^\s*의/.test(after) || (/^[가-힣]/.test(after) && !PARTICLE.test(after))) continue;
    if (!counts && /^\s*(?:[-+]\s*\d+\s*)?(?:개|줄|번째|명)/.test(after)) continue;
    const name = m[2] !== undefined ? `${v}${m[2]}` : v;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** Particles after a variable ("N이", "M과", "K개", "X번째"). */
const PARTICLE = /^[이가과와을를은는도로으에만랑부까보개번줄명라일인]/;

const NUMBER_WORDS: Record<string, number> = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
};

/**
 * Fixed sizes the text states: "5개의 정수", "총 8줄", "다섯 개" → 5, 8, 5. With `loose`, also
 * "세 정수" (which more often names three scalars on a line, but sizes the rows of a block).
 */
export function fixedCounts(text: string, loose = false): Set<number> {
  const out = new Set<number>();
  const digits =
    /(?<![\d가-힣.,^])(\d{1,3})\s*(?:개|줄|행|대|명|자리|가지|쌍|정수|자연수|수(?![가-힣]))/g;
  const words = loose
    ? /(?<![가-힣])(다섯|여섯|일곱|여덟|아홉|열|한|두|세|네)\s*(?:개|줄|행|정수|자연수|수(?![가-힣]))/g
    : /(?<![가-힣])(다섯|여섯|일곱|여덟|아홉|열|한|두|세|네)\s*(?:개|줄|행)/g;
  for (const m of text.matchAll(digits)) out.add(Number(m[1]));
  for (const m of text.matchAll(words)) out.add(NUMBER_WORDS[m[1] as string] as number);
  // "첫째 줄부터 열 번째 줄까지": the last line of a fixed run.
  const upTo =
    /(\d{1,2}|첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)\s*(?:번째|번 째|째)\s*줄\s*까지|부터\s*(\d{1,2}|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)\s*(?:번째|번 째|째)\s*줄/g;
  for (const m of text.matchAll(upTo)) {
    const word = (m[1] ?? m[2]) as string;
    const n = /\d/.test(word) ? Number(word) : ORDINAL_WORDS.indexOf(word) + 1;
    if (n >= 2) out.add(n);
  }
  return out;
}

const ORDINAL_WORDS = ['첫', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

/** The largest number in a text: "10^18", "2^63", "1,000,000,000" or "10억". */
export function maxBound(text: string): number {
  let max = 0;
  // "2^31-1" is the int limit itself, not one past it.
  for (const m of text.matchAll(/(\d+)\s*\^\s*(\d+)(\s*-\s*1(?!\d))?/g)) {
    max = Math.max(max, Number(m[1]) ** Number(m[2]) - (m[3] ? 1 : 0));
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
  /** Quoted text and Latin phrases in the output description, in order ("Nice", gosu). */
  phrases: string[];
  /** The text asks for 64-bit integers ("long long", "64비트"). */
  wide: boolean;
  /** The output description bounds the answer within int ("2^31-1 이하"). */
  intAnswer: boolean;
  /** Fixed sizes the input description states ("5개의 정수" → 5), and row widths ("세 정수"). */
  fixed: Set<number>;
  fixedCols: Set<number>;
}

const END_LINE =
  /마지막(?:\s*줄|\s*입력|에는|에)|0이\s*(?:\d|두|세|하나|한)|0\s*(?:두|세)\s*개|0이\s*(?:주어지|입력)|입력의\s*끝을|종료|끝을\s*(?:나타|의미|표시)/;
/** Input read to the end: "입력의 끝까지", "최대 100줄", "N번째 줄까지" (N not given). */
const EOF =
  /EOF|파일의\s*끝|입력의\s*끝까지|여러\s*(?:개의|줄의)?\s*(?:테스트\s*케이스|줄)|최대\s*[\d,]+\s*줄|[A-Z]\s*번째\s*줄\s*까지/;
const WIDE = /64\s*(?:비트|bit)|long\s*long|부호\s*있는\s*64/i;
const MODULO = /나눈\s*나머지|나머지를/;
const INT_ANSWER = /2\s*\^\s*31|2,147,483,64[78]|int\s*범위|32\s*(?:비트|bit)/i;

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
    testCases: /테스트\s*(?:케이스|데이터|셋)|test\s*case/i.test(inText),
    endLine: END_LINE.test(inText),
    eof: EOF.test(inText),
    inputBound: maxBound(inText),
    outputBound: maxBound(outText),
    quoted,
    phrases: answerPhrases(outText),
    wide: WIDE.test(outText) || WIDE.test(inText),
    // (Also an answer taken modulo a number that fits an int: "1,000,000,007로 나눈 나머지".)
    intAnswer:
      (INT_ANSWER.test(outText) || (MODULO.test(outText) && maxBound(outText) <= INT_LIMIT)) &&
      !WIDE.test(outText),
    fixed: fixedCounts(inText),
    fixedCols: fixedCounts(inText, true),
  };
}

/** Quoted text and Latin phrases, in order of appearance and each once. */
function answerPhrases(text: string): string[] {
  const out: string[] = [];
  const re =
    /["“”'‘’]([^"“”'‘’\n]{1,40})["“”'‘’]|(?<![A-Za-z])([A-Za-z][A-Za-z0-9]+(?:[ '][A-Za-z0-9]+)*[!?.]?)/g;
  for (const m of text.matchAll(re)) {
    const phrase = (m[1] ?? m[2] ?? '').trim();
    if (phrase && !out.includes(phrase)) out.push(phrase);
  }
  return out;
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
