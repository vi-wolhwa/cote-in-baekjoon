/**
 * The Kotlin glue's reader (kotlin.ts): top-level `__cib_` functions over the whole input.
 * Kept apart from kotlin.ts so each file stays short.
 */

/** Reading the whole input, tokens and lines. */
export const KOTLIN_RUNTIME = `private var __cib_d = ByteArray(0)
private var __cib_p = 0
private var __cib_n = 0
private fun __cib_fail(): RuntimeException = RuntimeException("__cib_input")
private fun __cib_ws(c: Byte): Boolean {
    val x = c.toInt()
    return x == 32 || x == 10 || x == 13 || x == 9
}
private fun __cib_more(): Boolean {
    while (__cib_p < __cib_n && __cib_ws(__cib_d[__cib_p])) __cib_p++
    return __cib_p < __cib_n
}
private fun __cib_str(s: Int, e: Int): String = String(__cib_d, s, e - s, Charsets.UTF_8)
private fun __cib_tok(): String {
    if (!__cib_more()) throw __cib_fail()
    val s = __cib_p
    while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) __cib_p++
    return __cib_str(s, __cib_p)
}
private fun __cib_ll(): Long {
    if (!__cib_more()) throw __cib_fail()
    var neg = false
    val c0 = __cib_d[__cib_p].toInt()
    if (c0 == 45 || c0 == 43) {
        neg = c0 == 45
        __cib_p++
    }
    if (__cib_p >= __cib_n || __cib_ws(__cib_d[__cib_p])) throw __cib_fail()
    var v = 0L
    while (__cib_p < __cib_n && !__cib_ws(__cib_d[__cib_p])) {
        val c = __cib_d[__cib_p++].toInt() - 48
        if (c < 0 || c > 9) throw __cib_fail()
        v = v * 10 - c
    }
    return if (neg) v else -v
}
private fun __cib_int(): Int = __cib_ll().toInt()
private fun __cib_dbl(): Double = __cib_tok().toDouble()
private fun __cib_nl() {
    if (__cib_p > 0 && __cib_d[__cib_p - 1].toInt() != 10) {
        while (__cib_p < __cib_n && __cib_d[__cib_p].toInt() != 10) __cib_p++
        if (__cib_p < __cib_n) __cib_p++
    }
    while (true) {
        var q = __cib_p
        while (q < __cib_n && __cib_d[q].toInt() != 10 && __cib_ws(__cib_d[q])) q++
        if (q < __cib_n && __cib_d[q].toInt() == 10) {
            __cib_p = q + 1
        } else {
            break
        }
    }
}
private fun __cib_end(): Int {
    if (__cib_p >= __cib_n) throw __cib_fail()
    var e = __cib_p
    while (e < __cib_n && __cib_d[e].toInt() != 10) e++
    return e
}
private fun __cib_line(): String {
    var e = __cib_end()
    var s = __cib_p
    __cib_p = e
    while (s < e && __cib_ws(__cib_d[s])) s++
    while (e > s && __cib_ws(__cib_d[e - 1])) e--
    return __cib_str(s, e)
}
private fun __cib_rest(): Array<String> {
    val e = __cib_end()
    val r = ArrayList<String>()
    var i = __cib_p
    __cib_p = e
    while (i < e) {
        while (i < e && __cib_ws(__cib_d[i])) i++
        val s = i
        while (i < e && !__cib_ws(__cib_d[i])) i++
        if (i > s) r.add(__cib_str(s, i))
    }
    return r.toTypedArray()
}
private fun __cib_has(): Boolean {
    var q = __cib_p
    while (q < __cib_n && __cib_ws(__cib_d[q])) q++
    return q < __cib_n
}`;

/**
 * Counting rows ahead for end-line and end-of-input repeats, end lines (isEnd: mode 1 the
 * line is e, 4 it starts with e, 2/3 its first token is a number < 0 / <= 0) and raw
 * physical lines; only when the plan uses them (usesRows).
 */
export const KOTLIN_ROWS = `private fun __cib_at(w: Array<String>): Boolean {
    val s = __cib_p
    var ok = true
    for (x in w) {
        if (!__cib_more() || __cib_tok() != x) {
            ok = false
            break
        }
    }
    __cib_p = s
    return ok
}
private fun __cib_rowsTok(w: Array<String>, k: Int): Int {
    val s = __cib_p
    var r = 0
    while (true) {
        if (if (w.isEmpty()) !__cib_has() else __cib_at(w)) break
        if (k < 1 || !__cib_has()) throw __cib_fail()
        for (i in 0 until k) __cib_tok()
        r++
    }
    __cib_p = s
    return r
}
private fun __cib_raw(): String {
    var e = __cib_p
    while (e < __cib_n && __cib_d[e].toInt() != 10) e++
    val s = __cib_p
    __cib_p = e
    while (e > s && __cib_ws(__cib_d[e - 1])) e--
    return __cib_str(s, e)
}
private val __cib_num = Regex("""[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?""")
private fun __cib_isEnd(t: String, m: Int, e: String): Boolean {
    if (m == 1) return t == e
    if (m == 4) return t.startsWith(e)
    if (m != 2 && m != 3) return false
    val f = t.trim().takeWhile { !it.isWhitespace() }
    if (!__cib_num.matches(f)) return false
    val x = f.toDouble()
    return if (m == 2) x < 0 else x <= 0
}
private fun __cib_rowsLine(m: Int, e: String, text: Boolean): Int {
    val s = __cib_p
    var r = 0
    while (true) {
        __cib_nl()
        if (!__cib_has()) {
            if (m != 0) throw __cib_fail()
            break
        }
        val t = if (text) __cib_raw() else __cib_line()
        if (m != 0 && __cib_isEnd(t, m, e)) break
        r++
    }
    __cib_p = s
    return r
}
private fun __cib_endl(m: Int, e: String): Boolean {
    val s = __cib_p
    __cib_nl()
    if (__cib_has() && __cib_isEnd(__cib_line(), m, e)) return true
    __cib_p = s
    return false
}
private fun __cib_bol() {
    if (__cib_p > 0 && __cib_d[__cib_p - 1].toInt() != 10) {
        while (__cib_p < __cib_n && __cib_d[__cib_p].toInt() != 10) __cib_p++
        if (__cib_p < __cib_n) __cib_p++
    }
}
private fun __cib_rawl(): String {
    __cib_bol()
    if (__cib_p >= __cib_n) throw __cib_fail()
    val s = __cib_p
    var e = s
    while (e < __cib_n && __cib_d[e].toInt() != 10) e++
    __cib_p = if (e < __cib_n) e + 1 else e
    if (e > s && __cib_d[e - 1].toInt() == 13) e--
    return __cib_str(s, e)
}
private fun __cib_rowsPhys(m: Int, e: String): Int {
    val s = __cib_p
    var r = 0
    __cib_bol()
    while (true) {
        if (__cib_p >= __cib_n) {
            if (m != 0) throw __cib_fail()
            break
        }
        val t = __cib_rawl().trimEnd()
        if (m != 0 && __cib_isEnd(t, m, e)) break
        r++
    }
    __cib_p = s
    return r
}`;
