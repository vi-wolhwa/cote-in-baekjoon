/**
 * Infers a problem's input/output format from its samples and description (#115, ADR-0006
 * source 3). Candidate layouts are generated from the first sample's token shapes, kept only
 * if every sample reads and round-trips, paired with return types that print every expected
 * output back, ranked with hints from the text, and named from its variables ("N과 M" → n, m).
 * Returns undefined when nothing fits well enough; the user can still define a format.
 */
import type { Sample } from '@/boj/problem';
import type { Cases, Format, LineSpec, Param, ParamType, RetSpec } from './dsl';
import { isValidName, MAX_PARAMS } from './dsl';
import { BOOL_PAIRS, INT_LIMIT, textHints, type TextHints } from './infer-text';
import { nameParams } from './infer-names';
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

type Kind = 'int' | 'long' | 'double' | 'string';

function kind(tok: string): Kind {
  if (/^[+-]?\d+$/.test(tok)) return Math.abs(Number(tok)) <= INT_LIMIT ? 'int' : 'long';
  if (/^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(tok)) return 'double';
  return 'string';
}

const numeric = (k: Kind) => k === 'int' || k === 'long';
const leadingZero = (tok: string) => /^0\d/.test(tok);

/** A parameter under construction; names are given at the end. */
export interface DraftParam {
  type: ParamType;
  len?: DraftCount;
  cols?: DraftCount;
  /** Case-relative line (0-based) where it is read. */
  line: number;
  /** Integer scalars: the value in the first sample. */
  value?: number;
}
export type DraftCount = { id: number; plus: number } | number;
export type DraftLine = { ids: number[] } | { repeat: DraftCount; id: number };

interface Draft {
  params: DraftParam[];
  lines: DraftLine[];
  score: number;
}

interface Option {
  next: number;
  params: DraftParam[];
  line: DraftLine;
  score: number;
}

const MAX_VISITS = 4_000;
/** Every parameter costs this much: the simplest layout that reads every sample wins. */
const PARAM_COST = 3;
const MAX_DRAFTS = 300;
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

/** What a run of lines looks like, computed once per (first line, line count). */
interface BlockShape {
  /** Every line has this many tokens, or undefined when they differ. */
  width?: number;
  allInt: boolean;
  allNumeric: boolean;
  allString: boolean;
  /** One token per line, all of this length (undefined when lengths differ). */
  tokenLength?: number;
  zeros: boolean;
}

/** One sample's lines with token kinds, and a cache of block shapes. */
class Lines {
  readonly kinds: Kind[][];
  private shapes = new Map<string, BlockShape>();
  constructor(readonly tokens: string[][]) {
    this.kinds = tokens.map((t) => t.map(kind));
  }
  get length() {
    return this.tokens.length;
  }
  shape(i: number, n: number): BlockShape {
    const key = `${i}:${n}`;
    const cached = this.shapes.get(key);
    if (cached) return cached;
    let width: number | undefined = this.tokens[i]?.length;
    let tokenLength: number | undefined = this.tokens[i]?.[0]?.length;
    let allInt = true;
    let allNumeric = true;
    let allString = true;
    let zeros = false;
    for (let r = i; r < i + n; r++) {
      const t = this.tokens[r] as string[];
      const k = this.kinds[r] as Kind[];
      if (t.length !== width) width = undefined;
      if (t.length !== 1 || t[0]?.length !== tokenLength) tokenLength = undefined;
      for (let c = 0; c < t.length; c++) {
        const kc = k[c] as Kind;
        if (kc !== 'int') allInt = false;
        if (!numeric(kc)) allNumeric = false;
        if (kc !== 'string') allString = false;
        if (!zeros && leadingZero(t[c] as string)) zeros = true;
      }
    }
    const shape = {
      ...(width !== undefined ? { width } : {}),
      allInt,
      allNumeric,
      allString,
      ...(tokenLength !== undefined ? { tokenLength } : {}),
      zeros,
    };
    this.shapes.set(key, shape);
    return shape;
  }
}

/** Layouts for one case of `lines` starting at `start`, likelier options first. */
function layouts(lines: Lines, start: number, end: number, mustEnd: boolean): Draft[] {
  const out: Draft[] = [];
  let visits = 0;
  const cost = (o: Option) => o.score - PARAM_COST * o.params.length;
  const walk = (i: number, d: Draft) => {
    if (++visits > MAX_VISITS || out.length >= MAX_DRAFTS) return;
    if (i === end || (!mustEnd && i > start)) out.push(d);
    if (i === end) return;
    const opts = options(lines, i, end, d, start, mustEnd).sort((a, b) => cost(b) - cost(a));
    for (const o of opts) {
      // A format has at most MAX_PARAMS parameters; deeper layouts cannot be used.
      if (d.params.length + o.params.length > MAX_PARAMS) continue;
      walk(o.next, {
        params: [...d.params, ...o.params],
        lines: [...d.lines, o.line],
        score: d.score + cost(o),
      });
    }
  };
  walk(start, { params: [], lines: [], score: 0 });
  return out;
}

function arrayType(ks: readonly Kind[]): ParamType | undefined {
  if (ks.every((k) => k === 'int')) return 'int[]';
  if (ks.every(numeric)) return 'long[]';
  if (ks.every((k) => k === 'string')) return 'string[]';
  return undefined;
}

function options(
  lines: Lines,
  i: number,
  end: number,
  d: Draft,
  start: number,
  mustEnd: boolean,
): Option[] {
  const t = lines.tokens[i] as string[];
  const kinds = lines.kinds[i] as Kind[];
  const base = d.params.length;
  const rel = d.lines.length;
  const ints = d.params.flatMap((p, id) => (p.value !== undefined ? [{ id, value: p.value }] : []));
  const opts: Option[] = [];
  // A: every token its own scalar.
  if (t.length <= 6) {
    opts.push({
      next: i + 1,
      params: t.map((tok, k) => ({
        type: kinds[k] as Kind,
        line: rel,
        ...(kinds[k] === 'int' ? { value: Number(tok) } : {}),
      })),
      line: { ids: t.map((_, k) => base + k) },
      score: t.length >= 5 ? -5 : t.length === 4 ? -2 : 0,
    });
  }
  // B: a line with spaces.
  if (t.length >= 2 && kinds.some((k) => k === 'string')) {
    opts.push({
      next: i + 1,
      params: [{ type: 'line', line: rel }],
      line: { ids: [base] },
      score: -3,
    });
  }
  const arr = arrayType(kinds);
  if (arr) {
    // C: an array whose length was read before.
    for (const e of ints) {
      for (const plus of [0, -1]) {
        if (e.value + plus !== t.length || t.length === 0) continue;
        opts.push({
          next: i + 1,
          params: [{ type: arr, len: { id: e.id, plus }, line: rel }],
          line: { ids: [base] },
          score: plus === 0 ? 2 : 0,
        });
      }
    }
    // E: the rest of the line.
    opts.push({
      next: i + 1,
      params: [{ type: arr, line: rel }],
      line: { ids: [base] },
      score: t.length >= 4 ? 1 : -4,
    });
  }
  // D: "N a1 … aN" on one line.
  const restType = arrayType(kinds.slice(1));
  // (Not for "1 x": a count of one is more often just two numbers.)
  if (kinds[0] === 'int' && restType && Number(t[0]) === t.length - 1 && t.length >= 3) {
    opts.push({
      next: i + 1,
      params: [
        { type: 'int', line: rel, value: Number(t[0]) },
        { type: restType, len: { id: base, plus: 0 }, line: rel },
      ],
      line: { ids: [base, base + 1] },
      score: 2,
    });
  }
  // F: several lines, one element or row each, counted by an integer read before.
  const counts: { count: DraftCount; n: number; score: number }[] = [];
  for (const e of ints) {
    for (const plus of [0, -1]) {
      const n = e.value + plus;
      if (n >= 1 && i + n <= end)
        counts.push({ count: { id: e.id, plus }, n, score: plus ? 0 : 2 });
    }
  }
  // G: a fixed number of lines up to the end (only for a single case).
  if (mustEnd && i > start && end - i >= 2) {
    counts.push({ count: end - i, n: end - i, score: -3 });
  }
  for (const c of counts) {
    for (const p of blockParams(lines.shape(i, c.n), ints, rel)) {
      opts.push({
        next: i + c.n,
        params: [p.param],
        line: { repeat: c.count, id: base },
        score: c.score + p.score,
      });
    }
  }
  return opts;
}

function blockParams(
  shape: BlockShape,
  ints: { id: number; value: number }[],
  rel: number,
): { param: DraftParam; score: number }[] {
  const out: { param: DraftParam; score: number }[] = [];
  const colsFor = (w: number) => ints.find((e) => e.value === w);
  const { allInt, allNumeric, allString, zeros } = shape;
  if (shape.width === 1) {
    if (allNumeric) {
      out.push({ param: { type: allInt ? 'int[]' : 'long[]', line: rel }, score: zeros ? -4 : 1 });
    }
    if (allString || (zeros && allNumeric)) {
      out.push({
        param: { type: 'string[]', line: rel },
        score: shape.tokenLength !== undefined ? -1 : 1,
      });
    }
    const w = shape.tokenLength;
    if (w !== undefined && w >= 2) {
      const cols = colsFor(w);
      out.push({
        param: { type: 'char[][]', line: rel, ...(cols ? { cols: { id: cols.id, plus: 0 } } : {}) },
        score: (cols ? 2 : 0) + (allNumeric && !zeros ? -2 : 1),
      });
    }
    return out;
  }
  if (!allInt) return out;
  if (shape.width !== undefined) {
    const w = shape.width;
    const cols = colsFor(w);
    if (cols)
      out.push({ param: { type: 'int[][]', line: rel, cols: { id: cols.id, plus: 0 } }, score: 2 });
    if (w <= 4) out.push({ param: { type: 'int[][]', line: rel, cols: w }, score: cols ? 0 : 1 });
    out.push({ param: { type: 'int[][]', line: rel }, score: -2 });
  } else {
    out.push({ param: { type: 'int[][]', line: rel }, score: -3 });
  }
  return out;
}

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
  const last = (l: string[][]) => (l[l.length - 1] ?? []).join(' ');
  const counted = all.every(
    (l) => l[0]?.length === 1 && kind(l[0][0] as string) === 'int' && Number(l[0][0]) >= 1,
  );
  // Layouts come from each of the first samples (a tiny sample alone can be ambiguous);
  // every sample checks them later.
  for (const tokens of all.slice(0, MAX_SOURCES)) {
    const lines = new Lines(tokens);
    const n = tokens.length;
    add(layouts(lines, 0, n, true), null, 0);
    if (counted) add(layouts(lines, 1, n, false), { count: 'T' }, hints.testCases ? 5 : -3);
    const end = last(tokens);
    if (n >= 2 && all.every((l) => last(l) === end) && TERMINATOR.test(end)) {
      add(layouts(lines, 0, n - 1, false), { until: end }, hints.endLine ? 4 : 1);
    }
    if (n >= 2) {
      const drafts = layouts(lines, 0, n, false).filter((d) => d.lines.length > 0);
      add(drafts, { until: 'EOF' }, hints.eof ? 3 : hints.testCases ? 0 : -4);
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

/** Return value candidates from the expected outputs, given each sample's case count. */
function retCandidates(
  samples: readonly Sample[],
  caseCounts: number[],
  hints: TextHints,
): { ret: RetSpec; score: number }[] {
  const outs = samples.map((s) => s.output.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n'));
  const lines = outs.flat();
  const toks = lines.map((l) => l.trim().split(/\s+/).filter(Boolean));
  const flat = toks.flat();
  const kinds = flat.map(kind);
  const big = kinds.includes('long') || hints.outputBound > INT_LIMIT || hints.inputBound >= 1e9;
  const out: { ret: RetSpec; score: number }[] = [];
  const oneLinePerCase = outs.every((o, i) => o.length === caseCounts[i]);
  const single = toks.every((t) => t.length === 1);
  if (oneLinePerCase) {
    if (single) {
      if (kinds.every(numeric)) out.push({ ret: { type: big ? 'long' : 'int' }, score: 3 });
      if (kinds.every((k) => k === 'double' || numeric(k))) {
        const digits = flat.map((x) => (x.split('.')[1] ?? '').length);
        if (new Set(digits).size === 1 && kinds.includes('double')) {
          out.push({ ret: { type: 'double', digits: digits[0] as number }, score: 2 });
        }
      }
      const words = new Set(flat);
      for (const [yes, no] of BOOL_PAIRS) {
        if (![...words].every((w) => w === yes || w === no)) continue;
        const named = hints.quoted.includes(yes) && hints.quoted.includes(no);
        out.push({ ret: { type: 'bool', yes, no }, score: named || words.size === 2 ? 5 : 3 });
        break;
      }
    }
    if (kinds.every(numeric) && toks.some((t) => t.length > 1)) {
      out.push({
        ret: { type: kinds.every((k) => k === 'int') ? 'int[]' : 'long[]', sep: ' ' },
        score: 2,
      });
    }
    out.push({
      ret: { type: 'string' },
      score: kinds.every((k) => k === 'string') && single ? 1 : -2,
    });
  }
  if (caseCounts.every((c) => c === 1) && outs.some((o) => o.length > 1)) {
    if (single && kinds.every(numeric)) {
      out.push({
        ret: { type: kinds.every((k) => k === 'int') ? 'int[]' : 'long[]', sep: '\n' },
        score: 2,
      });
    }
    const lens = new Set(lines.map((l) => l.trim().length));
    if (single && lens.size === 1)
      out.push({ ret: { type: 'char[][]' }, score: kinds.every(numeric) ? 0 : 2 });
    if (single && kinds.every((k) => k === 'string'))
      out.push({ ret: { type: 'string[]', sep: '\n' }, score: 1 });
    if (!single && kinds.every((k) => k === 'int'))
      out.push({ ret: { type: 'int[][]' }, score: 2 });
    if (!single && flat.every((x) => x.length === 1) && kinds.every((k) => k === 'string')) {
      out.push({ ret: { type: 'char[][]', sep: ' ' }, score: 1 });
    }
  }
  return out;
}

/** Every format that passes sample validation, best first. */
export function inferCandidates(input: InferInput): Candidate[] {
  const { samples } = input;
  if (samples.length === 0 || samples.every((s) => s.input.trim() === '')) return [];
  const hints = textHints(input.inputHtml, input.outputHtml);
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
      // Several cases expected but every sample has one: the case loop explains nothing.
      const lonely = layout.cases !== null && caseCounts.every((c) => c === 1) ? -3 : 0;
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
  const finalRet: RetSpec = ret.type === 'int' && longIn ? { type: 'long' } : ret;
  const caseName = format.cases && 'count' in format.cases ? countName(hints, names) : undefined;
  const cases = caseName ? { count: caseName } : format.cases;
  return { ...format, params, lines, cases, ret: finalRet };
}

function countName(hints: TextHints, names: string[]): string {
  const sentence = hints.input.find((s) => /테스트\s*케이스/.test(s) && /개수|수\s/.test(s));
  const letter = sentence?.match(/(?<![A-Za-z])([A-Z])(?![A-Za-z])/)?.[1];
  const name = letter ?? 'T';
  return names.includes(name) || (!isValidName(name.toLowerCase()) && !/^[A-Z]$/.test(name))
    ? 'T'
    : name;
}
