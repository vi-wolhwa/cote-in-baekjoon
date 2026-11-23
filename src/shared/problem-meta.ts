/**
 * What the toolbar popup shows about a problem the user opened in the IDE (#79): its
 * title, the language picked last, and when it was opened. Kept under `meta:{id}` in
 * `storage.local` and included in backups.
 *
 * The title comes from the Baekjoon page, so it is untrusted text: it is only ever shown
 * as text, never as HTML.
 */
import { isLanguageId, type LanguageId } from '@/shared/languages';

export interface ProblemMeta {
  title: string;
  language: LanguageId;
  /** When the IDE last opened the problem, in milliseconds since the epoch. */
  openedAt: number;
}

export const MAX_TITLE_LENGTH = 200;
const MAX_PROBLEM_ID = 9_999_999;

/** `storage.local`: the problem's meta. */
export const metaKey = (problemId: number) => `meta:${problemId}`;

export function isProblemId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_PROBLEM_ID;
}

export function isProblemMeta(v: unknown): v is ProblemMeta {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.title === 'string' &&
    m.title.length <= MAX_TITLE_LENGTH &&
    isLanguageId(m.language) &&
    typeof m.openedAt === 'number' &&
    Number.isSafeInteger(m.openedAt) &&
    m.openedAt > 0 &&
    Object.keys(m).length === 3
  );
}

/** A meta value that passes isProblemMeta: the title is trimmed and shortened. */
export function makeMeta(title: string, language: LanguageId, openedAt: number): ProblemMeta {
  const clean = title.replace(/\s+/g, ' ').trim();
  return { title: clean.slice(0, MAX_TITLE_LENGTH), language, openedAt };
}
