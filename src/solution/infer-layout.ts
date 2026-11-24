/**
 * Layout search for format inference (#115): candidate line layouts for one case of a
 * sample, from its token shapes (scalars, counted arrays, repeated rows, grids). Likelier
 * options are tried first and the search is bounded so big samples stay fast.
 */
import type { ParamType } from './dsl';
import { MAX_PARAMS } from './dsl';
import { INT_LIMIT } from './infer-text';

export type Kind = 'int' | 'long' | 'double' | 'string';

export function kind(tok: string): Kind {
  if (/^[+-]?\d+$/.test(tok)) return Math.abs(Number(tok)) <= INT_LIMIT ? 'int' : 'long';
  if (/^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(tok)) return 'double';
  return 'string';
}

export const numeric = (k: Kind) => k === 'int' || k === 'long';
const leadingZero = (tok: string) => /^0\d/.test(tok);

/** Scalars: leading zeros ("0012") and numbers past 64 bits are text. */
function scalarKind(k: Kind, tok: string): Kind {
  if (numeric(k) && (leadingZero(tok) || tok.replace(/^[+-]/, '').length > 18)) return 'string';
  return k;
}

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

export interface Draft {
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
export class Lines {
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

/** What the description says about the layout, to rank options while searching. */
export interface LayoutHints {
  /** Whether the text names `width` scalars on a case-relative line (before any block). */
  scalars?: (rel: number, width: number) => boolean;
  /** Whether the text talks about a case-relative line by its ordinal ("셋째 줄에는"). */
  described?: (rel: number) => boolean;
  /** Sizes the text states ("5개의 정수", "총 8줄"), and row widths ("세 정수씩"). */
  fixed?: ReadonlySet<number>;
  fixedCols?: ReadonlySet<number>;
}

/** Layouts for one case of `lines` starting at `start`, likelier options first. */
export function layouts(
  lines: Lines,
  start: number,
  end: number,
  mustEnd: boolean,
  hints: LayoutHints = {},
): Draft[] {
  const out: Draft[] = [];
  let visits = 0;
  const cost = (o: Option) => o.score - PARAM_COST * o.params.length;
  // Depth first, likeliest option first, but each option gets at most half of the drafts
  // left: otherwise the first choice's variants use up the budget and later choices on
  // early lines are never tried.
  const walk = (i: number, d: Draft, budget: number): number => {
    if (budget <= 0 || ++visits > MAX_VISITS) return 0;
    let made = 0;
    if (i === end || (!mustEnd && i > start)) {
      out.push(d);
      made++;
    }
    if (i === end) return made;
    const opts = options(lines, i, end, d, start, mustEnd, hints)
      // A format has at most MAX_PARAMS parameters; deeper layouts cannot be used.
      .filter((o) => d.params.length + o.params.length <= MAX_PARAMS)
      .sort((a, b) => cost(b) - cost(a));
    for (const [j, o] of opts.entries()) {
      const left = budget - made;
      if (left <= 0) break;
      const share = j === opts.length - 1 ? left : Math.ceil(left / 2);
      made += walk(
        o.next,
        {
          params: [...d.params, ...o.params],
          lines: [...d.lines, o.line],
          score: d.score + cost(o),
        },
        share,
      );
    }
    return made;
  };
  walk(start, { params: [], lines: [], score: 0 }, MAX_DRAFTS);
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
  hints: LayoutHints,
): Option[] {
  const t = lines.tokens[i] as string[];
  const kinds = (lines.kinds[i] as Kind[]).map((k, c) => scalarKind(k, t[c] as string));
  const base = d.params.length;
  const rel = d.lines.length;
  const ints = d.params.flatMap((p, id) => (p.value !== undefined ? [{ id, value: p.value }] : []));
  const fixed = hints.fixed ?? new Set<number>();
  const opts: Option[] = [];
  const beforeBlocks = !d.lines.some((l) => 'repeat' in l);
  // The text names one scalar per token of this line ("x, y, w, h가 주어진다").
  const named = beforeBlocks && (hints.scalars?.(rel, t.length) ?? false);
  // A: every token its own scalar.
  if (t.length <= 6 || (named && t.length <= 8)) {
    opts.push({
      next: i + 1,
      params: t.map((tok, k) => ({
        type: kinds[k] as Kind,
        line: rel,
        ...(kinds[k] === 'int' ? { value: Number(tok) } : {}),
      })),
      line: { ids: t.map((_, k) => base + k) },
      score: named ? PARAM_COST * t.length - 1 : t.length >= 5 ? -5 : t.length === 4 ? -2 : 0,
    });
  }
  // B: a line with spaces (or a word, in input whose other lines have spaces).
  if (kinds.some((k) => k === 'string')) {
    opts.push({
      next: i + 1,
      params: [{ type: 'line', line: rel }],
      line: { ids: [base] },
      score: t.length >= 2 ? -3 : -5,
    });
  }
  const arr = arrayType(kinds);
  if (arr) {
    // C: an array whose length was read before (one or two numbers counted by a value
    // that happens to match are more often scalars).
    for (const e of ints) {
      for (const plus of [0, -1]) {
        if (e.value + plus !== t.length || t.length === 0) continue;
        opts.push({
          next: i + 1,
          params: [{ type: arr, len: { id: e.id, plus }, line: rel }],
          line: { ids: [base] },
          score: (plus === 0 ? 2 : 0) - (t.length <= 2 ? 2 : 0),
        });
      }
    }
    // E: the rest of the line, or as many as the text says ("5개의 정수").
    opts.push({
      next: i + 1,
      params: [{ type: arr, line: rel }],
      line: { ids: [base] },
      score: named ? -4 : t.length >= 4 ? 1 : -4,
    });
    if (fixed.has(t.length) && t.length >= 3) {
      // Lines of the same size one after another are rows of one block.
      const prev = d.lines[d.lines.length - 1];
      const last =
        prev && 'ids' in prev && prev.ids.length === 1
          ? d.params[prev.ids[0] as number]
          : undefined;
      const again = last?.type === arr && last.len === t.length;
      opts.push({
        next: i + 1,
        params: [{ type: arr, len: t.length, line: rel }],
        line: { ids: [base] },
        score: named ? -3 : again ? -2 : 2,
      });
    }
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
  // D': a number and as many values as the text says ("번호 T와 20개의 정수").
  const restFixed = t.length - 1;
  if (kinds[0] === 'int' && restType && restFixed >= 3 && fixed.has(restFixed) && !named) {
    opts.push({
      next: i + 1,
      params: [
        { type: 'int', line: rel, value: Number(t[0]) },
        { type: restType, len: restFixed, line: rel },
      ],
      line: { ids: [base, base + 1] },
      score: 5,
    });
  }
  // F: several lines, one element or row each, counted by an integer read before. A single
  // line counted by a 1 is more often a coincidence.
  const counts: { count: DraftCount; n: number; score: number }[] = [];
  for (const e of ints) {
    for (const plus of [0, -1]) {
      const n = e.value + plus;
      if (n >= 1 && i + n <= end) {
        counts.push({ count: { id: e.id, plus }, n, score: (plus ? 0 : 2) - (n === 1 ? 4 : 0) });
      }
    }
  }
  // G: as many lines as the text says ("총 5줄"), or up to the end (only for a single case).
  for (const k of fixed) {
    if (k >= 3 && i + k <= end) counts.push({ count: k, n: k, score: 0 });
  }
  if (mustEnd && i > start && end - i >= 2 && !fixed.has(end - i)) {
    counts.push({ count: end - i, n: end - i, score: -3 });
  }
  // A block right after a block of the same rows is usually one block split by coincidence.
  const prev = d.lines[d.lines.length - 1];
  const before = prev && 'repeat' in prev ? d.params[prev.id] : undefined;
  for (const c of counts) {
    // The text describes a line inside the block on its own ("셋째 줄에는"): not one block.
    let inside = false;
    for (let k = 1; beforeBlocks && k < c.n && !inside; k++) inside = !!hints.described?.(rel + k);
    const countId = typeof c.count === 'object' ? c.count.id : undefined;
    const shape = lines.shape(i, c.n);
    for (const p of blockParams(shape, ints, rel, hints.fixedCols ?? fixed, countId)) {
      const split = before?.type === p.param.type && sameCount(before.cols, p.param.cols);
      opts.push({
        next: i + c.n,
        params: [p.param],
        line: { repeat: c.count, id: base },
        score: c.score + p.score - (split ? 4 : 0) - (inside ? 3 : 0),
      });
    }
  }
  return opts;
}

function sameCount(a: DraftCount | undefined, b: DraftCount | undefined): boolean {
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  return a.id === b.id && a.plus === b.plus;
}

function blockParams(
  shape: BlockShape,
  ints: { id: number; value: number }[],
  rel: number,
  fixed: ReadonlySet<number>,
  countId?: number,
): { param: DraftParam; score: number }[] {
  const out: { param: DraftParam; score: number }[] = [];
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
      const base = allNumeric && !zeros ? -2 : 1;
      const cols: DraftCount[] = ints
        .filter((e) => e.value === w)
        .map((e) => ({ id: e.id, plus: 0 }));
      if (fixed.has(w)) cols.push(w);
      for (const c of cols) {
        // Rows of digits as long as another number says ("N M" then N rows of M digits).
        const digits = typeof c === 'object' && c.id !== countId && allNumeric && !zeros;
        out.push({
          param: { type: 'char[][]', line: rel, cols: c },
          score: 2 + (digits ? 0 : base),
        });
      }
      if (cols.length === 0) out.push({ param: { type: 'char[][]', line: rel }, score: base });
    }
    return out;
  }
  if (!allInt) return out;
  if (shape.width !== undefined) {
    const w = shape.width;
    // Every integer with this value: the text decides which one counts the columns.
    const cols = ints.filter((e) => e.value === w);
    for (const c of cols) {
      out.push({ param: { type: 'int[][]', line: rel, cols: { id: c.id, plus: 0 } }, score: 2 });
    }
    if (w <= 4 || fixed.has(w)) {
      const score = fixed.has(w) ? 2 : cols.length ? 0 : 1;
      out.push({ param: { type: 'int[][]', line: rel, cols: w }, score });
    }
    out.push({ param: { type: 'int[][]', line: rel }, score: -2 });
  } else {
    out.push({ param: { type: 'int[][]', line: rel }, score: -3 });
  }
  return out;
}
