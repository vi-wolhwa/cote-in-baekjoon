/**
 * Backup and restore of the data in `storage.local` (#42): code, test cases, judge results,
 * problem meta (#79) and settings. Uninstalling the extension deletes that data, so users can keep a JSON file.
 *
 * Kept free of extension APIs so the parsing and the restore plan can be unit tested. The
 * backup file is untrusted input: every key and value is checked before it is stored.
 */
import { MAX_CODE_LENGTH } from '@/boj/submit-fill';
import { isProblemMeta } from '@/shared/problem-meta';
import { isJudgeResult } from '@/shared/submission';
import { isTheme, THEME_KEY } from '@/shared/theme';

export const BACKUP_FORMAT = 'cote-in-baekjoon-backup';
export const BACKUP_VERSION = 1;
/** Larger files are refused before parsing. */
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  items: Record<string, unknown>;
}

export interface BackupSummary {
  problems: number;
  codes: number;
  cases: number;
  results: number;
  settings: number;
}

/** 'replace': the backup becomes the whole data. 'merge': keep what exists, add the rest. */
export type RestoreMode = 'replace' | 'merge';

export interface RestorePlan {
  set: Record<string, unknown>;
  remove: string[];
}

export type ParseResult =
  | { ok: true; items: Record<string, unknown>; skipped: number; exportedAt?: string }
  | { ok: false; reason: string };

const PROBLEM_ID = '[1-9]\\d{0,6}';
const CODE_KEY = new RegExp(`^code:${PROBLEM_ID}:[a-z0-9]{1,20}$`);
const CASES_KEY = new RegExp(`^cases:${PROBLEM_ID}$`);
const JUDGE_KEY = new RegExp(`^judge:(${PROBLEM_ID})$`);
const META_KEY = new RegExp(`^meta:${PROBLEM_ID}$`);
const MAX_CASES = 1000;
const MAX_CASE_LENGTH = 4 * 1024 * 1024;

const SETTINGS: Record<string, (v: unknown) => boolean> = {
  'ui:keymap': (v) => v === 'sublime' || v === 'vim' || v === 'emacs',
  'ui:split': (v) =>
    isObject(v) && isPercent(v.horizontal) && isPercent(v.vertical) && Object.keys(v).length === 2,
  'ui:language': (v) => typeof v === 'string' && /^[a-z0-9]{1,20}$/.test(v),
  [THEME_KEY]: isTheme,
};

/** Keys older versions wrote; a backup that has them restores without them, silently. */
const RETIRED_KEYS = new Set(['ui:auto-submit']);

/** True for keys that belong in a backup. Session-only and internal keys are left out. */
export function isBackupKey(key: string): boolean {
  return (
    CODE_KEY.test(key) ||
    CASES_KEY.test(key) ||
    JUDGE_KEY.test(key) ||
    META_KEY.test(key) ||
    key in SETTINGS
  );
}

/** True when `value` is a valid value for `key`. */
export function isValidEntry(key: string, value: unknown): boolean {
  if (CODE_KEY.test(key)) return typeof value === 'string' && value.length <= MAX_CODE_LENGTH;
  if (CASES_KEY.test(key)) return isCases(value);
  const judge = JUDGE_KEY.exec(key);
  if (judge) return isJudgeResult(value) && value.problemId === Number(judge[1]);
  if (META_KEY.test(key)) return isProblemMeta(value);
  const setting = SETTINGS[key];
  return setting ? setting(value) : false;
}

export function createBackup(all: Record<string, unknown>, now = new Date()): BackupFile {
  const items: Record<string, unknown> = {};
  for (const key of Object.keys(all).sort()) {
    if (isValidEntry(key, all[key])) items[key] = all[key];
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), items };
}

/** `코딩테스트-in-백준-백업-2026-11-24.json` in local time. */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `코딩테스트-in-백준-백업-${date}.json`;
}

/** Reads a backup file. Invalid entries are dropped and counted in `skipped`. */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'JSON 파일이 아닙니다.' };
  }
  if (!isObject(data) || data.format !== BACKUP_FORMAT || !isObject(data.items)) {
    return { ok: false, reason: '코딩테스트 in 백준 백업 파일이 아닙니다.' };
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    return {
      ok: false,
      reason: '더 새 버전에서 만든 백업입니다. 확장 프로그램을 업데이트한 뒤 다시 시도해 주세요.',
    };
  }
  const items: Record<string, unknown> = {};
  let skipped = 0;
  for (const [key, value] of Object.entries(data.items)) {
    if (RETIRED_KEYS.has(key)) continue;
    if (isValidEntry(key, value)) items[key] = value;
    else skipped++;
  }
  const exportedAt = typeof data.exportedAt === 'string' ? data.exportedAt : undefined;
  return { ok: true, items, skipped, exportedAt };
}

/** "문제 2개 (코드 3개, 테스트 케이스 1개, 채점 결과 1개), 설정 3개" */
export function describeSummary(s: BackupSummary): string {
  return `문제 ${s.problems}개 (코드 ${s.codes}개, 테스트 케이스 ${s.cases}개, 채점 결과 ${s.results}개), 설정 ${s.settings}개`;
}

export function summarizeBackup(items: Record<string, unknown>): BackupSummary {
  const problems = new Set<string>();
  const summary: BackupSummary = { problems: 0, codes: 0, cases: 0, results: 0, settings: 0 };
  for (const key of Object.keys(items)) {
    const [kind, problem] = key.split(':');
    if (kind === 'code') summary.codes++;
    else if (kind === 'cases') summary.cases++;
    else if (kind === 'judge') summary.results++;
    else if (kind === 'ui') summary.settings++;
    if (kind !== 'ui' && problem) problems.add(problem);
  }
  summary.problems = problems.size;
  return summary;
}

/**
 * What to write for a restore. `current` is everything in `storage.local`.
 * - replace: removes every backup-type key that is not in the backup, then writes the backup.
 * - merge: writes only keys that do not exist yet; existing code and settings are kept.
 */
export function planRestore(
  current: Record<string, unknown>,
  items: Record<string, unknown>,
  mode: RestoreMode,
): RestorePlan {
  if (mode === 'replace') {
    return {
      set: { ...items },
      remove: Object.keys(current).filter((k) => isBackupKey(k) && !(k in items)),
    };
  }
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(items)) {
    if (!(key in current)) set[key] = value;
  }
  return { set, remove: [] };
}

function isCases(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length <= MAX_CASES &&
    v.every(
      (c) =>
        isObject(c) &&
        typeof c.input === 'string' &&
        typeof c.output === 'string' &&
        c.input.length <= MAX_CASE_LENGTH &&
        c.output.length <= MAX_CASE_LENGTH,
    )
  );
}

function isPercent(v: unknown): boolean {
  return typeof v === 'number' && v >= 0 && v <= 100;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
