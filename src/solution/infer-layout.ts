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

/** Layouts for one case of `lines` starting at `start`, likelier options first. */
export function layouts(lines: Lines, start: number, end: number, mustEnd: boolean): Draft[] {
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
