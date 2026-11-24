/**
 * Python glue (Python 3 / PyPy3): reads stdin once, calls `solution` per case and writes
 * everything with one sys.stdout.write. Formats without line boundaries use the fast
 * `sys.stdin.buffer.read().split()` path; the others keep a position in the text.
 */
import { retSep, type RetSpec } from '../dsl';
import {
  needsLines,
  quote,
  renderCount,
  type CountRef,
  type Plan,
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
        return s`;

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => renderCount(c, variable);

function step(s: Step): string {
  switch (s.op) {
    case 'nl':
      return '__cib_nl()';
    case 'scalar':
      return `${variable(s.v)} = ${CONVERT[s.t]}(__cib_tok())`;
    case 'line':
      return `${variable(s.v)} = __cib_line()`;
    case 'array':
      return `${variable(s.v)} = __cib_many(${count(s.n)}, ${CONVERT[s.t]})`;
    case 'rest':
      return `${variable(s.v)} = list(map(${CONVERT[s.t]}, __cib_line().split()))`;
    case 'grid':
      return s.cols
        ? `${variable(s.v)} = [__cib_many(${count(s.cols)}, int) for _ in range(${count(s.n)})]`
        : `${variable(s.v)} = [(__cib_nl(), list(map(int, __cib_line().split())))[1] for _ in range(${count(s.n)})]`;
    case 'chars':
      return `${variable(s.v)} = __cib_many(${count(s.n)}, __cib_s)`;
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
      return `${sep}.join(map(str, r))`;
    case 'int[][]':
    case 'char[][]':
      return `'\\n'.join(${sep}.join(map(str, row)) for row in r)`;
    default:
      return 'str(r)';
  }
}

export function pythonGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const indent = (n: number, lines: string[]) => lines.map((l) => ' '.repeat(n) + l).join('\n');
  const body = (n: number) =>
    indent(n, [
      'try:',
      ...plan.steps.map((s) => `    ${step(s)}`),
      'except Exception:',
      "    raise RuntimeError('__cib_input') from None",
      `__cib_o.append(__cib_f(solution(${vars.join(', ')})))`,
    ]);
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return body(4);
      case 'count':
        return `    for _ in range(int(__cib_tok())):\n${body(8)}`;
      case 'eof':
        return `    while __cib_more():\n${body(8)}`;
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
