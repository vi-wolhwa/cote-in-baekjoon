/**
 * Background side of the submission history (ADR-0012): records each submission when the
 * user presses 제출하기 and links the judge result when the status page reports it. Writes
 * are read-modify-write on one storage key, so they run one at a time.
 */
import {
  addEntry,
  attachResult,
  historyKey,
  readHistory,
  type HistoryEntry,
  type HistoryResult,
} from '@/shared/submission-history';

let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` after the writes before it, whether they failed or not. */
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function update(
  problemId: number,
  change: (list: HistoryEntry[]) => HistoryEntry[] | undefined,
): Promise<void> {
  const key = historyKey(problemId);
  const list = readHistory((await browser.storage.local.get(key))[key], problemId);
  const next = change(list);
  if (next) await browser.storage.local.set({ [key]: next });
}

export function recordSubmission(entry: HistoryEntry): Promise<void> {
  return serialize(() => update(entry.problemId, (list) => addEntry(list, entry)));
}

export function recordJudgeResult(
  problemId: number,
  watchSince: number,
  result: HistoryResult,
): Promise<void> {
  return serialize(() => update(problemId, (list) => attachResult(list, watchSince, result)));
}
