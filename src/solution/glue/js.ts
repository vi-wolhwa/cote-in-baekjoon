/**
 * JavaScript glue (Node on Baekjoon): reads /dev/stdin once, calls `solution` per case and
 * prints everything with one console.log. `long` values are numbers while they are safe
 * integers, BigInt beyond that.
 */
import { labelParts, retSep, type RetSpec } from '../dsl';
import {
  quote,
  renderCount,
  renderRows,
  usesRows,
  type CountRef,
  type Plan,
  type Rows,
  type Scalar,
  type Step,
} from './plan';

const RUNTIME = `const __cib_d = require('fs').readFileSync('/dev/stdin').toString();
const __cib_n = __cib_d.length;
let __cib_p = 0;
const __cib_ws = (c) => c === 32 || c === 10 || c === 13 || c === 9;
const __cib_fail = () => { throw new Error('__cib_input'); };
const __cib_skip = () => { while (__cib_p < __cib_n && __cib_ws(__cib_d.charCodeAt(__cib_p))) __cib_p++; };
const __cib_more = () => { __cib_skip(); return __cib_p < __cib_n; };
const __cib_tok = () => {
  __cib_skip();
  if (__cib_p >= __cib_n) __cib_fail();
  const s = __cib_p;
  while (__cib_p < __cib_n && !__cib_ws(__cib_d.charCodeAt(__cib_p))) __cib_p++;
  return __cib_d.slice(s, __cib_p);
};
const __cib_nl = () => {
  if (__cib_p > 0 && __cib_d.charCodeAt(__cib_p - 1) !== 10) {
    const e = __cib_d.indexOf('\\n', __cib_p);
    __cib_p = e < 0 ? __cib_n : e + 1;
  }
  for (;;) {
    let q = __cib_p;
    while (q < __cib_n && __cib_ws(__cib_d.charCodeAt(q)) && __cib_d.charCodeAt(q) !== 10) q++;
    if (q < __cib_n && __cib_d.charCodeAt(q) === 10) __cib_p = q + 1;
    else break;
  }
};
const __cib_line = () => {
  if (__cib_p >= __cib_n) __cib_fail();
  const e = __cib_d.indexOf('\\n', __cib_p);
  const end = e < 0 ? __cib_n : e;
  const s = __cib_d.slice(__cib_p, end).trim();
  __cib_p = end;
  return s;
};
const __cib_rest = () => { const s = __cib_line(); return s === '' ? [] : s.split(/\\s+/); };
const __cib_int = (s) => { const n = +s; if (n !== n || !/^[+-]?\\d+$/.test(s)) __cib_fail(); return n; };
const __cib_long = (s) => { const n = __cib_int(s); return Number.isSafeInteger(n) ? n : BigInt(s); };
const __cib_dbl = (s) => { const n = +s; if (n !== n) __cib_fail(); return n; };
const __cib_str = (s) => s;
const __cib_rep = (n, f) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = f(); return a; };
const __cib_has = () => { let q = __cib_p; while (q < __cib_n && __cib_ws(__cib_d.charCodeAt(q))) q++; return q < __cib_n; };`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS = `const __cib_at = (w) => {
  const s = __cib_p;
  let ok = true;
  for (const x of w) if (!__cib_more() || __cib_tok() !== x) { ok = false; break; }
  __cib_p = s;
  return ok;
};
const __cib_rowsTok = (w, k) => {
  const s = __cib_p;
  let r = 0;
  for (;;) {
    if (w.length ? __cib_at(w) : !__cib_has()) break;
    if (k < 1 || !__cib_has()) __cib_fail();
    for (let i = 0; i < k; i++) __cib_tok();
    r++;
  }
  __cib_p = s;
  return r;
};
const __cib_raw = () => {
  const e = __cib_d.indexOf('\\n', __cib_p);
  const end = e < 0 ? __cib_n : e;
  const s = __cib_d.slice(__cib_p, end).replace(/\\s+$/, '');
  __cib_p = end;
  return s;
};
const __cib_isEnd = (t, m, e) => {
  if (m === 1) return t === e;
  if (m === 4) return t.startsWith(e);
  if (m !== 2 && m !== 3) return false;
  const f = t.trim().split(/\\s+/)[0];
  if (!/^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$/.test(f)) return false;
  return m === 2 ? +f < 0 : +f <= 0;
};
const __cib_rowsLine = (m, e, text) => {
  const s = __cib_p;
  let r = 0;
  for (;;) {
    __cib_nl();
    if (!__cib_has()) { if (m) __cib_fail(); break; }
    const t = text ? __cib_raw() : __cib_line();
    if (m && __cib_isEnd(t, m, e)) break;
    r++;
  }
  __cib_p = s;
  return r;
};
const __cib_endl = (m, e) => {
  const s = __cib_p;
  __cib_nl();
  if (__cib_has() && __cib_isEnd(__cib_line(), m, e)) return true;
  __cib_p = s;
  return false;
};
const __cib_bol = () => {
  if (__cib_p > 0 && __cib_d.charCodeAt(__cib_p - 1) !== 10) {
    const e = __cib_d.indexOf('\\n', __cib_p);
    __cib_p = e < 0 ? __cib_n : e + 1;
  }
};
const __cib_rawl = () => {
  __cib_bol();
  if (__cib_p >= __cib_n) __cib_fail();
  const e = __cib_d.indexOf('\\n', __cib_p);
  const s = __cib_d.slice(__cib_p, e < 0 ? __cib_n : e).replace(/\\r$/, '');
  __cib_p = e < 0 ? __cib_n : e + 1;
  return s;
};
const __cib_rowsPhys = (m, e) => {
  const s = __cib_p;
  let r = 0;
  __cib_bol();
  for (;;) {
    if (__cib_p >= __cib_n) { if (m) __cib_fail(); break; }
    const t = __cib_rawl().replace(/\\s+$/, '');
    if (m && __cib_isEnd(t, m, e)) break;
    r++;
  }
  __cib_p = s;
  return r;
};`;

const CONVERT: Record<Scalar, string> = {
  int: '__cib_int',
  long: '__cib_long',
  double: '__cib_dbl',
  string: '__cib_str',
};

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => renderCount(c, (v) => `Number(${variable(v)})`);
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_rowsTok([${end.map(quote).join(', ')}], ${k})`,
    line: (end, text) => `__cib_rowsLine(${end.mode}, ${quote(end.text)}, ${text})`,
    phys: (end) => `__cib_rowsPhys(${end.mode}, ${quote(end.text)})`,
  });

/** A block: its lists start empty; each pass reads the block's variables and appends them. */
function block(s: Extract<Step, { op: 'block' }>): string {
  const head = (() => {
    switch (s.loop.kind) {
      case 'count':
        return `for (let __cib_b = 0, __cib_bn = ${count(s.loop.n)}; __cib_bn < 0 ? __cib_fail() : __cib_b < __cib_bn; __cib_b++)`;
      case 'eof':
        return 'while (__cib_has())';
      case 'tok':
        return `while (!__cib_at([${s.loop.end.map(quote).join(', ')}]))`;
      case 'line':
        return `while (!__cib_endl(${s.loop.end.mode}, ${quote(s.loop.end.text)}))`;
    }
  })();
  return [
    ...s.items.map((x) => `${variable(x.list)} = [];`),
    `${head} {`,
    `  let ${s.items.map((x) => variable(x.item)).join(', ')};`,
    ...s.steps.flatMap((x) => step(x).split('\n')).map((l) => `  ${l}`),
    ...s.items.map((x) => `  ${variable(x.list)}.push(${variable(x.item)});`),
    '}',
  ].join('\n');
}

function step(s: Step): string {
  switch (s.op) {
    case 'block':
      return block(s);
    case 'raw':
      return `${variable(s.v)} = __cib_rawl();`;
    case 'rawLines':
      return `${variable(s.v)} = __cib_rep(${rows(s.n)}, __cib_rawl);`;
    case 'endRaw':
      return '__cib_rawl();';
    case 'nl':
      return '__cib_nl();';
    case 'scalar':
      return `${variable(s.v)} = ${CONVERT[s.t]}(__cib_tok());`;
    case 'line':
      return `${variable(s.v)} = __cib_line();`;
    case 'array':
      return `${variable(s.v)} = __cib_rep(${rows(s.n)}, () => ${CONVERT[s.t]}(__cib_tok()));`;
    case 'rest':
      return `${variable(s.v)} = __cib_rest().map(${CONVERT[s.t]});`;
    case 'grid':
      return s.cols
        ? `${variable(s.v)} = __cib_rep(${rows(s.n)}, () => __cib_rep(${count(s.cols)}, () => ${CONVERT[s.t]}(__cib_tok())));`
        : `${variable(s.v)} = __cib_rep(${rows(s.n)}, () => { __cib_nl(); return __cib_rest().map(${CONVERT[s.t]}); });`;
    case 'lines':
      return `${variable(s.v)} = __cib_rep(${rows(s.n)}, () => { __cib_nl(); return __cib_line(); });`;
    case 'endTok':
      return Array(s.k).fill('__cib_tok();').join(' ');
    case 'endLine':
      return '__cib_nl(); __cib_line();';
    case 'chars':
      return `${variable(s.v)} = __cib_rep(${rows(s.n)}, __cib_tok);`;
  }
}

function formatter(ret: RetSpec): string {
  const sep = quote(retSep(ret));
  switch (ret.type) {
    case 'bool':
      return `(r) => (r ? ${quote(ret.yes ?? 'true')} : ${quote(ret.no ?? 'false')})`;
    case 'double':
      return `(r) => Number(r).toFixed(${ret.digits ?? 6})`;
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return `(r) => Array.from(r, String).join(${sep})`;
    case 'int[][]':
    case 'char[][]':
      return `(r) => Array.from(r, (row) => Array.from(row, String).join(${sep})).join('\\n')`;
    default:
      return '(r) => String(r)';
  }
}

/** One case's output: its label (the case number is the outputs so far + 1), value, blank line. */
function caseText(ret: RetSpec, value: string): string {
  const label = labelParts(ret);
  const head = label ? `${quote(label.pre)} + (__cib_o.length + 1) + ${quote(label.post)} + ` : '';
  return `${head}${value}${ret.blank ? " + '\\n'" : ''}`;
}

export function jsGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const read = plan.steps
    .flatMap((s) => step(s).split('\n'))
    .map((l) => `      ${l}`)
    .join('\n');
  const body = [
    ...(vars.length ? [`    let ${vars.join(', ')};`] : []),
    '    try {',
    read,
    '    } catch (e) {',
    "      throw new Error('__cib_input');",
    '    }',
    `    __cib_o.push(${caseText(ret, `__cib_f(solution(${vars.join(', ')}))`)});`,
  ].join('\n');
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return `  {\n${body}\n  }`;
      case 'count':
        return `  const __cib_t = __cib_int(__cib_tok());\n  for (let __cib_i = 0; __cib_i < __cib_t; __cib_i++) {\n${body}\n  }`;
      case 'eof':
        return `  while (__cib_has()) {\n${body}\n  }`;
      case 'line': {
        const { mode, text } = plan.loop.end;
        return `  while (__cib_has() && !__cib_endl(${mode}, ${quote(text)})) {\n${body}\n  }`;
      }
      case 'until': {
        const words = plan.loop.tokens.map(quote).join(', ');
        return [
          `  const __cib_end = [${words}];`,
          '  const __cib_stop = () => {',
          '    const s = __cib_p;',
          '    for (const w of __cib_end) {',
          '      if (!__cib_more() || __cib_tok() !== w) { __cib_p = s; return false; }',
          '    }',
          '    return true;',
          '  };',
          `  while (__cib_has() && !__cib_stop()) {\n${body}\n  }`,
        ].join('\n');
      }
    }
  })();
  return [
    '// ---- 입출력 코드 ----',
    '(() => {',
    (usesRows(plan) ? `${RUNTIME}\n${ROWS}` : RUNTIME)
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
    "  if (typeof solution !== 'function') throw new Error('__cib_nosolution');",
    `  const __cib_f = ${formatter(ret)};`,
    '  const __cib_o = [];',
    loop,
    "  if (__cib_o.length) console.log(__cib_o.join('\\n'));",
    '})();',
    '',
  ].join('\n');
}
