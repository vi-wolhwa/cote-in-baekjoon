import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadTheme, saveTheme } from '@/ide/storage';
import { ideReportUrl } from '@/ide/report-link';
import { isBackupKey, parseBackup } from '@/shared/backup';
import { DEFAULT_THEME, isTheme, THEME_KEY, toTheme } from '@/shared/theme';

describe('theme values', () => {
  it('accepts only dark and light', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('light')).toBe(true);
    for (const v of ['Dark', 'blue', '', null, undefined, 1, {}]) expect(isTheme(v)).toBe(false);
  });

  it('falls back to dark', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(toTheme('light')).toBe('light');
    expect(toTheme('sepia')).toBe('dark');
    expect(toTheme(undefined)).toBe('dark');
  });
});

describe('theme storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('is dark until the user picks one', async () => {
    expect(await loadTheme()).toBe('dark');
  });

  it('keeps the choice under ui:theme', async () => {
    await saveTheme('light');
    expect(await fakeBrowser.storage.local.get(THEME_KEY)).toEqual({ 'ui:theme': 'light' });
    expect(await loadTheme()).toBe('light');
  });

  it('ignores a broken stored value', async () => {
    await fakeBrowser.storage.local.set({ 'ui:theme': 'neon' });
    expect(await loadTheme()).toBe('dark');
  });
});

describe('theme in backups', () => {
  const backup = (items: Record<string, unknown>) =>
    JSON.stringify({ format: 'cote-in-baekjoon-backup', version: 1, items });

  it('backs up and restores ui:theme', () => {
    expect(isBackupKey('ui:theme')).toBe(true);
    expect(parseBackup(backup({ 'ui:theme': 'light' }))).toMatchObject({
      ok: true,
      items: { 'ui:theme': 'light' },
      skipped: 0,
    });
  });

  it('drops an invalid theme', () => {
    expect(parseBackup(backup({ 'ui:theme': 'neon' }))).toMatchObject({
      ok: true,
      items: {},
      skipped: 1,
    });
  });
});

describe('IDE "문제 신고" link', () => {
  it('fills in the problem number and the language label', () => {
    const url = new URL(
      ideReportUrl({
        version: '0.3.0',
        browser: 'Edge 131',
        problemId: 1000,
        language: 'python3',
      }),
    );
    expect(url.origin + url.pathname).toBe(
      'https://github.com/vi-wolhwa/cote-in-baekjoon/issues/new',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: '1-bug.yml',
      version: '0.3.0 / Edge 131',
      problem: '1000',
      language: 'Python 3',
    });
  });

  it('leaves the demo problem out', () => {
    const url = new URL(
      ideReportUrl({
        version: '0.3.0',
        browser: 'Chrome 131',
        problemId: 0,
        language: 'cpp17',
      }),
    );
    expect(url.searchParams.has('problem')).toBe(false);
    expect(url.searchParams.get('language')).toBe('C++17');
  });
});
