/**
 * Baekjoon language ids: the `value` of each `<option>` in the language select on the
 * submit and status pages. Checked against the public status page's filter select
 * (2026-11-23).
 */
export const BOJ_LANGUAGES = {
  javascript: { id: 17, name: 'node.js' },
  python3: { id: 28, name: 'Python 3' },
  pypy3: { id: 73, name: 'PyPy3' },
  cpp17: { id: 84, name: 'C++17' },
  java11: { id: 93, name: 'Java 11' },
} as const;

export type BojLanguageKey = keyof typeof BOJ_LANGUAGES;

/** Languages the IDE can run and submit (M2: JavaScript, Python, C++; M3: Java). */
export type SubmitLanguage = 'javascript' | 'python3' | 'pypy3' | 'cpp17' | 'java11';

export const SUBMIT_LANGUAGES: readonly SubmitLanguage[] = [
  'javascript',
  'python3',
  'pypy3',
  'cpp17',
  'java11',
];

export function isSubmitLanguage(v: unknown): v is SubmitLanguage {
  return typeof v === 'string' && (SUBMIT_LANGUAGES as readonly string[]).includes(v);
}

const KNOWN_IDS: ReadonlySet<number> = new Set(Object.values(BOJ_LANGUAGES).map((l) => l.id));

export function isKnownLanguageId(v: unknown): v is number {
  return typeof v === 'number' && KNOWN_IDS.has(v);
}

export function languageName(id: number): string | undefined {
  return Object.values(BOJ_LANGUAGES).find((l) => l.id === id)?.name;
}
