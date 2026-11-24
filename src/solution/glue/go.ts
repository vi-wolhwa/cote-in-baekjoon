/**
 * Go glue: `package main` and the glue's own imports (under `__cib_` names, so the user's
 * `import "os"` or `import "fmt"` never clash and none goes unused) come before the user's
 * `func solution(...)`; the user's own imports follow at the top of their code. After it,
 * a byte reader and `func main` that calls `solution` per case.
 */
import { retSep, type Format, type ParamType, type RetSpec, type RetType } from '../dsl';
import {
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

export const GO_PREFIX =
  'package main\nimport (__cib_io "io"; __cib_os "os"; __cib_strconv "strconv")\n';

export const GO_TYPES: Record<ParamType | RetType, string> = {
  int: 'int',
  long: 'int64',
  double: 'float64',
  string: 'string',
  line: 'string',
  bool: 'bool',
  'int[]': '[]int',
  'long[]': '[]int64',
  'double[]': '[]float64',
  'string[]': '[]string',
  'line[]': '[]string',
  'int[][]': '[][]int',
  'long[][]': '[][]int64',
  'double[][]': '[][]float64',
  'string[][]': '[][]string',
  'char[][]': '[]string',
};

const ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/** A Go string literal. */
export function goQuote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    const esc = ESCAPES[ch];
    if (ch === '\\' || ch === '"') out += `\\${ch}`;
    else if (esc !== undefined) out += esc;
    else if (c < 0x20 || c === 0x7f) out += `\\x${c.toString(16).padStart(2, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

/** `package main` written by habit would be a second package clause: blank it out. */
export function dropPackage(code: string): string {
  return code.replace(/^[ \t]*package[ \t]+main[ \t]*;?[ \t]*$/m, '');
}

const RUNTIME = `var __cib_d []byte
var __cib_p int

func __cib_fail() {
	__cib_os.Stderr.WriteString("__cib_input\\n")
	__cib_os.Exit(1)
}
func __cib_ws(c byte) bool { return c == ' ' || c == '\\n' || c == '\\r' || c == '\\t' }
func __cib_more() bool {
	for __cib_p < len(__cib_d) && __cib_ws(__cib_d[__cib_p]) {
		__cib_p++
	}
	return __cib_p < len(__cib_d)
}
func __cib_word() []byte {
	if !__cib_more() {
		__cib_fail()
	}
	s := __cib_p
	for __cib_p < len(__cib_d) && !__cib_ws(__cib_d[__cib_p]) {
		__cib_p++
	}
	return __cib_d[s:__cib_p]
}
func __cib_tok() string { return string(__cib_word()) }
func __cib_ll(b []byte) int64 {
	i, neg := 0, false
	if i < len(b) && (b[i] == '-' || b[i] == '+') {
		neg = b[i] == '-'
		i++
	}
	if i >= len(b) {
		__cib_fail()
	}
	var v int64
	for ; i < len(b); i++ {
		c := int64(b[i]) - '0'
		if c < 0 || c > 9 {
			__cib_fail()
		}
		v = v*10 - c
	}
	if neg {
		return v
	}
	return -v
}
func __cib_dbl(b []byte) float64 {
	v, err := __cib_strconv.ParseFloat(string(b), 64)
	if err != nil {
		__cib_fail()
	}
	return v
}
func __cib_cnt(x int64) int {
	if x < 0 {
		__cib_fail()
	}
	return int(x)
}
func __cib_nl() {
	n := len(__cib_d)
	if __cib_p > 0 && __cib_d[__cib_p-1] != '\\n' {
		for __cib_p < n && __cib_d[__cib_p] != '\\n' {
			__cib_p++
		}
		if __cib_p < n {
			__cib_p++
		}
	}
	for {
		q := __cib_p
		for q < n && __cib_d[q] != '\\n' && __cib_ws(__cib_d[q]) {
			q++
		}
		if q < n && __cib_d[q] == '\\n' {
			__cib_p = q + 1
		} else {
			break
		}
	}
}
func __cib_end() int {
	if __cib_p >= len(__cib_d) {
		__cib_fail()
	}
	e := __cib_p
	for e < len(__cib_d) && __cib_d[e] != '\\n' {
		e++
	}
	return e
}
func __cib_line() string {
	e := __cib_end()
	s := __cib_p
	__cib_p = e
	for s < e && __cib_ws(__cib_d[s]) {
		s++
	}
	for e > s && __cib_ws(__cib_d[e-1]) {
		e--
	}
	return string(__cib_d[s:e])
}
func __cib_rest() [][]byte {
	e := __cib_end()
	var r [][]byte
	i := __cib_p
	__cib_p = e
	for i < e {
		for i < e && __cib_ws(__cib_d[i]) {
			i++
		}
		s := i
		for i < e && !__cib_ws(__cib_d[i]) {
			i++
		}
		if i > s {
			r = append(r, __cib_d[s:i])
		}
	}
	return r
}
func __cib_has() bool {
	q := __cib_p
	for q < len(__cib_d) && __cib_ws(__cib_d[q]) {
		q++
	}
	return q < len(__cib_d)
}
func __cib_put(o []byte, x interface{}) []byte {
	switch v := x.(type) {
	case int:
		return __cib_strconv.AppendInt(o, int64(v), 10)
	case int64:
		return __cib_strconv.AppendInt(o, v, 10)
	case int32:
		return __cib_strconv.AppendInt(o, int64(v), 10)
	case int16:
		return __cib_strconv.AppendInt(o, int64(v), 10)
	case int8:
		return __cib_strconv.AppendInt(o, int64(v), 10)
	case uint:
		return __cib_strconv.AppendUint(o, uint64(v), 10)
	case uint64:
		return __cib_strconv.AppendUint(o, v, 10)
	case uint32:
		return __cib_strconv.AppendUint(o, uint64(v), 10)
	case uint16:
		return __cib_strconv.AppendUint(o, uint64(v), 10)
	case uint8:
		return __cib_strconv.AppendUint(o, uint64(v), 10)
	case float64:
		return __cib_strconv.AppendFloat(o, v, 'f', -1, 64)
	case float32:
		return __cib_strconv.AppendFloat(o, float64(v), 'f', -1, 32)
	case string:
		return append(o, v...)
	case bool:
		return __cib_strconv.AppendBool(o, v)
	}
	return o
}`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS = `func __cib_at(w []string) bool {
	s := __cib_p
	ok := true
	for _, x := range w {
		if !__cib_more() || __cib_tok() != x {
			ok = false
			break
		}
	}
	__cib_p = s
	return ok
}
func __cib_rowsTok(w []string, k int) int {
	s := __cib_p
	r := 0
	for {
		if len(w) == 0 && !__cib_has() || len(w) > 0 && __cib_at(w) {
			break
		}
		if k < 1 || !__cib_has() {
			__cib_fail()
		}
		for i := 0; i < k; i++ {
			__cib_word()
		}
		r++
	}
	__cib_p = s
	return r
}
func __cib_raw() string {
	e := __cib_p
	for e < len(__cib_d) && __cib_d[e] != '\\n' {
		e++
	}
	s := __cib_p
	__cib_p = e
	for e > s && __cib_ws(__cib_d[e-1]) {
		e--
	}
	return string(__cib_d[s:e])
}
func __cib_rowsLine(e string, until bool, raw bool) int {
	s := __cib_p
	r := 0
	for {
		__cib_nl()
		if !__cib_has() {
			if until {
				__cib_fail()
			}
			break
		}
		var t string
		if raw {
			t = __cib_raw()
		} else {
			t = __cib_line()
		}
		if until && t == e {
			break
		}
		r++
	}
	__cib_p = s
	return r
}`;

const ELEMENT: Record<Scalar, string> = {
  int: 'int',
  long: 'int64',
  double: 'float64',
  string: 'string',
};
/** Converts one word (a byte slice) of the input. */
const CONVERT: Record<Scalar, (b: string) => string> = {
  int: (b) => `int(__cib_ll(${b}))`,
  long: (b) => `__cib_ll(${b})`,
  double: (b) => `__cib_dbl(${b})`,
  string: (b) => `string(${b})`,
};
const READ = (t: Scalar) => CONVERT[t]('__cib_word()');

const variable = (v: number) => `__cib_v${v}`;
const count = (c: CountRef) => `__cib_cnt(${renderCount(c, (v) => `int64(${variable(v)})`)})`;
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_rowsTok([]string{${end.map(goQuote).join(', ')}}, ${k})`,
    line: (end, raw) =>
      `__cib_rowsLine(${end === null ? '"", false' : `${goQuote(end)}, true`}, ${raw})`,
  });

function step(s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
    case 'nl':
      return '__cib_nl()';
    case 'scalar':
      return `${v} = ${READ(s.t)}`;
    case 'line':
      return `${v} = __cib_line()`;
    case 'array':
      return `${v} = make([]${ELEMENT[s.t]}, ${rows(s.n)}); for __cib_i := range ${v} { ${v}[__cib_i] = ${READ(s.t)} }`;
    case 'rest':
      return `{ __cib_w := __cib_rest(); ${v} = make([]${ELEMENT[s.t]}, len(__cib_w)); for __cib_i, __cib_x := range __cib_w { ${v}[__cib_i] = ${CONVERT[s.t]('__cib_x')} } }`;
    case 'chars':
      return `${v} = make([]string, ${rows(s.n)}); for __cib_i := range ${v} { ${v}[__cib_i] = __cib_tok() }`;
    case 'grid': {
      const e = ELEMENT[s.t];
      return s.cols
        ? `${v} = make([][]${e}, ${rows(s.n)}); for __cib_i := range ${v} { ${v}[__cib_i] = make([]${e}, ${count(s.cols)}); for __cib_j := range ${v}[__cib_i] { ${v}[__cib_i][__cib_j] = ${READ(s.t)} } }`
        : `${v} = make([][]${e}, ${rows(s.n)}); for __cib_i := range ${v} { __cib_nl(); __cib_w := __cib_rest(); ${v}[__cib_i] = make([]${e}, len(__cib_w)); for __cib_j, __cib_x := range __cib_w { ${v}[__cib_i][__cib_j] = ${CONVERT[s.t]('__cib_x')} } }`;
    }
    case 'lines':
      return `${v} = make([]string, ${rows(s.n)}); for __cib_i := range ${v} { __cib_nl(); ${v}[__cib_i] = __cib_line() }`;
    case 'endTok':
      return Array(s.k).fill('__cib_word()').join('; ');
    case 'endLine':
      return '__cib_nl(); __cib_line()';
  }
}

/** Prints `__cib_r`; ranging works for any slice, strings as rows of characters. */
function printer(ret: RetSpec): string[] {
  const sep = goQuote(retSep(ret));
  const join = (arr: string, item: (x: string) => string) => [
    `for __cib_j, __cib_x := range ${arr} {`,
    '    if __cib_j > 0 {',
    `        __cib_o = append(__cib_o, ${sep}...)`,
    '    }',
    `    __cib_o = ${item('__cib_x')}`,
    '}',
  ];
  const put = (x: string) => `__cib_put(__cib_o, ${x})`;
  switch (ret.type) {
    case 'bool':
      return [
        'if __cib_r {',
        `    __cib_o = append(__cib_o, ${goQuote(ret.yes ?? 'true')}...)`,
        '} else {',
        `    __cib_o = append(__cib_o, ${goQuote(ret.no ?? 'false')}...)`,
        '}',
      ];
    case 'double':
      return [
        `__cib_o = __cib_strconv.AppendFloat(__cib_o, float64(__cib_r), 'f', ${ret.digits ?? 6}, 64)`,
      ];
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return join('__cib_r', put);
    case 'int[][]':
    case 'char[][]': {
      const item =
        ret.type === 'char[][]' ? (x: string) => `append(__cib_o, string(${x})...)` : put;
      return [
        'for __cib_i, __cib_row := range __cib_r {',
        '    if __cib_i > 0 {',
        "        __cib_o = append(__cib_o, '\\n')",
        '    }',
        ...join('__cib_row', item).map((l) => `    ${l}`),
        '}',
      ];
    }
    default:
      return [`__cib_o = ${put('__cib_r')}`];
  }
}

export function goGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const decls = plan.params.map((p, i) => `var ${variable(i)} ${GO_TYPES[p.type]}`);
  const body = (n: number) =>
    [
      ...decls,
      ...plan.steps.map(step),
      `__cib_r := solution(${vars.join(', ')})`,
      'if __cib_cases > 0 {',
      "    __cib_o = append(__cib_o, '\\n')",
      '}',
      '__cib_cases++',
      ...printer(ret),
    ]
      .map((l) => ' '.repeat(n) + l)
      .join('\n');
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return `    {\n${body(8)}\n    }`;
      case 'count':
        return `    __cib_t := int(__cib_ll(__cib_word()))\n    for __cib_k := 0; __cib_k < __cib_t; __cib_k++ {\n${body(8)}\n    }`;
      case 'eof':
        return `    for __cib_has() {\n${body(8)}\n    }`;
      case 'until': {
        const words = plan.loop.tokens.map(goQuote).join(', ');
        return [
          `    __cib_end := []string{${words}}`,
          '    for __cib_has() {',
          '        __cib_s := __cib_p',
          '        __cib_stop := true',
          '        for _, __cib_w := range __cib_end {',
          '            if !__cib_more() || __cib_tok() != __cib_w {',
          '                __cib_stop = false',
          '                break',
          '            }',
          '        }',
          '        if __cib_stop {',
          '            break',
          '        }',
          '        __cib_p = __cib_s',
          body(8),
          '    }',
        ].join('\n');
      }
    }
  })();
  return [
    '// ---- 입출력 코드 ----',
    RUNTIME,
    ...(usesRows(plan) ? [ROWS] : []),
    '',
    'func main() {',
    '    __cib_d, _ = __cib_io.ReadAll(__cib_os.Stdin)',
    '    __cib_o := make([]byte, 0, 1<<16)',
    '    __cib_cases := 0',
    loop,
    '    if __cib_cases > 0 {',
    "        __cib_o = append(__cib_o, '\\n')",
    '    }',
    '    __cib_os.Stdout.Write(__cib_o)',
    '}',
    '',
  ].join('\n');
}

export function goStarter(format: Format): string {
  const params = format.params.map((p) => `${p.name} ${GO_TYPES[p.type]}`).join(', ');
  const type = GO_TYPES[format.ret.type];
  const answer = format.ret.type === 'bool' ? 'answer := true' : `var answer ${type}`;
  return `// 자동 포함: package main\n\nfunc solution(${params}) ${type} {\n    ${answer}\n    return answer\n}\n`;
}

export const goLanguage: GlueLanguage = {
  prefix: GO_PREFIX,
  user: dropPackage,
  glue: goGlue,
  starter: goStarter,
  fileName: 'solution.go',
};
