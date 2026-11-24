// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProblem, parseProblemId, parseTimeLimitMs } from '@/boj/problem';
import { outputsMatch } from '@/runner/compare';

const html = readFileSync('tests/fixtures/problem-sample.html', 'utf8');

function load(): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('parseProblem', () => {
  it('reads title, limits, sections, samples and labels', () => {
    const p = parseProblem(load(), 'https://acmicpc.net/problem/1000');
    expect(p).toBeDefined();
    expect(p?.id).toBe(1000);
    expect(p?.title).toBe('테스트용 덧셈');
    expect(p?.timeLimitText).toBe('0.5 초 (추가 시간 없음)');
    expect(p?.timeLimitMs).toBe(500);
    expect(p?.memoryLimitText).toBe('256 MB');
    expect(p?.samples).toEqual([
      { input: '1 2\n', output: '3\n' },
      { input: '10 20\n', output: '30\n' },
    ]);
    expect(p?.labels).toEqual(['spj']);
  });

  it('makes relative image and link URLs absolute', () => {
    const p = parseProblem(load(), 'https://www.acmicpc.net/problem/1000');
    expect(p?.sections.description).toContain('src="https://acmicpc.net/upload/images/sample.png"');
    expect(p?.sections.hint).toContain('href="https://acmicpc.net/board/list"');
  });

  it('drops empty optional sections', () => {
    expect(
      parseProblem(load(), 'https://acmicpc.net/problem/1000')?.sections.limit,
    ).toBeUndefined();
  });

  it('returns undefined outside a problem page', () => {
    expect(parseProblem(load(), 'https://acmicpc.net/status')).toBeUndefined();
  });
});

describe('url and limit helpers', () => {
  it('parses problem ids from both hosts', () => {
    expect(parseProblemId('https://acmicpc.net/problem/1000')).toBe(1000);
    expect(parseProblemId('https://www.acmicpc.net/problem/42?x=1')).toBe(42);
    expect(parseProblemId('https://acmicpc.net/problem/1000abc')).toBeUndefined();
    expect(parseProblemId('https://evil.example/acmicpc.net/problem/1')).toBeUndefined();
  });

  it('parses time limits', () => {
    expect(parseTimeLimitMs('2 초')).toBe(2000);
    expect(parseTimeLimitMs('1.5 초 (하단 참고)')).toBe(1500);
    expect(parseTimeLimitMs('')).toBeUndefined();
  });
});

describe('outputsMatch', () => {
  it('ignores trailing spaces and trailing newlines', () => {
    expect(outputsMatch('3  \n\n', '3\n')).toBe(true);
    expect(outputsMatch('1 2\r\n3', '1 2\n3\n')).toBe(true);
  });

  it('detects real differences', () => {
    expect(outputsMatch('3', '4')).toBe(false);
    expect(outputsMatch('1\n2', '1 2')).toBe(false);
  });

  it('accepts numbers within an allowed error, absolute or relative', () => {
    expect(outputsMatch('0.3333333333', '0.333333', 1e-6)).toBe(true);
    expect(outputsMatch('0.3334', '0.333333', 1e-6)).toBe(false);
    expect(outputsMatch('1000000.5', '1000000', 1e-6)).toBe(true);
    expect(outputsMatch('1.0 x', '1 x', 1e-6)).toBe(true);
    expect(outputsMatch('1.0 x', '1 y', 1e-6)).toBe(false);
    expect(outputsMatch('1 2', '1', 1e-6)).toBe(false);
    expect(outputsMatch('0.3333333333', '0.333333')).toBe(false);
  });
});

describe('formulas already rendered by Baekjoon', () => {
  const rendered = readFileSync('tests/fixtures/problem-rendered.html', 'utf8');
  const doc = () => new DOMParser().parseFromString(rendered, 'text/html');

  it('puts the original TeX back from the hidden copy text', () => {
    const p = parseProblem(doc(), 'https://acmicpc.net/problem/2');
    expect(p?.sections.description).toBe(
      String.raw`<p>\(a\)개의 값과 \(\binom{x}{y}\)을 구한다.</p>`,
    );
    expect(p?.sections.description).not.toContain('mjx-');
  });

  it('falls back to MathML when there is no copy text', () => {
    const p = parseProblem(doc(), 'https://acmicpc.net/problem/2');
    expect(p?.sections.input).toContain('<math');
    expect(p?.sections.input).not.toContain('mjx-container');
  });
});
