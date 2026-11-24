/** Ruby glue on Baekjoon's interpreter (`ruby`); see harness.ts. */
import { nativeSuite } from './harness';

nativeSuite(
  'ruby',
  { file: 'main.rb', run: ['ruby', 'main.rb'] },
  {
    ab: 'def solution(a, b)\n  a + b\nend',
    sort: 'def solution(n, arr)\n  arr.sort\nend',
    grid: "def solution(n, m, board)\n  board.any? { |r| r.include?('#') }\nend",
    lines:
      'def solution(title, nums, k, rows)\n  (nums.sum + rows.flatten.sum).to_f / title.length\nend',
    words: 'def solution(name, a, b)\n  "#{name}:#{a + b}"\nend',
    transpose: 'def solution(n, m, g)\n  g.transpose\nend',
    blocks: 'def solution(a, b, names, rows)\n  names.reverse + rows.map { |r| r.sum.to_s }\nend',
    commands:
      "def solution(n, m, cmds, w)\n  cmds.count { |c| c[0] == 'push' } * 10 + (w[0] + w[1]).to_i\nend",
    noInput: "def solution\n  [' *', '***']\nend",
    untilEof: 'def solution(n, pairs, names)\n  pairs.map { |p| (p[0] + p[1]).to_s } + names\nend',
    untilDot: 'def solution(nums, texts)\n  (nums[0] + nums[1]) * 10 + texts.size\nend',
    emptyThenEof: 'def solution(n, arr, rest)\n  rest.sum\nend',
  },
);
