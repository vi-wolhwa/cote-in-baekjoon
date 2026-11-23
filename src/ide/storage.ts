/**
 * Per-user state kept in chrome.storage.local (PRD F9). Nothing leaves the browser.
 */
import type { Sample } from '@/boj/problem';
import { DEFAULT_LANGUAGE, isLanguageId, type LanguageId } from '@/shared/languages';
import { makeMeta, metaKey } from '@/shared/problem-meta';
import { THEME_KEY, toTheme, type Theme } from '@/shared/theme';

export type Keymap = 'sublime' | 'vim' | 'emacs';
export const KEYMAPS: Keymap[] = ['sublime', 'vim', 'emacs'];

export interface SplitSizes {
  /** Problem pane width in percent of the main area. */
  horizontal: number;
  /** Editor height in percent of the run area. */
  vertical: number;
}

export const DEFAULT_SPLIT: SplitSizes = { horizontal: 40, vertical: 60 };

/** `group` is LanguageInfo.codeGroup (JavaScript keeps its M1 key `code:{id}:javascript`). */
const codeKey = (problemId: number, group: string) => `code:${problemId}:${group}`;
const casesKey = (problemId: number) => `cases:${problemId}`;
const KEYMAP_KEY = 'ui:keymap';
const SPLIT_KEY = 'ui:split';

async function get(key: string): Promise<unknown> {
  const items = await browser.storage.local.get(key);
  return items[key];
}

export async function loadCode(problemId: number, language: string): Promise<string | undefined> {
  const v = await get(codeKey(problemId, language));
  return typeof v === 'string' ? v : undefined;
}

export function saveCode(problemId: number, language: string, code: string) {
  return browser.storage.local.set({ [codeKey(problemId, language)]: code });
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
