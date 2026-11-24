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
  isRepeat,
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

export type Step =
  | { op: 'nl' }
  | { op: 'scalar'; v: number; t: Scalar }
  | { op: 'line'; v: number }
  /** n tokens. */
  | { op: 'array'; v: number; t: Scalar; n: CountRef }
  /** Tokens of the rest of the current line. */
  | { op: 'rest'; v: number; t: Scalar }
  /** 2D arrays: n rows; with cols, n×cols tokens, else one line per row. */
  | { op: 'grid'; v: number; t: Scalar; n: CountRef; cols?: CountRef }
  /** line[]: n whole lines. */
  | { op: 'lines'; v: number; n: CountRef }
  /** char[][]: n row tokens. */
  | { op: 'chars'; v: number; n: CountRef };

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
      if (isArrayType(p.type)) {
        steps.push({ op: 'array', v, t: elementType(p.type), n: ref(spec.repeat) });
      } else if (p.type === 'char[][]') {
        steps.push({ op: 'chars', v, n: ref(spec.repeat) });
      } else if (p.type === 'line[]') {
        steps.push({ op: 'lines', v, n: ref(spec.repeat) });
      } else {
        steps.push({
          op: 'grid',
          v,
          t: elementType(p.type),
          n: ref(spec.repeat),
          ...(p.cols !== undefined ? { cols: ref(p.cols) } : {}),
        });
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
  return plan.steps.some((s) => s.op === 'nl' || s.op === 'lines' || (s.op === 'grid' && !s.cols));
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
