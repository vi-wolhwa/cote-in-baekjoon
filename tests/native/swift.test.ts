/** Swift glue on Baekjoon's compiler (`swiftc -O`); see harness.ts. */
import { nativeSuite } from './harness';

nativeSuite(
  'swift',
  { file: 'main.swift', build: [['swiftc', '-O', '-o', 'main', 'main.swift']], run: ['./main'] },
  {
    ab: 'func solution(_ a: Int, _ b: Int) -> Int {\n    return a + b\n}',
    sort: 'func solution(_ n: Int, _ arr: [Int]) -> [Int] {\n    return arr.sorted()\n}',
    grid: 'func solution(_ n: Int, _ m: Int, _ board: [String]) -> Bool {\n    return board.contains { $0.contains("#") }\n}',
    lines:
      'func solution(_ title: String, _ nums: [Int], _ k: Int, _ rows: [[Int]]) -> Double {\n    let s = nums.reduce(0, +) + rows.flatMap { $0 }.reduce(0, +)\n    return Double(s) / Double(title.count)\n}',
    words:
      'func solution(_ name: String, _ a: Int, _ b: Int) -> String {\n    return name + ":" + String(a + b)\n}',
    transpose:
      'func solution(_ n: Int, _ m: Int, _ g: [[Int]]) -> [[Int]] {\n    return (0..<m).map { j in (0..<n).map { i in g[i][j] } }\n}',
    blocks:
      'func solution(_ a: Int, _ b: Int, _ names: [String], _ rows: [[Int]]) -> [String] {\n    return Array(names.reversed()) + rows.map { String($0.reduce(0, +)) }\n}',
    commands:
      'func solution(_ n: Int, _ m: Int, _ cmds: [[String]], _ w: [Double]) -> Int {\n    return cmds.filter { $0.first == "push" }.count * 10 + Int(w[0] + w[1])\n}',
    noInput: 'func solution() -> [String] {\n    return [" *", "***"]\n}',
    untilEof:
      'func solution(_ n: Int, _ pairs: [[Int]], _ names: [String]) -> [String] {\n    return pairs.map { String($0[0] + $0[1]) } + names\n}',
    untilDot:
      'func solution(_ nums: [Int], _ texts: [String]) -> Int {\n    return (nums[0] + nums[1]) * 10 + texts.count\n}',
    emptyThenEof:
      'func solution(_ n: Int, _ arr: [Int], _ rest: [Int]) -> Int {\n    return rest.reduce(0, +)\n}',
  },
);
