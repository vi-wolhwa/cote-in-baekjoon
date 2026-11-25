import { describe, expect, it } from 'vitest';
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
