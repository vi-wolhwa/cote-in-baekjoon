/**
 * Saved answers and submitting them after the exam (ADR-0005, product owner 2026-11-24).
 *
 * - During the exam 제출하기 saves the answer (saveAnswer); nothing goes to Baekjoon.
 * - When the exam ends (finishExam), each saved answer gets a queue entry, in problem order.
 * - The result page submits them one at a time through the usual submission tab: one entry is
 *   'submitting' or 'manual' at a time, the next starts after it is reported or fails.
 * - Entries are stored in the exam record, so a reload resumes; an entry is claimed before it
 *   is sent, and one whose fate is unknown after a reload is marked failed instead of being
 *   sent again, so an answer is never submitted twice by itself.
 *
 * Pure functions on the exam record, unit tested.
 */
import type { JudgeResult } from '@/shared/submission';
import type { LanguageId } from '@/shared/languages';
import type { ExamAnswer, QueueEntry, QueueState } from './answers';
import { endExam, isOver, recordSubmission, type Exam } from './model';
import { MAX_CODE_LENGTH } from '@/boj/submit-fill';

export const UNKNOWN_REASON =
  '제출됐는지 확인하지 못했어요. 백준 채점 현황을 확인하고 필요하면 다시 제출해 주세요.';

const has = (exam: Exam, problemId: number) => exam.problems.some((p) => p.id === problemId);

/**
 * 제출하기 during the exam: keeps this code as the answer, replacing an earlier one. In
 * solution-function mode `code` is the program with glue and `solution` the editor's code.
 */
export function saveAnswer(
  exam: Exam,
  problemId: number,
  code: string,
  language: LanguageId,
  now: number,
  solution?: string,
): Exam {
  if (isOver(exam, now) || !has(exam, problemId)) return exam;
  if (code.trim() === '' || code.length > MAX_CODE_LENGTH) return exam;
  const answer: ExamAnswer = {
    code,
    language,
    savedAt: now,
    ...(solution !== undefined && solution.length <= MAX_CODE_LENGTH ? { solution } : {}),
  };
  return { ...exam, answers: { ...exam.answers, [problemId]: answer } };
}

/**
 * True when the editor no longer holds the saved answer (only the saved one is submitted).
 * `fn`: the editor is in solution-function mode, so it compares with the saved function.
 */
export function answerDiffers(
  answer: ExamAnswer | undefined,
  code: string,
  language: LanguageId,
  fn = false,
): boolean {
  if (answer === undefined) return false;
  const saved = fn ? answer.solution : answer.solution === undefined ? answer.code : undefined;
  return saved !== code || answer.language !== language;
}

/** Problems with a saved answer, in problem order. */
export function answeredProblems(exam: Exam): number[] {
  return exam.problems.filter((p) => exam.answers?.[p.id]).map((p) => p.id);
}

/** After the end: a pending entry per saved answer, once. */
export function startBatch(exam: Exam, now: number): Exam {
  if (!isOver(exam, now) || exam.submitQueue) return exam;
  const submitQueue: Record<string, QueueEntry> = {};
  for (const id of answeredProblems(exam)) submitQueue[id] = { state: 'pending', updatedAt: now };
  return { ...exam, submitQueue };
}

/** Ends the exam (시험 종료, time up, or opened after the end) and queues the answers. */
export function finishExam(exam: Exam, now: number): Exam {
  return startBatch(endExam(exam, now), now);
}

function entries(exam: Exam): [number, QueueEntry][] {
  return exam.problems.flatMap((p) => {
    const entry = exam.submitQueue?.[p.id];
    return entry ? [[p.id, entry] as [number, QueueEntry]] : [];
  });
}

/** The entry being submitted (or waiting for the user), if any. */
export function activeEntry(exam: Exam): number | undefined {
  return entries(exam).find(([, e]) => e.state === 'submitting' || e.state === 'manual')?.[0];
}

/** The next entry to submit: none while one is active (one submit window at a time). */
export function nextPending(exam: Exam): number | undefined {
  if (activeEntry(exam) !== undefined) return undefined;
  return entries(exam).find(([, e]) => e.state === 'pending')?.[0];
}

function setEntry(exam: Exam, problemId: number, entry: QueueEntry): Exam {
  return { ...exam, submitQueue: { ...exam.submitQueue, [problemId]: entry } };
}

/**
 * Takes the entry for submitting now: pending → submitting, owned by `owner`, and records the
 * submission time so the judge result can be matched (judgeBelongs).
 */
export function claimEntry(exam: Exam, problemId: number, owner: string, now: number): Exam {
  const entry = exam.submitQueue?.[problemId];
  const answer = exam.answers?.[problemId];
  if (entry?.state !== 'pending' || !answer || activeEntry(exam) !== undefined) return exam;
  const claimed = setEntry(exam, problemId, {
    state: 'submitting',
    updatedAt: now,
    startedAt: now,
    owner,
  });
  return recordSubmission(claimed, problemId, answer.language, now);
}

function move(
  exam: Exam,
  problemId: number,
  from: readonly QueueState[],
  state: QueueState,
  now: number,
  reason?: string,
): Exam {
  const entry = exam.submitQueue?.[problemId];
  if (!entry || !from.includes(entry.state)) return exam;
  const next: QueueEntry = { ...entry, state, updatedAt: now };
  if (reason) next.reason = reason;
  else delete next.reason;
  return setEntry(exam, problemId, next);
}

export const markManual = (exam: Exam, problemId: number, now: number) =>
  move(exam, problemId, ['submitting'], 'manual', now);

export const markSubmitted = (exam: Exam, problemId: number, now: number) =>
  move(exam, problemId, ['submitting', 'manual'], 'submitted', now);

export const markFailed = (exam: Exam, problemId: number, reason: string, now: number) =>
  move(exam, problemId, ['submitting', 'manual'], 'failed', now, reason);

/** '다시 제출' on a failed entry: back in the queue. */
export function retrySubmission(exam: Exam, problemId: number, now: number): Exam {
  if (!exam.answers?.[problemId]) return exam;
  const retried = move(exam, problemId, ['failed'], 'pending', now);
  if (retried === exam) return exam;
  const entry = retried.submitQueue?.[problemId];
  if (entry) {
    delete entry.startedAt;
    delete entry.owner;
  }
  return retried;
}

/**
 * After a reload, an entry left 'submitting' or 'manual': reported (a judge result since it
 * was sent) or sent before its tab closed → submitted; its submission tab still running →
 * keep waiting; otherwise its fate is unknown → failed, never sent again by itself.
 */
export function resumeEntry(
  exam: Exam,
  problemId: number,
  judge: JudgeResult | undefined,
  tabRunning: boolean,
  now: number,
  sent = false,
): Exam {
  const entry = exam.submitQueue?.[problemId];
  if (!entry || (entry.state !== 'submitting' && entry.state !== 'manual')) return exam;
  if (judge && entry.startedAt !== undefined && judge.updatedAt >= entry.startedAt) {
    return markSubmitted(exam, problemId, now);
  }
  if (tabRunning) return exam;
  if (sent) return markSubmitted(exam, problemId, now);
  return markFailed(exam, problemId, UNKNOWN_REASON, now);
}

export interface BatchProgress {
  total: number;
  submitted: number;
  failed: number;
  /** Something is still pending, being submitted or waiting for the user. */
  running: boolean;
  /** "제출 중 2/4" or "제출 완료 3/4". */
  label?: string;
}

export function batchProgress(exam: Exam): BatchProgress {
  const list = entries(exam).map(([, e]) => e.state);
  const total = list.length;
  const submitted = list.filter((s) => s === 'submitted').length;
  const failed = list.filter((s) => s === 'failed').length;
  const running = list.some((s) => s === 'pending' || s === 'submitting' || s === 'manual');
  const label =
    total === 0
      ? undefined
      : running
        ? `제출 중 ${Math.min(total, submitted + failed + 1)}/${total}`
        : `제출 완료 ${submitted}/${total}`;
  return { total, submitted, failed, running, ...(label ? { label } : {}) };
}
