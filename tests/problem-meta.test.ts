import { describe, expect, it } from 'vitest';
import { createBackup, isBackupKey, parseBackup, summarizeBackup } from '@/shared/backup';
import { MAX_TITLE_LENGTH, isProblemMeta, makeMeta } from '@/shared/problem-meta';

const valid = { title: 'A+B', language: 'python3', openedAt: 1_764_000_000_000 };

describe('isProblemMeta', () => {
  it('accepts a title, a known language and a timestamp', () => {
    expect(isProblemMeta(valid)).toBe(true);
    expect(isProblemMeta({ ...valid, title: '' })).toBe(true);
    expect(isProblemMeta({ ...valid, title: 'a'.repeat(MAX_TITLE_LENGTH) })).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of [
      null,
      'A+B',
      [valid],
      { ...valid, title: 'a'.repeat(MAX_TITLE_LENGTH + 1) },
      { ...valid, title: 3 },
      { ...valid, language: 'cobol' },
      { ...valid, openedAt: 0 },
      { ...valid, openedAt: -1 },
      { ...valid, openedAt: 1.5 },
      { ...valid, openedAt: '2026-11-24' },
      { ...valid, extra: true },
      { title: 'A+B', language: 'python3' },
    ]) {
      expect(isProblemMeta(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('makeMeta', () => {
  it('trims and shortens the page title', () => {
    expect(makeMeta('  A+B \n 문제 ', 'cpp17', 5)).toEqual({
      title: 'A+B 문제',
      language: 'cpp17',
      openedAt: 5,
    });
    const long = makeMeta('가'.repeat(500), 'java11', 5);
    expect(long.title).toHaveLength(MAX_TITLE_LENGTH);
    expect(isProblemMeta(long)).toBe(true);
  });
});

describe('backup of problem meta', () => {
  it('backs up valid meta and counts its problem, not as a setting', () => {
    const backup = createBackup({
      'meta:1000': valid,
      'meta:1001': { ...valid, language: 'cobol' },
      'meta:0': valid,
      'code:1000:python': 'print(1)',
      'meta:2000': valid,
    });
    expect(Object.keys(backup.items)).toEqual(['code:1000:python', 'meta:1000', 'meta:2000']);
    expect(summarizeBackup(backup.items)).toEqual({
      problems: 2,
      codes: 1,
      cases: 0,
      results: 0,
      settings: 0,
      exams: 0,
      submissions: 0,
    });
    expect(isBackupKey('meta:1000')).toBe(true);
    expect(isBackupKey('meta:abc')).toBe(false);
  });

  it('restores valid meta and skips invalid meta from a file', () => {
    const result = parseBackup(
      JSON.stringify({
        format: 'cote-in-baekjoon-backup',
        version: 1,
        items: {
          'meta:1000': valid,
          'meta:1001': { ...valid, title: 'x'.repeat(1000) },
          'meta:1002': { ...valid, openedAt: 'yesterday' },
        },
      }),
    );
    expect(result).toEqual({ ok: true, items: { 'meta:1000': valid }, skipped: 2 });
  });
});
