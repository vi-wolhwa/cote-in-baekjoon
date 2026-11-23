import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  createBackup,
  isBackupKey,
  parseBackup,
  planRestore,
  summarizeBackup,
} from '@/shared/backup';

const judge = {
  problemId: 1000,
  solutionId: 5,
  status: 'done',
  resultText: '맞았습니다!!',
  resultCode: 'ac',
  memoryKb: 2020,
  timeMs: 0,
  updatedAt: 1,
};

const stored: Record<string, unknown> = {
  'code:1000:javascript': 'console.log(1)',
  'code:1000:python': 'print(1)',
  'cases:1000': [{ input: '1 2', output: '3' }],
  'judge:1000': judge,
  'code:2557:cpp': 'int main(){}',
  'ui:keymap': 'vim',
  'ui:split': { horizontal: 40, vertical: 60 },
  'ui:auto-submit': true,
  'ui:language': 'python3',
  // Not backed up: internal or invalid.
  'cib:pending:1000': { code: 'x' },
  'judge:2000': judge,
  'ui:keymap-old': 'vim',
};

describe('createBackup', () => {
  it('keeps code, cases, results and settings only', () => {
    const backup = createBackup(stored, new Date('2026-11-24T00:00:00Z'));
    expect(backup.format).toBe('cote-in-baekjoon-backup');
    expect(backup.exportedAt).toBe('2026-11-24T00:00:00.000Z');
    expect(Object.keys(backup.items)).toEqual([
      'cases:1000',
      'code:1000:javascript',
      'code:1000:python',
      'code:2557:cpp',
      'judge:1000',
      'ui:auto-submit',
      'ui:keymap',
      'ui:language',
      'ui:split',
    ]);
  });

  it('summarizes by problem', () => {
    expect(summarizeBackup(createBackup(stored).items)).toEqual({
      problems: 2,
      codes: 3,
      cases: 1,
      results: 1,
      settings: 4,
    });
  });
});

describe('parseBackup', () => {
  it('reads a file it wrote', () => {
    const backup = createBackup(stored);
    const result = parseBackup(JSON.stringify(backup));
    expect(result).toEqual({
      ok: true,
      items: backup.items,
      skipped: 0,
      exportedAt: backup.exportedAt,
    });
  });

  it('drops invalid entries and counts them', () => {
    const result = parseBackup(
      JSON.stringify({
        format: 'cote-in-baekjoon-backup',
        version: 1,
        items: {
          'code:1000:javascript': 'ok',
          'code:1000:javascript:extra': 'x',
          'code:0:javascript': 'x',
          'cases:1000': [{ input: 1 }],
          'judge:1001': judge,
          'ui:keymap': 'notepad',
          'cib:watch:1000': {},
        },
      }),
    );
    expect(result).toMatchObject({ ok: true, items: { 'code:1000:javascript': 'ok' } });
    expect(result.ok && result.skipped).toBe(6);
  });

  it('refuses files that are not backups', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, reason: 'JSON 파일이 아닙니다.' });
    expect(parseBackup('{"items":{}}')).toMatchObject({ ok: false });
    expect(parseBackup('[]')).toMatchObject({ ok: false });
  });

  it('refuses backups from a newer version', () => {
    const result = parseBackup(
      JSON.stringify({ format: 'cote-in-baekjoon-backup', version: 2, items: {} }),
    );
    expect(result).toMatchObject({ ok: false });
  });
});

describe('planRestore', () => {
  const current = {
    'code:1000:javascript': 'mine',
    'code:3000:python': 'only here',
    'ui:keymap': 'emacs',
    'cib:pending:1000': {},
  };
  const items = { 'code:1000:javascript': 'backup', 'code:2557:cpp': 'new', 'ui:keymap': 'vim' };

  it('merge keeps existing data and adds the rest', () => {
    expect(planRestore(current, items, 'merge')).toEqual({
      set: { 'code:2557:cpp': 'new' },
      remove: [],
    });
  });

  it('replace writes the backup and removes other backed-up keys only', () => {
    expect(planRestore(current, items, 'replace')).toEqual({
      set: items,
      remove: ['code:3000:python'],
    });
  });
});

describe('helpers', () => {
  it('knows which keys are backed up', () => {
    expect(isBackupKey('code:1:javascript')).toBe(true);
    expect(isBackupKey('cib:submit-window:1')).toBe(false);
  });

  it('names the file with the local date', () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe('코딩테스트-in-백준-백업-2026-01-05.json');
  });
});
