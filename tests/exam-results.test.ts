import { describe, expect, it } from 'vitest';
import {
  createExam,
  DEFAULT_DRAFT,
  endExam,
  recordJudge,
  recordSubmission,
  type Exam,
} from '@/exam/model';
import { judgeFor, outcomeOf, pastExams, runningExamProblems, summarizeExam } from '@/exam/results';
import { parseRoute, routeHash } from '@/exam/routes';
import type { JudgeResult } from '@/shared/submission';

const MIN = 60_000;
const NOW = 1_800_000_000_000;

function exam(id = 'abcdefgh12', startedAt = NOW): Exam {
  return createExam({
    id,
    now: startedAt,
    draft: { ...DEFAULT_DRAFT, minutes: 60 },
    problems: [
      { id: 2001, title: '가', level: 7 },
      { id: 2002, title: '나', level: 12 },
      { id: 2003, title: '다', level: 9 },
      { id: 2004, title: '라', level: 15 },
    ],
  });
}

const judge = (problemId: number, patch: Partial<JudgeResult> = {}): JudgeResult => ({
  problemId,
  solutionId: problemId * 10,
  status: 'done',
  resultText: '맞았습니다!!',
  resultCode: 'ac',
  updatedAt: NOW + 20 * MIN,
  ...patch,
});

const judges = (...list: JudgeResult[]) => new Map(list.map((j) => [j.problemId, j]));

describe('exam results', () => {
  it('counts only results that belong to the exam', () => {
    let e = exam();
    e = recordSubmission(e, 2001, 'python3', NOW + 10 * MIN);
    e = recordSubmission(e, 2002, 'cpp17', NOW + 15 * MIN);
    e = recordSubmission(e, 2003, 'java11', NOW + 30 * MIN);
    e = endExam(e, NOW + 45 * MIN);
    const summary = summarizeExam(
      e,
      judges(
        judge(2001),
        judge(2002, { resultCode: 'wa', resultText: '틀렸습니다' }),
        // Seen before 제출하기 for 2003: a stale practice result.
        judge(2003, { updatedAt: NOW + 29 * MIN }),
        // Accepted, but never submitted in the exam.
        judge(2004),
      ),
      NOW + 50 * MIN,
    );
    expect(summary.accepted).toBe(1);
    expect(summary.total).toBe(4);
    expect(summary.elapsedMs).toBe(45 * MIN);
    expect(summary.hardest?.id).toBe(2001);
    expect(summary.rows.map((r) => [r.outcome, r.resultText])).toEqual([
      ['accepted', '맞았습니다!!'],
      ['wrong', '틀렸습니다'],
      ['none', '채점 결과를 기다리는 중'],
      ['none', '제출하지 않음'],
    ]);
    expect(summary.rows[0]).toMatchObject({ language: 'Python 3', submittedAfterMs: 10 * MIN });
    expect(summary.rows[3]?.language).toBeUndefined();
  });

  it('takes results that arrive after the end, and the hardest accepted problem', () => {
    let e = exam();
    e = recordSubmission(e, 2002, 'python3', NOW + 58 * MIN);
    e = recordSubmission(e, 2004, 'python3', NOW + 59 * MIN);
    e = endExam(e, NOW + 60 * MIN);
    const late = judges(
      judge(2002, { updatedAt: NOW + 62 * MIN }),
      judge(2004, {
        status: 'judging',
        resultCode: 'judging',
        resultText: '채점 중 (40%)',
        updatedAt: NOW + 61 * MIN,
      }),
    );
    let summary = summarizeExam(e, late, NOW + 63 * MIN);
    expect(summary.accepted).toBe(1);
    expect(summary.rows[3]).toMatchObject({ outcome: 'judging', resultText: '채점 중 (40%)' });
    late.set(2004, judge(2004, { updatedAt: NOW + 64 * MIN }));
    summary = summarizeExam(e, late, NOW + 65 * MIN);
    expect(summary.accepted).toBe(2);
    expect(summary.hardest?.id).toBe(2004);
  });

  it('keeps the exam result when practice later overwrites judge:{id}', () => {
    let e = recordSubmission(exam(), 2001, 'python3', NOW + 10 * MIN);
    e = recordJudge(e, judge(2001, { updatedAt: NOW + 11 * MIN }));
    e = endExam(e, NOW + 40 * MIN);
    // Days later, a wrong practice submission of the same problem.
    const practice = judge(2001, {
      solutionId: 99_999,
      resultCode: 'wa',
      resultText: '틀렸습니다',
      updatedAt: NOW + 3 * 24 * 60 * MIN,
    });
    expect(judgeFor(e, 2001, practice)?.resultCode).toBe('ac');
    expect(summarizeExam(e, judges(practice), NOW + 4 * 24 * 60 * MIN).accepted).toBe(1);
  });

  it('runs the clock while the exam is on', () => {
    const e = exam();
    expect(summarizeExam(e, new Map(), NOW + 7 * MIN).elapsedMs).toBe(7 * MIN);
    expect(summarizeExam(e, new Map(), NOW + 90 * MIN).elapsedMs).toBe(60 * MIN);
  });

  it('maps results to the status circle', () => {
    expect(outcomeOf(undefined)).toBe('none');
    expect(outcomeOf(judge(1, { status: 'pending', resultCode: 'wait' }))).toBe('judging');
    expect(outcomeOf(judge(1, { resultCode: 'tle' }))).toBe('wrong');
    expect(outcomeOf(judge(1))).toBe('accepted');
  });
});

describe('past exams', () => {
  it('lists the newest five with their score, or 진행 중', () => {
    const list = Array.from({ length: 7 }, (_, i) =>
      endExam(exam(`exam0000${i}x`, NOW - (i + 1) * 24 * 60 * MIN), NOW),
    );
    const running = exam('runningexam1', NOW - 5 * MIN);
    const past = pastExams([...list, running], new Map(), NOW);
    expect(past).toHaveLength(5);
    expect(past[0]).toMatchObject({ id: 'runningexam1', inProgress: true });
    expect(past[0]?.score).toBeUndefined();
    expect(past[1]).toMatchObject({ inProgress: false, score: '0/4' });
    expect(past[1]?.label).toMatch(/^\d{1,2}\/\d{1,2} · 실버~골드 4문제$/);
  });
});

describe('results hidden while an exam runs', () => {
  it('lists the problems of running exams only', () => {
    const running = exam('runningexam1', NOW - 5 * MIN);
    const done = endExam(exam('doneexam0001', NOW - 90 * MIN), NOW - 40 * MIN);
    expect([...runningExamProblems([running, done], NOW)]).toEqual([2001, 2002, 2003, 2004]);
    expect(runningExamProblems([done], NOW).size).toBe(0);
    expect(runningExamProblems([running], NOW + 60 * MIN).size).toBe(0);
  });
});

describe('exam.html routes', () => {
  it('reads the hash', () => {
    expect(parseRoute('')).toEqual({ kind: 'setup' });
    expect(parseRoute('#setup')).toEqual({ kind: 'setup' });
    expect(parseRoute('#setup?include=1000')).toEqual({ kind: 'setup', include: 1000 });
    expect(parseRoute('#setup?include=0')).toEqual({ kind: 'setup' });
    expect(parseRoute('#setup?include=10000000')).toEqual({ kind: 'setup' });
    expect(parseRoute('#setup?include=1e3')).toEqual({ kind: 'setup' });
    expect(parseRoute('#abcdefgh12')).toEqual({ kind: 'exam', id: 'abcdefgh12' });
    expect(parseRoute('#abcdefgh12/result')).toEqual({ kind: 'result', id: 'abcdefgh12' });
    expect(parseRoute('#short')).toEqual({ kind: 'not-found' });
    expect(parseRoute('#ABCDEFGH12')).toEqual({ kind: 'not-found' });
    expect(parseRoute('#abcdefgh12/other')).toEqual({ kind: 'not-found' });
  });

  it('writes it back', () => {
    for (const hash of ['#setup', '#setup?include=1000', '#abcdefgh12', '#abcdefgh12/result']) {
      expect(routeHash(parseRoute(hash))).toBe(hash);
    }
  });
});
