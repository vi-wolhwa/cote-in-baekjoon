// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { submitLanguageOfName, syntaxOfName } from '@/ide/history/languages';
import { describeResult } from '@/ide/history/result';
import { rowsThatFit } from '@/ide/history/StatusTable';
import { appendRows } from '@/ide/history/useStatusList';
import { DRAFT_TTL_MS, loadCode, saveCode } from '@/ide/storage';
import type { StatusPageRow } from '@/shared/status-page';

const row = (solutionId: number): StatusPageRow => ({
  solutionId,
  username: 'tester',
  resultCode: 'ac',
  resultText: '맞았습니다!!',
  language: 'C++17',
});

describe('paging helpers', () => {
  it('adds a page without the rows already there', () => {
    expect(appendRows([row(3), row(2)], [row(2), row(1)]).map((r) => r.solutionId)).toEqual([
      3, 2, 1,
    ]);
  });

  it('fits whole rows below the header', () => {
    expect(rowsThatFit(32 + 36 * 7 + 35)).toBe(7);
    expect(rowsThatFit(10)).toBe(1);
  });
});

describe('Baekjoon language names', () => {
  it('map to the extension language and its colours', () => {
    expect(submitLanguageOfName('node.js')).toBe('javascript');
    expect(submitLanguageOfName('C++17')).toBe('cpp17');
    expect(submitLanguageOfName('C++17 (Clang)')).toBe('cpp17');
    expect(submitLanguageOfName('Java 15')).toBe('java11');
    expect(submitLanguageOfName('Golfscript')).toBeUndefined();
    expect(syntaxOfName('C++17 (Clang)')).toBe('cpp');
    expect(syntaxOfName('C99')).toBe('c');
    expect(syntaxOfName('PyPy3')).toBe('python');
    expect(syntaxOfName('Golfscript')).toBeUndefined();
  });
});

describe('result chips', () => {
  it('use two-letter labels, the icon and colour telling kinds apart', () => {
    expect(describeResult('ac', '맞았습니다!!').label).toBe('정답');
    expect(describeResult('rte', '런타임 에러 (OutOfBounds)')).toMatchObject({
      label: '에러',
      tone: 'error',
    });
    expect(describeResult('ce', '컴파일 에러')).toMatchObject({ label: '에러', glyph: 'code' });
    expect(describeResult('tle', '시간 초과')).toMatchObject({ label: '초과', glyph: 'clock' });
    expect(describeResult('pac', '73점').label).toBe('73점');
    expect(describeResult('judging', '채점 중 (35%)').label).toBe('35%');
    expect(describeResult(undefined).tone).toBe('none');
  });
});

describe('editor drafts', () => {
  beforeEach(() => fakeBrowser.reset());

  it('come back only within the practice window, and always for the exam', async () => {
    const at = 1_800_000_000_000;
    await saveCode(1000, 'cpp', 'int main() {}', at);
    expect(await loadCode(1000, 'cpp', DRAFT_TTL_MS, at + DRAFT_TTL_MS)).toBe('int main() {}');
    expect(await loadCode(1000, 'cpp', DRAFT_TTL_MS, at + DRAFT_TTL_MS + 1)).toBeUndefined();
    expect(await loadCode(1000, 'cpp', undefined, at + 10 * DRAFT_TTL_MS)).toBe('int main() {}');
  });

  it('do not bring back code older versions kept without a time', async () => {
    await fakeBrowser.storage.local.set({ 'code:1000:cpp': 'old' });
    expect(await loadCode(1000, 'cpp', DRAFT_TTL_MS)).toBeUndefined();
    expect(await loadCode(1000, 'cpp')).toBe('old');
  });
});

describe('storage cleanup', () => {
  it('removes the old submission history and drafts past the keep time', async () => {
    const { DRAFT_KEEP_MS, staleKeys } = await import('@/shared/storage-cleanup');
    const now = 1_800_000_000_000;
    const keys = staleKeys(
      {
        'history:1000': [],
        'code:1000:cpp': 'plain string from an older version',
        'code:1001:cpp': { code: 'x', savedAt: now - DRAFT_KEEP_MS - 1 },
        'code:1002:cpp': { code: 'x', savedAt: now - 1000 },
        'judge:1000': {},
        'exam:abc': {},
      },
      now,
    );
    expect(keys.sort()).toEqual(['code:1000:cpp', 'code:1001:cpp', 'history:1000']);
  });
});

describe('submission times', () => {
  it('read like Baekjoon, with the exact time for the tooltip', async () => {
    const { fullTime, relativeTime } = await import('@/ide/history/format');
    const now = Date.UTC(2026, 10, 25);
    const day = 24 * 60 * 60 * 1000;
    expect(relativeTime(now - 30_000, now)).toBe('방금');
    expect(relativeTime(now - 3 * day, now)).toBe('3일 전');
    expect(relativeTime(now - 95 * day, now)).toBe('3개월 전');
    expect(relativeTime(now - 3 * 365 * day, now)).toBe('3년 전');
    expect(fullTime(new Date(2026, 10, 25, 14, 3, 5).getTime())).toBe('2026년 11월 25일 14:03:05');
  });
});

describe('table numbers', () => {
  it('keep memory under seven digits and code length under five', async () => {
    const { lengthMeasure, memoryMeasure } = await import('@/ide/history/format');
    expect(memoryMeasure(999_999)).toEqual(['999,999', 'KB']);
    expect(memoryMeasure(2_048_000)).toEqual(['2,000', 'MB']);
    expect(lengthMeasure(9_999)).toEqual(['9,999', 'B']);
    expect(lengthMeasure(12_800)).toEqual(['12.5', 'KB']);
    expect(lengthMeasure(500_000)).toEqual(['488', 'KB']);
  });
});
