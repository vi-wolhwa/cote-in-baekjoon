/** Rust 2021 glue on a real compiler, built like Baekjoon's Rust 2021 (rustc -O). */
import { nativeSuite } from './harness';

nativeSuite(
  'rust',
  {
    file: 'main.rs',
    build: [['rustc', '--edition', '2021', '-O', '-o', 'main', 'main.rs']],
    run: ['./main'],
  },
  {
    // The user's own `use` line at the top of their code.
    ab: `use std::cmp::max;

fn solution(a: i32, b: i32) -> i32 {
    max(a, b) - max(a, b) + a + b
}`,
    sort: `fn solution(_n: i32, mut arr: Vec<i64>) -> Vec<i64> {
    arr.sort();
    arr
}`,
    grid: `fn solution(_n: i32, _m: i32, board: Vec<Vec<char>>) -> bool {
    board.iter().any(|r| r.contains(&'#'))
}`,
    lines: `fn solution(title: String, nums: Vec<i64>, _k: i32, rows: Vec<Vec<i32>>) -> f64 {
    let s: i64 = nums.iter().sum::<i64>() + rows.iter().flatten().map(|&x| x as i64).sum::<i64>();
    s as f64 / title.chars().count() as f64
}`,
    words: `fn solution(name: String, a: i64, b: i64) -> String {
    format!("{}:{}", name, a + b)
}`,
    transpose: `fn solution(n: i32, m: i32, g: Vec<Vec<i32>>) -> Vec<Vec<i32>> {
    (0..m as usize).map(|j| (0..n as usize).map(|i| g[i][j]).collect()).collect()
}`,
    blocks: `fn solution(_a: i32, _b: i32, names: Vec<String>, rows: Vec<Vec<i64>>) -> Vec<String> {
    let mut r: Vec<String> = names.into_iter().rev().collect();
    for row in rows {
        r.push(row.iter().sum::<i64>().to_string());
    }
    r
}`,
    commands: `fn solution(_n: i32, _m: i32, cmds: Vec<Vec<String>>, w: Vec<f64>) -> i32 {
    let push = cmds.iter().filter(|c| !c.is_empty() && c[0] == "push").count() as i32;
    push * 10 + (w[0] + w[1]) as i32
}`,
    noInput: `fn solution() -> Vec<String> {
    vec![" *".to_string(), "***".to_string()]
}`,
    untilEof: `fn solution(_n: i32, pairs: Vec<Vec<i32>>, names: Vec<String>) -> Vec<String> {
    let mut r: Vec<String> = pairs.iter().map(|p| (p[0] + p[1]).to_string()).collect();
    r.extend(names);
    r
}`,
    untilDot: `fn solution(nums: Vec<i32>, texts: Vec<String>) -> i32 {
    (nums[0] + nums[1]) * 10 + texts.len() as i32
}`,
    emptyThenEof: `fn solution(_n: i32, _arr: Vec<i32>, rest: Vec<i64>) -> i64 {
    rest.iter().sum()
}`,
    caseLabel: `fn solution(a: i32, b: i32) -> i32 {
    a + b
}`,
    scenario: `fn solution(_n: i32, arr: Vec<i32>) -> Vec<i32> {
    arr
}`,
    exprFlow: `fn solution(_n: i32, arr: Vec<i32>, g: Vec<Vec<i32>>) -> i64 {
    let s: i64 = arr.iter().map(|&x| x as i64).sum();
    s * 100 + g.len() as i64 * 10 + g[0].len() as i64
}`,
    blockCount: `fn solution(_n: i32, _k: Vec<i32>, name: Vec<String>, items: Vec<Vec<i32>>) -> Vec<String> {
    name.iter()
        .zip(items.iter())
        .map(|(s, v)| format!("{}:{}", s, v.iter().sum::<i32>()))
        .collect()
}`,
    blockUntil: `fn solution(_m: Vec<i32>, vals: Vec<Vec<i32>>, x: Vec<i32>, y: Vec<i32>) -> Vec<i32> {
    let mut r: Vec<i32> = vals.iter().map(|v| *v.iter().max().unwrap()).collect();
    r.extend(x.iter().zip(y.iter()).map(|(a, b)| a * b));
    r
}`,
    endConds: `fn solution(n: i32, words: Vec<String>, p: Vec<i32>) -> i64 {
    n as i64 + words.len() as i64 * 10 + p.iter().map(|&x| x as i64).sum::<i64>() * 100
}`,
    rawLines: `fn solution(t: String, _n: i32, ls: Vec<String>, mid: Vec<String>, rest: Vec<String>) -> Vec<String> {
    let mut r = vec![format!("[{}]", t)];
    for s in ls.iter().chain(mid.iter()).chain(rest.iter()) {
        r.push(format!("[{}]", s));
    }
    r
}`,
  },
);
