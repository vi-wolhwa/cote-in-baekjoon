/**
 * Baekjoon language names in the 제출 기록 tab: which extension language a submission's code
 * loads into, and which syntax colours show it.
 */
import { BOJ_LANGUAGES, type SubmitLanguage } from '@/boj/languages';
import type { SyntaxId } from '@/shared/languages';

/** The extension language Baekjoon calls `name` ("C++17" → cpp17), if there is one. */
export function submitLanguageOfName(name: string): SubmitLanguage | undefined {
  const entry = Object.entries(BOJ_LANGUAGES).find(([, l]) => l.name === name);
  return entry?.[0] as SubmitLanguage | undefined;
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
  [/^Go/, 'go'],
  [/^Swift/, 'swift'],
  [/^Ruby/, 'ruby'],
];

/** Syntax colours for a Baekjoon language name; none for languages the editor lacks. */
export function syntaxOfName(name: string): SyntaxId | undefined {
  return SYNTAX_BY_NAME.find(([pattern]) => pattern.test(name))?.[1];
}
