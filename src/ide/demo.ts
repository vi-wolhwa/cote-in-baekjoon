import type { Problem } from '@/boj/problem';

/** Used when ide.html is opened on its own (development and E2E tests). */
export const DEMO_PROBLEM: Problem = {
  id: 0,
  title: '예시 문제: 두 수의 합',
  timeLimitText: '1 초',
  memoryLimitText: '128 MB',
  timeLimitMs: 1000,
  sections: {
    description: '<p>두 정수 \\(A\\)와 \\(B\\)가 주어진다. \\(A+B\\)를 출력하라.</p>',
    input: '<p>첫째 줄에 A와 B가 공백으로 구분되어 주어진다.</p>',
    output: '<p>A+B를 출력한다.</p>',
  },
  samples: [
    { input: '1 2\n', output: '3\n' },
    { input: '5 4\n', output: '9\n' },
  ],
  labels: [],
};

export const STARTER_CODE = `const input = require('fs').readFileSync('/dev/stdin').toString().trim().split('\\n');

`;
