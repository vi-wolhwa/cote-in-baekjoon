/**
 * The C glue's reader and printer (c.ts): plain C99, every name starting with `__cib_`.
 * Kept apart from c.ts so each file stays short.
 */

/** Reading the whole input, tokens and lines; the output buffer and printing. */
export const C_RUNTIME = `static char* __cib_d;
static size_t __cib_n = 0, __cib_p = 0, __cib_le = 0;
static void __cib_fail(void) {
    fputs("__cib_input\\n", stderr);
    exit(1);
}
static void* __cib_alloc(size_t k, size_t size) {
    void* a = malloc(k ? k * size : size);
    if (!a || (k && (k * size) / k != size)) __cib_fail();
    return a;
}
static size_t __cib_cnt(long long x) {
    if (x < 0) __cib_fail();
    return (size_t)x;
}
static bool __cib_ws(char c) { return c == ' ' || c == '\\n' || c == '\\r' || c == '\\t'; }
static bool __cib_more(void) {
    while (__cib_p < __cib_n && __cib_ws(__cib_d[__cib_p])) __cib_p++;
    return __cib_p < __cib_n;
}
static bool __cib_has(void) {
    size_t q = __cib_p;
    while (q < __cib_n && __cib_ws(__cib_d[q])) q++;
    return q < __cib_n;
}
/* The next token: its start, and its length in *len. */
static size_t __cib_tok(size_t* len) {
    if (!__cib_more()) __cib_fail();
    size_t s = __cib_p;
    while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) __cib_p++;
    *len = __cib_p - s;
    return s;
}
static void __cib_skip(void) {
    size_t l;
    __cib_tok(&l);
}
static char* __cib_dup(size_t s, size_t l) {
    char* r = (char*)__cib_alloc(l + 1, 1);
    memcpy(r, __cib_d + s, l);
    r[l] = '\\0';
    return r;
}
static void __cib_nl(void) {
    if (__cib_p > 0 && __cib_d[__cib_p - 1] != '\\n') {
        while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n') __cib_p++;
        if (__cib_p < __cib_n) __cib_p++;
    }
    for (;;) {
        size_t q = __cib_p;
        while (q < __cib_n && __cib_d[q] != '\\n' && __cib_ws(__cib_d[q])) q++;
        if (q < __cib_n && __cib_d[q] == '\\n') __cib_p = q + 1;
        else break;
    }
}
/* The rest of the current line, trimmed: its start, and its length in *len. */
static size_t __cib_span(size_t* len) {
    if (__cib_p >= __cib_n) __cib_fail();
    size_t s = __cib_p, e = __cib_p;
    while (e < __cib_n && __cib_d[e] != '\\n') e++;
    __cib_p = e;
    while (s < e && __cib_ws(__cib_d[s])) s++;
    while (e > s && __cib_ws(__cib_d[e - 1])) e--;
    *len = e - s;
    return s;
}
static char* __cib_line(void) {
    size_t l, s = __cib_span(&l);
    return __cib_dup(s, l);
}
static void __cib_skipline(void) {
    size_t l;
    __cib_span(&l);
}
/* Counts the tokens left on the current line; __cib_le is where the line ends. */
static size_t __cib_restn(void) {
    if (__cib_p >= __cib_n) __cib_fail();
    size_t k = 0, q = __cib_p;
    while (q < __cib_n && __cib_d[q] != '\\n') {
        while (q < __cib_n && __cib_d[q] != '\\n' && __cib_ws(__cib_d[q])) q++;
        if (q >= __cib_n || __cib_d[q] == '\\n') break;
        k++;
        while (q < __cib_n && !__cib_ws(__cib_d[q])) q++;
    }
    __cib_le = q;
    return k;
}
static long long __cib_ll(void) {
    size_t l, i = __cib_tok(&l), e = i + l;
    bool neg = false;
    if (__cib_d[i] == '-' || __cib_d[i] == '+') neg = __cib_d[i++] == '-';
    if (i >= e) __cib_fail();
    unsigned long long v = 0;
    for (; i < e; i++) {
        if (__cib_d[i] < '0' || __cib_d[i] > '9') __cib_fail();
        v = v * 10 + (unsigned long long)(__cib_d[i] - '0');
    }
    return neg ? (long long)(0ULL - v) : (long long)v;
}
static int __cib_int(void) { return (int)__cib_ll(); }
static double __cib_dbl(void) {
    size_t l, s = __cib_tok(&l);
    char* e = NULL;
    double v = strtod(__cib_d + s, &e);
    if (e == __cib_d + s) __cib_fail();
    return v;
}
static const char* __cib_str(void) {
    size_t l, s = __cib_tok(&l);
    return __cib_dup(s, l);
}
static int* __cib_ints(size_t k) {
    int* a = (int*)__cib_alloc(k, sizeof(int));
    for (size_t i = 0; i < k; i++) a[i] = __cib_int();
    return a;
}
static long long* __cib_lls(size_t k) {
    long long* a = (long long*)__cib_alloc(k, sizeof(long long));
    for (size_t i = 0; i < k; i++) a[i] = __cib_ll();
    return a;
}
static double* __cib_dbls(size_t k) {
    double* a = (double*)__cib_alloc(k, sizeof(double));
    for (size_t i = 0; i < k; i++) a[i] = __cib_dbl();
    return a;
}
static const char** __cib_strs(size_t k) {
    const char** a = (const char**)__cib_alloc(k, sizeof(const char*));
    for (size_t i = 0; i < k; i++) a[i] = __cib_str();
    return a;
}
static int* __cib_intr(size_t* k) {
    *k = __cib_restn();
    int* a = __cib_ints(*k);
    __cib_p = __cib_le;
    return a;
}
static long long* __cib_llr(size_t* k) {
    *k = __cib_restn();
    long long* a = __cib_lls(*k);
    __cib_p = __cib_le;
    return a;
}
static double* __cib_dblr(size_t* k) {
    *k = __cib_restn();
    double* a = __cib_dbls(*k);
    __cib_p = __cib_le;
    return a;
}
static const char** __cib_strr(size_t* k) {
    *k = __cib_restn();
    const char** a = __cib_strs(*k);
    __cib_p = __cib_le;
    return a;
}
/* True when the next tokens are w[0..k), without moving. */
static bool __cib_at(const char* const* w, size_t k) {
    size_t s = __cib_p;
    bool ok = true;
    for (size_t i = 0; i < k && ok; i++) {
        size_t l, t;
        if (!__cib_more()) { ok = false; break; }
        t = __cib_tok(&l);
        ok = strlen(w[i]) == l && memcmp(__cib_d + t, w[i], l) == 0;
    }
    __cib_p = s;
    return ok;
}
static char* __cib_o;
static size_t __cib_on = 0, __cib_oc = 0;
static void __cib_putn(const char* s, size_t l) {
    if (__cib_on + l + 1 > __cib_oc) {
        size_t c = __cib_oc ? __cib_oc : 1 << 16;
        while (__cib_on + l + 1 > c) c *= 2;
        __cib_o = (char*)realloc(__cib_o, c);
        if (!__cib_o) exit(1);
        __cib_oc = c;
    }
    memcpy(__cib_o + __cib_on, s, l);
    __cib_on += l;
}
static void __cib_puts(const char* s) { if (s) __cib_putn(s, strlen(s)); }
static void __cib_putc(char c) { __cib_putn(&c, 1); }
static void __cib_putll(long long v) {
    char b[32];
    __cib_putn(b, (size_t)snprintf(b, sizeof b, "%lld", v));
}
static void __cib_putdbl(double v, int digits) {
    char b[512];
    int k = snprintf(b, sizeof b, "%.*f", digits, v);
    __cib_putn(b, k < 0 ? 0 : (size_t)k < sizeof b ? (size_t)k : sizeof b - 1);
}
/* A row of chars with sep between them ("" prints the row as it is). */
static void __cib_putrow(const char* s, const char* sep) {
    if (!s) return;
    if (!*sep) { __cib_puts(s); return; }
    for (size_t i = 0; s[i]; i++) {
        if (i) __cib_puts(sep);
        __cib_putc(s[i]);
    }
}`;

/** Counting rows ahead for end-line and end-of-input repeats (only when used). */
export const C_ROWS = `static size_t __cib_rowsTok(const char* const* w, size_t wk, size_t k) {
    size_t s = __cib_p, r = 0;
    for (;;) {
        if (wk == 0 ? !__cib_has() : __cib_at(w, wk)) break;
        if (k < 1 || !__cib_has()) __cib_fail();
        for (size_t i = 0; i < k; i++) __cib_skip();
        r++;
    }
    __cib_p = s;
    return r;
}
/* A line with only its end trimmed (line[] end lines compare the whole text). */
static size_t __cib_raw(size_t* len) {
    size_t s = __cib_p, e = __cib_p;
    while (e < __cib_n && __cib_d[e] != '\\n') e++;
    __cib_p = e;
    while (e > s && __cib_ws(__cib_d[e - 1])) e--;
    *len = e - s;
    return s;
}
static bool __cib_isNum(const char* f, size_t n) {
    size_t i = 0, k = 0;
    if (i < n && (f[i] == '+' || f[i] == '-')) i++;
    while (i < n && f[i] >= '0' && f[i] <= '9') { i++; k++; }
    if (i < n && f[i] == '.') for (i++; i < n && f[i] >= '0' && f[i] <= '9'; i++) k++;
    if (k == 0) return false;
    if (i < n && (f[i] == 'e' || f[i] == 'E')) {
        size_t x = 0;
        if (++i < n && (f[i] == '+' || f[i] == '-')) i++;
        for (; i < n && f[i] >= '0' && f[i] <= '9'; i++) x++;
        if (x == 0) return false;
    }
    return i == n;
}
/* Whether the line at t (length l) ends the reading: end mode m with text e (plan.ts). */
static bool __cib_isEnd(size_t t, size_t l, int m, const char* e) {
    const char* s = __cib_d + t;
    size_t i = 0, b;
    if (m == 1) return strlen(e) == l && memcmp(s, e, l) == 0;
    if (m == 4) return strlen(e) <= l && memcmp(s, e, strlen(e)) == 0;
    if (m != 2 && m != 3) return false;
    while (i < l && __cib_ws(s[i])) i++;
    b = i;
    while (i < l && !__cib_ws(s[i])) i++;
    if (!__cib_isNum(s + b, i - b)) return false;
    return m == 2 ? strtod(s + b, NULL) < 0 : strtod(s + b, NULL) <= 0;
}
static size_t __cib_rowsLine(int m, const char* e, bool text) {
    size_t s = __cib_p, r = 0;
    for (;;) {
        size_t l, t;
        __cib_nl();
        if (!__cib_has()) { if (m) __cib_fail(); break; }
        t = text ? __cib_raw(&l) : __cib_span(&l);
        if (m && __cib_isEnd(t, l, m, e)) break;
        r++;
    }
    __cib_p = s;
    return r;
}
/* True when the next line ends the reading; it is then read. */
static bool __cib_endl(int m, const char* e) {
    size_t s = __cib_p, l, t;
    __cib_nl();
    if (__cib_has()) {
        t = __cib_span(&l);
        if (__cib_isEnd(t, l, m, e)) return true;
    }
    __cib_p = s;
    return false;
}
static void __cib_bol(void) {
    if (__cib_p > 0 && __cib_d[__cib_p - 1] != '\\n') {
        while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n') __cib_p++;
        if (__cib_p < __cib_n) __cib_p++;
    }
}
/* The next physical line, blank or not (a trailing '\\r' dropped): its start and length. */
static size_t __cib_rawspan(size_t* len) {
    size_t s, e;
    __cib_bol();
    if (__cib_p >= __cib_n) __cib_fail();
    s = e = __cib_p;
    while (e < __cib_n && __cib_d[e] != '\\n') e++;
    __cib_p = e < __cib_n ? e + 1 : __cib_n;
    if (e > s && __cib_d[e - 1] == '\\r') e--;
    *len = e - s;
    return s;
}
static const char* __cib_rawl(void) {
    size_t l, s = __cib_rawspan(&l);
    return __cib_dup(s, l);
}
static size_t __cib_rowsPhys(int m, const char* e) {
    size_t s = __cib_p, r = 0;
    __cib_bol();
    for (;;) {
        size_t l, t;
        if (__cib_p >= __cib_n) { if (m) __cib_fail(); break; }
        t = __cib_rawspan(&l);
        while (l > 0 && __cib_ws(__cib_d[t + l - 1])) l--;
        if (m && __cib_isEnd(t, l, m, e)) break;
        r++;
    }
    __cib_p = s;
    return r;
}`;

/** Growing arrays for blocks (only when used): room for twice as many at 0 and powers of two. */
export const C_GROW = `static void* __cib_grow(void* a, size_t n, size_t size) {
    if (n & (n - 1)) return a;
    a = realloc(a, (n ? 2 * n : 1) * size);
    if (!a) __cib_fail();
    return a;
}`;
