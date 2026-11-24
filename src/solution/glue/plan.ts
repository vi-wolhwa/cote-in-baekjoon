/**
 * What the glue code reads, as a list of steps every language renders the same way
 * (ADR-0006). The glue reader is lenient: tokens may wrap lines, except where the format
 * needs line boundaries (`line`, arrays without a length, rows without a column count).
 *
 * Reader primitives each language implements:
 * - tok(): next token, skipping any whitespace including newlines
 * - nl(): moves to the start of the next line unless already at one, skipping blank lines
 * - line(): the rest of the current line, trimmed; rest(): its tokens
 * - more(): true when tokens remain (cases until EOF)
 */
import {
  isArrayType,
  isGridType,
  isRepeat,
  repeatSize,
  parseCount,
  sentinelOf,
  type Format,
  type Param,
  type ParsedCount,
} from '../dsl';
import { elementType } from '../values';

export type Scalar = 'int' | 'long' | 'double' | 'string';

/** A count with parameters replaced by their variable index. */
export type CountRef =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; v: number; plus: number }
  | { kind: 'mul' | 'add'; a: number; b: number };

/**
 * How many rows a repeat reads: a count, or rows counted ahead in the input. `tok`: rows of
 * `k` tokens up to the end line's tokens (`end` empty: to the end of input). `line`: whole
 * lines up to a line equal to `end` (whole text when `raw`, for line[]), or to the end.
 */
export type Rows =
  | CountRef
  | { kind: 'tok'; end: string[]; k: CountRef }
  | { kind: 'line'; end: string | null; raw: boolean };

export type Step =
  | { op: 'nl' }
  | { op: 'scalar'; v: number; t: Scalar }
  | { op: 'line'; v: number }
  /** n tokens. */
  | { op: 'array'; v: number; t: Scalar; n: Rows }
  /** Tokens of the rest of the current line. */
  | { op: 'rest'; v: number; t: Scalar }
  /** 2D arrays: n rows; with cols, n×cols tokens, else one line per row. */
  | { op: 'grid'; v: number; t: Scalar; n: Rows; cols?: CountRef }
  /** line[]: n whole lines. */
  | { op: 'lines'; v: number; n: Rows }
  /** Skips the end line of an `until` repeat: k tokens, or one whole line. */
  | { op: 'endTok'; k: number }
  | { op: 'endLine' }
  /** char[][]: n row tokens. */
  | { op: 'chars'; v: number; n: Rows };

export type CaseLoop =
  { kind: 'once' } | { kind: 'count' } | { kind: 'eof' } | { kind: 'until'; tokens: string[] };

export interface Plan {
  params: Param[];
  steps: Step[];
  loop: CaseLoop;
}

export function makePlan(format: Format): Plan {
  const index = new Map(format.params.map((p, i) => [p.name, i]));
  const byName = new Map(format.params.map((p) => [p.name, p]));
  const ref = (c: string | number): CountRef => {
    const parsed = parseCount(c) as ParsedCount;
    if (parsed.kind === 'num') return parsed;
    if (parsed.kind === 'ref')
      return { kind: 'ref', v: index.get(parsed.name) as number, plus: parsed.plus };
    return {
      kind: parsed.kind,
      a: index.get(parsed.a) as number,
      b: index.get(parsed.b) as number,
    };
  };
  const steps: Step[] = [];
  for (const spec of format.lines) {
    if (isRepeat(spec)) {
      const p = byName.get(spec.of) as Param;
      const v = index.get(p.name) as number;
      const size = repeatSize(spec);
      // Rows of whole lines: 2D arrays without a column count, and line[].
      const byLine = p.type === 'line[]' || (isGridType(p.type) && p.cols === undefined);
      const k: CountRef =
        isGridType(p.type) && p.cols !== undefined ? ref(p.cols) : { kind: 'num', value: 1 };
      const end = size.kind === 'until' ? size.end : null;
      const n: Rows =
        size.kind === 'count'
          ? ref(size.count)
          : byLine
            ? { kind: 'line', end, raw: p.type === 'line[]' }
            : { kind: 'tok', end: end === null ? [] : end.split(' '), k };
      if (isArrayType(p.type)) {
        steps.push({ op: 'array', v, t: elementType(p.type), n });
      } else if (p.type === 'char[][]') {
        steps.push({ op: 'chars', v, n });
      } else if (p.type === 'line[]') {
        steps.push({ op: 'lines', v, n });
      } else {
        steps.push({
          op: 'grid',
          v,
          t: elementType(p.type),
          n,
          ...(p.cols !== undefined ? { cols: ref(p.cols) } : {}),
        });
      }
      if (end !== null) {
        steps.push(byLine ? { op: 'endLine' } : { op: 'endTok', k: end.split(' ').length });
      }
      continue;
    }
    const params = spec.map((name) => byName.get(name) as Param);
    const needsLine = params.some(
      (p) => p.type === 'line' || (isArrayType(p.type) && p.len === undefined),
    );
    if (needsLine) steps.push({ op: 'nl' });
    for (const p of params) {
      const v = index.get(p.name) as number;
      if (p.type === 'line') steps.push({ op: 'line', v });
      else if (isArrayType(p.type)) {
        steps.push(
          p.len === undefined
            ? { op: 'rest', v, t: elementType(p.type) }
            : { op: 'array', v, t: elementType(p.type), n: ref(p.len) },
        );
      } else steps.push({ op: 'scalar', v, t: elementType(p.type) });
    }
  }
  const cases = format.cases;
  const sentinel = sentinelOf(cases);
  const loop: CaseLoop =
    cases === null
      ? { kind: 'once' }
      : 'count' in cases
        ? { kind: 'count' }
        : sentinel === undefined
          ? { kind: 'eof' }
          : { kind: 'until', tokens: sentinel.split(' ') };
  return { params: format.params, steps, loop };
}

/** Steps that need line boundaries; without them Python can use its fast token path. */
export function needsLines(plan: Plan): boolean {
  return plan.steps.some(
    (s) => s.op === 'nl' || s.op === 'lines' || s.op === 'endLine' || (s.op === 'grid' && !s.cols),
  );
}

/** True when some repeat counts its rows ahead (an end line or the end of input). */
export function usesRows(plan: Plan): boolean {
  return plan.steps.some((st) => 'n' in st && (st.n.kind === 'tok' || st.n.kind === 'line'));
}

/** Renders a row count: a count, or a call that counts rows ahead in the input. */
export function renderRows(
  n: Rows,
  count: (c: CountRef) => string,
  call: {
    tok: (end: string[], k: string) => string;
    line: (end: string | null, raw: boolean) => string;
  },
): string {
  if (n.kind === 'tok') return call.tok(n.end, count(n.k));
  if (n.kind === 'line') return call.line(n.end, n.raw);
  return count(n);
}

/** A string literal usable in JavaScript, Python, C++ and Java source. */
export function quote(s: string): string {
  return JSON.stringify(s);
}

/** Renders a count with each language's variable naming and integer conversion. */
export function renderCount(c: CountRef, variable: (v: number) => string): string {
  if (c.kind === 'num') return String(c.value);
  if (c.kind === 'ref') {
    const base = variable(c.v);
    if (c.plus === 0) return base;
    return `${base} ${c.plus > 0 ? '+' : '-'} ${Math.abs(c.plus)}`;
  }
  return `${variable(c.a)} ${c.kind === 'add' ? '+' : '*'} ${variable(c.b)}`;
}
