/**
 * The C# glue's reader (csharp.ts), members of `__cib_Main`, every name starting with
 * `__cib_`. Kept apart from csharp.ts so each file stays short.
 */

/** Reading the whole input: tokens, numbers and lines. */
export const CSHARP_RUNTIME = `    sealed class __cib_Error : System.Exception { }
    static byte[] __cib_d;
    static int __cib_p, __cib_n;
    static System.Exception __cib_fail() { return new __cib_Error(); }
    static bool __cib_ws(byte c) { return c == ' ' || c == '\\n' || c == '\\r' || c == '\\t'; }
    static int __cib_cnt(long x) { if (x < 0 || x > int.MaxValue) throw __cib_fail(); return (int)x; }
    static string __cib_str(int s, int e) { return System.Text.Encoding.UTF8.GetString(__cib_d, s, e - s); }
    static bool __cib_more() {
        while (__cib_p < __cib_n && __cib_ws(__cib_d[__cib_p])) __cib_p++;
        return __cib_p < __cib_n;
    }
    static bool __cib_has() {
        int q = __cib_p;
        while (q < __cib_n && __cib_ws(__cib_d[q])) q++;
        return q < __cib_n;
    }
    static string __cib_tok() {
        if (!__cib_more()) throw __cib_fail();
        int s = __cib_p;
        while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) __cib_p++;
        return __cib_str(s, __cib_p);
    }
    static long __cib_ll() {
        if (!__cib_more()) throw __cib_fail();
        bool neg = false;
        if (__cib_d[__cib_p] == '-' || __cib_d[__cib_p] == '+') neg = __cib_d[__cib_p++] == '-';
        if (__cib_p >= __cib_n || __cib_ws(__cib_d[__cib_p])) throw __cib_fail();
        long v = 0;
        while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) {
            int c = __cib_d[__cib_p++] - '0';
            if (c < 0 || c > 9) throw __cib_fail();
            v = unchecked(v * 10 - c);
        }
        return neg ? v : unchecked(-v);
    }
    static int __cib_int() { return unchecked((int)__cib_ll()); }
    static long __cib_pl(string s) {
        long v;
        if (!long.TryParse(s, System.Globalization.NumberStyles.AllowLeadingSign, System.Globalization.CultureInfo.InvariantCulture, out v)) throw __cib_fail();
        return v;
    }
    static int __cib_pi(string s) { return unchecked((int)__cib_pl(s)); }
    static double __cib_pd(string s) {
        double v;
        if (!double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out v)) throw __cib_fail();
        return v;
    }
    static double __cib_dbl() { return __cib_pd(__cib_tok()); }
    static void __cib_nl() {
        if (__cib_p > 0 && __cib_d[__cib_p - 1] != '\\n') {
            while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n') __cib_p++;
            if (__cib_p < __cib_n) __cib_p++;
        }
        for (;;) {
            int q = __cib_p;
            while (q < __cib_n && __cib_d[q] != '\\n' && __cib_ws(__cib_d[q])) q++;
            if (q < __cib_n && __cib_d[q] == '\\n') __cib_p = q + 1;
            else break;
        }
    }
    static string __cib_line() {
        if (__cib_p >= __cib_n) throw __cib_fail();
        int e = __cib_p;
        while (e < __cib_n && __cib_d[e] != '\\n') e++;
        int s = __cib_p;
        __cib_p = e;
        while (s < e && __cib_ws(__cib_d[s])) s++;
        while (e > s && __cib_ws(__cib_d[e - 1])) e--;
        return __cib_str(s, e);
    }
    static string[] __cib_rest() {
        if (__cib_p >= __cib_n) throw __cib_fail();
        var r = new System.Collections.Generic.List<string>();
        while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n') {
            while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n' && __cib_ws(__cib_d[__cib_p])) __cib_p++;
            int s = __cib_p;
            while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) __cib_p++;
            if (__cib_p > s) r.Add(__cib_str(s, __cib_p));
        }
        return r.ToArray();
    }`;

/**
 * Counting rows ahead for end-line and end-of-input repeats, end lines (isEnd, endl) and raw
 * physical lines (rawl); only when the plan uses them (usesRows).
 */
export const CSHARP_ROWS = `    static bool __cib_at(string[] w) {
        int s = __cib_p;
        bool ok = true;
        foreach (string x in w) if (!__cib_more() || __cib_tok() != x) { ok = false; break; }
        __cib_p = s;
        return ok;
    }
    static int __cib_rowsTok(string[] w, long k) {
        int s = __cib_p, r = 0;
        for (;;) {
            if (w.Length == 0 ? !__cib_has() : __cib_at(w)) break;
            if (k < 1 || !__cib_has()) throw __cib_fail();
            for (long i = 0; i < k; i++) __cib_tok();
            r++;
        }
        __cib_p = s;
        return r;
    }
    static string __cib_raw() {
        int e = __cib_p;
        while (e < __cib_n && __cib_d[e] != '\\n') e++;
        int s = __cib_p;
        __cib_p = e;
        while (e > s && __cib_ws(__cib_d[e - 1])) e--;
        return __cib_str(s, e);
    }
    static bool __cib_isEnd(string t, int m, string e) {
        if (m == 1) return t == e;
        if (m == 4) return t.StartsWith(e, System.StringComparison.Ordinal);
        if (m != 2 && m != 3) return false;
        string[] f = t.Split((char[])null, System.StringSplitOptions.RemoveEmptyEntries);
        if (f.Length == 0 || !System.Text.RegularExpressions.Regex.IsMatch(f[0], @"^[+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?\\z")) return false;
        double v = double.Parse(f[0], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture);
        return m == 2 ? v < 0 : v <= 0;
    }
    static int __cib_rowsLine(int m, string e, bool text) {
        int s = __cib_p, r = 0;
        for (;;) {
            __cib_nl();
            if (!__cib_has()) { if (m != 0) throw __cib_fail(); break; }
            string t = text ? __cib_raw() : __cib_line();
            if (m != 0 && __cib_isEnd(t, m, e)) break;
            r++;
        }
        __cib_p = s;
        return r;
    }
    static bool __cib_endl(int m, string e) {
        int s = __cib_p;
        __cib_nl();
        if (__cib_has() && __cib_isEnd(__cib_line(), m, e)) return true;
        __cib_p = s;
        return false;
    }
    static void __cib_bol() {
        if (__cib_p > 0 && __cib_d[__cib_p - 1] != '\\n') {
            while (__cib_p < __cib_n && __cib_d[__cib_p] != '\\n') __cib_p++;
            if (__cib_p < __cib_n) __cib_p++;
        }
    }
    static string __cib_rawl() {
        __cib_bol();
        if (__cib_p >= __cib_n) throw __cib_fail();
        int s = __cib_p, e = __cib_p;
        while (e < __cib_n && __cib_d[e] != '\\n') e++;
        __cib_p = e < __cib_n ? e + 1 : e;
        if (e > s && __cib_d[e - 1] == '\\r') e--;
        return __cib_str(s, e);
    }
    static int __cib_rowsPhys(int m, string e) {
        int s = __cib_p, r = 0;
        __cib_bol();
        for (;;) {
            if (__cib_p >= __cib_n) { if (m != 0) throw __cib_fail(); break; }
            string t = __cib_rawl().TrimEnd();
            if (m != 0 && __cib_isEnd(t, m, e)) break;
            r++;
        }
        __cib_p = s;
        return r;
    }`;
