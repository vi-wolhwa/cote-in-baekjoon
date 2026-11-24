/**
 * Count expressions of the format DSL (ADR-0006): how many elements, columns or lines to read.
 * A count is a number, or integer arithmetic over integer parameters read earlier and integer
 * literals with `+ - *` and parentheses: "n", "n-1", "2*n-1", "n*m", "2*(n+m)".
 */

/** A count as written in a format: a number, or an expression as text. */
export type Count = string | number;

export type ParsedCount =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; name: string }
  | { kind: 'bin'; op: '+' | '-' | '*'; a: ParsedCount; b: ParsedCount };

export const MAX_COUNT = 1_000_000;
/** Longest count text, and most numbers and names in one count. */
const MAX_TEXT = 40;
const MAX_TERMS = 8;

/** Parses a count expression; undefined when it is not one. */
export function parseCount(c: Count): ParsedCount | undefined {
  if (typeof c === 'number') {
    return Number.isInteger(c) && c >= 0 && c <= MAX_COUNT ? { kind: 'num', value: c } : undefined;
  }
  if (typeof c !== 'string') return undefined;
  const s = c.trim();
  if (s === '' || s.replace(/\s+/g, '').length > MAX_TEXT) return undefined;
  // Spaces only separate tokens ("n m" is not "nm").
  const tokens = s.match(/[a-z_]\w*|\d+|\S/g) ?? [];
  let i = 0;
  let terms = 0;
  const peek = () => tokens[i];
  const factor = (): ParsedCount | undefined => {
    const t = tokens[i++];
    if (t === undefined) return undefined;
    if (t === '(') {
      const e = sum();
      return e && tokens[i++] === ')' ? e : undefined;
    }
    if (++terms > MAX_TERMS) return undefined;
    if (/^\d+$/.test(t)) {
      const value = Number(t);
      return t.length <= 7 && value <= MAX_COUNT ? { kind: 'num', value } : undefined;
    }
    return /^[a-z_]\w*$/.test(t) ? { kind: 'ref', name: t } : undefined;
  };
  const product = (): ParsedCount | undefined => {
    let a = factor();
    while (a && peek() === '*') {
      i++;
      const b = factor();
      a = b && { kind: 'bin', op: '*', a, b };
    }
    return a;
  };
  const sum = (): ParsedCount | undefined => {
    let a = product();
    while (a && (peek() === '+' || peek() === '-')) {
      const op = tokens[i++] as '+' | '-';
      const b = product();
      a = b && { kind: 'bin', op, a, b };
    }
    return a;
  };
  const e = sum();
  return e && i === tokens.length ? e : undefined;
}

/** The parameter names a count refers to, in order. */
export function countRefs(c: ParsedCount): string[] {
  if (c.kind === 'ref') return [c.name];
  if (c.kind === 'bin') return [...countRefs(c.a), ...countRefs(c.b)];
  return [];
}

/** The value of a count with the integer parameters read so far (NaN for a missing one). */
export function evalCount(c: ParsedCount, env: ReadonlyMap<string, number>): number {
  if (c.kind === 'num') return c.value;
  if (c.kind === 'ref') return env.get(c.name) ?? Number.NaN;
  const a = evalCount(c.a, env);
  const b = evalCount(c.b, env);
  return c.op === '+' ? a + b : c.op === '-' ? a - b : a * b;
}

const PRECEDENCE = { '+': 1, '-': 1, '*': 2 } as const;

/**
 * Renders a count with the fewest parentheses: `leaf` renders numbers and names, so glue
 * code can convert each parameter to its language's integer type.
 */
export function renderExpr<T extends { kind: string }>(
  c: T,
  leaf: (c: T) => string | undefined,
  sides: (c: T) => { op: '+' | '-' | '*'; a: T; b: T },
  space = ' ',
): string {
  const own = leaf(c);
  if (own !== undefined) return own;
  const { op, a, b } = sides(c);
  const wrap = (x: T, right: boolean) => {
    const text = renderExpr(x, leaf, sides, space);
    if (leaf(x) !== undefined) return text;
    const inner = PRECEDENCE[sides(x).op];
    const outer = PRECEDENCE[op];
    return inner < outer || (right && inner === outer && op === '-') ? `(${text})` : text;
  };
  return `${wrap(a, false)}${space}${op}${space}${wrap(b, true)}`;
}

/** "n", "n-1", "2*(n+m)" or "5", for display. */
export function countText(c: ParsedCount): string {
  return renderExpr(
    c,
    (x) => (x.kind === 'num' ? String(x.value) : x.kind === 'ref' ? x.name : undefined),
    (x) => x as Extract<ParsedCount, { kind: 'bin' }>,
    '',
  );
}
