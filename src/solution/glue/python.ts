/**
 * Python glue (Python 3 / PyPy3): reads stdin once, calls `solution` per case and writes
 * everything with one sys.stdout.write. Formats without line boundaries use the fast
 * `sys.stdin.buffer.read().split()` path; the others keep a position in the text.
 */
import { labelParts, retSep, type RetSpec } from '../dsl';
import {
  needsLines,
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

const CONVERT: Record<Scalar, string> = {
  int: 'int',
  long: 'int',
  double: 'float',
  string: '__cib_s',
};

/** Token reader over `sys.stdin.buffer.read().split()` (bytes). */
const FAST = `    __cib_t = __cib_sys.stdin.buffer.read().split()
    __cib_n = len(__cib_t)
    __cib_P = [0]

    def __cib_tok():
        p = __cib_P[0]
        if p >= __cib_n:
            raise EOFError
        __cib_P[0] = p + 1
        return __cib_t[p]

    def __cib_many(n, f):
        p = __cib_P[0]
        if n < 0 or p + n > __cib_n:
            raise EOFError
        __cib_P[0] = p + n
        return list(map(f, __cib_t[p:p + n]))

    def __cib_more():
        return __cib_P[0] < __cib_n

    __cib_has = __cib_more

    def __cib_s(b):
        return b.decode()`;

/** Reader that keeps line boundaries (str). */
const LINES = `    import re as __cib_re
    __cib_d = __cib_sys.stdin.read()
    __cib_n = len(__cib_d)
    __cib_P = [0]
    __cib_T = __cib_re.compile(r'\\S+')

    def __cib_tok():
        m = __cib_T.search(__cib_d, __cib_P[0])
        if m is None:
            raise EOFError
        __cib_P[0] = m.end()
        return m.group()

    def __cib_many(n, f):
        if n < 0:
            raise EOFError
        return [f(__cib_tok()) for _ in range(n)]

    def __cib_more():
        return __cib_T.search(__cib_d, __cib_P[0]) is not None

    def __cib_nl():
        p = __cib_P[0]
        if p > 0 and __cib_d[p - 1] != '\\n':
            e = __cib_d.find('\\n', p)
            p = __cib_n if e < 0 else e + 1
        while True:
            e = __cib_d.find('\\n', p)
            if e >= 0 and __cib_d[p:e].strip() == '':
                p = e + 1
            else:
                break
        __cib_P[0] = p

    def __cib_line():
        p = __cib_P[0]
        if p >= __cib_n:
            raise EOFError
        e = __cib_d.find('\\n', p)
        e = __cib_n if e < 0 else e
        __cib_P[0] = e
        return __cib_d[p:e].strip()

    def __cib_s(s):
        return s

    __cib_has = __cib_more
`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS_TOK = `
    def __cib_raw():
        p = __cib_P[0]
        e = __cib_d.find('\\n', p)
        e = __cib_n if e < 0 else e
        __cib_P[0] = e
        return __cib_d[p:e].rstrip()

    __cib_num = __import__('re').compile(r'[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$')

    def __cib_isEnd(t, m, e):
        if m == 1:
            return t == e
        if m == 4:
            return t.startswith(e)
        f = t.split()
        if m not in (2, 3) or not f or __cib_num.match(f[0]) is None:
            return False
        return float(f[0]) < 0 if m == 2 else float(f[0]) <= 0

    def __cib_rowsLine(m, e, text):
        s = __cib_P[0]
        r = 0
        while True:
            __cib_nl()
            if not __cib_has():
                if m:
                    raise EOFError
                break
            t = __cib_raw() if text else __cib_line()
            if m and __cib_isEnd(t, m, e):
                break
            r += 1
        __cib_P[0] = s
        return r

    def __cib_endl(m, e):
        s = __cib_P[0]
        __cib_nl()
        if __cib_has() and __cib_isEnd(__cib_line(), m, e):
            return True
        __cib_P[0] = s
        return False

    def __cib_bol():
        p = __cib_P[0]
        if p > 0 and __cib_d[p - 1] != '\\n':
            e = __cib_d.find('\\n', p)
            __cib_P[0] = __cib_n if e < 0 else e + 1

    def __cib_rawl():
        __cib_bol()
        p = __cib_P[0]
        if p >= __cib_n:
            raise EOFError
        e = __cib_d.find('\\n', p)
        e = __cib_n if e < 0 else e
        __cib_P[0] = min(e + 1, __cib_n)
        s = __cib_d[p:e]
        return s[:-1] if s.endswith('\\r') else s

    def __cib_rowsPhys(m, e):
        s = __cib_P[0]
        r = 0
        __cib_bol()
        while True:
            if __cib_P[0] >= __cib_n:
                if m:
                    raise EOFError
                break
            t = __cib_rawl().rstrip()
            if m and __cib_isEnd(t, m, e):
                break
            r += 1
        __cib_P[0] = s
        return r

    def __cib_at(w):
        s = __cib_P[0]
        try:
            ok = all(__cib_s(__cib_tok()) == x for x in w)
        except EOFError:
            ok = False
        __cib_P[0] = s
        return ok

    def __cib_rowsTok(w, k):
        s = __cib_P[0]
        r = 0
        while True:
            if (__cib_at(w) if w else not __cib_has()):
                break
            if k < 1 or not __cib_has():
                raise EOFError
            for _ in range(k):
                __cib_tok()
            r += 1
        __cib_P[0] = s
        return r`;

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => renderCount(c, variable);
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_rowsTok([${end.map(quote).join(', ')}], ${k})`,
    line: (end, text) =>
      `__cib_rowsLine(${end.mode}, ${quote(end.text)}, ${text ? 'True' : 'False'})`,
    phys: (end) => `__cib_rowsPhys(${end.mode}, ${quote(end.text)})`,
  });

/** A block: its lists start empty; each pass reads the block's variables and appends them. */
function block(s: Extract<Step, { op: 'block' }>): string {
  const head = (() => {
    switch (s.loop.kind) {
      case 'count':
        return [
          `__cib_bn = ${count(s.loop.n)}`,
          'if __cib_bn < 0:',
          '    raise EOFError',
          'for _ in range(__cib_bn):',
        ];
      case 'eof':
        return ['while __cib_has():'];
      case 'tok':
        return [`while not __cib_at([${s.loop.end.map(quote).join(', ')}]):`];
      case 'line':
        return [`while not __cib_endl(${s.loop.end.mode}, ${quote(s.loop.end.text)}):`];
    }
  })();
  return [
    ...s.items.map((x) => `${variable(x.list)} = []`),
    ...head,
    ...s.steps.flatMap((x) => step(x).split('\n')).map((l) => `    ${l}`),
    ...s.items.map((x) => `    ${variable(x.list)}.append(${variable(x.item)})`),
  ].join('\n');
}

function step(s: Step): string {
  switch (s.op) {
    case 'block':
      return block(s);
    case 'raw':
      return `${variable(s.v)} = __cib_rawl()`;
    case 'rawLines':
      return `${variable(s.v)} = [__cib_rawl() for _ in range(${rows(s.n)})]`;
    case 'endRaw':
      return '__cib_rawl()';
    case 'nl':
      return '__cib_nl()';
    case 'scalar':
      return `${variable(s.v)} = ${CONVERT[s.t]}(__cib_tok())`;
    case 'line':
      return `${variable(s.v)} = __cib_line()`;
    case 'array':
      return `${variable(s.v)} = __cib_many(${rows(s.n)}, ${CONVERT[s.t]})`;
    case 'rest':
      return `${variable(s.v)} = list(map(${CONVERT[s.t]}, __cib_line().split()))`;
    case 'grid':
      return s.cols
        ? `${variable(s.v)} = [__cib_many(${count(s.cols)}, ${CONVERT[s.t]}) for _ in range(${rows(s.n)})]`
        : `${variable(s.v)} = [(__cib_nl(), list(map(${CONVERT[s.t]}, __cib_line().split())))[1] for _ in range(${rows(s.n)})]`;
    case 'lines':
      return `${variable(s.v)} = [(__cib_nl(), __cib_line())[1] for _ in range(${rows(s.n)})]`;
    case 'chars':
      return `${variable(s.v)} = __cib_many(${rows(s.n)}, __cib_s)`;
    case 'endTok':
      return Array(s.k).fill('__cib_tok()').join('; ');
    case 'endLine':
      return '__cib_nl(); __cib_line()';
  }
}

function formatter(ret: RetSpec): string {
  const sep = quote(retSep(ret));
  switch (ret.type) {
    case 'bool':
      return `${quote(ret.yes ?? 'True')} if r else ${quote(ret.no ?? 'False')}`;
    case 'double':
      return `'%.${ret.digits ?? 6}f' % r`;
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return `${sep}.join(map(str, r))`;
    case 'int[][]':
    case 'char[][]':
      return `'\\n'.join(${sep}.join(map(str, row)) for row in r)`;
    default:
      return 'str(r)';
  }
}

/** One case's output: its label (the case number is the outputs so far + 1), value, blank line. */
function caseText(ret: RetSpec, value: string): string {
  const label = labelParts(ret);
  const head = label ? `${quote(label.pre)} + str(len(__cib_o) + 1) + ${quote(label.post)} + ` : '';
  return `${head}${value}${ret.blank ? " + '\\n'" : ''}`;
}

export function pythonGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const indent = (n: number, lines: string[]) => lines.map((l) => ' '.repeat(n) + l).join('\n');
  const body = (n: number) =>
    indent(n, [
      'try:',
      ...(plan.steps.length
        ? plan.steps.flatMap((s) => step(s).split('\n')).map((l) => `    ${l}`)
        : ['    pass']),
      'except Exception:',
      "    raise RuntimeError('__cib_input') from None",
      `__cib_o.append(${caseText(ret, `__cib_f(solution(${vars.join(', ')}))`)})`,
    ]);
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return body(4);
      case 'count':
        return `    for _ in range(int(__cib_tok())):\n${body(8)}`;
      case 'eof':
        return `    while __cib_more():\n${body(8)}`;
      case 'line': {
        const { mode, text } = plan.loop.end;
        return `    while __cib_more() and not __cib_endl(${mode}, ${quote(text)}):\n${body(8)}`;
      }
      case 'until': {
        const words = plan.loop.tokens.map(quote).join(', ');
        return [
          `    __cib_end = [${words}]`,
          '',
          '    def __cib_stop():',
          '        p = __cib_P[0]',
          '        for w in __cib_end:',
          '            if not __cib_more() or __cib_s(__cib_tok()) != w:',
          '                __cib_P[0] = p',
          '                return False',
          '        return True',
          '',
          '    while __cib_more() and not __cib_stop():',
          body(8),
        ].join('\n');
      }
    }
  })();
  return [
    '# ---- 입출력 코드 ----',
    'import sys as __cib_sys',
    '',
    '',
    'def __cib_main():',
    "    if 'solution' not in globals():",
    "        raise NameError('__cib_nosolution')",
    needsLines(plan) ? LINES : FAST,
    ...(usesRows(plan) ? [ROWS_TOK] : []),
    '',
    '    def __cib_f(r):',
    `        return ${formatter(ret)}`,
    '',
    '    __cib_o = []',
    loop,
    '    if __cib_o:',
    "        __cib_sys.stdout.write('\\n'.join(__cib_o) + '\\n')",
    '',
    '',
    '__cib_main()',
    '',
  ].join('\n');
}
