import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  bugReportUrl,
  computeStats,
  parseProblemInput,
  parseProblemUrl,
  readProblems,
  recentProblems,
  relativeTime,
  statusKind,
} from '@/popup/model';
import type { JudgeResult } from '@/shared/submission';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const MIN = 60 * 1000;

function judge(problemId: number, resultCode: string, updatedAt: number, status = 'done') {
  return {
    problemId,
    solutionId: problemId * 10,
    status,
    resultText: resultCode === 'ac' ? '맞았습니다!!' : '틀렸습니다',
    resultCode,
    updatedAt,
  } as JudgeResult;
}

const meta = (title: string, language: string, openedAt: number) => ({
  title,
  language,
  openedAt,
});

describe('parseProblemUrl', () => {
  it('reads the problem number from problem pages', () => {
    expect(parseProblemUrl('https://www.acmicpc.net/problem/1000')).toBe(1000);
    expect(parseProblemUrl('https://acmicpc.net/problem/2557')).toBe(2557);
    expect(parseProblemUrl('https://www.acmicpc.net/problem/1000?foo=1#bar')).toBe(1000);
    expect(parseProblemUrl('https://www.acmicpc.net/problem/9999999')).toBe(9999999);
  });

  it('ignores other pages and look-alike hosts', () => {
    for (const url of [
      undefined,
      '',
      'https://www.acmicpc.net/',
      'https://www.acmicpc.net/problem/tags',
      'https://www.acmicpc.net/problem/0',
      'https://www.acmicpc.net/problem/01000',
      'https://www.acmicpc.net/problem/10000000',
      'https://www.acmicpc.net/submit/1000',
      'http://www.acmicpc.net/problem/1000',
      'https://acmicpc.net.evil.example/problem/1000',
      'https://evil.example/https://www.acmicpc.net/problem/1000',
      'chrome-extension://abc/popup.html',
    ]) {
      expect(parseProblemUrl(url), url).toBeUndefined();
    }
  });
});

describe('parseProblemInput', () => {
  it('accepts 1 to 9999999', () => {
    expect(parseProblemInput('1000')).toEqual({ ok: true, id: 1000 });
    expect(parseProblemInput(' 1 ')).toEqual({ ok: true, id: 1 });
    expect(parseProblemInput('9999999')).toEqual({ ok: true, id: 9999999 });
  });

  it('explains what is wrong', () => {
    expect(parseProblemInput('')).toEqual({ ok: false, reason: '문제 번호를 입력해 주세요.' });
    for (const text of ['0', '10000000', '12a', '1.5', '-3', '1e3', '0100']) {
      expect(parseProblemInput(text), text).toEqual({
        ok: false,
        reason: '1부터 9999999까지의 숫자로 입력해 주세요.',
      });
    }
  });
});

describe('relativeTime', () => {
  it('says how long ago in Korean', () => {
    expect(relativeTime(NOW - 10 * 1000, NOW)).toBe('방금');
    expect(relativeTime(NOW + 5 * MIN, NOW)).toBe('방금');
    expect(relativeTime(NOW - 3 * MIN, NOW)).toBe('3분 전');
    expect(relativeTime(NOW - 59 * MIN, NOW)).toBe('59분 전');
    expect(relativeTime(NOW - 2 * 60 * MIN, NOW)).toBe('2시간 전');
    expect(relativeTime(NOW - 1.5 * DAY_MS, NOW)).toBe('어제');
    expect(relativeTime(NOW - 3 * DAY_MS, NOW)).toBe('3일 전');
    expect(relativeTime(NOW - 29 * DAY_MS, NOW)).toBe('29일 전');
  });

  it('shows a date after a month', () => {
    expect(relativeTime(new Date(2026, 8, 3).getTime(), NOW)).toBe('9월 3일');
    expect(relativeTime(new Date(2025, 0, 5).getTime(), NOW)).toBe('2025년 1월 5일');
  });
});

describe('computeStats', () => {
  it('counts judged, accepted and recent problems from valid results only', () => {
    const data = readProblems({
      'judge:1000': judge(1000, 'ac', NOW - MIN),
      'judge:1001': judge(1001, 'wa', NOW - 8 * DAY_MS),
      'judge:1002': judge(1002, 'ac', NOW - 6 * DAY_MS),
      'judge:1003': judge(1003, 'judging', NOW, 'judging'),
      // Invalid: id mismatch and broken value.
      'judge:2000': judge(1000, 'ac', NOW),
      'judge:2001': { problemId: 2001 },
      'meta:3000': meta('열기만 한 문제', 'python3', NOW),
    });
    expect(computeStats(data, NOW)).toEqual({ submitted: 4, accepted: 2, lastWeek: 3 });
  });

  it('is all zero without data', () => {
    expect(computeStats(readProblems({}), NOW)).toEqual({
      submitted: 0,
      accepted: 0,
      lastWeek: 0,
    });
  });
});

describe('statusKind', () => {
  it('maps judge results to circle colours', () => {
    expect(statusKind(undefined)).toBe('opened');
    expect(statusKind(judge(1, 'ac', 0))).toBe('accepted');
    expect(statusKind(judge(1, 'wa', 0))).toBe('wrong');
    expect(statusKind(judge(1, 'tle', 0))).toBe('other');
    expect(statusKind(judge(1, 'ce', 0))).toBe('other');
    expect(statusKind(judge(1, 'judging', 0, 'judging'))).toBe('judging');
    expect(statusKind(judge(1, 'wait', 0, 'pending'))).toBe('judging');
  });
});

describe('recentProblems', () => {
  it('lists newest first by judge time, falling back to when it was opened', () => {
    const data = readProblems({
      'judge:1000': judge(1000, 'ac', NOW - 3 * DAY_MS),
      'meta:1000': meta('A+B', 'cpp17', NOW - 4 * DAY_MS),
      'judge:1001': judge(1001, 'wa', NOW - MIN),
      'meta:1002': meta('<b>열기만</b>', 'java11', NOW - 2 * MIN),
      'meta:1003': meta('', 'pypy3', NOW - 10 * DAY_MS),
      'meta:1004': { title: 'bad', language: 'cobol', openedAt: NOW },
    });
    expect(recentProblems(data)).toEqual([
      {
        id: 1001,
        status: 'wrong',
        resultText: '틀렸습니다',
        at: NOW - MIN,
      },
      {
        id: 1002,
        title: '<b>열기만</b>',
        language: 'Java 11',
        status: 'opened',
        at: NOW - 2 * MIN,
      },
      {
        id: 1000,
        title: 'A+B',
        language: 'C++17',
        status: 'accepted',
        resultText: '맞았습니다!!',
        at: NOW - 3 * DAY_MS,
      },
      { id: 1003, language: 'PyPy3', status: 'opened', at: NOW - 10 * DAY_MS },
    ]);
  });

  it('keeps the newest five', () => {
    const items: Record<string, unknown> = {};
    for (let i = 1; i <= 8; i++) items[`judge:${i}`] = judge(i, 'ac', NOW - i * MIN);
    expect(recentProblems(readProblems(items)).map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('bugReportUrl', () => {
  const context = { version: '0.3.0', browser: 'Chrome 131' };

  it('fills the problem in the active tab and its language', () => {
    const data = readProblems({ 'meta:1000': meta('A+B', 'java11', NOW) });
    const url = new URL(bugReportUrl(context, 1000, data));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: '1-bug.yml',
      version: '0.3.0 / Chrome 131',
      problem: '1000',
      language: 'Java 11',
    });
  });

  it('leaves the problem out when no problem page is open', () => {
    const url = new URL(bugReportUrl(context, undefined, readProblems({})));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: '1-bug.yml',
      version: '0.3.0 / Chrome 131',
    });
  });
});
