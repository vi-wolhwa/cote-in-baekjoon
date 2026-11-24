/**
 * Names and integer widths for inferred parameters, from the input description: the
 * letters a sentence about each line mentions ("첫째 줄에 N과 M이" → n, m), array letters
 * ("A_1, …, A_N" → a), cue words ("간선" → edges) and bounds ("10^18" → long). Also scores
 * how well a layout matches the text, for ranking.
 */
import { isValidName, type Cases, type ParamType } from './dsl';
import type { DraftCount, DraftLine, DraftParam } from './infer-layout';
import {
  arrayLetters,
  INT_LIMIT,
  maxBound,
  scalarNames,
  sentenceLine,
  type TextHints,
} from './infer-text';
import { cueName, GRID_CUES, ROW_CUES } from './infer-vocab';

interface DraftLike {
  params: DraftParam[];
  lines: DraftLine[];
}

const DEFAULTS: Partial<Record<ParamType, string>> = {
  'int[]': 'arr',
  'long[]': 'arr',
  'string[]': 'words',
  'int[][]': 'board',
  'char[][]': 'board',
  line: 's',
  string: 's',
  double: 'x',
};
const SCALAR_FALLBACK = ['a', 'b', 'c', 'd', 'e', 'f'];
/** Unnamed integers that count something: N, M, K as statements usually call them. */
const COUNT_FALLBACK = ['n', 'm', 'k'];
/** Text that says a line has spaces in it. */
const LINE_WORDS =
  /문장|공백을\s*포함|공백이\s*포함|띄어쓰기|공백도|공백으로\s*이루어|[와과]\s*공백|공백[과,]/;
/** Names for a text value without a letter. */
const STRING_NAMES: [RegExp, string][] = [[/수식/, 'expr']];
/** Words (one per line) versus the cells of a grid. */
/** A sentence about a block of lines rather than one line. */
const BLOCK_WORDS = /개의?\s*줄|[A-Za-z]\s*줄|줄에\s*걸쳐/;
const WORDY = /단어|이름|번호|제목/;
const CELLS = /지도|격자|판|칸|미로|그림|보드|맵|행렬|표|모양|상태|배치/;
/** Text that says a number is really a string of digits ("2진수", "1,000자리", "암호"). */
const DIGIT_TEXT = /진수|\d\s*자리|숫자로\s*(?:이루어|구성)|공백\s*없이|암호/;

const isScalar = (t: ParamType) => t === 'int' || t === 'long' || t === 'double' || t === 'string';

/** Input sentences by the 1-based line they talk about ("둘째 줄에"). */
function sentencesByLine(hints: TextHints): Map<number, string[]> {
  const byLine = new Map<number, string[]>();
  for (const s of hints.input) {
    const n = sentenceLine(s);
    if (n === undefined) continue;
    byLine.set(n, [...(byLine.get(n) ?? []), s]);
  }
  return byLine;
}

/**
 * The sentence about a case-relative line. With a case count first, "둘째 줄" is usually the
 * case's first line, unless the text counts lines again in each case ("각 테스트 케이스의
 * 첫째 줄에는"), which shows as two sentences about the first line.
 */
function lineSentence(byLine: Map<number, string[]>, rel: number, offset: number): string {
  if (offset === 0) return (byLine.get(rel + 1) ?? []).join(' ');
  const restart = (byLine.get(1)?.length ?? 0) >= 2;
  return (byLine.get(restart ? rel + 1 : rel + 1 + offset) ?? []).join(' ');
}

/** The letter the text gives the number of test cases ("테스트 케이스의 개수 T"). */
export function caseCountLetter(hints: TextHints): string | undefined {
  return hints.input
    .find((s) => CASE_WORDS.test(s))
    ?.match(/(?<![A-Za-z])([A-Z]|TC)(?![A-Za-z])/)?.[1];
}
const CASE_WORDS = /테스트\s*(?:케이스|데이터|셋)|test\s*case/i;

/**
 * Whether the text names `width` scalars for a case-relative line, for the layout search:
 * the sentence about that line ("둘째 줄에 X와 Y가"), or for a line of several numbers, any
 * sentence that is about no line in particular ("여섯 정수 x_1, y_1, r_1, …가").
 */
export function lineScalars(
  hints: TextHints,
  counted: boolean,
): (rel: number, width: number) => boolean {
  const byLine = sentencesByLine(hints);
  const caseLetter = counted ? caseCountLetter(hints) : undefined;
  const offset = counted ? 1 : 0;
  const count = (s: string) =>
    scalarNames(s, { counts: false }).filter((v) => v !== caseLetter).length;
  // (Not sentences about a block of lines: "M줄에 걸쳐 A B C가" names a row's columns.)
  const loose = hints.input
    .filter((s) => sentenceLine(s) === undefined && !/줄에\s*걸쳐|개의?\s*줄|[A-Za-z]\s*줄/.test(s))
    .map(count);
  return (rel, width) => {
    const sentence = lineSentence(byLine, rel, offset);
    // (A sentence about a block of lines, "둘째 줄부터 M개의 줄에 u와 v가", names its columns.)
    if (sentence) return !BLOCK_WORDS.test(sentence) && count(sentence) === width;
    return width >= 3 && (counted || rel === 0) && loose.includes(width);
  };
}

/** Whether a sentence is about a line by its ordinal (single case only: cases restart them). */
export function lineDescribed(hints: TextHints): (rel: number) => boolean {
  const byLine = sentencesByLine(hints);
  return (rel) => byLine.has(rel + 1);
}

export function nameParams(
  draft: DraftLike,
  cases: Cases,
  hints: TextHints,
): { names: string[]; types: ParamType[]; score: number } {
  const offset = cases && 'count' in cases ? 1 : 0;
  const byLine = sentencesByLine(hints);
  const caseLetter = offset ? caseCountLetter(hints) : undefined;
  const allText = hints.input.join(' ');
  const arrayList = arrayLetters(allText);
  const arrayNames = new Set(arrayList);
  const repeated = new Set(draft.lines.flatMap((l) => ('repeat' in l ? [l.id] : [])));
  const counters = new Set(
    [
      ...draft.params.flatMap((p) => [p.len, p.cols]),
      ...draft.lines.map((l) => ('repeat' in l ? l.repeat : undefined)),
    ].flatMap((c) => (c !== undefined && typeof c === 'object' ? [c.id] : [])),
  );
  const global = scalarNames(allText).filter((v) => v !== caseLetter && !arrayNames.has(v));
  const used = new Set<string>();
  const names: string[] = new Array<string>(draft.params.length).fill('');
  const types = draft.params.map((p) => p.type);
  /** The sentence about each parameter's line, if any. */
  const lineText: string[] = [];
  let score = 0;

  // Ordinals ("셋째 줄") only line up with entries until the first repeated block.
  let afterRepeat = false;
  for (const [k, entry] of draft.lines.entries()) {
    const ids = 'ids' in entry ? entry.ids : [entry.id];
    let sentence = afterRepeat ? '' : lineSentence(byLine, k, offset);
    if (!('ids' in entry)) {
      afterRepeat = true;
      // "다음 M개의 줄에 간선이": the sentence that counts this block's lines.
      const counter = countPattern(entry.repeat);
      const about =
        counter && hints.input.find((x) => new RegExp(`${counter}\\s*개의?\\s*줄`).test(x));
      if (about) sentence = about;
    }
    const scalars = ids.filter((id) => isScalar(draft.params[id]?.type as ParamType));
    const letters = scalarNames(sentence).filter(
      (v) => v !== caseLetter && !arrayNames.has(v) && !used.has(v.toLowerCase()),
    );
    if (scalars.length > 0 && letters.length >= scalars.length) {
      scalars.forEach((id, j) => {
        names[id] = take(letters[j] as string);
        widen(id, letters[j] as string);
      });
      score += (letters.length === scalars.length ? 2 : 1) * scalars.length;
    }
    // A lone number the text calls a string of digits ("2진수가 주어진다").
    const about = sentence || (draft.params.length === 1 ? allText : '');
    if (ids.length === 1 && scalars.length === 1 && DIGIT_TEXT.test(about)) {
      const id = scalars[0] as number;
      if ((types[id] === 'int' || types[id] === 'long') && !counters.has(id)) types[id] = 'string';
    }
    const hasLine = ids.some((id) => draft.params[id]?.type === 'line');
    // ("문자열 S가 주어진다" with spaces in the sample: one string, not words.)
    const oneString = /문자열/.test(sentence) && scalarNames(sentence).length <= 1;
    if (hasLine && (LINE_WORDS.test(sentence || allText) || oneString)) score += 5;
    for (const id of ids) {
      lineText[id] = sentence;
      const p = draft.params[id] as DraftParam;
      if (isScalar(p.type) || names[id] || p.type === 'line') continue;
      // Words one per line are strings, not the rows of a grid of characters.
      const context = sentence || allText;
      const wordy = WORDY.test(context) && !CELLS.test(context);
      if (wordy && p.type === 'char[][]') score -= 4;
      if (wordy && p.type === 'string[]' && repeated.has(id)) score += 2;
      names[id] = take(arrayName(p, sentence, repeated.has(id)));
      // Rows of a small fixed width ("양 끝점 u와 v"): the sentence names each column.
      if (p.type === 'int[][]' && typeof p.cols === 'number') {
        const free = scalarNames(sentence).filter(
          (v) => !used.has(v.toLowerCase()) && v !== caseLetter,
        );
        if (free.length === p.cols || ROW_CUES.has(cueName(sentence, true, false) ?? '')) {
          score += 3;
        }
      }
      const letter = arrayLetters(sentence)[0];
      const big =
        maxBound(sentence) > INT_LIMIT || (letter !== undefined && bigFor(allText, letter));
      if (big && types[id] === 'int[]') types[id] = 'long[]';
    }
  }
  // Scalars no sentence named: letters in order of appearance, then a, b, c.
  for (const [id, p] of draft.params.entries()) {
    if (names[id]) continue;
    const letter = global.find((v) => !used.has(v.toLowerCase()));
    if (letter && isScalar(p.type)) {
      names[id] = take(letter);
      score += 1;
      widen(id, letter);
    } else if (isScalar(p.type) && p.type !== 'string' && p.type !== 'double') {
      const fallback = counters.has(id) ? [...COUNT_FALLBACK, ...SCALAR_FALLBACK] : SCALAR_FALLBACK;
      names[id] = take(fallback.find((n) => !used.has(n)) ?? 'v');
    } else {
      // A text value the sentence calls a word or an expression ("단어가 주어진다").
      const text = p.type === 'string' || p.type === 'line' ? (lineText[id] ?? '') : '';
      const named = STRING_NAMES.find(([re]) => re.test(text))?.[1];
      names[id] = take(named ?? DEFAULTS[p.type] ?? 'v');
    }
  }
  // The test case count read as a parameter, with the cases as rows of a block.
  const testLetter = !cases && hints.testCases ? caseCountLetter(hints)?.toLowerCase() : undefined;
  for (const l of draft.lines) {
    if ('repeat' in l && typeof l.repeat === 'object' && names[l.repeat.id] === testLetter) {
      score -= 4;
    }
  }
  // "N개의 수", "N-1개의 줄": a count the text names, with the same offset.
  const counts = [
    ...draft.params.flatMap((p) => [p.len, p.cols]),
    ...draft.lines.map((l) => ('repeat' in l ? l.repeat : undefined)),
  ];
  // Each mention rewards one count: "N개의 줄" once does not explain two blocks of N lines.
  const mentions = new Map<string, number>();
  for (const c of counts) {
    const pattern = c === undefined ? undefined : countPattern(c);
    if (!pattern) continue;
    const left =
      mentions.get(pattern) ?? allText.match(new RegExp(`${pattern}\\s*개`, 'g'))?.length ?? 0;
    if (left > 0) score += 2;
    mentions.set(pattern, left - 1);
  }
  // "다음 K개의 줄에": a count of lines is the likeliest count for a block of lines.
  for (const l of draft.lines) {
    const pattern = 'repeat' in l ? countPattern(l.repeat) : undefined;
    if (pattern && new RegExp(`${pattern}\\s*개의?\\s*줄`).test(allText)) score += 1;
    // "셋째 줄부터 M+2줄까지", "M+1번째 줄까지": M lines after the first ones.
    const plain = 'repeat' in l && typeof l.repeat === 'object' && l.repeat.plus === 0;
    const letter = plain ? names[(l.repeat as { id: number }).id] : undefined;
    if (letter?.length === 1) {
      const upTo = new RegExp(
        `[${letter.toUpperCase()}${letter}]\\s*\\+\\s*\\d\\s*(?:번째|번 째)?\\s*줄`,
      );
      if (upTo.test(allText)) score += 2;
    }
  }
  return { names, types, score };

  function arrayName(p: DraftParam, sentence: string, block: boolean): string {
    const free = (v: string) => !used.has(v.toLowerCase());
    const letter = arrayLetters(sentence).find(free);
    const grid = p.type === 'int[][]' || p.type === 'char[][]';
    // Rows of a fixed width are records, not cells of a board.
    const cue = cueName(sentence, p.type === 'int[][]', typeof p.cols !== 'number');
    // Rows of a few numbers are named after what they describe ("간선" → edges); their
    // letters name the columns ("x_i, y_i").
    if (p.type === 'int[][]' && cue && cue !== 'arr' && (!letter || typeof p.cols === 'number')) {
      return cue;
    }
    if (letter) return letter;
    if (p.type === 'char[][]') return 'board';
    if (cue && !GRID_CUES.has(cue) && cue !== 'arr' && !grid) return cue;
    if (cue === 'arr' && !grid) return 'arr';
    // An array letter the text uses elsewhere ("A에 있는 수"), in order.
    const named = grid ? undefined : arrayList.find(free);
    if (named) return named;
    if (p.type === 'int[][]') return p.cols === 2 ? 'pairs' : p.cols === 3 ? 'edges' : 'board';
    if (block && (p.type === 'int[]' || p.type === 'long[]')) return 'nums';
    return DEFAULTS[p.type] ?? 'arr';
  }

  /** "N" or "N-1" as the text would write the count, or undefined for fixed counts. */
  function countPattern(c: DraftCount): string | undefined {
    if (typeof c !== 'object') return undefined;
    const name = names[c.id];
    if (!name || name.length !== 1) return undefined;
    // Statements write counts in either case ("N개", "n-1개").
    const letter = `[${name.toUpperCase()}${name}]`;
    if (c.plus === 0) return `${letter}(?!\\s*[-+]\\s*\\d)`;
    return `${letter}\\s*${c.plus > 0 ? '\\+' : '-'}\\s*${Math.abs(c.plus)}`;
  }

  /** An integer the text bounds past int is a long; past 64 bits, a string of digits. */
  function widen(id: number, letter: string): void {
    if (types[id] !== 'int' && types[id] !== 'long') return;
    const bound = boundFor(allText, letter);
    if (bound >= HUGE && !counters.has(id)) types[id] = 'string';
    else if (bound > INT_LIMIT) types[id] = 'long';
  }

  function take(raw: string): string {
    let base = raw.toLowerCase();
    if (!isValidName(base)) base = `${base}1`;
    if (!isValidName(base)) base = 'v';
    let name = base;
    for (let k = 2; used.has(name); k++) name = `${base}${k}`;
    used.add(name);
    return name;
  }
}

/** The largest upper bound the text gives `letter` ("1 ≤ A, B ≤ 10^18" → 1e18), or 0. */
function boundFor(text: string, letter: string): number {
  const chain =
    /((?:[A-Za-z](?:_\w+)?\s*,\s*)*[A-Za-z](?:_\w+)?)\s*(?:≤|<=|<)\s*(-?[\d^,]+(?:\s*-\s*1(?!\d))?)/g;
  let max = 0;
  for (const m of text.matchAll(chain)) {
    const letters = (m[1] as string).split(',').map((s) => s.trim()[0]);
    if (letters.includes(letter)) max = Math.max(max, maxBound(m[2] as string));
  }
  // "N은 2,000,000,000보다 작거나 같은 자연수", "N과 M은 최대 10자리 정수".
  const L = letter.replace(/[^A-Za-z]/g, '');
  if (L.length !== 1) return max;
  const said = new RegExp(
    `(?<![A-Za-z])${L}(?![A-Za-z])[^.A-Za-z]{0,40}?([\\d,^]+(?:\\s*-\\s*1(?!\\d))?)\\s*(보다\\s*작거나\\s*같|이하|보다\\s*작|[을를]\\s*넘지\\s*않|자리)`,
    'g',
  );
  for (const m of text.matchAll(said)) {
    const n = maxBound(m[1] as string);
    max = Math.max(max, m[2] === '자리' ? 10 ** n : n);
  }
  return max;
}

const bigFor = (text: string, letter: string) => boundFor(text, letter) > INT_LIMIT;

/** Past 64 bits ("10^10000"): only a string holds the number. */
export const HUGE = 1e19;
