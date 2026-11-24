/**
 * Submission history (M7, ADR-0012): every submission made through the extension, kept in
 * `storage.local` under `history:{problemId}` as a newest-first list of at most
 * HISTORY_LIMIT entries. The background records an entry when the user presses 제출하기
 * and links the judge result to it when the status page reports one (ADR-0002).
 *
 * The list functions are pure so the model can be unit tested; values read from storage
 * (or a backup file) are checked before use.
 */
import { isSubmitLanguage, type SubmitLanguage } from '@/boj/languages';
import { MAX_CODE_LENGTH } from '@/boj/submit-fill';
import { isResultCode, type JudgeStatus, type ResultCode } from '@/boj/status';

/** Entries kept per problem; the oldest are dropped first. */
export const HISTORY_LIMIT = 50;

/**
 * How far before the watch start an entry may have been recorded and still get its result.
 * The IDE's '결과 다시 확인' restarts the watch from the IDE's own clock, a moment before the
 * background recorded the entry.
 */
export const LINK_WINDOW_MS = 60 * 1000;

export const historyKey = (problemId: number) => `history:${problemId}`;

export interface HistoryResult {
  /** Baekjoon's submission number. */
  solutionId?: number;
  status: JudgeStatus;
  resultCode: ResultCode;
  resultText: string;
  memoryKb?: number;
  timeMs?: number;
}

export interface HistoryEntry {
  problemId: number;
  language: SubmitLanguage;
  /** The program sent to Baekjoon. */
  code: string;
  /** The solution function as written, when it was submitted in solution-function mode. */
  fnCode?: string;
  /** When the user pressed 제출하기, in milliseconds since the epoch. Unique per problem. */
  submittedAt: number;
  /** The judge result, once the status page reported one. */
  result?: HistoryResult;
}

export function isHistoryResult(v: unknown): v is HistoryResult {
  return (
    isObject(v) &&
    (v.solutionId === undefined || isPositiveInt(v.solutionId)) &&
    (v.status === 'pending' || v.status === 'judging' || v.status === 'done') &&
    isResultCode(v.resultCode) &&
    typeof v.resultText === 'string' &&
    v.resultText.length <= 200 &&
    isOptionalCount(v.memoryKb) &&
    isOptionalCount(v.timeMs)
  );
}

export function isHistoryEntry(v: unknown): v is HistoryEntry {
  return (
    isObject(v) &&
    isProblemId(v.problemId) &&
    isSubmitLanguage(v.language) &&
    isCode(v.code) &&
    (v.fnCode === undefined || isCode(v.fnCode)) &&
    typeof v.submittedAt === 'number' &&
    Number.isFinite(v.submittedAt) &&
    v.submittedAt > 0 &&
    (v.result === undefined || isHistoryResult(v.result))
  );
}

/** A stored list for `problemId`: valid entries of that problem only, at most the limit. */
export function isHistoryList(v: unknown, problemId: number): v is HistoryEntry[] {
  return (
    Array.isArray(v) &&
    v.length <= HISTORY_LIMIT &&
    v.every((e) => isHistoryEntry(e) && e.problemId === problemId)
  );
}

/** The usable entries of a stored value, newest first. Invalid entries are dropped. */
export function readHistory(v: unknown, problemId: number): HistoryEntry[] {
  if (!Array.isArray(v)) return [];
  return normalize(
    v.filter((e): e is HistoryEntry => isHistoryEntry(e) && e.problemId === problemId),
  );
}

/** Adds a submission at the top; the oldest entries beyond the limit are dropped. */
export function addEntry(list: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return normalize([entry, ...list.filter((e) => e.submittedAt !== entry.submittedAt)]);
}

/**
 * Links a judge result to the submission that started the watch: the newest entry recorded
 * since shortly before `watchSince`. Returns undefined when nothing changes (no such entry, an
 * older report than the one it has, or the same result again).
 */
export function attachResult(
  list: readonly HistoryEntry[],
  watchSince: number,
  result: HistoryResult,
): HistoryEntry[] | undefined {
  const index = list.findIndex((e) => e.submittedAt >= watchSince - LINK_WINDOW_MS);
  const entry = list[index];
  if (!entry) return undefined;
  const old = entry.result;
  if (old?.solutionId !== undefined && result.solutionId !== undefined) {
    if (old.solutionId > result.solutionId) return undefined;
  }
  if (old && sameResult(old, result)) return undefined;
  const next = [...list];
  next[index] = { ...entry, result: { ...result } };
  return next;
}

/** Joins two lists (a restore that merges): one entry per submission time, newest first. */
export function mergeHistory(
  a: readonly HistoryEntry[],
  b: readonly HistoryEntry[],
): HistoryEntry[] {
  const byTime = new Map<number, HistoryEntry>();
  for (const e of [...b, ...a]) byTime.set(e.submittedAt, e);
  return normalize([...byTime.values()]);
}

function normalize(list: HistoryEntry[]): HistoryEntry[] {
  return [...list].sort((x, y) => y.submittedAt - x.submittedAt).slice(0, HISTORY_LIMIT);
}

function sameResult(a: HistoryResult, b: HistoryResult): boolean {
  return (
    a.solutionId === b.solutionId &&
    a.status === b.status &&
    a.resultCode === b.resultCode &&
    a.resultText === b.resultText &&
    a.memoryKb === b.memoryKb &&
    a.timeMs === b.timeMs
  );
}

// ---------------------------------------------------------------------------
// Extension pages

/**
 * Calls `onChange` with the problem's history now and whenever it changes. Returns a
 * function that stops watching.
 */
export function watchHistory(
  problemId: number,
  onChange: (entries: HistoryEntry[]) => void,
): () => void {
  const key = historyKey(problemId);
  let active = true;
  const deliver = (value: unknown) => {
    if (active) onChange(readHistory(value, problemId));
  };
  const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName === 'local' && key in changes) deliver(changes[key]?.newValue);
  };
  browser.storage.onChanged.addListener(listener);
  browser.storage.local
    .get(key)
    .then((items) => deliver(items[key]))
    .catch(() => deliver(undefined));
  return () => {
    active = false;
    browser.storage.onChanged.removeListener(listener);
  };
}

// ---------------------------------------------------------------------------

function isCode(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_CODE_LENGTH;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

function isProblemId(v: unknown): v is number {
  return isPositiveInt(v) && v < 10_000_000;
}

function isOptionalCount(v: unknown): boolean {
  return v === undefined || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
}
