/**
 * Kotlin (JVM) glue on a real compiler, built like Baekjoon's Kotlin (JVM): kotlinc-jvm to a
 * jar with the runtime, then `java -jar`.
 */
import { nativeSuite } from './harness';

nativeSuite(
  'kotlin',
  {
    file: 'Main.kt',
    build: [['kotlinc-jvm', 'Main.kt', '-include-runtime', '-d', 'Main.jar']],
    run: ['java', '-jar', 'Main.jar'],
  },
  {
    // The user's own import at the top of their code.
    ab: `import kotlin.math.max

class Solution {
    fun solution(a: Int, b: Int): Int = max(a, b) - max(a, b) + a + b
}`,
    sort: `class Solution {
    fun solution(n: Int, arr: LongArray): LongArray {
        arr.sort()
        return arr
    }
}`,
    grid: `class Solution {
    fun solution(n: Int, m: Int, board: Array<CharArray>): Boolean = board.any { it.contains('#') }
}`,
    lines: `class Solution {
    fun solution(title: String, nums: LongArray, k: Int, rows: Array<IntArray>): Double {
        var s = nums.sum()
        for (r in rows) for (x in r) s += x
        return s.toDouble() / title.length
    }
}`,
    words: `class Solution {
    fun solution(name: String, a: Long, b: Long): String = name + ":" + (a + b)
}`,
    transpose: `class Solution {
    fun solution(n: Int, m: Int, g: Array<IntArray>): Array<IntArray> =
        Array(m) { j -> IntArray(n) { i -> g[i][j] } }
}`,
    blocks: `class Solution {
    fun solution(a: Int, b: Int, names: Array<String>, rows: Array<LongArray>): Array<String> =
        (names.reversed() + rows.map { it.sum().toString() }).toTypedArray()
}`,
    commands: `class Solution {
    fun solution(n: Int, m: Int, cmds: Array<Array<String>>, w: DoubleArray): Int =
        cmds.count { it.isNotEmpty() && it[0] == "push" } * 10 + (w[0] + w[1]).toInt()
}`,
    noInput: `class Solution {
    fun solution(): Array<String> = arrayOf(" *", "***")
}`,
    untilEof: `class Solution {
    fun solution(n: Int, pairs: Array<IntArray>, names: Array<String>): Array<String> =
        (pairs.map { (it[0] + it[1]).toString() } + names).toTypedArray()
}`,
    untilDot: `class Solution {
    fun solution(nums: IntArray, texts: Array<String>): Int = (nums[0] + nums[1]) * 10 + texts.size
}`,
    emptyThenEof: `class Solution {
    fun solution(n: Int, arr: IntArray, rest: LongArray): Long = rest.sum()
}`,
    caseLabel: `class Solution {
    fun solution(a: Int, b: Int): Int = a + b
}`,
    scenario: `class Solution {
    fun solution(n: Int, arr: IntArray): IntArray = arr
}`,
  },
);
