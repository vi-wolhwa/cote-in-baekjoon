/**
 * C++17 glue: `bits/stdc++.h` and `using namespace std;` go before the user's code (2 lines,
 * reported as the line offset); after it, a fast reader over the whole input, a `main`
 * that calls `solution` per case, and printing that accepts any compatible return type
 * (int or long long, vector<int> or vector<long long>, string or vector<char> rows).
 */
import { labelParts, retSep, type ParamType, type RetSpec, type RetType } from '../dsl';
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

export const CPP_PREFIX = '#include <bits/stdc++.h>\nusing namespace std;\n';

export const CPP_TYPES: Record<ParamType | RetType, string> = {
  int: 'int',
  long: 'long long',
  double: 'double',
  string: 'string',
  line: 'string',
  bool: 'bool',
  'int[]': 'vector<int>',
  'long[]': 'vector<long long>',
  'double[]': 'vector<double>',
  'string[]': 'vector<string>',
  'line[]': 'vector<string>',
  'int[][]': 'vector<vector<int>>',
  'long[][]': 'vector<vector<long long>>',
  'double[][]': 'vector<vector<double>>',
  'string[][]': 'vector<vector<string>>',
  'char[][]': 'vector<string>',
};

const ELEMENT: Record<Scalar, string> = {
  int: 'int',
  long: 'long long',
  double: 'double',
  string: 'std::string',
};

const RUNTIME = `static std::string __cib_d;
static size_t __cib_p = 0;
static void __cib_fail() {
    std::fputs("__cib_input\\n", stderr);
    std::exit(1);
}
static bool __cib_ws(char c) { return c == ' ' || c == '\\n' || c == '\\r' || c == '\\t'; }
static bool __cib_more() {
    while (__cib_p < __cib_d.size() && __cib_ws(__cib_d[__cib_p])) __cib_p++;
    return __cib_p < __cib_d.size();
}
static std::string __cib_tok() {
    if (!__cib_more()) __cib_fail();
    size_t s = __cib_p;
    while (__cib_p < __cib_d.size() && !__cib_ws(__cib_d[__cib_p])) __cib_p++;
    return __cib_d.substr(s, __cib_p - s);
}
static void __cib_nl() {
    if (__cib_p > 0 && __cib_d[__cib_p - 1] != '\\n') {
        size_t e = __cib_d.find('\\n', __cib_p);
        __cib_p = e == std::string::npos ? __cib_d.size() : e + 1;
    }
    for (;;) {
        size_t q = __cib_p;
        while (q < __cib_d.size() && __cib_d[q] != '\\n' && __cib_ws(__cib_d[q])) q++;
        if (q < __cib_d.size() && __cib_d[q] == '\\n') __cib_p = q + 1;
        else break;
    }
}
static std::string __cib_line() {
    if (__cib_p >= __cib_d.size()) __cib_fail();
    size_t e = __cib_d.find('\\n', __cib_p);
    if (e == std::string::npos) e = __cib_d.size();
    size_t s = __cib_p;
    __cib_p = e;
    while (s < e && __cib_ws(__cib_d[s])) s++;
    while (e > s && __cib_ws(__cib_d[e - 1])) e--;
    return __cib_d.substr(s, e - s);
}
static std::vector<std::string> __cib_rest() {
    std::vector<std::string> r;
    std::string l = __cib_line();
    size_t i = 0;
    while (i < l.size()) {
        while (i < l.size() && __cib_ws(l[i])) i++;
        size_t s = i;
        while (i < l.size() && !__cib_ws(l[i])) i++;
        if (i > s) r.push_back(l.substr(s, i - s));
    }
    return r;
}
static long long __cib_ll(const std::string& s) {
    size_t i = 0;
    bool neg = false;
    if (i < s.size() && (s[i] == '-' || s[i] == '+')) neg = s[i++] == '-';
    if (i >= s.size()) __cib_fail();
    unsigned long long v = 0;
    for (; i < s.size(); i++) {
        if (s[i] < '0' || s[i] > '9') __cib_fail();
        v = v * 10 + (unsigned long long)(s[i] - '0');
    }
    return neg ? (long long)(0ULL - v) : (long long)v;
}
static int __cib_int(const std::string& s) { return (int)__cib_ll(s); }
static double __cib_dbl(const std::string& s) {
    char* e = nullptr;
    double v = std::strtod(s.c_str(), &e);
    if (e == s.c_str()) __cib_fail();
    return v;
}
static std::string __cib_str(const std::string& s) { return s; }
static void __cib_put(std::string& o, const std::string& s) { o += s; }
static void __cib_put(std::string& o, const char* s) { o += s; }
static void __cib_put(std::string& o, char c) { o += c; }
template <class T>
static typename std::enable_if<std::is_arithmetic<T>::value>::type __cib_put(std::string& o, T v) {
    o += std::to_string(v);
}
static bool __cib_has() {
    size_t q = __cib_p;
    while (q < __cib_d.size() && __cib_ws(__cib_d[q])) q++;
    return q < __cib_d.size();
}
template <class C>
static void __cib_join(std::string& o, const C& c, const char* sep) {
    bool first = true;
    for (const auto& x : c) {
        if (!first) o += sep;
        first = false;
        __cib_put(o, x);
    }
}`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
const ROWS = `static bool __cib_at(const std::vector<std::string>& w) {
    size_t s = __cib_p;
    bool ok = true;
    for (const auto& x : w) if (!__cib_more() || __cib_tok() != x) { ok = false; break; }
    __cib_p = s;
    return ok;
}
static int __cib_rowsTok(const std::vector<std::string>& w, long long k) {
    size_t s = __cib_p;
    int r = 0;
    for (;;) {
        if (w.empty() ? !__cib_has() : __cib_at(w)) break;
        if (k < 1 || !__cib_has()) __cib_fail();
        for (long long i = 0; i < k; i++) __cib_tok();
        r++;
    }
    __cib_p = s;
    return r;
}
static std::string __cib_raw() {
    size_t e = __cib_d.find('\\n', __cib_p);
    if (e == std::string::npos) e = __cib_d.size();
    size_t s = __cib_p;
    __cib_p = e;
    while (e > s && __cib_ws(__cib_d[e - 1])) e--;
    return __cib_d.substr(s, e - s);
}
static int __cib_rowsLine(const char* e, bool raw) {
    size_t s = __cib_p;
    int r = 0;
    for (;;) {
        __cib_nl();
        if (!__cib_has()) { if (e) __cib_fail(); break; }
        std::string t = raw ? __cib_raw() : __cib_line();
        if (e && t == e) break;
        r++;
    }
    __cib_p = s;
    return r;
}`;

const CONVERT: Record<Scalar, string> = {
  int: '__cib_int',
  long: '__cib_ll',
  double: '__cib_dbl',
  string: '__cib_str',
};

const variable = (v: number) => `__cib_v${v}`;
/** The glue does not rely on `using namespace std;` for its own declarations. */
const qualified = (type: string) => type.replace(/\b(vector|string)\b/g, 'std::$1');
const count = (c: CountRef) => `(int)(${renderCount(c, variable)})`;
const rows = (n: Rows) =>
  renderRows(n, count, {
    tok: (end, k) => `__cib_rowsTok({${end.map(quote).join(', ')}}, ${k})`,
    line: (end, raw) => `__cib_rowsLine(${end === null ? 'nullptr' : quote(end)}, ${raw})`,
  });

function step(s: Step): string {
  const v = variable('v' in s ? s.v : 0);
  switch (s.op) {
    case 'nl':
      return '__cib_nl();';
    case 'scalar':
      return `${v} = ${CONVERT[s.t]}(__cib_tok());`;
    case 'line':
      return `${v} = __cib_line();`;
    case 'array':
      return `${v}.assign(${rows(s.n)}, {}); for (auto& __cib_x : ${v}) __cib_x = ${CONVERT[s.t]}(__cib_tok());`;
    case 'rest':
      return `{ ${v}.clear(); for (const auto& __cib_x : __cib_rest()) ${v}.push_back(${CONVERT[s.t]}(__cib_x)); }`;
    case 'chars':
      return `${v}.assign(${rows(s.n)}, {}); for (auto& __cib_x : ${v}) __cib_x = __cib_tok();`;
    case 'grid':
      return s.cols
        ? `${v}.assign(${rows(s.n)}, std::vector<${ELEMENT[s.t]}>(${count(s.cols)})); for (auto& __cib_r : ${v}) for (auto& __cib_x : __cib_r) __cib_x = ${CONVERT[s.t]}(__cib_tok());`
        : `${v}.assign(${rows(s.n)}, {}); for (auto& __cib_r : ${v}) { __cib_nl(); for (const auto& __cib_x : __cib_rest()) __cib_r.push_back(${CONVERT[s.t]}(__cib_x)); }`;
    case 'lines':
      return `${v}.assign(${rows(s.n)}, {}); for (auto& __cib_x : ${v}) { __cib_nl(); __cib_x = __cib_line(); }`;
    case 'endTok':
      return Array(s.k).fill('__cib_tok();').join(' ');
    case 'endLine':
      return '__cib_nl(); __cib_line();';
  }
}

function printer(ret: RetSpec): string {
  const sep = quote(retSep(ret));
  switch (ret.type) {
    case 'bool':
      return `__cib_o += (__cib_r ? ${quote(ret.yes ?? 'true')} : ${quote(ret.no ?? 'false')});`;
    case 'double':
      return `{ char __cib_b[512]; std::snprintf(__cib_b, sizeof __cib_b, "%.${ret.digits ?? 6}f", (double)__cib_r); __cib_o += __cib_b; }`;
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return `__cib_join(__cib_o, __cib_r, ${sep});`;
    case 'int[][]':
    case 'char[][]':
      return `{ bool __cib_first = true; for (const auto& __cib_row : __cib_r) { if (!__cib_first) __cib_o += '\\n'; __cib_first = false; __cib_join(__cib_o, __cib_row, ${sep}); } }`;
    default:
      return '__cib_put(__cib_o, __cib_r);';
  }
}

export function cppGlue(plan: Plan, ret: RetSpec): string {
  const vars = plan.params.map((_, i) => variable(i));
  const decls = plan.params.map((p, i) => `${qualified(CPP_TYPES[p.type])} ${variable(i)}{};`);
  const label = labelParts(ret);
  const body = (n: number) =>
    [
      ...decls,
      ...plan.steps.map(step),
      `auto __cib_r = solution(${vars.join(', ')});`,
      "if (__cib_cases++) __cib_o += '\\n';",
      ...(label
        ? [`__cib_o += ${quote(label.pre)} + std::to_string(__cib_cases) + ${quote(label.post)};`]
        : []),
      printer(ret),
      ...(ret.blank ? ["__cib_o += '\\n';"] : []),
    ]
      .map((l) => ' '.repeat(n) + l)
      .join('\n');
  const loop = (() => {
    switch (plan.loop.kind) {
      case 'once':
        return `    {\n${body(8)}\n    }`;
      case 'count':
        return `    int __cib_t = __cib_int(__cib_tok());\n    for (int __cib_i = 0; __cib_i < __cib_t; __cib_i++) {\n${body(8)}\n    }`;
      case 'eof':
        return `    while (__cib_has()) {\n${body(8)}\n    }`;
      case 'until': {
        const words = plan.loop.tokens.map(quote).join(', ');
        return [
          `    const std::vector<std::string> __cib_end = {${words}};`,
          '    auto __cib_stop = [&]() {',
          '        size_t s = __cib_p;',
          '        for (const auto& w : __cib_end) {',
          '            if (!__cib_more() || __cib_tok() != w) { __cib_p = s; return false; }',
          '        }',
          '        return true;',
          '    };',
          `    while (__cib_has() && !__cib_stop()) {\n${body(8)}\n    }`,
        ].join('\n');
      }
    }
  })();
  return [
    '// ---- 입출력 코드 ----',
    RUNTIME,
    ...(usesRows(plan) ? [ROWS] : []),
    'int main() {',
    '    {',
    '        static char __cib_buf[1 << 16];',
    '        size_t __cib_k;',
    '        while ((__cib_k = std::fread(__cib_buf, 1, sizeof __cib_buf, stdin)) > 0) __cib_d.append(__cib_buf, __cib_k);',
    '    }',
    '    std::string __cib_o;',
    '    int __cib_cases = 0;',
    loop,
    "    if (__cib_cases) __cib_o += '\\n';",
    '    std::fwrite(__cib_o.data(), 1, __cib_o.size(), stdout);',
    '    return 0;',
    '}',
    '',
  ].join('\n');
}
