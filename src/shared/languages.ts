/**
 * Languages offered in the IDE (M2, M3, M6: ADR-0004, ADR-0007). Each maps to a Baekjoon
 * language for submission. Languages with an engine also run in the browser ('코드 실행');
 * the rest are submit only.
 */
import { BOJ_LANGUAGES, type SubmitLanguage } from '@/boj/languages';
import type { BuildOptions } from '@/runner/engine';
import type { GlueId } from '@/solution/glue/types';
import { LANGUAGE_STARTERS } from './starters';

export type LanguageId = SubmitLanguage;

/** In-browser engine family; several Baekjoon languages can share one. */
export type EngineId = 'js' | 'python' | 'cpp' | 'java';

/** Editor syntax highlighting. */
export type SyntaxId =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'c'
  | 'cpp'
  | 'java'
  | 'kotlin'
  | 'rust'
  | 'go'
  | 'swift'
  | 'csharp'
  | 'ruby';

export interface LanguageInfo {
  id: LanguageId;
  /** Shown in the language select. */
  label: string;
  /** File tab name, like the coding-test screen. */
  fileName: string;
  /** In-browser engine family; none for submit-only languages. */
  engine?: EngineId;
  /** How the engine builds this language (compiler standard, TypeScript stripping). */
  build?: BuildOptions;
  syntax: SyntaxId;
  /** Glue family for the solution-function mode; none where its glue does not apply. */
  glue?: GlueId;
  /** Languages with the same group share saved code (Python 3 and PyPy3, C++14/17/20). */
  codeGroup: string;
  bojId: number;
  starter: string;
}

type Entry = Omit<LanguageInfo, 'bojId' | 'starter' | 'syntax'> & { syntax?: SyntaxId };

const clang = (lang: 'c' | 'c++', std: string): BuildOptions => ({ kind: 'clang', lang, std });
const C = {
  fileName: 'solution.c',
  engine: 'cpp',
  syntax: 'c',
  glue: 'c',
  codeGroup: 'c',
} as const;
const CPP = { fileName: 'solution.cpp', engine: 'cpp', glue: 'cpp', codeGroup: 'cpp' } as const;
const PYTHON = {
  fileName: 'solution.py',
  engine: 'python',
  glue: 'python',
  codeGroup: 'python',
} as const;
const JAVA = { fileName: 'Main.java', engine: 'java', glue: 'java', codeGroup: 'java' } as const;

/** Order of the language select: languages that run first, then submit-only ones. */
const ENTRIES: readonly Entry[] = [
  { id: 'c99', label: 'C99', ...C, build: clang('c', 'gnu99') },
  { id: 'c11', label: 'C11', ...C, build: clang('c', 'gnu11') },
  { id: 'cpp14', label: 'C++14', ...CPP, build: clang('c++', 'gnu++14') },
  { id: 'cpp17', label: 'C++17', ...CPP, build: clang('c++', 'gnu++17') },
  { id: 'cpp20', label: 'C++20', ...CPP, build: clang('c++', 'gnu++20') },
  { id: 'python3', label: 'Python 3', ...PYTHON },
  { id: 'pypy3', label: 'PyPy3', ...PYTHON },
  { id: 'java8', label: 'Java 8', ...JAVA },
  { id: 'java11', label: 'Java 11', ...JAVA },
  { id: 'javascript', label: 'JavaScript', fileName: 'solution.js', engine: 'js', glue: 'js' },
  {
    id: 'typescript',
    label: 'TypeScript',
    fileName: 'solution.ts',
    engine: 'js',
    glue: 'ts',
    build: { kind: 'typescript' },
  },
  { id: 'kotlin', label: 'Kotlin (JVM)', fileName: 'solution.kt' },
  { id: 'rust', label: 'Rust 2021', fileName: 'solution.rs' },
  { id: 'go', label: 'Go', fileName: 'solution.go' },
  { id: 'swift', label: 'Swift', fileName: 'solution.swift' },
  { id: 'csharp', label: 'C#', fileName: 'solution.cs' },
  { id: 'ruby', label: 'Ruby', fileName: 'solution.rb' },
].map((e) => ({ codeGroup: e.id, ...e }) as Entry);

export const LANGUAGES: readonly LanguageInfo[] = ENTRIES.map((e) => ({
  ...e,
  syntax: e.syntax ?? defaultSyntax(e),
  bojId: BOJ_LANGUAGES[e.id].id,
  starter: LANGUAGE_STARTERS[e.codeGroup] ?? '',
}));

function defaultSyntax(e: Entry): SyntaxId {
  if (e.engine === 'js') return e.id === 'typescript' ? 'typescript' : 'javascript';
  if (e.engine) return e.engine;
  return e.id as SyntaxId;
}

export const DEFAULT_LANGUAGE: LanguageId = 'javascript';

export function languageInfo(id: LanguageId): LanguageInfo {
  return (
    LANGUAGES.find((l) => l.id === id) ??
    (LANGUAGES.find((l) => l.id === DEFAULT_LANGUAGE) as LanguageInfo)
  );
}

export function isLanguageId(v: unknown): v is LanguageId {
  return typeof v === 'string' && LANGUAGES.some((l) => l.id === v);
}

/** Whether '코드 실행' can run this language in the browser. */
export function runsInBrowser(id: LanguageId): boolean {
  return languageInfo(id).engine !== undefined;
}

/** Shown instead of running a submit-only language. */
export const SUBMIT_ONLY_REASON =
  '이 언어는 브라우저에서 실행할 수 없어요. 제출하면 백준이 채점해요';

/** Why the solution-function mode is off for a language, or undefined when it works. */
export function solutionLanguageReason(id: LanguageId): string | undefined {
  const info = languageInfo(id);
  if (info.glue) return undefined;
  return `${info.label}에서는 solution 함수를 쓸 수 없어 표준 입출력으로 풀어요`;
}

/** The language select's groups (ide-spec §4). */
export const LANGUAGE_GROUPS: readonly { label: string; languages: readonly LanguageInfo[] }[] = [
  { label: '브라우저에서 실행', languages: LANGUAGES.filter((l) => l.engine) },
  { label: '제출만', languages: LANGUAGES.filter((l) => !l.engine) },
];
