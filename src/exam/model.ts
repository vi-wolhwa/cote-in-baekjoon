/**
 * The mock exam (ADR-0005), kept free of extension APIs so it can be unit tested.
 *
 * - `ui:exam-draft`: the conditions picked last in the setup form.
 * - `exam:{id}`: one exam: its conditions, problems (with the statement once fetched), start
 *   time, duration, end, flags and the last submission per problem.
 *
 * Stored values are untrusted (older versions, backups, hand edits): everything read back is
 * checked with parseDraft() / isExam().
 */
import type { Problem } from '@/boj/problem';
import { isLanguageId, type LanguageId } from '@/shared/languages';
import { isJudgeResult, type JudgeResult } from '@/shared/submission';
import { isHandle } from '@/shared/handle';
import {
  isTagChipId,
  isTierGroup,
  sortTiers,
  TIER_GROUPS,
  type PickedProblem,
  type TierGroup,
} from './solvedac';

const MINUTE = 60_000;

// ---------------------------------------------------------------------------
// Setup form conditions

export const DRAFT_KEY = 'ui:exam-draft';
export const MIN_COUNT = 1;
export const MAX_COUNT = 8;
export const MINUTE_PRESETS = [60, 90, 120] as const;
export const MIN_MINUTES = 10;
export const MAX_MINUTES = 300;

export interface ExamDraft {
  /** A contiguous range of tier groups, easiest first. */
  tiers: TierGroup[];
  /** Tag chip ids (TAG_CHIPS); empty means every algorithm. */
  tags: string[];
  count: number;
  minutes: number;
  /** The minutes were typed ('직접') rather than picked from the presets. */
  customMinutes: boolean;
  excludeSolved: boolean;
}

export const DEFAULT_DRAFT: ExamDraft = {
  tiers: ['silver', 'gold'],
  tags: [],
  count: 4,
  minutes: 120,
  customMinutes: false,
  excludeSolved: true,
};

export function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_COUNT && v <= MAX_COUNT;
}

export function isMinutes(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_MINUTES && v <= MAX_MINUTES;
}

/** True when the tier groups are next to each other (실버, 골드 but not 브론즈, 골드). */
export function isTierRange(tiers: readonly TierGroup[]): boolean {
  const index = sortTiers(tiers).map((t) => TIER_GROUPS.findIndex((g) => g.id === t));
  return (
    index.length > 0 &&
    index.length === tiers.length &&
    index.every((n, i) => i === 0 || n === (index[i - 1] ?? -2) + 1)
  );
}

export function isDraft(v: unknown): v is ExamDraft {
  if (!isRecord(v)) return false;
  return (
    Array.isArray(v.tiers) &&
    v.tiers.every(isTierGroup) &&
    isTierRange(v.tiers as TierGroup[]) &&
    Array.isArray(v.tags) &&
    v.tags.length <= 32 &&
    v.tags.every(isTagChipId) &&
    new Set(v.tags).size === v.tags.length &&
    isCount(v.count) &&
    isMinutes(v.minutes) &&
    typeof v.customMinutes === 'boolean' &&
    typeof v.excludeSolved === 'boolean' &&
    Object.keys(v).length === 6
  );
}

/** A stored draft, or the default one. */
export function parseDraft(v: unknown): ExamDraft {
  return isDraft(v) ? { ...v, tiers: sortTiers(v.tiers) } : { ...DEFAULT_DRAFT };
}

/**
 * Clicking a tier chip keeps the selection a contiguous range:
 * - an unselected tier extends the range to it;
 * - a selected tier at either end leaves the range (unless it is the only one);
 * - a selected tier inside the range becomes the only one.
 */
export function toggleTier(selected: readonly TierGroup[], tier: TierGroup): TierGroup[] {
  const order = TIER_GROUPS.map((g) => g.id);
  const current = sortTiers(selected);
  const at = order.indexOf(tier);
  if (current.length === 0) return [tier];
  const low = order.indexOf(current[0] as TierGroup);
  const high = order.indexOf(current[current.length - 1] as TierGroup);
  if (!current.includes(tier)) {
    return order.slice(Math.min(low, at), Math.max(high, at) + 1);
  }
  if (current.length === 1) return current;
  if (at === low) return order.slice(low + 1, high + 1);
  if (at === high) return order.slice(low, high);
  return [tier];
}

/** "실버~골드", or "골드" for one group. */
export function tierRangeLabel(tiers: readonly TierGroup[]): string {
  const sorted = sortTiers(tiers);
  const label = (id: TierGroup | undefined) => TIER_GROUPS.find((g) => g.id === id)?.label ?? '';
  if (sorted.length <= 1) return label(sorted[0]);
  return `${label(sorted[0])}~${label(sorted[sorted.length - 1])}`;
}

// ---------------------------------------------------------------------------
// Exam record

export const EXAM_PREFIX = 'exam:';
const EXAM_ID = /^[a-z0-9]{8,24}$/;
export const EXAM_KEY = /^exam:([a-z0-9]{8,24})$/;
export const examKey = (id: string) => `${EXAM_PREFIX}${id}`;

export function isExamId(v: unknown): v is string {
  return typeof v === 'string' && EXAM_ID.test(v);
}

/** Time in base 36 then random letters: sorts roughly by creation and never collides. */
export function newExamId(now: number, random: () => number = Math.random): string {
  let tail = '';
  for (let i = 0; i < 6; i++) tail += Math.floor(random() * 36).toString(36);
  return `${Math.max(0, Math.floor(now)).toString(36)}${tail}`.slice(0, 24).padEnd(8, '0');
}

export interface ExamProblem extends PickedProblem {
  /** The statement, fetched the first time the user opens the problem. Untrusted HTML. */
  body?: Problem;
}

export interface ExamSubmission {
  language: LanguageId;
  /** When 제출하기 was pressed. */
  at: number;
  /** The judge result seen for this submission, kept even if practice overwrites judge:{id}. */
  judge?: JudgeResult;
}

export interface Exam {
  id: string;
  startedAt: number;
  durationMs: number;
  /** Set when the user ends the exam or the time runs out. */
  endedAt?: number;
  tiers: TierGroup[];
  tags: string[];
  /** The Baekjoon id whose solved problems were left out. */
  excludedSolvedBy?: string;
  /** The problem the Baekjoon menu's '모의시험' was pressed on. */
  include?: number;
  problems: ExamProblem[];
  /** Problem ids marked '다시 볼 문제'. */
  flagged: number[];
  /** The last submission per problem id. */
  submissions: Record<string, ExamSubmission>;
}

export function createExam(input: {
  id: string;
  now: number;
  draft: ExamDraft;
  problems: readonly PickedProblem[];
  excludedSolvedBy?: string;
  include?: number;
}): Exam {
  const { draft } = input;
  return {
    id: input.id,
    startedAt: input.now,
    durationMs: draft.minutes * MINUTE,
    tiers: sortTiers(draft.tiers),
    tags: [...draft.tags],
    ...(input.excludedSolvedBy ? { excludedSolvedBy: input.excludedSolvedBy } : {}),
    ...(input.include ? { include: input.include } : {}),
    problems: input.problems.map(({ id, title, level }) => ({ id, title, level })),
    flagged: [],
    submissions: {},
  };
}

/**
 * The problems for a new exam: `include` first if given, then random picks, `count` in all,
 * ordered easiest first like a real test. Undefined when there are not enough.
 */
export function pickProblems(
  random: readonly PickedProblem[],
  count: number,
  include?: PickedProblem,
): PickedProblem[] | undefined {
  const rest = random.filter((p) => p.id !== include?.id);
  const need = include ? count - 1 : count;
  if (rest.length < need) return undefined;
  const picked = [...(include ? [include] : []), ...rest.slice(0, need)];
  return picked
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.level - b.p.level || a.i - b.i)
    .map(({ p }) => p);
}

// ---------------------------------------------------------------------------
// Time (from timestamps, like the sidebar timer: a reload or a stopped tab loses nothing)

export const endTime = (exam: Exam) => exam.startedAt + exam.durationMs;

export function isOver(exam: Exam, now: number): boolean {
  return exam.endedAt !== undefined || now >= endTime(exam);
}

export function remainingMs(exam: Exam, now: number): number {
  if (exam.endedAt !== undefined) return 0;
  return Math.max(0, endTime(exam) - now);
}

/** When the exam ended or will end. */
export function finishTime(exam: Exam): number {
  return exam.endedAt ?? endTime(exam);
}

/** Ends the exam now, or at the time limit if that passed already. Idempotent. */
export function endExam(exam: Exam, now: number): Exam {
  if (exam.endedAt !== undefined) return exam;
  return { ...exam, endedAt: Math.max(exam.startedAt, Math.min(now, endTime(exam))) };
}

/** "1:59:59": hours always shown; rounds up so 2:00:00 shows right after the start. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** "1시간 23분", "45분", "30초" */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** "실버~골드 4문제" */
export function examLabel(exam: Pick<Exam, 'tiers' | 'problems'>): string {
  return `${tierRangeLabel(exam.tiers)} ${exam.problems.length}문제`;
}

// ---------------------------------------------------------------------------
// Changes during the exam

export function toggleFlag(exam: Exam, problemId: number): Exam {
  if (!exam.problems.some((p) => p.id === problemId)) return exam;
  const flagged = exam.flagged.includes(problemId)
    ? exam.flagged.filter((id) => id !== problemId)
    : [...exam.flagged, problemId];
  return { ...exam, flagged };
}

/** A submission made now; refused after the end, so nothing counts after time is up. */
export function recordSubmission(
  exam: Exam,
  problemId: number,
  language: LanguageId,
  now: number,
): Exam {
  if (isOver(exam, now) || !exam.problems.some((p) => p.id === problemId)) return exam;
  return {
    ...exam,
    submissions: { ...exam.submissions, [problemId]: { language, at: now } },
  };
}

export function setProblemBody(exam: Exam, body: Problem): Exam {
  if (!exam.problems.some((p) => p.id === body.id)) return exam;
  return {
    ...exam,
    problems: exam.problems.map((p) => (p.id === body.id ? { ...p, body } : p)),
  };
}

/** How long after the end a judge result can still arrive (judging takes time). */
export const LATE_RESULT_MS = 30 * MINUTE;

/**
 * True when a stored judge result belongs to the exam's submission for that problem: seen
 * after 제출하기 was pressed and not long after the exam ended. Older results (practice before
 * the exam) and much later ones (practice after it) are not the exam's.
 */
export function judgeBelongs(exam: Exam, judge: JudgeResult): boolean {
  const submission = exam.submissions[judge.problemId];
  if (!submission) return false;
  return judge.updatedAt >= submission.at && judge.updatedAt <= finishTime(exam) + LATE_RESULT_MS;
}

/** The newer of two results for the same problem: a larger solution id, else the later one. */
export function newerJudge(a: JudgeResult | undefined, b: JudgeResult | undefined) {
  if (!a) return b;
  if (!b) return a;
  if (a.solutionId !== undefined && b.solutionId !== undefined && a.solutionId !== b.solutionId) {
    return a.solutionId > b.solutionId ? a : b;
  }
  return b.updatedAt >= a.updatedAt ? b : a;
}

/** Keeps a judge result in the exam record when it belongs to the exam and is newer. */
export function recordJudge(exam: Exam, judge: JudgeResult): Exam {
  if (!judgeBelongs(exam, judge)) return exam;
  const submission = exam.submissions[judge.problemId];
  if (!submission || newerJudge(submission.judge, judge) !== judge) return exam;
  if (submission.judge && sameJudge(submission.judge, judge)) return exam;
  return {
    ...exam,
    submissions: { ...exam.submissions, [judge.problemId]: { ...submission, judge } },
  };
}

function sameJudge(a: JudgeResult, b: JudgeResult): boolean {
  return (
    a.solutionId === b.solutionId &&
    a.status === b.status &&
    a.resultCode === b.resultCode &&
    a.resultText === b.resultText &&
    a.updatedAt === b.updatedAt
  );
}

// ---------------------------------------------------------------------------
// Validation of stored exams

const MAX_HTML = 512 * 1024;
const MAX_SAMPLE = 1024 * 1024;

function isText(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

/** A cached statement: the shape parseProblem() returns, with size limits. */
export function isProblemBody(v: unknown, id: number): v is Problem {
  if (!isRecord(v) || v.id !== id || !isText(v.title, 200)) return false;
  if (!isText(v.timeLimitText, 200) || !isText(v.memoryLimitText, 200)) return false;
  if (v.timeLimitMs !== undefined && !(typeof v.timeLimitMs === 'number' && v.timeLimitMs > 0)) {
    return false;
  }
  const s = v.sections;
  if (!isRecord(s) || !isText(s.description, MAX_HTML) || !isText(s.input, MAX_HTML)) return false;
  if (!isText(s.output, MAX_HTML)) return false;
  if (s.limit !== undefined && !isText(s.limit, MAX_HTML)) return false;
  if (s.hint !== undefined && !isText(s.hint, MAX_HTML)) return false;
  return (
    Array.isArray(v.samples) &&
    v.samples.length <= 50 &&
    v.samples.every(
      (x) => isRecord(x) && isText(x.input, MAX_SAMPLE) && isText(x.output, MAX_SAMPLE),
    ) &&
    Array.isArray(v.labels) &&
    v.labels.length <= 20 &&
    v.labels.every((l) => isText(l, 40))
  );
}

function isExamProblem(v: unknown): v is ExamProblem {
  if (!isRecord(v)) return false;
  const { id, title, level } = v;
  return (
    typeof id === 'number' &&
    Number.isInteger(id) &&
    id >= 1 &&
    id <= 9_999_999 &&
    isText(title, 200) &&
    typeof level === 'number' &&
    Number.isInteger(level) &&
    level >= 0 &&
    level <= 30 &&
    (v.body === undefined || isProblemBody(v.body, id))
  );
}

function isSubmission(v: unknown, problemId: number): v is ExamSubmission {
  return (
    isRecord(v) &&
    isLanguageId(v.language) &&
    isTime(v.at) &&
    (v.judge === undefined || (isJudgeResult(v.judge) && v.judge.problemId === problemId))
  );
}

export function isExam(v: unknown): v is Exam {
  if (!isRecord(v) || !isExamId(v.id) || !isTime(v.startedAt)) return false;
  const duration = v.durationMs;
  if (typeof duration !== 'number' || duration % MINUTE !== 0) return false;
  if (!isMinutes(duration / MINUTE)) return false;
  if (v.endedAt !== undefined && !(isTime(v.endedAt) && v.endedAt >= v.startedAt)) return false;
  if (!Array.isArray(v.tiers) || !v.tiers.every(isTierGroup)) return false;
  if (!isTierRange(v.tiers as TierGroup[])) return false;
  if (!Array.isArray(v.tags) || v.tags.length > 32 || !v.tags.every(isTagChipId)) return false;
  if (v.excludedSolvedBy !== undefined && !isHandle(v.excludedSolvedBy)) return false;
  const problems = v.problems;
  if (!Array.isArray(problems) || problems.length < MIN_COUNT || problems.length > MAX_COUNT) {
    return false;
  }
  if (!problems.every(isExamProblem)) return false;
  const ids = new Set(problems.map((p) => p.id));
  if (ids.size !== problems.length) return false;
  if (v.include !== undefined && !ids.has(v.include as number)) return false;
  if (!Array.isArray(v.flagged) || !v.flagged.every((id) => ids.has(id as number))) return false;
  if (!isRecord(v.submissions)) return false;
  return Object.entries(v.submissions).every(
    ([key, s]) => ids.has(Number(key)) && String(Number(key)) === key && isSubmission(s, +key),
  );
}

function isTime(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
