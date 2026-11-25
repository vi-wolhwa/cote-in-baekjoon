/**
 * Per-user state kept in chrome.storage.local (PRD F9). Nothing leaves the browser.
 */
import type { Sample } from '@/boj/problem';
import { DEFAULT_LANGUAGE, isLanguageId, type LanguageId } from '@/shared/languages';
import { makeMeta, metaKey } from '@/shared/problem-meta';
import type { Format } from '@/solution/dsl';
import { THEME_KEY, toTheme, type Theme } from '@/shared/theme';
import { parseTimer, timerKey, type TimerState } from './timer';

export type Keymap = 'sublime' | 'vim' | 'emacs';
export const KEYMAPS: Keymap[] = ['sublime', 'vim', 'emacs'];

export interface SplitSizes {
  /** Problem pane width in percent of the main area. */
  horizontal: number;
  /** Editor height in percent of the run area. */
  vertical: number;
}

export const DEFAULT_SPLIT: SplitSizes = { horizontal: 40, vertical: 60 };

/**
 * `group` is LanguageInfo.codeGroup (JavaScript keeps its M1 key `code:{id}:javascript`).
 * Solution-function mode keeps its code apart, under `code:{id}:{group}:fn` (codeGroupFor).
 */
const codeKey = (problemId: number, group: string) => `code:${problemId}:${group}`;
const formatKey = (problemId: number) => `format:${problemId}`;
export const SOLUTION_KEY = 'ui:solution';

/** The storage group of a language's code in a mode: standard I/O or solution function. */
export function codeGroupFor(group: string, fn: boolean): string {
  return fn ? `${group}:fn` : group;
}
const casesKey = (problemId: number) => `cases:${problemId}`;
const KEYMAP_KEY = 'ui:keymap';
const SPLIT_KEY = 'ui:split';

async function get(key: string): Promise<unknown> {
  const items = await browser.storage.local.get(key);
  return items[key];
}

/**
 * How long the practice IDE restores a draft after its last save: enough to come back from a
 * tab closed by mistake, not to keep old code around (ADR-0012 개정 3, product owner
 * 2026-11-25). The mock exam keeps its drafts for the whole exam.
 */
export const DRAFT_TTL_MS = 3 * 60 * 60 * 1000;

/** A saved draft: the code and when it was saved. Older versions saved the plain string. */
interface Draft {
  code: string;
  savedAt: number;
}

function isDraft(v: unknown): v is Draft {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Draft).code === 'string' &&
    typeof (v as Draft).savedAt === 'number'
  );
}

/** The draft of a language group, if one was saved within `maxAgeMs` (any age without it). */
export async function loadCode(
  problemId: number,
  language: string,
  maxAgeMs?: number,
  now = Date.now(),
): Promise<string | undefined> {
  const v = await get(codeKey(problemId, language));
  if (typeof v === 'string') return maxAgeMs === undefined ? v : undefined;
  if (!isDraft(v)) return undefined;
  return maxAgeMs === undefined || now - v.savedAt <= maxAgeMs ? v.code : undefined;
}

export function saveCode(problemId: number, language: string, code: string, now = Date.now()) {
  const draft: Draft = { code, savedAt: now };
  return browser.storage.local.set({ [codeKey(problemId, language)]: draft });
}

export function clearCode(problemId: number, language: string) {
  return browser.storage.local.remove(codeKey(problemId, language));
}

export async function loadCases(problemId: number): Promise<Sample[]> {
  const v = await get(casesKey(problemId));
  if (!Array.isArray(v)) return [];
  return v.filter(
    (c): c is Sample =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as Sample).input === 'string' &&
      typeof (c as Sample).output === 'string',
  );
}

export function saveCases(problemId: number, cases: Sample[]) {
  return browser.storage.local.set({ [casesKey(problemId)]: cases });
}

export async function loadKeymap(): Promise<Keymap> {
  const v = await get(KEYMAP_KEY);
  return KEYMAPS.includes(v as Keymap) ? (v as Keymap) : 'sublime';
}

export function saveKeymap(keymap: Keymap) {
  return browser.storage.local.set({ [KEYMAP_KEY]: keymap });
}

export async function loadSplit(): Promise<SplitSizes> {
  const v = (await get(SPLIT_KEY)) as Partial<SplitSizes> | undefined;
  const valid = (n: unknown) => typeof n === 'number' && n >= 0 && n <= 100;
  return {
    horizontal: valid(v?.horizontal) ? (v?.horizontal as number) : DEFAULT_SPLIT.horizontal,
    vertical: valid(v?.vertical) ? (v?.vertical as number) : DEFAULT_SPLIT.vertical,
  };
}

export function saveSplit(sizes: SplitSizes) {
  return browser.storage.local.set({ [SPLIT_KEY]: sizes });
}

const LANGUAGE_KEY = 'ui:language';

/** The language picked last; new problems open in it. */
export async function loadLanguage(): Promise<LanguageId> {
  const v = await get(LANGUAGE_KEY);
  return isLanguageId(v) ? v : DEFAULT_LANGUAGE;
}

export function saveLanguage(language: LanguageId) {
  return browser.storage.local.set({ [LANGUAGE_KEY]: language });
}

export async function loadTheme(): Promise<Theme> {
  return toTheme(await get(THEME_KEY));
}

export function saveTheme(theme: Theme) {
  return browser.storage.local.set({ [THEME_KEY]: theme });
}

/** Title and language for the toolbar popup (#79). `openedAt` is when the IDE opened it. */
export function saveMeta(problemId: number, title: string, language: LanguageId, openedAt: number) {
  return browser.storage.local.set({ [metaKey(problemId)]: makeMeta(title, language, openedAt) });
}

/**
 * Stopwatch/timer per problem (`timer:{id}`). The demo problem (id 0) is not stored.
 */
export async function loadTimer(problemId: number): Promise<TimerState | undefined> {
  if (problemId <= 0) return undefined;
  return parseTimer(await get(timerKey(problemId)));
}

export function saveTimer(problemId: number, state: TimerState) {
  if (problemId <= 0) return Promise.resolve();
  return browser.storage.local.set({ [timerKey(problemId)]: state });
}

/** The format the user saved for a problem (`format:{id}`), raw: validate before use. */
export async function loadUserFormat(problemId: number): Promise<unknown> {
  return get(formatKey(problemId));
}

export function saveUserFormat(problemId: number, format: Format) {
  return browser.storage.local.set({ [formatKey(problemId)]: format });
}

export function clearUserFormat(problemId: number) {
  return browser.storage.local.remove(formatKey(problemId));
}

/** 'solution 함수' on or off. Like the language, the last choice applies to every problem. */
export async function loadSolutionMode(): Promise<boolean> {
  const v = await get(SOLUTION_KEY);
  return typeof v === 'boolean' ? v : true;
}

export function saveSolutionMode(on: boolean) {
  return browser.storage.local.set({ [SOLUTION_KEY]: on });
}
