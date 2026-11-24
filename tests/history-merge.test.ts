import { describe, expect, it } from 'vitest';
import { mergeRecords } from '@/ide/history/merge';
import { appendRows } from '@/ide/history/useStatusList';
import { rowsThatFit } from '@/ide/history/StatusTable';
import type { StatusPageRow } from '@/shared/status-page';
import type { HistoryEntry } from '@/shared/submission-history';

const row = (solutionId: number, at: number): StatusPageRow => ({
  solutionId,
  username: 'tester',
  resultCode: 'wa',
  resultText: '틀렸습니다',
  language: 'C++17',
  codeLength: 100,
  submittedAt: at,
});

const entry = (at: number, solutionId?: number): HistoryEntry => ({
  problemId: 1000,
  language: 'cpp17',
  code: '한글',
  submittedAt: at,
  ...(solutionId
    ? {
        result: {
          solutionId,
          status: 'done',
          resultCode: 'ac',
          resultText: '맞았습니다!!',
          memoryKb: 2020,
          timeMs: 4,
        },
      }
    : {}),
});

describe('mergeRecords', () => {
  it('joins a submission made in the IDE with its Baekjoon row', () => {
    const merged = mergeRecords([entry(3000, 12)], [row(12, 3001), row(11, 2000)], true);
    expect(merged.map((r) => r.key)).toEqual(['s12', 's11']);
    // Baekjoon's values, the IDE's code.
    expect(merged[0]).toMatchObject({ resultText: '틀렸습니다', language: 'C++17' });
    expect(merged[0]?.entry?.code).toBe('한글');
    expect(merged[1]?.entry).toBeUndefined();
  });

  it('shows IDE submissions Baekjoon has not listed, newest first', () => {
    const merged = mergeRecords([entry(5000), entry(1500, 9)], [row(12, 3000)], true);
    expect(merged.map((r) => r.key)).toEqual(['l5000', 's12', 's9']);
    expect(merged[0]).toMatchObject({ resultText: '결과 없음', codeLength: 6 });
    expect(merged[2]).toMatchObject({ resultCode: 'ac', memoryKb: 2020, language: 'C++17' });
  });

  it('holds back IDE submissions older than the loaded Baekjoon pages', () => {
    const merged = mergeRecords([entry(5000), entry(1500, 9)], [row(12, 3000)], false);
    expect(merged.map((r) => r.key)).toEqual(['l5000', 's12']);
  });
});

describe('paging helpers', () => {
  it('adds a page without the rows already there', () => {
    expect(
      appendRows([row(3, 3), row(2, 2)], [row(2, 2), row(1, 1)]).map((r) => r.solutionId),
    ).toEqual([3, 2, 1]);
  });

  it('fits whole rows below the header', () => {
    expect(rowsThatFit(30 + 30 * 7 + 29)).toBe(7);
    expect(rowsThatFit(10)).toBe(1);
  });
});
