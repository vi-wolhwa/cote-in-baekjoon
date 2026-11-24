/** Go glue on a real compiler, built like Baekjoon's Go (go build). */
import { nativeSuite } from './harness';

nativeSuite(
  'go',
  {
    file: 'main.go',
    build: [['go', 'build', '-o', 'main', 'main.go']],
    run: ['./main'],
  },
  {
    // A package clause and the user's own imports (os too) next to the glue's.
    ab: `package main

import (
    "fmt"
    "os"
)

func solution(a int, b int) int {
    if a < 0 {
        fmt.Fprintln(os.Stderr, "negative")
    }
    return a + b
}`,
    sort: `import "sort"

func solution(n int, arr []int64) []int64 {
    sort.Slice(arr, func(i, j int) bool { return arr[i] < arr[j] })
    return arr
}`,
    grid: `import "strings"

func solution(n int, m int, board []string) bool {
    for _, r := range board {
        if strings.Contains(r, "#") {
            return true
        }
    }
    return false
}`,
    lines: `func solution(title string, nums []int64, k int, rows [][]int) float64 {
    var s int64
    for _, x := range nums {
        s += x
    }
    for _, r := range rows {
        for _, x := range r {
            s += int64(x)
        }
    }
    return float64(s) / float64(len(title))
}`,
    words: `import "strconv"

func solution(name string, a int64, b int64) string {
    return name + ":" + strconv.FormatInt(a+b, 10)
}`,
    transpose: `func solution(n int, m int, g [][]int) [][]int {
    r := make([][]int, m)
    for j := range r {
        r[j] = make([]int, n)
        for i := 0; i < n; i++ {
            r[j][i] = g[i][j]
        }
    }
    return r
}`,
    blocks: `import "strconv"

func solution(a int, b int, names []string, rows [][]int64) []string {
    var r []string
    for i := len(names) - 1; i >= 0; i-- {
        r = append(r, names[i])
    }
    for _, row := range rows {
        var s int64
        for _, x := range row {
            s += x
        }
        r = append(r, strconv.FormatInt(s, 10))
    }
    return r
}`,
    commands: `func solution(n int, m int, cmds [][]string, w []float64) int {
    c := 0
    for _, x := range cmds {
        if len(x) > 0 && x[0] == "push" {
            c++
        }
    }
    return c*10 + int(w[0]+w[1])
}`,
    noInput: `func solution() []string {
    return []string{" *", "***"}
}`,
    untilEof: `import "strconv"

func solution(n int, pairs [][]int, names []string) []string {
    var r []string
    for _, p := range pairs {
        r = append(r, strconv.Itoa(p[0]+p[1]))
    }
    return append(r, names...)
}`,
    untilDot: `func solution(nums []int, texts []string) int {
    return (nums[0]+nums[1])*10 + len(texts)
}`,
    emptyThenEof: `func solution(n int, arr []int, rest []int64) int64 {
    var s int64
    for _, x := range rest {
        s += x
    }
    return s
}`,
  },
);
