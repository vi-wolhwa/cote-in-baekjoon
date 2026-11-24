/**
 * Names and integer widths for inferred parameters, from the input description: the
 * letters a sentence about each line mentions ("첫째 줄에 N과 M이" → n, m), array letters
 * ("A_1, …, A_N" → a), cue words ("간선" → edges) and bounds ("10^18" → long). Also scores
 * how well a layout matches the text, for ranking.
 */
import { isValidName, type Cases, type ParamType } from './dsl';
import type { DraftCount, DraftLine, DraftParam } from './infer';
import {
  arrayLetters,
  cueName,
  INT_LIMIT,
  maxBound,
  sentenceLine,
  variables,
  type TextHints,
} from './infer-text';

interface DraftLike {
  params: DraftParam[];
  lines: DraftLine[];
}

const DEFAULTS: Partial<Record<ParamType, string>> = {
  'int[]': 'arr',
  'long[]': 'arr',
  'string[]': 'words',
  'int[][]': 'grid',
  'char[][]': 'board',
  line: 's',
  string: 's',
  double: 'x',
};
const SCALAR_FALLBACK = ['a', 'b', 'c', 'd', 'e', 'f'];
/** Text that says a line has spaces in it. */
const LINE_WORDS = /문장|공백을\s*포함|공백이\s*포함|띄어쓰기|공백도/;
const PAIR_CUES = new Set(['edges', 'points', 'queries']);

const isScalar = (t: ParamType) => t === 'int' || t === 'long' || t === 'double' || t === 'string';

export function nameParams(
  draft: DraftLike,
  cases: Cases,
  hints: TextHints,
): { names: string[]; types: ParamType[]; score: number } {
  const offset = cases && 'count' in cases ? 1 : 0;
  const byLine = new Map<number, string[]>();
  for (const s of hints.input) {
    const n = sentenceLine(s);
    if (n === undefined) continue;
    byLine.set(n, [...(byLine.get(n) ?? []), s]);
  }
  const caseLetter = offset
    ? hints.input
        .find((s) => /테스트\s*케이스/.test(s))
        ?.match(/(?<![A-Za-z])([A-Z])(?![A-Za-z])/)?.[1]
    : undefined;
  const allText = hints.input.join(' ');
  const arrayNames = new Set(arrayLetters(allText));
  const global = variables(allText).filter((v) => v !== caseLetter && !arrayNames.has(v));
  const used = new Set<string>();
  const names: string[] = new Array<string>(draft.params.length).fill('');
  const types = draft.params.map((p) => p.type);
  let score = 0;

  // Ordinals ("셋째 줄") only line up with entries until the first repeated block.
  let afterRepeat = false;
  for (const [k, entry] of draft.lines.entries()) {
    const ids = 'ids' in entry ? entry.ids : [entry.id];
    let sentence = afterRepeat
      ? ''
      : (byLine.get(k + 1 + offset) ?? byLine.get(k + 1) ?? []).join(' ');
    if (!('ids' in entry)) {
      afterRepeat = true;
      // "다음 M개의 줄에 간선이": the sentence that counts this block's lines.
      const counter = countPattern(entry.repeat);
      const about =
        counter && hints.input.find((x) => new RegExp(`${counter}\\s*개의?\\s*줄`).test(x));
      if (about) sentence = about;
    }
    const scalars = ids.filter((id) => isScalar(draft.params[id]?.type as ParamType));
    const letters = variables(sentence).filter(
      (v) => v !== caseLetter && !arrayNames.has(v) && !used.has(v.toLowerCase()),
    );
    if (scalars.length > 0 && letters.length >= scalars.length) {
      scalars.forEach((id, j) => {
        names[id] = take(letters[j] as string);
        if (bigFor(allText, letters[j] as string) && types[id] === 'int') types[id] = 'long';
      });
      score += (letters.length === scalars.length ? 2 : 1) * scalars.length;
    }
    const hasLine = ids.some((id) => draft.params[id]?.type === 'line');
    if (hasLine && LINE_WORDS.test(sentence || allText)) score += 5;
    for (const id of ids) {
      const p = draft.params[id] as DraftParam;
      if (isScalar(p.type) || names[id]) continue;
      names[id] = take(arrayName(p, sentence));
      // Rows of a small fixed width ("양 끝점 u와 v"): the sentence names each column.
      if (p.type === 'int[][]' && typeof p.cols === 'number') {
        const free = variables(sentence).filter(
          (v) => !used.has(v.toLowerCase()) && v !== caseLetter,
        );
        if (free.length === p.cols || PAIR_CUES.has(names[id] as string)) score += 3;
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
      if (bigFor(allText, letter) && types[id] === 'int') types[id] = 'long';
    } else if (isScalar(p.type) && p.type !== 'string' && p.type !== 'double') {
      names[id] = take(SCALAR_FALLBACK.find((n) => !used.has(n)) ?? 'v');
    } else {
      names[id] = take(DEFAULTS[p.type] ?? 'v');
    }
  }
  // "N개의 수", "N-1개의 줄": a count the text names, with the same offset.
  const counts = [
    ...draft.params.map((p) => p.len),
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
  }
  return { names, types, score };

  function arrayName(p: DraftParam, sentence: string): string {
    const letter = arrayLetters(sentence).find((v) => !used.has(v.toLowerCase()));
    const cue = cueName(sentence);
    if (p.type === 'int[][]' && cue && PAIR_CUES.has(cue)) return cue;
    if (letter && p.type !== 'line') return letter;
    if (cue && p.type === 'char[][]') return cue === 'board' ? cue : 'board';
    if (cue && !(p.type === 'int[][]' && cue === 'arr') && !PAIR_CUES.has(cue)) return cue;
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

/** True when the text bounds `letter` above the int range ("1 ≤ A, B ≤ 10^18"). */
function bigFor(text: string, letter: string): boolean {
  const chain = /((?:[A-Za-z](?:_\w+)?\s*,\s*)*[A-Za-z](?:_\w+)?)\s*(?:≤|<=|<)\s*(-?[\d^,]+)/g;
  for (const m of text.matchAll(chain)) {
    const letters = (m[1] as string).split(',').map((s) => s.trim()[0]);
    if (letters.includes(letter) && maxBound(m[2] as string) > INT_LIMIT) return true;
  }
  return false;
}
