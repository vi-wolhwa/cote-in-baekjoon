import { describe, expect, it } from 'vitest';
import { judgeStatusUrl } from '@/shared/handle';

describe('judgeStatusUrl', () => {
  it('puts the submission at the top when its number is known', () => {
    expect(judgeStatusUrl(1000, 98765432, 'tester')).toBe(
      'https://www.acmicpc.net/status?problem_id=1000&user_id=tester&top=98765432',
    );
    expect(judgeStatusUrl(1000, 98765432)).toBe(
      'https://www.acmicpc.net/status?problem_id=1000&top=98765432',
    );
  });

  it("falls back to the user's own list", () => {
    expect(judgeStatusUrl(1000, undefined, 'tester')).toBe(
      'https://www.acmicpc.net/status?problem_id=1000&user_id=tester',
    );
    expect(judgeStatusUrl(1000)).toBe('https://www.acmicpc.net/status?problem_id=1000&from_mine=1');
  });

  it('ignores a handle that is not a Baekjoon id', () => {
    expect(judgeStatusUrl(1000, 5, 'x&y=1')).toBe(
      'https://www.acmicpc.net/status?problem_id=1000&top=5',
    );
  });
});
