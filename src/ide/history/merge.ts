/**
 * '내 제출' in the 제출 기록 tab (ADR-0012): the submissions made in the IDE (with their
 * code) and the user's rows of Baekjoon's status list, as one newest-first list. A
 * submission in both is one row: Baekjoon's values, the IDE's code.
 */
import type { ResultCode } from '@/boj/status';
import { languageInfo } from '@/shared/languages';
import type { StatusPageRow } from '@/shared/status-page';
import type { HistoryEntry } from '@/shared/submission-history';

export interface RecordRow {
  /** Stable key for the list. */
  key: string;
  solutionId?: number;
  username?: string;
  resultCode?: ResultCode;
  resultText: string;
  memoryKb?: number;
  timeMs?: number;
  language: string;
  codeLength?: number;
  submittedAt?: number;
  /** The IDE submission with its code, when it was made in the IDE. */
  entry?: HistoryEntry;
}

export function statusRow(row: StatusPageRow, entry?: HistoryEntry): RecordRow {
  return {
    key: `s${row.solutionId}`,
    solutionId: row.solutionId,
    username: row.username,
    resultCode: row.resultCode,
    resultText: row.resultText,
    ...(row.memoryKb !== undefined ? { memoryKb: row.memoryKb } : {}),
    ...(row.timeMs !== undefined ? { timeMs: row.timeMs } : {}),
    language: row.language,
    ...(row.codeLength !== undefined ? { codeLength: row.codeLength } : {}),
    ...(row.submittedAt !== undefined ? { submittedAt: row.submittedAt } : {}),
    ...(entry ? { entry } : {}),
  };
}

const encoder = new TextEncoder();

export function entryRow(entry: HistoryEntry): RecordRow {
  const r = entry.result;
  return {
    key: r?.solutionId !== undefined ? `s${r.solutionId}` : `l${entry.submittedAt}`,
    ...(r?.solutionId !== undefined ? { solutionId: r.solutionId } : {}),
    ...(r ? { resultCode: r.resultCode } : {}),
    resultText: r?.resultText ?? '결과 없음',
    ...(r?.memoryKb !== undefined ? { memoryKb: r.memoryKb } : {}),
    ...(r?.timeMs !== undefined ? { timeMs: r.timeMs } : {}),
    language: languageInfo(entry.language).label,
    // Baekjoon counts the program's bytes.
    codeLength: encoder.encode(entry.code).length,
    submittedAt: entry.submittedAt,
    entry,
  };
}

/**
 * The merged list, newest first. `complete` says Baekjoon's rows reach back to the first
 * submission (or that there are none to wait for): until then, IDE submissions older than
 * the oldest loaded Baekjoon row are left out, so loading the next page never puts rows
 * above ones already shown.
 */
export function mergeRecords(
  entries: readonly HistoryEntry[],
  rows: readonly StatusPageRow[],
  complete: boolean,
): RecordRow[] {
  const bySolution = new Map<number, HistoryEntry>();
  for (const e of entries) {
    if (e.result?.solutionId !== undefined) bySolution.set(e.result.solutionId, e);
  }
  const seen = new Set<number>();
  const merged: RecordRow[] = [];
  let oldest = Infinity;
  for (const row of rows) {
    if (seen.has(row.solutionId)) continue;
    seen.add(row.solutionId);
    merged.push(statusRow(row, bySolution.get(row.solutionId)));
    if (row.submittedAt !== undefined) oldest = Math.min(oldest, row.submittedAt);
  }
  for (const e of entries) {
    const id = e.result?.solutionId;
    if (id !== undefined && seen.has(id)) continue;
    if (!complete && !(e.submittedAt >= oldest)) continue;
    merged.push(entryRow(e));
  }
  return merged.sort(
    (a, b) =>
      (b.submittedAt ?? 0) - (a.submittedAt ?? 0) || (b.solutionId ?? 0) - (a.solutionId ?? 0),
  );
}
