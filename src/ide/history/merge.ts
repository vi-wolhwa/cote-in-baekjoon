/**
 * A row of the 제출 기록 tables (ADR-0012): one submission of a Baekjoon list, as the tables
 * and the code view show it. Every row comes from Baekjoon; the extension keeps no
 * submission records of its own (ADR-0012 개정 3).
 */
import type { ResultCode } from '@/boj/status';
import type { StatusPageRow } from '@/shared/status-page';

export interface RecordRow {
  /** Stable key for the list. */
  key: string;
  solutionId: number;
  username: string;
  resultCode: ResultCode;
  resultText: string;
  memoryKb?: number;
  timeMs?: number;
  language: string;
  codeLength?: number;
  submittedAt?: number;
  /** Baekjoon lets the viewer open the source. */
  sourceOpen?: boolean;
  /** Place in a ranking (맞힌 사람, 숏코딩). */
  rank?: number;
}

export function statusRow(row: StatusPageRow): RecordRow {
  return { key: `s${row.solutionId}`, ...row };
}
