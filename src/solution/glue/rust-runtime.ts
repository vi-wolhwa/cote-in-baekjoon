/**
 * The Rust glue's reader (rust.ts): a byte reader `__CibIn` and its helpers, every name
 * starting with `__cib_` or `__Cib`. Kept apart from rust.ts so each file stays short.
 */

/** Reading the whole input: tokens, lines and counts. */
export const RUST_RUNTIME = `#[allow(non_camel_case_types)]
struct __CibIn {
    d: Vec<u8>,
    p: usize,
}
fn __cib_fail() -> ! {
    eprintln!("__cib_input");
    std::process::exit(1)
}
fn __cib_ws(c: u8) -> bool {
    c == b' ' || c == b'\\n' || c == b'\\r' || c == b'\\t'
}
fn __cib_str(b: &[u8]) -> String {
    String::from_utf8_lossy(b).into_owned()
}
fn __cib_ll(b: &[u8]) -> i64 {
    let mut i = 0;
    let mut neg = false;
    if i < b.len() && (b[i] == b'-' || b[i] == b'+') {
        neg = b[i] == b'-';
        i += 1;
    }
    if i >= b.len() {
        __cib_fail()
    }
    let mut v: i64 = 0;
    while i < b.len() {
        let c = b[i].wrapping_sub(b'0');
        if c > 9 {
            __cib_fail()
        }
        v = v.wrapping_mul(10).wrapping_sub(c as i64);
        i += 1;
    }
    if neg {
        v
    } else {
        v.wrapping_neg()
    }
}
fn __cib_int(b: &[u8]) -> i32 {
    __cib_ll(b) as i32
}
fn __cib_dbl(b: &[u8]) -> f64 {
    match std::str::from_utf8(b).ok().and_then(|s| s.parse::<f64>().ok()) {
        Some(v) => v,
        None => __cib_fail(),
    }
}
fn __cib_cnt(x: i64) -> usize {
    if x < 0 {
        __cib_fail()
    }
    x as usize
}
#[allow(dead_code)]
impl __CibIn {
    fn more(&mut self) -> bool {
        while self.p < self.d.len() && __cib_ws(self.d[self.p]) {
            self.p += 1;
        }
        self.p < self.d.len()
    }
    fn word(&mut self) -> &[u8] {
        if !self.more() {
            __cib_fail()
        }
        let s = self.p;
        while self.p < self.d.len() && !__cib_ws(self.d[self.p]) {
            self.p += 1;
        }
        &self.d[s..self.p]
    }
    fn tok(&mut self) -> String {
        __cib_str(self.word())
    }
    fn ll(&mut self) -> i64 {
        __cib_ll(self.word())
    }
    fn int(&mut self) -> i32 {
        __cib_int(self.word())
    }
    fn dbl(&mut self) -> f64 {
        __cib_dbl(self.word())
    }
    fn nl(&mut self) {
        let n = self.d.len();
        if self.p > 0 && self.d[self.p - 1] != b'\\n' {
            while self.p < n && self.d[self.p] != b'\\n' {
                self.p += 1;
            }
            if self.p < n {
                self.p += 1;
            }
        }
        loop {
            let mut q = self.p;
            while q < n && self.d[q] != b'\\n' && __cib_ws(self.d[q]) {
                q += 1;
            }
            if q < n && self.d[q] == b'\\n' {
                self.p = q + 1;
            } else {
                break;
            }
        }
    }
    fn end(&self) -> usize {
        if self.p >= self.d.len() {
            __cib_fail()
        }
        let mut e = self.p;
        while e < self.d.len() && self.d[e] != b'\\n' {
            e += 1;
        }
        e
    }
    fn line(&mut self) -> String {
        let mut e = self.end();
        let mut s = self.p;
        self.p = e;
        while s < e && __cib_ws(self.d[s]) {
            s += 1;
        }
        while e > s && __cib_ws(self.d[e - 1]) {
            e -= 1;
        }
        __cib_str(&self.d[s..e])
    }
    // The words of the rest of the line, as ranges of the input.
    fn rest(&mut self) -> Vec<(usize, usize)> {
        let e = self.end();
        let mut r = Vec::new();
        let mut i = self.p;
        self.p = e;
        while i < e {
            while i < e && __cib_ws(self.d[i]) {
                i += 1;
            }
            let s = i;
            while i < e && !__cib_ws(self.d[i]) {
                i += 1;
            }
            if i > s {
                r.push((s, i));
            }
        }
        r
    }
    fn has(&self) -> bool {
        let mut q = self.p;
        while q < self.d.len() && __cib_ws(self.d[q]) {
            q += 1;
        }
        q < self.d.len()
    }
    fn vec<T>(&mut self, n: usize, mut f: impl FnMut(&mut Self) -> T) -> Vec<T> {
        let mut a = Vec::with_capacity(n.min(self.d.len() + 1));
        for _ in 0..n {
            a.push(f(&mut *self));
        }
        a
    }
}`;

/**
 * Rows counted ahead (end lines, the end of input), end-line checks and raw lines (only when
 * the plan uses them; glue/plan.ts usesRows).
 */
export const RUST_ROWS = `// A decimal number token: [+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?
#[allow(dead_code)]
fn __cib_num(b: &[u8]) -> bool {
    let n = b.len();
    let mut i = 0;
    if i < n && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    let mut d = 0;
    while i < n && b[i].is_ascii_digit() {
        i += 1;
        d += 1;
    }
    if i < n && b[i] == b'.' {
        i += 1;
        while i < n && b[i].is_ascii_digit() {
            i += 1;
            d += 1;
        }
    }
    if d == 0 {
        return false;
    }
    if i < n && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < n && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        let s = i;
        while i < n && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == s {
            return false;
        }
    }
    i == n
}
// Whether line text t is an end line: m 1 it is e, 2 its first token is a number < 0,
// 3 a number <= 0, 4 it starts with e.
#[allow(dead_code)]
fn __cib_is_end(t: &str, m: u8, e: &str) -> bool {
    match m {
        1 => t == e,
        4 => t.starts_with(e),
        2 | 3 => match t.split_ascii_whitespace().next() {
            Some(f) if __cib_num(f.as_bytes()) => match f.parse::<f64>() {
                Ok(x) => {
                    if m == 2 {
                        x < 0.0
                    } else {
                        x <= 0.0
                    }
                }
                Err(_) => false,
            },
            _ => false,
        },
        _ => false,
    }
}
#[allow(dead_code)]
impl __CibIn {
    fn at(&mut self, w: &[&str]) -> bool {
        let s = self.p;
        let mut ok = true;
        for x in w {
            if !self.more() || self.tok() != *x {
                ok = false;
                break;
            }
        }
        self.p = s;
        ok
    }
    fn rows_tok(&mut self, w: &[&str], k: usize) -> usize {
        let s = self.p;
        let mut r = 0;
        loop {
            let stop = if w.is_empty() { !self.has() } else { self.at(w) };
            if stop {
                break;
            }
            if k < 1 || !self.has() {
                __cib_fail()
            }
            for _ in 0..k {
                self.word();
            }
            r += 1;
        }
        self.p = s;
        r
    }
    fn raw(&mut self) -> String {
        let mut e = self.p;
        while e < self.d.len() && self.d[e] != b'\\n' {
            e += 1;
        }
        let s = self.p;
        self.p = e;
        while e > s && __cib_ws(self.d[e - 1]) {
            e -= 1;
        }
        __cib_str(&self.d[s..e])
    }
    fn rows_line(&mut self, m: u8, e: &str, text: bool) -> usize {
        let s = self.p;
        let mut r = 0;
        loop {
            self.nl();
            if !self.has() {
                if m != 0 {
                    __cib_fail()
                }
                break;
            }
            let t = if text { self.raw() } else { self.line() };
            if m != 0 && __cib_is_end(&t, m, e) {
                break;
            }
            r += 1;
        }
        self.p = s;
        r
    }
    // Whether the next line is an end line; it is then read.
    fn endl(&mut self, m: u8, e: &str) -> bool {
        let s = self.p;
        self.nl();
        if self.has() {
            let t = self.line();
            if __cib_is_end(&t, m, e) {
                return true;
            }
        }
        self.p = s;
        false
    }
    // To the start of the next physical line unless already at one.
    fn bol(&mut self) {
        let n = self.d.len();
        if self.p > 0 && self.d[self.p - 1] != b'\\n' {
            while self.p < n && self.d[self.p] != b'\\n' {
                self.p += 1;
            }
            if self.p < n {
                self.p += 1;
            }
        }
    }
    // The next physical line as it is (only a trailing "\\r" dropped), blank or not.
    fn rawl(&mut self) -> String {
        self.bol();
        let n = self.d.len();
        if self.p >= n {
            __cib_fail()
        }
        let s = self.p;
        let mut e = s;
        while e < n && self.d[e] != b'\\n' {
            e += 1;
        }
        self.p = if e < n { e + 1 } else { n };
        if e > s && self.d[e - 1] == b'\\r' {
            e -= 1;
        }
        __cib_str(&self.d[s..e])
    }
    fn rows_phys(&mut self, m: u8, e: &str) -> usize {
        let s = self.p;
        let mut r = 0;
        self.bol();
        loop {
            if self.p >= self.d.len() {
                if m != 0 {
                    __cib_fail()
                }
                break;
            }
            let t = self.rawl();
            if m != 0 && __cib_is_end(t.trim_end(), m, e) {
                break;
            }
            r += 1;
        }
        self.p = s;
        r
    }
}`;
