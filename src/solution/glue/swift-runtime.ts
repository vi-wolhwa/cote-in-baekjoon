/**
 * The Swift glue's reader (swift.ts): the class `__cib_Reader` over the whole input, read
 * once with fread. Kept apart from swift.ts so each file stays short; swift.ts closes the
 * class after these members.
 */

/** Reading the whole input, tokens and lines (the class stays open). */
export const SWIFT_RUNTIME = `final class __cib_Reader {
    var d: [UInt8] = []
    var p = 0
    var n = 0
    init() {
        var buf = [UInt8](repeating: 0, count: 1 << 16)
        while true {
            let k = fread(&buf, 1, buf.count, stdin)
            if k <= 0 { break }
            d.append(contentsOf: buf[0..<k])
        }
        n = d.count
    }
    func fail() -> Never {
        fputs("__cib_input\\n", stderr)
        exit(1)
    }
    @inline(__always) func ws(_ c: UInt8) -> Bool { return c == 32 || c == 10 || c == 13 || c == 9 }
    func cnt(_ x: Int) -> Int {
        if x < 0 { fail() }
        return x
    }
    func more() -> Bool {
        while p < n && ws(d[p]) { p += 1 }
        return p < n
    }
    func has() -> Bool {
        var q = p
        while q < n && ws(d[q]) { q += 1 }
        return q < n
    }
    func str(_ s: Int, _ e: Int) -> String { return String(decoding: d[s..<e], as: UTF8.self) }
    func tok() -> String {
        if !more() { fail() }
        let s = p
        while p < n && !ws(d[p]) { p += 1 }
        return str(s, p)
    }
    func ll() -> Int {
        if !more() { fail() }
        var neg = false
        if d[p] == 45 || d[p] == 43 { neg = d[p] == 45; p += 1 }
        if p >= n || ws(d[p]) { fail() }
        var v = 0
        while p < n && !ws(d[p]) {
            let c = Int(d[p]) - 48
            if c < 0 || c > 9 { fail() }
            v = v &* 10 &- c
            p += 1
        }
        return neg ? v : 0 &- v
    }
    func pl(_ s: String) -> Int {
        guard let v = Int(s) else { fail() }
        return v
    }
    func pd(_ s: String) -> Double {
        guard let v = Double(s) else { fail() }
        return v
    }
    func dbl() -> Double { return pd(tok()) }
    func nl() {
        if p > 0 && d[p - 1] != 10 {
            while p < n && d[p] != 10 { p += 1 }
            if p < n { p += 1 }
        }
        while true {
            var q = p
            while q < n && d[q] != 10 && ws(d[q]) { q += 1 }
            if q < n && d[q] == 10 { p = q + 1 } else { break }
        }
    }
    func line() -> String {
        if p >= n { fail() }
        var e = p
        while e < n && d[e] != 10 { e += 1 }
        var s = p
        p = e
        while s < e && ws(d[s]) { s += 1 }
        while e > s && ws(d[e - 1]) { e -= 1 }
        return str(s, e)
    }
    func rest() -> [String] {
        if p >= n { fail() }
        var r: [String] = []
        while p < n && d[p] != 10 {
            while p < n && d[p] != 10 && ws(d[p]) { p += 1 }
            let s = p
            while p < n && !ws(d[p]) { p += 1 }
            if p > s { r.append(str(s, p)) }
        }
        return r
    }`;

/**
 * Counting rows ahead for end-line and end-of-input repeats, end lines (isEnd: mode 1 the
 * line is e, 4 it starts with e, 2/3 its first token is a number < 0 / <= 0) and raw
 * physical lines; only when the plan uses them (usesRows).
 */
export const SWIFT_ROWS = `    func at(_ w: [String]) -> Bool {
        let s = p
        var ok = true
        for x in w {
            if !more() || tok() != x {
                ok = false
                break
            }
        }
        p = s
        return ok
    }
    func rowsTok(_ w: [String], _ k: Int) -> Int {
        let s = p
        var r = 0
        while true {
            if (w.isEmpty ? !has() : at(w)) { break }
            if k < 1 || !has() { fail() }
            for _ in 0..<k { _ = tok() }
            r += 1
        }
        p = s
        return r
    }
    func raw() -> String {
        var e = p
        while e < n && d[e] != 10 { e += 1 }
        let s = p
        p = e
        while e > s && ws(d[e - 1]) { e -= 1 }
        return str(s, e)
    }
    /** True when s is a decimal number: an optional sign, digits with an optional point, an optional exponent. */
    func num(_ s: Substring) -> Bool {
        let b = Array(s.utf8)
        var i = 0
        func digits() -> Int {
            let k = i
            while i < b.count && b[i] >= 48 && b[i] <= 57 { i += 1 }
            return i - k
        }
        if i < b.count && (b[i] == 43 || b[i] == 45) { i += 1 }
        let a = digits()
        var f = 0
        if i < b.count && b[i] == 46 {
            i += 1
            f = digits()
        }
        if a == 0 && f == 0 { return false }
        if i < b.count && (b[i] == 101 || b[i] == 69) {
            i += 1
            if i < b.count && (b[i] == 43 || b[i] == 45) { i += 1 }
            if digits() == 0 { return false }
        }
        return i == b.count
    }
    func isEnd(_ t: String, _ m: Int, _ e: String) -> Bool {
        if m == 1 { return t == e }
        if m == 4 { return t.hasPrefix(e) }
        if m != 2 && m != 3 { return false }
        guard let f = t.split(whereSeparator: { $0.isWhitespace }).first, num(f),
            let x = Double(f) else { return false }
        return m == 2 ? x < 0 : x <= 0
    }
    func rowsLine(_ m: Int, _ e: String, _ text: Bool) -> Int {
        let s = p
        var r = 0
        while true {
            nl()
            if !has() {
                if m != 0 { fail() }
                break
            }
            let t = text ? raw() : line()
            if m != 0 && isEnd(t, m, e) { break }
            r += 1
        }
        p = s
        return r
    }
    func endl(_ m: Int, _ e: String) -> Bool {
        let s = p
        nl()
        if has() && isEnd(line(), m, e) { return true }
        p = s
        return false
    }
    func bol() {
        if p > 0 && d[p - 1] != 10 {
            while p < n && d[p] != 10 { p += 1 }
            if p < n { p += 1 }
        }
    }
    /** The next physical line's bytes s..<e (a trailing CR dropped); moves past its newline. */
    func phys() -> (Int, Int) {
        bol()
        if p >= n { fail() }
        let s = p
        var e = p
        while e < n && d[e] != 10 { e += 1 }
        p = e < n ? e + 1 : e
        if e > s && d[e - 1] == 13 { e -= 1 }
        return (s, e)
    }
    func rawl() -> String {
        let (s, e) = phys()
        return str(s, e)
    }
    func rowsPhys(_ m: Int, _ e: String) -> Int {
        let s = p
        var r = 0
        bol()
        while true {
            if p >= n {
                if m != 0 { fail() }
                break
            }
            let (a, z) = phys()
            var b = z
            while b > a && ws(d[b - 1]) { b -= 1 }
            if m != 0 && isEnd(str(a, b), m, e) { break }
            r += 1
        }
        p = s
        return r
    }`;
