/**
 * Exam records and the setup draft in `storage.local` (ADR-0005). Every read is validated:
 * a value that fails isExam() is treated as missing.
 */
import { HANDLE_KEY, isHandle } from '@/shared/handle';
import { isJudgeResult, judgeKey, type JudgeResult } from '@/shared/submission';
import {
  DRAFT_KEY,
  EXAM_KEY,
  examKey,
  isExam,
  parseDraft,
  type Exam,
  type ExamDraft,
} from './model';

export async function loadExam(id: string): Promise<Exam | undefined> {
  const key = examKey(id);
  const value = (await browser.storage.local.get(key))[key];
  return isExam(value) && value.id === id ? value : undefined;
}

export function saveExam(exam: Exam) {
  return browser.storage.local.set({ [examKey(exam.id)]: exam });
}

/** Updates made on this page run one after another, so none reads a copy another replaces. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Reads the stored exam, applies `change` and saves the result, so a change made in another
 * tab (or by an earlier save) is never overwritten with an older copy.
 */
export function updateExam(id: string, change: (exam: Exam) => Exam): Promise<Exam | undefined> {
  const run = async () => {
    const current = await loadExam(id);
    if (!current) return undefined;
    const next = change(current);
    if (next !== current) await saveExam(next);
    return next;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Valid exams among all stored items. */
export function readExams(items: Record<string, unknown>): Exam[] {
  const exams: Exam[] = [];
  for (const [key, value] of Object.entries(items)) {
    const match = EXAM_KEY.exec(key);
    if (match && isExam(value) && value.id === match[1]) exams.push(value);
  }
  return exams;
}

/** Valid judge results by problem number among all stored items. */
export function readJudges(items: Record<string, unknown>): Map<number, JudgeResult> {
  const judges = new Map<number, JudgeResult>();
  for (const [key, value] of Object.entries(items)) {
    const match = /^judge:(\d{1,7})$/.exec(key);
    if (match && isJudgeResult(value) && value.problemId === Number(match[1])) {
      judges.set(value.problemId, value);
    }
  }
  return judges;
}

export async function loadJudges(problemIds: readonly number[]) {
  const items = await browser.storage.local.get(problemIds.map(judgeKey));
  return readJudges(items);
}

export async function loadDraft(): Promise<ExamDraft> {
  return parseDraft((await browser.storage.local.get(DRAFT_KEY))[DRAFT_KEY]);
}

export function saveDraft(draft: ExamDraft) {
  return browser.storage.local.set({ [DRAFT_KEY]: draft });
}

/** The logged-in Baekjoon id content scripts last saw, if any. */
export async function loadHandle(): Promise<string | undefined> {
  const value = (await browser.storage.local.get(HANDLE_KEY))[HANDLE_KEY];
  return isHandle(value) ? value : undefined;
}
