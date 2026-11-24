/**
 * Infers a problem's input/output format from its samples and description (#115, ADR-0006
 * source 3). Candidate layouts come from the samples' token shapes (infer-layout.ts), kept
 * only if every sample reads and round-trips, paired with return types that print every expected
 * output back (infer-ret.ts), ranked with hints from the text, and named from its variables
 * ("N과 M" → n, m) and words ("간선" → edges, infer-names.ts and infer-vocab.ts).
 * Returns undefined when nothing fits well enough; the user can still define a format.
 */
import type { Sample } from '@/boj/problem';
import type { Cases, Format, LineSpec, Param, ParamType, RetSpec } from './dsl';
import { isValidName } from './dsl';
import {
  kind,
  layouts,
  Lines,
  type Draft,
  type DraftCount,
  type LayoutHints,
} from './infer-layout';
import { retCandidates, unprintable } from './infer-ret';
import { textHints, type TextHints } from './infer-text';
export type { DraftCount, DraftLine, DraftParam } from './infer-layout';
import { caseCountLetter, HUGE, lineDescribed, lineScalars, nameParams } from './infer-names';
import { formatOutput, parseOutput } from './output';
import { inputLines, readInput, sameInput, writeInput } from './reader';
import { validateFormat } from './validate';
import { outputsMatch } from '@/runner/compare';

export interface InferInput {
  samples: readonly Sample[];
  /** Input and output sections (raw HTML from the problem page). */
  inputHtml: string;
  outputHtml: string;
}

export interface Candidate {
  format: Format;
  score: number;
}

/** Layouts checked against every sample, and candidates returned. */
const MAX_CHECKED = 150;
const MAX_RESULTS = 20;
/** Samples layouts are generated from. */
const MAX_SOURCES = 3;

/** Fewer layouts for big samples, so inference stays well under a second. */
function checkLimit(samples: readonly Sample[]): number {
  const chars = samples.reduce((n, s) => n + s.input.length, 0);
  return Math.max(
    10,
    Math.min(MAX_CHECKED, Math.floor((MAX_CHECKED * 20_000) / Math.max(chars, 1))),
  );
}

const last = (l: string[][]) => (l[l.length - 1] ?? []).join(' ');
const outputLines = (out: string) => out.replace(/\s+$/, '').split(/\r?\n/).length;

const TERMINATOR = /^(?:-?0|-1|#|END|end|\.)(?: (?:-?0|-1|#))*$/;

interface Layout {
  draft: Draft;
  cases: Cases;
  score: number;
}

function caseLayouts(samples: readonly Sample[], hints: TextHints): Layout[] {
  const all = samples.map((s) => inputLines(s.input).map((l) => l.tokens));
  const out: Layout[] = [];
  const add = (drafts: Draft[], cases: Cases, score: number) => {
    for (const draft of drafts) out.push({ draft, cases, score: score + draft.score });
  };
  const counted = all.every(
    (l) => l[0]?.length === 1 && kind(l[0][0] as string) === 'int' && Number(l[0][0]) >= 1,
  );
  // One output line per counted case: the first number is a case count, whatever the text says.
  const perCase =
    counted && samples.every((s, i) => outputLines(s.output) === Number(all[i]?.[0]?.[0]));
  const ended = all.every((l) => TERMINATOR.test(last(l)));
  // Layouts come from each of the first samples (a tiny sample alone can be ambiguous);
  // every sample checks them later.
  const { fixed, fixedCols } = hints;
  const described = lineDescribed(hints);
  const single: LayoutHints = { scalars: lineScalars(hints, false), described, fixed, fixedCols };
  const caseHints: LayoutHints = { scalars: lineScalars(hints, true), fixed, fixedCols };
  // Also the sample with the longest token: its numbers may not fit a long ("10^10000").
  const longest = (l: string[][]) => Math.max(0, ...l.flat().map((x) => x.length));
  const widest = all.reduce((a, b) => (longest(b) > longest(a) ? b : a), all[0] ?? []);
  const sources = all.slice(0, MAX_SOURCES);
  if (!sources.includes(widest)) sources.push(widest);
  for (const tokens of sources) {
    const lines = new Lines(tokens);
    const n = tokens.length;
    add(layouts(lines, 0, n, true, single), null, 0);
    if (counted) {
      const score = (hints.testCases ? 5 : -3) + (perCase ? 5 : 0);
      add(layouts(lines, 1, n, false, caseHints), { count: 'T' }, score);
    }
    const end = last(tokens);
    if (n >= 2 && all.every((l) => last(l) === end) && TERMINATOR.test(end)) {
      add(layouts(lines, 0, n - 1, false, single), { until: end }, hints.endLine ? 4 : 1);
    }
    if (n >= 2) {
      const drafts = layouts(lines, 0, n, false, single).filter((d) => d.lines.length > 0);
      // An end line the text mentions is not a case.
      const score = (hints.eof ? 3 : hints.testCases ? 0 : -4) - (ended && hints.endLine ? 4 : 0);
      add(drafts, { until: 'EOF' }, score);
    }
  }
  return out;
}

function draftFormat(draft: Draft, cases: Cases, ret: RetSpec): Format {
  const names = draft.params.map((_, i) => `p${i}`);
  const count = (c: DraftCount): string | number =>
    typeof c === 'number'
      ? c
      : `${names[c.id]}${c.plus ? `${c.plus > 0 ? '+' : '-'}${Math.abs(c.plus)}` : ''}`;
  const params: Param[] = draft.params.map((p, i) => ({
    name: names[i] as string,
    type: p.type,
    ...(p.len !== undefined ? { len: count(p.len) } : {}),
    ...(p.cols !== undefined ? { cols: count(p.cols) } : {}),
  }));
  const lines: LineSpec[] = draft.lines.map((l) =>
    'ids' in l
      ? l.ids.map((id) => names[id] as string)
      : { repeat: count(l.repeat), of: names[l.id] as string },
  );
  return { v: 1, params, lines, cases, ret };
}

/** Every format that passes sample validation, best first. */
export function inferCandidates(input: InferInput): Candidate[] {
  const { samples } = input;
  if (samples.length === 0 || samples.every((s) => s.input.trim() === '')) return [];
  const hints = textHints(input.inputHtml, input.outputHtml);
  if (unprintable(samples, hints.output.join(' '))) return [];
  const seen = new Set<string>();
  const found: Candidate[] = [];
  // The likeliest layouts only: reading big samples with thousands of layouts would stall the page.
  const ranked = caseLayouts(samples, hints)
    .sort((a, b) => b.score - a.score)
    .slice(0, checkLimit(samples));
  for (const layout of ranked) {
    // Input first: read and round-trip every sample with a placeholder return type.
    const probe = draftFormat(layout.draft, layout.cases, { type: 'string' });
    const key = JSON.stringify([probe.params, probe.lines, probe.cases]);
    if (seen.has(key)) continue;
    seen.add(key);
    const caseCounts: number[] = [];
    const ok = samples.every((s) => {
      const r = readInput(probe, s.input);
      if (!r.ok) return false;
      caseCounts.push(r.cases.length);
      const w = writeInput(probe, r.cases);
      return w.ok && sameInput(w.text, s.input);
    });
    if (!ok) continue;
    for (const { ret, score } of retCandidates(samples, caseCounts, hints)) {
      const fits = samples.every((s, i) => {
        const out = parseOutput(ret, s.output, caseCounts[i] as number);
        return (
          out.ok &&
          (out.values.length === 0 || outputsMatch(formatOutput(ret, out.values), s.output))
        );
      });
      if (!fits) continue;
      // Several cases expected but every sample has one: the case loop explains nothing
      // (unless the text gives a case count, which may well be 1 in a sample).
      const counts = layout.cases !== null && 'count' in layout.cases;
      const lonely =
        layout.cases !== null && !(counts && hints.testCases) && caseCounts.every((c) => c === 1)
          ? -3
          : 0;
      const named = nameParams(layout.draft, layout.cases, hints);
      const format = draftFormat(layout.draft, layout.cases, ret);
      const renamed = applyNames(format, named.names, named.types, ret, hints);
      found.push({ format: renamed, score: layout.score + score + named.score + lonely });
    }
  }
  found.sort((a, b) => b.score - a.score);
  return found.slice(0, MAX_RESULTS).filter((c) => validateFormat(c.format, samples).ok);
}

/** The best inferred format, or undefined when unsure. */
export function inferFormat(input: InferInput): Format | undefined {
  const [best] = inferCandidates(input);
  return best && best.score >= MIN_SCORE ? best.format : undefined;
}

/** Below this the layout leaned on guesses (fixed line counts, many loose scalars). */
export const MIN_SCORE = -6;

function applyNames(
  format: Format,
  names: string[],
  types: ParamType[],
  ret: RetSpec,
  hints: TextHints,
): Format {
  const map = new Map(format.params.map((p, i) => [p.name, names[i] as string]));
  const rename = (c: string | number) =>
    typeof c === 'number' ? c : c.replace(/^p\d+/, (m) => map.get(m) ?? m);
  const params = format.params.map((p, i) => ({
    ...p,
    name: names[i] as string,
    type: types[i] as ParamType,
    ...(p.len !== undefined ? { len: rename(p.len) } : {}),
    ...(p.cols !== undefined ? { cols: rename(p.cols) } : {}),
  }));
  const lines = format.lines.map((l) =>
    Array.isArray(l)
      ? l.map((n) => map.get(n) as string)
      : { repeat: rename(l.repeat), of: map.get(l.of) as string },
  );
  const longIn = params.some((p) => p.type === 'long' || p.type === 'long[]');
  // Numbers past 64 bits in, so the answer is one too ("10^10000 이하의 A, B").
  const hugeIn =
    hints.inputBound >= HUGE &&
    params.some((p, i) => p.type === 'string' && format.params[i]?.type !== 'string');
  const numeric = ret.type === 'int' || ret.type === 'long';
  const finalRet: RetSpec =
    numeric && hugeIn
      ? { type: 'string' }
      : ret.type === 'int' && longIn && !hints.intAnswer
        ? { type: 'long' }
        : ret;
  const caseName = format.cases && 'count' in format.cases ? countName(hints, names) : undefined;
  const cases = caseName ? { count: caseName } : format.cases;
  return { ...format, params, lines, cases, ret: finalRet };
}

function countName(hints: TextHints, names: string[]): string {
  const name = caseCountLetter(hints) ?? 'T';
  return names.includes(name) || (!isValidName(name.toLowerCase()) && !/^[A-Z]$/.test(name))
    ? 'T'
    : name;
}
