import { describe, expect, it } from 'vitest';
import type { Problem } from '@/boj/problem';
import {
  createExam,
  DEFAULT_DRAFT,
  endExam,
  examLabel,
  formatClock,
  formatDuration,
  isDraft,
  isExam,
  isOver,
  isTierRange,
  judgeBelongs,
  LATE_RESULT_MS,
  newExamId,
  newerJudge,
  parseDraft,
  pickProblems,
  recordJudge,
  recordSubmission,
  remainingMs,
  setProblemBody,
  tierRangeLabel,
  toggleFlag,
  toggleTier,
  type Exam,
} from '@/exam/model';
import type { JudgeResult } from '@/shared/submission';

const MIN = 60_000;
const NOW = 1_800_000_000_000;

const picked = [
  { id: 2001, title: '가', level: 12 },
  { id: 2002, title: '나', level: 7 },
  { id: 2003, title: '다', level: 9 },
];

function exam(patch: Partial<Exam> = {}): Exam {
  return {
    ...createExam({
      id: 'abcdefgh12',
      now: NOW,
      draft: { ...DEFAULT_DRAFT, minutes: 60 },
      problems: picked,
    }),
    ...patch,
  };
}

const judge = (patch: Partial<JudgeResult> = {}): JudgeResult => ({
  problemId: 2001,
  solutionId: 500,
  status: 'done',
  resultText: '맞았습니다!!',
  resultCode: 'ac',
  updatedAt: NOW + 10 * MIN,
  ...patch,
});

const body = (id: number): Problem => ({
  id,
  title: '합',
  timeLimitText: '1 초',
  memoryLimitText: '256 MB',
  timeLimitMs: 1000,
  sections: { description: '<p>더한다.</p>', input: '', output: '' },
  samples: [{ input: '1 2\n', output: '3\n' }],
  labels: [],
});

describe('setup draft', () => {
  it('keeps the tier selection a contiguous range', () => {
    expect(toggleTier(['silver', 'gold'], 'platinum')).toEqual(['silver', 'gold', 'platinum']);
    expect(toggleTier(['silver'], 'platinum')).toEqual(['silver', 'gold', 'platinum']);
    expect(toggleTier(['gold'], 'bronze')).toEqual(['bronze', 'silver', 'gold']);
    expect(toggleTier(['silver', 'gold'], 'silver')).toEqual(['gold']);
    expect(toggleTier(['silver', 'gold'], 'gold')).toEqual(['silver']);
    expect(toggleTier(['bronze', 'silver', 'gold'], 'silver')).toEqual(['silver']);
    // The last one stays: there is always a range.
    expect(toggleTier(['gold'], 'gold')).toEqual(['gold']);
    expect(toggleTier([], 'gold')).toEqual(['gold']);
  });

  it('checks ranges and labels them', () => {
    expect(isTierRange(['silver', 'gold'])).toBe(true);
    expect(isTierRange(['gold', 'silver'])).toBe(true);
    expect(isTierRange(['bronze', 'gold'])).toBe(false);
    expect(isTierRange([])).toBe(false);
    expect(tierRangeLabel(['gold', 'silver'])).toBe('실버~골드');
    expect(tierRangeLabel(['platinum'])).toBe('플래티넘');
  });

  it('reads a stored draft or falls back to the default', () => {
    expect(DEFAULT_DRAFT).toEqual({
      tiers: ['silver', 'gold'],
      tags: [],
      count: 4,
      minutes: 120,
      customMinutes: false,
      excludeSolved: true,
    });
    const draft = { ...DEFAULT_DRAFT, tags: ['dp'], count: 8, minutes: 45, customMinutes: true };
    expect(parseDraft(draft)).toEqual(draft);
    for (const bad of [
      { ...draft, count: 9 },
      { ...draft, count: 0 },
      { ...draft, minutes: 9 },
      { ...draft, minutes: 301 },
      { ...draft, tiers: ['bronze', 'gold'] },
      { ...draft, tiers: ['diamond'] },
      { ...draft, tags: ['dp', 'dp'] },
      { ...draft, tags: ['<script>'] },
      { ...draft, extra: 1 },
      null,
      'x',
    ]) {
      expect(isDraft(bad)).toBe(false);
      expect(parseDraft(bad)).toEqual(DEFAULT_DRAFT);
    }
  });
});

describe('new exam', () => {
  it('makes ids that sort by time and pass validation', () => {
    const id = newExamId(NOW, () => 0.5);
    expect(id).toMatch(/^[a-z0-9]{8,24}$/);
    expect(newExamId(NOW + 1, () => 0) > newExamId(NOW, () => 0.99)).toBe(true);
  });

  it('puts the included problems in and orders problems easiest first', () => {
    const include = { id: 1000, title: '포함', level: 10 };
    const other = { id: 1001, title: '또', level: 1 };
    expect(pickProblems(picked, 3)?.map((p) => p.id)).toEqual([2002, 2003, 2001]);
    expect(pickProblems(picked, 2, [include])?.map((p) => p.id)).toEqual([1000, 2001]);
    // Included problems are not counted twice when solved.ac returns them too.
    expect(pickProblems([include, ...picked], 4, [include])?.map((p) => p.id)).toEqual([
      2002, 2003, 1000, 2001,
    ]);
    // Only included problems: no random pick needed.
    expect(pickProblems([], 2, [include, other])?.map((p) => p.id)).toEqual([1001, 1000]);
    expect(pickProblems(picked, 4)).toBeUndefined();
    expect(pickProblems(picked, 5, [include])).toBeUndefined();
    // Never more than the count, never the same problem twice.
    expect(pickProblems(picked, 1, [include, other])).toBeUndefined();
    expect(pickProblems(picked, 3, [include, include])).toBeUndefined();
    expect(pickProblems([...picked, ...picked], 3)?.map((p) => p.id)).toEqual([2002, 2003, 2001]);
  });

  it('records the conditions, start and duration', () => {
    const created = createExam({
      id: 'abcdefgh12',
      now: NOW,
      draft: { ...DEFAULT_DRAFT, tags: ['dp'], minutes: 90 },
      problems: picked,
      excludedSolvedBy: 'tester',
      included: [2001],
    });
    expect(created).toEqual({
      id: 'abcdefgh12',
      startedAt: NOW,
      durationMs: 90 * MIN,
      tiers: ['silver', 'gold'],
      tags: ['dp'],
      excludedSolvedBy: 'tester',
      included: [2001],
      problems: picked,
      flagged: [],
      submissions: {},
    });
    expect(isExam(created)).toBe(true);
    expect(examLabel(created)).toBe('실버~골드 3문제');
    // Exams from before the list kept one `include`; both read back.
    expect(isExam({ ...created, included: undefined, include: 2001 })).toBe(true);
    expect(isExam({ ...created, included: [9999] })).toBe(false);
    expect(isExam({ ...created, included: 2001 })).toBe(false);
  });
});

describe('time', () => {
  it('counts down from the start and ends at the limit', () => {
    const e = exam();
    expect(remainingMs(e, NOW)).toBe(60 * MIN);
    expect(remainingMs(e, NOW + 59 * MIN)).toBe(MIN);
    expect(isOver(e, NOW + 60 * MIN - 1)).toBe(false);
    expect(isOver(e, NOW + 60 * MIN)).toBe(true);
    expect(remainingMs(e, NOW + 61 * MIN)).toBe(0);
    // A clock set back before the start shows the full time, not more.
    expect(remainingMs(e, NOW - MIN)).toBe(61 * MIN);
  });

  it('ends early when asked, and never after the limit', () => {
    const e = exam();
    const ended = endExam(e, NOW + 20 * MIN);
    expect(ended.endedAt).toBe(NOW + 20 * MIN);
    expect(isOver(ended, NOW + 20 * MIN)).toBe(true);
    expect(remainingMs(ended, NOW + 20 * MIN)).toBe(0);
    expect(endExam(ended, NOW + 30 * MIN)).toBe(ended);
    // Opened again days later: the end is the time limit, not now.
    expect(endExam(e, NOW + 3 * 24 * 60 * MIN).endedAt).toBe(NOW + 60 * MIN);
  });

  it('formats the clock and durations', () => {
    expect(formatClock(2 * 60 * MIN)).toBe('2:00:00');
    expect(formatClock(5 * MIN - 1)).toBe('0:05:00');
    expect(formatClock(4 * MIN + 59_001)).toBe('0:05:00');
    expect(formatClock(4 * MIN + 59_000)).toBe('0:04:59');
    expect(formatClock(0)).toBe('0:00:00');
    expect(formatDuration(83 * MIN)).toBe('1시간 23분');
    expect(formatDuration(45 * MIN)).toBe('45분');
    expect(formatDuration(120 * MIN)).toBe('2시간');
    expect(formatDuration(30_000)).toBe('30초');
  });
});

describe('during the exam', () => {
  it('flags and unflags problems of the exam only', () => {
    const flagged = toggleFlag(exam(), 2002);
    expect(flagged.flagged).toEqual([2002]);
    expect(toggleFlag(flagged, 2002).flagged).toEqual([]);
    expect(toggleFlag(flagged, 9999)).toBe(flagged);
  });

  it('records submissions until the end', () => {
    const e = recordSubmission(exam(), 2001, 'python3', NOW + 5 * MIN);
    expect(e.submissions).toEqual({ 2001: { language: 'python3', at: NOW + 5 * MIN } });
    const again = recordSubmission(e, 2001, 'cpp17', NOW + 9 * MIN);
    expect(again.submissions[2001]).toEqual({ language: 'cpp17', at: NOW + 9 * MIN });
    expect(recordSubmission(e, 2002, 'python3', NOW + 60 * MIN)).toBe(e);
    const ended = endExam(e, NOW + 10 * MIN);
    expect(recordSubmission(ended, 2002, 'python3', NOW + 11 * MIN)).toBe(ended);
    expect(recordSubmission(e, 9999, 'python3', NOW + MIN)).toBe(e);
    expect(isExam(again)).toBe(true);
  });

  it('keeps the fetched statement', () => {
    const e = setProblemBody(exam(), body(2002));
    expect(e.problems[1]?.body?.samples).toHaveLength(1);
    expect(isExam(e)).toBe(true);
    expect(setProblemBody(e, body(9999))).toBe(e);
  });

  it('keeps judge results that belong to the exam', () => {
    const e = recordSubmission(exam(), 2001, 'python3', NOW + 5 * MIN);
    // Before 제출하기: practice before the exam.
    expect(judgeBelongs(e, judge({ updatedAt: NOW + 4 * MIN }))).toBe(false);
    expect(judgeBelongs(e, judge())).toBe(true);
    // Judging can end after the time is up, but not much later.
    expect(judgeBelongs(e, judge({ updatedAt: NOW + 60 * MIN + LATE_RESULT_MS }))).toBe(true);
    expect(judgeBelongs(e, judge({ updatedAt: NOW + 61 * MIN + LATE_RESULT_MS }))).toBe(false);
    // A problem without an exam submission.
    expect(judgeBelongs(e, judge({ problemId: 2002 }))).toBe(false);

    const kept = recordJudge(e, judge({ status: 'judging', resultCode: 'judging' }));
    expect(kept.submissions[2001]?.judge?.status).toBe('judging');
    const done = recordJudge(kept, judge({ updatedAt: NOW + 11 * MIN }));
    expect(done.submissions[2001]?.judge?.resultCode).toBe('ac');
    // An older result never replaces a newer one; the same one changes nothing.
    expect(recordJudge(done, judge({ solutionId: 499, updatedAt: NOW + 12 * MIN }))).toBe(done);
    expect(recordJudge(done, judge({ updatedAt: NOW + 11 * MIN }))).toBe(done);
    expect(isExam(done)).toBe(true);
  });

  it('picks the newer of two results', () => {
    const a = judge({ solutionId: 10, updatedAt: NOW + 5 });
    const b = judge({ solutionId: 11, updatedAt: NOW + 1 });
    expect(newerJudge(a, b)).toBe(b);
    expect(newerJudge(b, a)).toBe(b);
    const c = judge({ solutionId: undefined, updatedAt: NOW + 9 });
    expect(newerJudge(a, c)).toBe(c);
    expect(newerJudge(undefined, a)).toBe(a);
    expect(newerJudge(a, undefined)).toBe(a);
  });
});

describe('stored exam validation', () => {
  it('refuses broken or hostile records', () => {
    const good = recordJudge(recordSubmission(exam(), 2001, 'python3', NOW + MIN), judge());
    expect(isExam(good)).toBe(true);
    const bad: unknown[] = [
      { ...good, id: 'BAD ID' },
      { ...good, durationMs: 5 * MIN },
      { ...good, durationMs: 60 * MIN + 1 },
      { ...good, endedAt: NOW - 1 },
      { ...good, tiers: ['bronze', 'gold'] },
      { ...good, tags: ['nope'] },
      { ...good, excludedSolvedBy: 'Bad User' },
      { ...good, problems: [] },
      { ...good, problems: [...picked, picked[0]] },
      {
        ...good,
        problems: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, title: 'x', level: 1 })),
      },
      { ...good, problems: [{ id: 1, title: 'x', level: 31 }] },
      { ...good, include: 1234 },
      { ...good, flagged: [1234] },
      { ...good, submissions: { 1234: { language: 'python3', at: NOW } } },
      { ...good, submissions: { 2001: { language: 'kotlin', at: NOW } } },
      {
        ...good,
        submissions: { 2001: { language: 'python3', at: NOW, judge: judge({ problemId: 2002 }) } },
      },
      { ...good, problems: [{ ...picked[0], body: { ...body(2001), id: 2002 } }] },
      {
        ...good,
        problems: [
          {
            ...picked[0],
            body: { ...body(2001), sections: { description: 1, input: '', output: '' } },
          },
        ],
      },
      null,
      [],
    ];
    for (const value of bad) expect(isExam(value)).toBe(false);
  });
});
