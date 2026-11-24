import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  activeEntry,
  answerDiffers,
  answeredProblems,
  batchProgress,
  claimEntry,
  finishExam,
  markFailed,
  markManual,
  markSubmitted,
  nextPending,
  resumeEntry,
  retrySubmission,
  saveAnswer,
  startBatch,
  UNKNOWN_REASON,
} from '@/exam/batch';
import { createExam, DEFAULT_DRAFT, examKey, isExam, judgeBelongs, type Exam } from '@/exam/model';
import { CLOSED_REASON, drive } from '@/exam/useBatch';
import { judgeKey, submitWindowKey, type JudgeResult } from '@/shared/submission';

const MIN = 60_000;
const NOW = 1_800_000_000_000;

function exam(): Exam {
  return createExam({
    id: 'abcdefgh12',
    now: NOW,
    draft: { ...DEFAULT_DRAFT, minutes: 60 },
    problems: [
      { id: 2001, title: '가', level: 7 },
      { id: 2002, title: '나', level: 12 },
      { id: 2003, title: '다', level: 9 },
    ],
  });
}

/** Answers for 2001 and 2003, then the end. */
function ended(): Exam {
  let e = saveAnswer(exam(), 2003, 'print(3)', 'python3', NOW + 5 * MIN);
  e = saveAnswer(e, 2001, 'print(1)', 'pypy3', NOW + 9 * MIN);
  return finishExam(e, NOW + 30 * MIN);
}

const judge = (problemId: number, updatedAt: number): JudgeResult => ({
  problemId,
  solutionId: problemId * 10,
  status: 'judging',
  resultText: '채점 중',
  resultCode: 'judging',
  updatedAt,
});

describe('answers during the exam', () => {
  it('saves and replaces an answer, never after the end', () => {
    let e = saveAnswer(exam(), 2002, 'a', 'python3', NOW + MIN);
    expect(e.answers).toEqual({ 2002: { code: 'a', language: 'python3', savedAt: NOW + MIN } });
    e = saveAnswer(e, 2002, 'b', 'cpp17', NOW + 2 * MIN);
    expect(e.answers?.[2002]).toEqual({ code: 'b', language: 'cpp17', savedAt: NOW + 2 * MIN });
    expect(isExam(e)).toBe(true);
    // Nothing went to Baekjoon.
    expect(e.submissions).toEqual({});
    expect(saveAnswer(e, 2002, 'c', 'python3', NOW + 60 * MIN)).toBe(e);
    expect(saveAnswer(e, 9999, 'c', 'python3', NOW + MIN)).toBe(e);
    expect(saveAnswer(e, 2001, '   ', 'python3', NOW + MIN)).toBe(e);
    expect(saveAnswer(e, 2001, 'x'.repeat(600_000), 'python3', NOW + MIN)).toBe(e);
  });

  it('tells when the editor no longer holds the saved answer', () => {
    const answer = { code: 'a', language: 'python3' as const, savedAt: NOW };
    expect(answerDiffers(undefined, 'a', 'python3')).toBe(false);
    expect(answerDiffers(answer, 'a', 'python3')).toBe(false);
    expect(answerDiffers(answer, 'a ', 'python3')).toBe(true);
    expect(answerDiffers(answer, 'a', 'pypy3')).toBe(true);
  });

  it('checks stored answers and queue entries', () => {
    const e = ended();
    expect(isExam(e)).toBe(true);
    expect(isExam({ ...e, answers: { 9999: e.answers?.[2001] } })).toBe(false);
    expect(
      isExam({ ...e, answers: { 2001: { code: '', language: 'python3', savedAt: NOW } } }),
    ).toBe(false);
    expect(isExam({ ...e, submitQueue: { 2001: { state: 'sent', updatedAt: NOW } } })).toBe(false);
  });
});

describe('the submit queue after the end', () => {
  it('queues the saved answers in problem order, once', () => {
    const e = ended();
    expect(answeredProblems(e)).toEqual([2001, 2003]);
    expect(Object.keys(e.submitQueue ?? {})).toEqual(['2001', '2003']);
    expect(e.submitQueue?.[2001]).toEqual({ state: 'pending', updatedAt: NOW + 30 * MIN });
    expect(startBatch(e, NOW + 31 * MIN)).toBe(e);
    // Not before the end.
    expect(startBatch(saveAnswer(exam(), 2001, 'a', 'python3', NOW), NOW + MIN).submitQueue).toBe(
      undefined,
    );
    // Opened long after the time ran out: ends at the limit and queues.
    const late = finishExam(saveAnswer(exam(), 2002, 'a', 'python3', NOW), NOW + 600 * MIN);
    expect(late.endedAt).toBe(NOW + 60 * MIN);
    expect(Object.keys(late.submitQueue ?? {})).toEqual(['2002']);
    expect(batchProgress(late)).toMatchObject({ total: 1, running: true, label: '제출 중 1/1' });
  });

  it('submits one at a time, in order', () => {
    let e = ended();
    expect(nextPending(e)).toBe(2001);
    e = claimEntry(e, 2001, 'me', NOW + 31 * MIN);
    expect(e.submitQueue?.[2001]).toMatchObject({ state: 'submitting', owner: 'me' });
    // The submission time is kept so its judge result can be matched.
    expect(e.submissions[2001]).toEqual({ language: 'pypy3', at: NOW + 31 * MIN });
    expect(activeEntry(e)).toBe(2001);
    expect(nextPending(e)).toBeUndefined();
    expect(claimEntry(e, 2003, 'me', NOW + 31 * MIN)).toBe(e);
    expect(batchProgress(e).label).toBe('제출 중 1/2');

    e = markManual(e, 2001, NOW + 32 * MIN);
    expect(e.submitQueue?.[2001]?.state).toBe('manual');
    expect(nextPending(e)).toBeUndefined();
    e = markSubmitted(e, 2001, NOW + 33 * MIN);
    expect(nextPending(e)).toBe(2003);
    expect(batchProgress(e).label).toBe('제출 중 2/2');
    e = claimEntry(e, 2003, 'me', NOW + 34 * MIN);
    e = markFailed(e, 2003, '제출 창이 닫혀 제출하지 못했어요.', NOW + 35 * MIN);
    expect(e.submitQueue?.[2003]).toMatchObject({ state: 'failed', reason: CLOSED_REASON });
    expect(batchProgress(e)).toMatchObject({ running: false, label: '제출 완료 1/2' });

    // '다시 제출' puts it back; a submitted one cannot be claimed or sent again.
    e = retrySubmission(e, 2003, NOW + 36 * MIN);
    expect(e.submitQueue?.[2003]).toEqual({ state: 'pending', updatedAt: NOW + 36 * MIN });
    expect(retrySubmission(e, 2001, NOW)).toBe(e);
    expect(claimEntry(e, 2001, 'me', NOW)).toBe(e);
    expect(isExam(e)).toBe(true);
  });

  it('matches judge results of submissions made after the end', () => {
    const e = claimEntry(ended(), 2001, 'me', NOW + 50 * MIN);
    expect(judgeBelongs(e, judge(2001, NOW + 49 * MIN))).toBe(false);
    expect(judgeBelongs(e, judge(2001, NOW + 51 * MIN))).toBe(true);
    expect(judgeBelongs(e, judge(2001, NOW + 50 * MIN + 31 * MIN))).toBe(false);
  });

  it('resumes after a reload without sending anything twice', () => {
    const e = claimEntry(ended(), 2001, 'old-page', NOW + 31 * MIN);
    // Reported in the meantime.
    expect(
      resumeEntry(e, 2001, judge(2001, NOW + 32 * MIN), false, NOW + 40 * MIN).submitQueue?.[2001]
        ?.state,
    ).toBe('submitted');
    // An older result is not this submission's.
    const unknown = resumeEntry(e, 2001, judge(2001, NOW + 20 * MIN), false, NOW + 40 * MIN);
    expect(unknown.submitQueue?.[2001]).toMatchObject({ state: 'failed', reason: UNKNOWN_REASON });
    // The window is still open: keep waiting.
    expect(resumeEntry(e, 2001, undefined, true, NOW + 40 * MIN)).toBe(e);
    expect(resumeEntry(ended(), 2001, undefined, false, NOW)).toEqual(ended());
  });
});

describe('the result page drives the queue', () => {
  let sent: { problemId: number; code: string; language: string }[];
  let respond: (problemId: number) => Promise<unknown>;

  beforeEach(async () => {
    fakeBrowser.reset();
    sent = [];
    // The submit window reports each submission a moment after it opened.
    respond = async (problemId) => {
      setTimeout(
        () =>
          void fakeBrowser.storage.local.set({
            [judgeKey(problemId)]: judge(problemId, Date.now()),
          }),
        20,
      );
      return { ok: true };
    };
    Object.assign(fakeBrowser.runtime, {
      sendMessage: vi.fn(async (m: { problemId: number; code: string; language: string }) => {
        sent.push({ problemId: m.problemId, code: m.code, language: m.language });
        return respond(m.problemId);
      }),
    });
  });

  const seed = (e: Exam) => fakeBrowser.storage.local.set({ [examKey(e.id)]: e });
  const stored = async () =>
    (await fakeBrowser.storage.local.get(examKey('abcdefgh12')))[examKey('abcdefgh12')] as Exam;

  it('submits every saved answer once, one after another', async () => {
    await seed(ended());
    await drive('abcdefgh12', 'me', () => true);
    expect(sent).toEqual([
      { problemId: 2001, code: 'print(1)', language: 'pypy3' },
      { problemId: 2003, code: 'print(3)', language: 'python3' },
    ]);
    const e = await stored();
    expect(e.submitQueue?.[2001]?.state).toBe('submitted');
    expect(e.submitQueue?.[2003]?.state).toBe('submitted');
    // Run again: nothing is sent twice.
    await drive('abcdefgh12', 'me', () => true);
    expect(sent).toHaveLength(2);
  });

  it('records a failure and goes on with the next', async () => {
    respond = async (problemId) =>
      problemId === 2001
        ? { ok: false, reason: '백준 제출 페이지를 열지 못했습니다.' }
        : (setTimeout(
            () =>
              void fakeBrowser.storage.local.set({
                [judgeKey(problemId)]: judge(problemId, Date.now()),
              }),
            20,
          ),
          { ok: true });
    await seed(ended());
    await drive('abcdefgh12', 'me', () => true);
    const e = await stored();
    expect(e.submitQueue?.[2001]).toMatchObject({
      state: 'failed',
      reason: '백준 제출 페이지를 열지 못했습니다.',
    });
    expect(e.submitQueue?.[2003]?.state).toBe('submitted');
  });

  it('fails an entry whose submit window was closed before a report', async () => {
    respond = async (problemId) => {
      setTimeout(
        () =>
          void fakeBrowser.storage.session.set({
            [submitWindowKey(problemId)]: {
              problemId,
              windowId: 5,
              state: 'closed',
              updatedAt: Date.now(),
            },
          }),
        20,
      );
      return { ok: true };
    };
    await seed(ended());
    await drive('abcdefgh12', 'me', () => true);
    const e = await stored();
    expect(e.submitQueue?.[2001]).toMatchObject({ state: 'failed', reason: CLOSED_REASON });
    expect(e.submitQueue?.[2003]).toMatchObject({ state: 'failed', reason: CLOSED_REASON });
  });

  it('does not send again an entry left submitting by an earlier page', async () => {
    await seed(claimEntry(ended(), 2001, 'old-page', Date.now() - 60_000));
    await drive('abcdefgh12', 'me', () => true);
    expect(sent.map((s) => s.problemId)).toEqual([2003]);
    const e = await stored();
    expect(e.submitQueue?.[2001]).toMatchObject({ state: 'failed', reason: UNKNOWN_REASON });
    expect(e.submitQueue?.[2003]?.state).toBe('submitted');
  });

  it('stops when the page goes away', async () => {
    await seed(ended());
    await drive('abcdefgh12', 'me', () => false);
    expect(sent).toEqual([]);
  });
});
