/**
 * Saved answers and the submit queue of a mock exam (ADR-0005, product owner 2026-11-24):
 * during the exam 제출하기 only saves the answer; when the exam ends, every saved answer is
 * submitted to Baekjoon one after another. Types and checks of stored values only; the
 * functions that change an exam are in batch.ts.
 */
import { MAX_CODE_LENGTH } from '@/boj/submit-fill';
import { isLanguageId, type LanguageId } from '@/shared/languages';

export interface ExamAnswer {
  /** What is submitted: in solution-function mode, the function with the glue code. */
  code: string;
  /** The editor's code when saved in solution-function mode (ADR-0006). */
  solution?: string;
  language: LanguageId;
  /** When 제출하기 saved it. */
  savedAt: number;
}

/**
 * - pending: waits for its turn
 * - submitting: its submit window is open; waiting for the status page to report it
 * - manual: the submit window needs the user (security check, language list, firewall)
 * - submitted: Baekjoon has it; the judge result follows in `judge:{id}`
 * - failed: not submitted (window closed, could not open, unknown after a reload)
 */
export type QueueState = 'pending' | 'submitting' | 'manual' | 'submitted' | 'failed';

export interface QueueEntry {
  state: QueueState;
  updatedAt: number;
  /** When its submission was requested (submitting and later). */
  startedAt?: number;
  /** The page that submits it, so two open result pages never both submit. */
  owner?: string;
  reason?: string;
}

const STATES: readonly QueueState[] = ['pending', 'submitting', 'manual', 'submitted', 'failed'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isTime(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

export function isAnswer(v: unknown): v is ExamAnswer {
  return (
    isRecord(v) &&
    typeof v.code === 'string' &&
    v.code.length > 0 &&
    v.code.length <= MAX_CODE_LENGTH &&
    isLanguageId(v.language) &&
    isTime(v.savedAt) &&
    (v.solution === undefined ||
      (typeof v.solution === 'string' && v.solution.length <= MAX_CODE_LENGTH))
  );
}

export function isQueueEntry(v: unknown): v is QueueEntry {
  return (
    isRecord(v) &&
    STATES.includes(v.state as QueueState) &&
    isTime(v.updatedAt) &&
    (v.startedAt === undefined || isTime(v.startedAt)) &&
    (v.owner === undefined || (typeof v.owner === 'string' && v.owner.length <= 40)) &&
    (v.reason === undefined || (typeof v.reason === 'string' && v.reason.length <= 300))
  );
}
