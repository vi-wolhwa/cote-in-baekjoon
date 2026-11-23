/**
 * The result screen (exam.html#{id}/result) and the popup's past exams, computed from the
 * exam record and the stored judge results (`judge:{id}`). Results can arrive after the exam
 * ended (judging takes time), so this is recomputed whenever storage changes.
 */
import { languageInfo } from '@/shared/languages';
import type { JudgeResult } from '@/shared/submission';
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

export interface ProblemRow {
  index: number;
  problem: ExamProblem;
  submission?: ExamSubmission;
  judge?: JudgeResult;
  outcome: Outcome;
  /** Shown in the row: the judge text, or why there is none. */
  resultText: string;
  language?: string;
  /** Time from the exam start to the last submission. */
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

export function summarizeExam(
  exam: Exam,
  judges: ReadonlyMap<number, JudgeResult>,
  now: number,
): ExamSummary {
  const rows = exam.problems.map((problem, index): ProblemRow => {
    const submission = exam.submissions[problem.id];
    const judge = submission ? judgeFor(exam, problem.id, judges.get(problem.id)) : undefined;
    const outcome = outcomeOf(judge);
    return {
      index,
      problem,
      ...(submission
        ? {
            submission,
            language: languageInfo(submission.language).label,
            submittedAfterMs: Math.max(0, submission.at - exam.startedAt),
          }
        : {}),
      ...(judge ? { judge } : {}),
      outcome,
      resultText: judge
        ? judge.resultText
        : submission
          ? '채점 결과를 기다리는 중'
          : '제출하지 않음',
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
