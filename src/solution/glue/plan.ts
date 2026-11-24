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
 * and, only when the plan uses them (usesRows), the ROWS helpers:
 * - at(w): the next tokens are w; rowsTok / rowsLine / rowsPhys: rows counted ahead
 * - isEnd(t, m, e): line text t is an end line (END_MODES); endl(m, e): the next line is an
 *   end line (it is then read)
 * - rawl(): the next physical line as it is (only "\r" dropped), blank or not
 */
import {
  isArrayType,
  isBlock,
  isGridType,
  isRepeat,
  parseCount,
  parseEnd,
  repeatSize,
  sentinelOf,
  solutionParams,
  type End,
  type Format,
  type InnerLine,
  type RepeatLine,
  type Param,
  type ParsedCount,
} from '../dsl';
import { renderExpr } from '../count';
import { elementType } from '../values';

export type Scalar = 'int' | 'long' | 'double' | 'string';

/** A count with parameters replaced by their variable index. */
export type CountRef =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; v: number }
  | { kind: 'bin'; op: '+' | '-' | '*'; a: CountRef; b: CountRef };

/**
 * An end line as the glue runtimes check it: mode 0 none (the end of input), 1 the line is
 * `text`, 2 its first token is a number < 0, 3 a number <= 0, 4 it starts with `text`.
 */
export interface LineEnd {
  mode: 0 | 1 | 2 | 3 | 4;
  text: string;
}

export function lineEnd(end: End): LineEnd {
  switch (end.kind) {
    case 'eof':
      return { mode: 0, text: '' };
    case 'line':
      return { mode: 1, text: end.text };
    case 'neg':
      return { mode: end.zero ? 3 : 2, text: '' };
    case 'prefix':
      return { mode: 4, text: end.text };
  }
}

/**
 * How many rows a repeat reads: a count, or rows counted ahead in the input. `tok`: rows of
 * `k` tokens up to the end line's tokens (`end` empty: to the end of input). `line`: lines up
 * to an end line (mode 0: to the end of input), compared by their whole text when `text`
 * (line[]) or trimmed. `phys`: physical lines, blank ones too (raw line[]).
 */
export type Rows =
  | CountRef
  | { kind: 'tok'; end: string[]; k: CountRef }
  | { kind: 'line'; end: LineEnd; text: boolean }
  | { kind: 'phys'; end: LineEnd };

/** How many times a block is read. `tok`: up to the end line's tokens; `line`: up to an end line (read by endl). */
export type BlockLoop =
  | { kind: 'count'; n: CountRef }
  | { kind: 'eof' }
  | { kind: 'tok'; end: string[] }
  | { kind: 'line'; end: LineEnd };

export type Step =
  | { op: 'nl' }
  | { op: 'scalar'; v: number; t: Scalar }
  | { op: 'line'; v: number }
  /** raw `line`: the next physical line as it is. */
  | { op: 'raw'; v: number }
  /** n tokens. */
  | { op: 'array'; v: number; t: Scalar; n: Rows }
  /** Tokens of the rest of the current line. */
  | { op: 'rest'; v: number; t: Scalar }
  /** 2D arrays: n rows; with cols, n×cols tokens, else one line per row. */
  | { op: 'grid'; v: number; t: Scalar; n: Rows; cols?: CountRef }
  /** line[]: n whole lines. */
  | { op: 'lines'; v: number; n: Rows }
  /** raw line[]: n physical lines. */
  | { op: 'rawLines'; v: number; n: Rows }
  /** Skips the end line of an `until` repeat: k tokens, one whole line, or one physical line. */
  | { op: 'endTok'; k: number }
  | { op: 'endLine' }
  | { op: 'endRaw' }
  /** char[][]: n row tokens. */
  | { op: 'chars'; v: number; n: Rows }
  /**
   * A block read per `loop`: its steps read into the variables `item` (locals), which are
   * then appended to the parameter arrays `list`. The lists start empty before the loop.
   */
  | { op: 'block'; loop: BlockLoop; steps: Step[]; items: { list: number; item: number }[] };

export type CaseLoop =
  | { kind: 'once' }
  | { kind: 'count' }
  | { kind: 'eof' }
  | { kind: 'until'; tokens: string[] }
  /** Up to an end line found by line (endl): "<0", "<=0", "#*". */
  | { kind: 'line'; end: LineEnd };

export interface Plan {
  /** The parameters of `solution`, those read in blocks one dimension higher. */
  params: Param[];
  /** Block variables (one block's value), numbered after the parameters. */
  locals: Param[];
  steps: Step[];
  loop: CaseLoop;
}

/** The parameter or block variable with this variable number. */
export function planVar(plan: Plan, v: number): Param {
  return (plan.params[v] ?? plan.locals[v - plan.params.length]) as Param;
}

export function makePlan(format: Format): Plan {
  const params = solutionParams(format);
  const locals: Param[] = [];
  const top = new Map(format.params.map((p, i) => [p.name, i]));
  const byName = new Map(format.params.map((p) => [p.name, p]));
  let index = top;
  const ref = (c: string | number): CountRef => {
    const to = (x: ParsedCount): CountRef => {
      if (x.kind === 'num') return x;
      if (x.kind === 'ref') return { kind: 'ref', v: index.get(x.name) as number };
      return { kind: 'bin', op: x.op, a: to(x.a), b: to(x.b) };
    };
    return to(parseCount(c) as ParsedCount);
  };
  const repeatSteps = (spec: RepeatLine, out: Step[]) => {
    const p = byName.get(spec.of) as Param;
    const v = index.get(p.name) as number;
    const size = repeatSize(spec);
    const end =
      size.kind === 'until'
        ? parseEnd(size.end)
        : size.kind === 'eof'
          ? ({ kind: 'eof' } as const)
          : undefined;
    // Rows of whole lines: 2D arrays without a column count, and line[].
    const byLine = p.type === 'line[]' || (isGridType(p.type) && p.cols === undefined);
    const k: CountRef =
      isGridType(p.type) && p.cols !== undefined ? ref(p.cols) : { kind: 'num', value: 1 };
    let n: Rows;
    if (size.kind === 'count') n = ref(size.count);
    else if (p.raw) n = { kind: 'phys', end: lineEnd(end as End) };
    else if (byLine || (end && end.kind !== 'line' && end.kind !== 'eof')) {
      n = { kind: 'line', end: lineEnd(end as End), text: p.type === 'line[]' };
    } else {
      n = { kind: 'tok', end: end?.kind === 'line' ? end.text.split(' ') : [], k };
    }
    if (p.raw) out.push({ op: 'rawLines', v, n });
    else if (isArrayType(p.type)) out.push({ op: 'array', v, t: elementType(p.type), n });
    else if (p.type === 'char[][]') out.push({ op: 'chars', v, n });
    else if (p.type === 'line[]') out.push({ op: 'lines', v, n });
    else {
      out.push({
        op: 'grid',
        v,
        t: elementType(p.type),
        n,
        ...(p.cols !== undefined ? { cols: ref(p.cols) } : {}),
      });
    }
    if (size.kind !== 'until') return;
    if (n.kind === 'phys') out.push({ op: 'endRaw' });
    else if (n.kind === 'line') out.push({ op: 'endLine' });
    else if (n.kind === 'tok') out.push({ op: 'endTok', k: n.end.length });
  };
  const lineSteps = (spec: string[], out: Step[]) => {
    const ps = spec.map((name) => byName.get(name) as Param);
    const needsLine = ps.some(
      (p) => (p.type === 'line' && !p.raw) || (isArrayType(p.type) && p.len === undefined),
    );
    if (needsLine) out.push({ op: 'nl' });
    for (const p of ps) {
      const v = index.get(p.name) as number;
      if (p.type === 'line') out.push(p.raw ? { op: 'raw', v } : { op: 'line', v });
      else if (isArrayType(p.type)) {
        out.push(
          p.len === undefined
            ? { op: 'rest', v, t: elementType(p.type) }
            : { op: 'array', v, t: elementType(p.type), n: ref(p.len) },
        );
      } else out.push({ op: 'scalar', v, t: elementType(p.type) });
    }
  };
  const innerSteps = (spec: InnerLine, out: Step[]) => {
    if (isRepeat(spec)) repeatSteps(spec, out);
    else lineSteps(spec as string[], out);
  };
  const steps: Step[] = [];
  for (const spec of format.lines) {
    if (!isBlock(spec)) {
      innerSteps(spec as InnerLine, steps);
      continue;
    }
    const size = repeatSize(spec);
    // The block count uses the variables outside the block; the block's steps its locals.
    const loop: BlockLoop =
      size.kind === 'count'
        ? { kind: 'count', n: ref(size.count) }
        : size.kind === 'eof'
          ? { kind: 'eof' }
          : (() => {
              const end = parseEnd(size.end);
              return end.kind === 'line'
                ? { kind: 'tok' as const, end: end.text.split(' ') }
                : { kind: 'line' as const, end: lineEnd(end) };
            })();
    const items: { list: number; item: number }[] = [];
    index = new Map(top);
    for (const name of spec.of.flatMap((l) => (Array.isArray(l) ? l : [l.of]))) {
      const item = params.length + locals.length;
      locals.push(byName.get(name) as Param);
      items.push({ list: top.get(name) as number, item });
      index.set(name, item);
    }
    const inner: Step[] = [];
    for (const l of spec.of) innerSteps(l, inner);
    index = top;
    steps.push({ op: 'block', loop, steps: inner, items });
    if (loop.kind === 'tok') steps.push({ op: 'endTok', k: loop.end.length });
  }
  const cases = format.cases;
  const sentinel = sentinelOf(cases);
  const caseEnd = sentinel === undefined ? undefined : parseEnd(sentinel);
  const loop: CaseLoop =
    cases === null
      ? { kind: 'once' }
      : 'count' in cases
        ? { kind: 'count' }
        : caseEnd === undefined
          ? { kind: 'eof' }
          : caseEnd.kind === 'line'
            ? { kind: 'until', tokens: caseEnd.text.split(' ') }
            : { kind: 'line', end: lineEnd(caseEnd) };
  return { params, locals, steps, loop };
}

/** Every step, those inside blocks included. */
export function allSteps(steps: readonly Step[]): Step[] {
  return steps.flatMap((s) => (s.op === 'block' ? [s, ...allSteps(s.steps)] : [s]));
}

/** Steps that need line boundaries; without them Python can use its fast token path. */
export function needsLines(plan: Plan): boolean {
  return (
    plan.loop.kind === 'line' ||
    allSteps(plan.steps).some(
      (s) =>
        s.op === 'nl' ||
        s.op === 'lines' ||
        s.op === 'endLine' ||
        s.op === 'raw' ||
        s.op === 'rawLines' ||
        s.op === 'endRaw' ||
        (s.op === 'block' && s.loop.kind === 'line') ||
        (s.op === 'grid' && !s.cols) ||
        ('n' in s && (s.n.kind === 'line' || s.n.kind === 'phys')),
    )
  );
}

/**
 * True when the plan needs the ROWS helpers: rows counted ahead (an end line or the end of
 * input), blocks up to an end line, raw lines, or cases up to a "<0"-style end line.
 */
export function usesRows(plan: Plan): boolean {
  return (
    plan.loop.kind === 'line' ||
    allSteps(plan.steps).some(
      (s) =>
        s.op === 'raw' ||
        s.op === 'rawLines' ||
        s.op === 'endRaw' ||
        (s.op === 'block' && (s.loop.kind === 'tok' || s.loop.kind === 'line')) ||
        ('n' in s && 'kind' in s.n && ['tok', 'line', 'phys'].includes(s.n.kind)),
    )
  );
}

/** Renders a row count: a count, or a call that counts rows ahead in the input. */
export function renderRows(
  n: Rows,
  count: (c: CountRef) => string,
  call: {
    tok: (end: string[], k: string) => string;
    line: (end: LineEnd, text: boolean) => string;
    phys: (end: LineEnd) => string;
  },
): string {
  if (n.kind === 'tok') return call.tok(n.end, count(n.k));
  if (n.kind === 'line') return call.line(n.end, n.text);
  if (n.kind === 'phys') return call.phys(n.end);
  return count(n);
}

/** A string literal usable in JavaScript, Python, C++ and Java source. */
export function quote(s: string): string {
  return JSON.stringify(s);
}

/** Renders a count with each language's variable naming and integer conversion. */
export function renderCount(c: CountRef, variable: (v: number) => string): string {
  return renderExpr(
    c,
    (x) => (x.kind === 'num' ? String(x.value) : x.kind === 'ref' ? variable(x.v) : undefined),
    (x) => x as Extract<CountRef, { kind: 'bin' }>,
  );
}
