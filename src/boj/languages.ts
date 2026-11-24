/**
 * Baekjoon language ids: the `value` of each `<option>` in the language select on the
 * submit and status pages. Checked against the public status page's filter select
 * (2026-11-23; M6 languages 2026-11-24, ADR-0007). C99's id is 0: never test it for truth.
 */
export const BOJ_LANGUAGES = {
  javascript: { id: 17, name: 'node.js' },
  typescript: { id: 106, name: 'TypeScript' },
  python3: { id: 28, name: 'Python 3' },
  pypy3: { id: 73, name: 'PyPy3' },
  c99: { id: 0, name: 'C99' },
  c11: { id: 75, name: 'C11' },
  cpp14: { id: 88, name: 'C++14' },
  cpp17: { id: 84, name: 'C++17' },
  cpp20: { id: 95, name: 'C++20' },
  java8: { id: 3, name: 'Java 8' },
  java11: { id: 93, name: 'Java 11' },
  kotlin: { id: 69, name: 'Kotlin (JVM)' },
  rust: { id: 113, name: 'Rust 2021' },
  go: { id: 12, name: 'Go' },
  swift: { id: 74, name: 'Swift' },
  csharp: { id: 86, name: 'C#' },
  ruby: { id: 68, name: 'Ruby' },
} as const;

export type BojLanguageKey = keyof typeof BOJ_LANGUAGES;

/**
 * Languages the IDE submits (M2: JavaScript, Python, C++; M3: Java; M6: the rest, ADR-0007).
 * Which of them also run in the browser is LanguageInfo.engine.
 */
export type SubmitLanguage = BojLanguageKey;

export const SUBMIT_LANGUAGES = Object.keys(BOJ_LANGUAGES) as readonly SubmitLanguage[];

export function isSubmitLanguage(v: unknown): v is SubmitLanguage {
  return typeof v === 'string' && Object.hasOwn(BOJ_LANGUAGES, v);
}

const KNOWN_IDS: ReadonlySet<number> = new Set(Object.values(BOJ_LANGUAGES).map((l) => l.id));

export function isKnownLanguageId(v: unknown): v is number {
  return typeof v === 'number' && KNOWN_IDS.has(v);
}

export function languageName(id: number): string | undefined {
  return Object.values(BOJ_LANGUAGES).find((l) => l.id === id)?.name;
}
