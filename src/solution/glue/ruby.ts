/**
 * Ruby glue (Baekjoon: `ruby`): nothing goes before the user's `def solution(...)`; after it,
 * the glue reads stdin once, calls `solution` per case and writes everything with one
 * write. Formats without line boundaries split the whole input into tokens; the others
 * scan it with StringScanner. Integers are Integer (any size), reals Float.
 */
import { retSep, type Format, type RetSpec } from '../dsl';
import {
  needsLines,
  renderCount,
  renderRows,
  usesRows,
  type CountRef,
  type Plan,
  type Rows,
  type Scalar,
  type Step,
} from './plan';
import type { GlueLanguage } from './types';

/** A single-quoted Ruby string literal (no interpolation, only `\\` and `\'` escaped). */
export function rubyQuote(s: string): string {
  return `'${s.replace(/[\\']/g, (c) => `\\${c}`)}'`;
}

const COMMON = `def __cib_fail
  raise '__cib_input'
end

def __cib_int(s)
  Integer(s, 10)
rescue StandardError
  __cib_fail
end

def __cib_dbl(s)
  Float(s)
rescue StandardError
  __cib_fail
end`;

/** Token reader over the whole input split at whitespace. */
const FAST = `$__cib_t = $stdin.binmode.read.force_encoding(Encoding::UTF_8).split
$__cib_n = $__cib_t.size
$__cib_p = 0

def __cib_tok
  p = $__cib_p
  __cib_fail if p >= $__cib_n
  $__cib_p = p + 1
  $__cib_t[p]
end

def __cib_take(n)
  p = $__cib_p
  __cib_fail if n < 0 || p + n > $__cib_n
  $__cib_p = p + n
  $__cib_t[p, n]
end

def __cib_more
  $__cib_p < $__cib_n
end

def __cib_has
  $__cib_p < $__cib_n
end

def __cib_pos
  $__cib_p
end

def __cib_seek(p)
  $__cib_p = p
end`;

/** Reader that keeps line boundaries. */
const LINES = `require 'strscan'
$__cib_s = StringScanner.new($stdin.binmode.read.force_encoding(Encoding::UTF_8))

def __cib_more
  $__cib_s.skip(/[ \\t\\r\\n]+/)
  !$__cib_s.eos?
end

def __cib_has
  !$__cib_s.match?(/[ \\t\\r\\n]*[^ \\t\\r\\n]/).nil?
end

def __cib_tok
  $__cib_s.skip(/[ \\t\\r\\n]+/)
  $__cib_s.scan(/[^ \\t\\r\\n]+/) || __cib_fail
end

def __cib_take(n)
  Array.new(n) { __cib_tok }
end

def __cib_nl
  s = $__cib_s
  if s.pos > 0 && s.string.getbyte(s.pos - 1) != 10
    s.skip_until(/\\n/) || s.terminate
  end
  nil while s.skip(/[ \\t\\r]*\\n/)
end

def __cib_line
  __cib_fail if $__cib_s.eos?
  $__cib_s.scan(/[^\\n]*/).strip
end

def __cib_pos
  $__cib_s.pos
end

def __cib_seek(p)
  $__cib_s.pos = p
end`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS = `def __cib_at(w)
  s = __cib_pos
  ok = w.all? { |x| __cib_more && __cib_tok == x }
  __cib_seek(s)
  ok
end

def __cib_rowsTok(w, k)
  s = __cib_pos
  r = 0
  while true
    break if w.empty? ? !__cib_has : __cib_at(w)
    __cib_fail if k < 1 || !__cib_has
    k.times { __cib_tok }
    r += 1
  end
  __cib_seek(s)
  r
end

def __cib_raw
  $__cib_s.scan(/[^\\n]*/).rstrip
end

def __cib_rowsLine(e, raw)
  s = __cib_pos
  r = 0
  while true
    __cib_nl
    unless __cib_has
      __cib_fail unless e.nil?
      break
    end
    t = raw ? __cib_raw : __cib_line
    break if !e.nil? && t == e
    r += 1
  end
  __cib_seek(s)
  r
end`;

const CONVERT: Record<Scalar, (x: string) => string> = {
  int: (x) => `__cib_int(${x})`,
  long: (x) => `__cib_int(${x})`,
  double: (x) => `__cib_dbl(${x})`,
  string: (x) => x,
};
/** `list` converted element by element. */
const mapped = (t: Scalar, list: string) =>
  t === 'string' ? list : `${list}.map { |x| ${CONVERT[t]('x')} }`;

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => renderCount(c, variable);
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_rowsTok([${end.map(rubyQuote).join(', ')}], ${k})`,
    line: (end, raw) => `__cib_rowsLine(${end === null ? 'nil' : rubyQuote(end)}, ${raw})`,
  });

function step(s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
    case 'nl':
      return '__cib_nl';
    case 'scalar':
      return `${v} = ${CONVERT[s.t]('__cib_tok')}`;
    case 'line':
      return `${v} = __cib_line`;
    case 'array':
      return `${v} = ${mapped(s.t, `__cib_take(${rows(s.n)})`)}`;
    case 'rest':
      return `${v} = ${mapped(s.t, '__cib_line.split')}`;
    case 'chars':
      return `${v} = __cib_take(${rows(s.n)})`;
    case 'grid':
      return s.cols
        ? `__cib_m = ${count(s.cols)}; ${v} = Array.new(${rows(s.n)}) { ${mapped(s.t, '__cib_take(__cib_m)')} }`
        : `${v} = Array.new(${rows(s.n)}) { __cib_nl; ${mapped(s.t, '__cib_line.split')} }`;
    case 'lines':
      return `${v} = Array.new(${rows(s.n)}) { __cib_nl; __cib_line }`;
    case 'endTok':
      return Array(s.k).fill('__cib_tok').join('; ');
    case 'endLine':
      return '__cib_nl; __cib_line';
  }
}

function formatter(ret: RetSpec): string {
  const sep = rubyQuote(retSep(ret));
  switch (ret.type) {
    case 'bool':
      return `r ? ${rubyQuote(ret.yes ?? 'true')} : ${rubyQuote(ret.no ?? 'false')}`;
    case 'double':
      return `format('%.${ret.digits ?? 6}f', r)`;
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return `r.map(&:to_s).join(${sep})`;
    case 'int[][]':
    case 'char[][]':
      return `r.map { |row| (row.is_a?(String) ? row.chars : row).map(&:to_s).join(${sep}) }.join("\\n")`;
    default:
      return 'r.to_s';
  }
}

export function rubyGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const indent = (n: number, lines: string[]) => lines.map((l) => ' '.repeat(n) + l).join('\n');
  const body = (n: number) =>
    indent(n, [
      ...(plan.steps.length
        ? [
            'begin',
            ...plan.steps.map((s) => `  ${step(s)}`),
            'rescue StandardError',
            '  __cib_fail',
            'end',
          ]
        : []),
      `__cib_o << __cib_f(solution(${vars.join(', ')}))`,
    ]);
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return body(2);
      case 'count':
        return [
          '  __cib_t = __cib_int(__cib_tok)',
          '  __cib_k = 0',
          '  while __cib_k < __cib_t',
          '    __cib_k += 1',
          body(4),
          '  end',
        ].join('\n');
      case 'eof':
        return `  while __cib_more\n${body(4)}\n  end`;
      case 'until': {
        const words = plan.loop.tokens.map(rubyQuote).join(', ');
        return [
          `  __cib_end = [${words}]`,
          '  while __cib_has',
          '    __cib_s = __cib_pos',
          '    break if __cib_end.all? { |w| __cib_more && __cib_tok == w }',
          '    __cib_seek(__cib_s)',
          body(4),
          '  end',
        ].join('\n');
      }
    }
  })();
  return [
    '# ---- 입출력 코드 ----',
    COMMON,
    '',
    needsLines(plan) ? LINES : FAST,
    ...(usesRows(plan) ? ['', ROWS] : []),
    '',
    'def __cib_f(r)',
    `  ${formatter(ret)}`,
    'end',
    '',
    'def __cib_main',
    '  __cib_o = []',
    loop,
    '  $stdout.write(__cib_o.join("\\n"), "\\n") unless __cib_o.empty?',
    'end',
    '',
    '__cib_main',
    '',
  ].join('\n');
}

/** Ruby keywords a format's parameter name could be (renamed with a trailing `_`). */
const KEYWORDS = new Set(
  (
    'alias and begin break case class def defined do else elsif end ensure false for if in ' +
    'module next nil not or redo rescue retry return self super then true undef unless until ' +
    'when while yield'
  ).split(' '),
);

function placeholder(format: Format): string {
  const type = format.ret.type;
  if (type.endsWith('[]')) return '[]';
  if (type === 'string') return "''";
  if (type === 'bool') return 'true';
  if (type === 'double') return '0.0';
  return '0';
}

export function rubyStarter(format: Format): string {
  const names = format.params.map((p) => (KEYWORDS.has(p.name) ? `${p.name}_` : p.name));
  return `# 입력을 읽고 결과를 출력하는 코드는 자동으로 붙습니다.\n\ndef solution(${names.join(', ')})\n  answer = ${placeholder(format)}\n  return answer\nend\n`;
}

export const rubyLanguage: GlueLanguage = {
  prefix: '',
  glue: rubyGlue,
  starter: rubyStarter,
  fileName: 'solution.rb',
};
