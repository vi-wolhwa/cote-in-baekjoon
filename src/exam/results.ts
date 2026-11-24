/**
 * The result screen (exam.html#{id}/result) and the popup's past exams, computed from the
 * exam record and the stored judge results (`judge:{id}`). Results can arrive after the exam
 * ended (judging takes time), so this is recomputed whenever storage changes.
 */
import { languageInfo } from '@/shared/languages';
import type { JudgeResult } from '@/shared/submission';
import type { QueueState } from './answers';
import {
  examLabel,
  finishTime,
  isOver,
  judgeBelongs,
  newerJudge,
  type Exam,
  type ExamProblem,
  type ExamSubmission,
} from './model';

/** ✓ green, ✕ red, – grey (not submitted, or no result yet). */
export type Outcome = 'accepted' | 'wrong' | 'judging' | 'none';

/** Where the saved answer is in the submit queue after the end (batch.ts). */
export type RowStage = 'none' | 'saved' | QueueState;

export interface ProblemRow {
  index: number;
  problem: ExamProblem;
  stage: RowStage;
  /** Why submitting failed, for 'failed'. */
  reason?: string;
  submission?: ExamSubmission;
  judge?: JudgeResult;
  outcome: Outcome;
  /** Shown in the row: the judge text, or why there is none. */
  resultText: string;
  language?: string;
  /** Time from the exam start to when the answer was saved. */
  submittedAfterMs?: number;
}

export interface ExamSummary {
  accepted: number;
  total: number;
  /** From the start to the end (or to now while running). */
  elapsedMs: number;
  /** The hardest accepted problem by solved.ac level. */
  hardest?: ExamProblem;
  rows: ProblemRow[];
}

/** The exam's result for one problem: the kept snapshot or a stored result that belongs. */
export function judgeFor(exam: Exam, problemId: number, stored?: JudgeResult) {
  const kept = exam.submissions[problemId]?.judge;
  const fresh = stored && stored.problemId === problemId && judgeBelongs(exam, stored);
  return newerJudge(kept, fresh ? stored : undefined);
}

export function outcomeOf(judge: JudgeResult | undefined): Outcome {
  if (!judge) return 'none';
  if (judge.status !== 'done') return 'judging';
  return judge.resultCode === 'ac' ? 'accepted' : 'wrong';
}

const STAGE_TEXT: Partial<Record<RowStage, string>> = {
  none: '제출 안 함',
  saved: '제출 대기',
  pending: '제출 대기',
  submitting: '제출 중',
  manual: '직접 제출이 필요해요',
  failed: '제출 실패',
};

export function summarizeExam(
  exam: Exam,
  judges: ReadonlyMap<number, JudgeResult>,
  now: number,
): ExamSummary {
  const rows = exam.problems.map((problem, index): ProblemRow => {
    const submission = exam.submissions[problem.id];
    const answer = exam.answers?.[problem.id];
    const entry = exam.submitQueue?.[problem.id];
    // Older exams submitted during the exam and have no answers.
    const stage: RowStage = entry
      ? entry.state
      : answer
        ? 'saved'
        : submission
          ? 'submitted'
          : 'none';
    const judge =
      submission && (stage === 'submitted' || stage === 'manual' || stage === 'submitting')
        ? judgeFor(exam, problem.id, judges.get(problem.id))
        : undefined;
    const language = answer?.language ?? submission?.language;
    const savedAt = answer?.savedAt ?? submission?.at;
    return {
      index,
      problem,
      stage,
      ...(entry?.reason ? { reason: entry.reason } : {}),
      ...(submission ? { submission } : {}),
      ...(language ? { language: languageInfo(language).label } : {}),
      ...(savedAt !== undefined ? { submittedAfterMs: Math.max(0, savedAt - exam.startedAt) } : {}),
      ...(judge ? { judge } : {}),
      outcome: outcomeOf(judge),
      resultText:
        judge?.resultText ??
        (stage === 'submitted' ? '채점 결과를 기다리는 중' : (STAGE_TEXT[stage] ?? '')),
    };
  });
  const accepted = rows.filter((r) => r.outcome === 'accepted');
  const hardest = accepted.reduce<ExamProblem | undefined>(
    (best, r) => (!best || r.problem.level >= best.level ? r.problem : best),
    undefined,
  );
  const end = isOver(exam, now) ? finishTime(exam) : now;
  return {
    accepted: accepted.length,
    total: exam.problems.length,
    elapsedMs: Math.max(0, end - exam.startedAt),
    ...(hardest ? { hardest } : {}),
    rows,
  };
}

export interface PastExam {
  id: string;
  /** "11/22 · 실버~골드 4문제" */
  label: string;
  /** "3/4", or undefined while the exam is running. */
  score?: string;
  inProgress: boolean;
  startedAt: number;
}

export const PAST_LIMIT = 5;

/** Newest first, at most `limit`. */
export function pastExams(
  exams: readonly Exam[],
  judges: ReadonlyMap<number, JudgeResult>,
  now: number,
  limit = PAST_LIMIT,
): PastExam[] {
  return [...exams]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map((exam) => {
      const date = new Date(exam.startedAt);
      const label = `${date.getMonth() + 1}/${date.getDate()} · ${examLabel(exam)}`;
      const inProgress = !isOver(exam, now);
      const summary = inProgress ? undefined : summarizeExam(exam, judges, now);
      return {
        id: exam.id,
        label,
        ...(summary ? { score: `${summary.accepted}/${summary.total}` } : {}),
        inProgress,
        startedAt: exam.startedAt,
      };
    });
}

/**
 * Problems of exams still running. The popup leaves their judge results out of its home tab,
 * so the results stay hidden until the exam ends (ADR-0005).
 */
export function runningExamProblems(exams: readonly Exam[], now: number): Set<number> {
  return new Set(exams.filter((e) => !isOver(e, now)).flatMap((e) => e.problems.map((p) => p.id)));
}
