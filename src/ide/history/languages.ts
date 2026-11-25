/**
 * Baekjoon language names in the 제출 기록 tab: which extension language a submission's code
 * loads into, and which syntax colours show it.
 */
import { BOJ_LANGUAGES, type SubmitLanguage } from '@/boj/languages';
import type { SyntaxId } from '@/shared/languages';

/**
 * The nearest extension language for the other Baekjoon names of a family: another
 * compiler or standard of C, C++ or Java, or another Rust edition. Checked in order.
 */
const FAMILY: [RegExp, SubmitLanguage][] = [
  [/^C\+\+(14|11|98)\b/, 'cpp14'],
  [/^C\+\+(20|23|26)\b/, 'cpp20'],
  [/^C\+\+/, 'cpp17'],
  [/^C(99|90)\b/, 'c99'],
  [/^C(11|2x)\b/, 'c11'],
  [/^Java 8\b/, 'java8'],
  [/^Java/, 'java11'],
  [/^Rust/, 'rust'],
  [/^Go\b/, 'go'],
  [/^Python 3/, 'python3'],
];

/**
 * The extension language for Baekjoon's name `name` ("C++17" → cpp17, "C++17 (Clang)" →
 * cpp17, "Java 15" → java11), if the extension has one of its family.
 */
export function submitLanguageOfName(name: string): SubmitLanguage | undefined {
  const entry = Object.entries(BOJ_LANGUAGES).find(([, l]) => l.name === name);
  if (entry) return entry[0] as SubmitLanguage;
  return FAMILY.find(([pattern]) => pattern.test(name))?.[1];
}

const SYNTAX_BY_NAME: [RegExp, SyntaxId][] = [
  [/^C\+\+|^Objective-C\+\+/, 'cpp'],
  [/^C(\d|$| \()/, 'c'],
  [/^C#/, 'csharp'],
  [/^Java/, 'java'],
  [/^Kotlin/, 'kotlin'],
  [/^(Python|PyPy)/, 'python'],
  [/^TypeScript/, 'typescript'],
  [/^(node\.js|Rhino|JavaScript)/, 'javascript'],
  [/^Rust/, 'rust'],
  [/^Go($| )/, 'go'],
  [/^Swift/, 'swift'],
  [/^Ruby/, 'ruby'],
];

/** Syntax colours for a Baekjoon language name; none for languages the editor lacks. */
export function syntaxOfName(name: string): SyntaxId | undefined {
  return SYNTAX_BY_NAME.find(([pattern]) => pattern.test(name))?.[1];
}
