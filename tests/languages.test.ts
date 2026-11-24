import { GLUES } from '@/solution/glue';
import { describe, expect, it } from 'vitest';
import {
  BOJ_LANGUAGES,
  isKnownLanguageId,
  isSubmitLanguage,
  languageName,
  SUBMIT_LANGUAGES,
} from '@/boj/languages';
import { findBlockedPatterns } from '@/boj/waf';
import { isBackupKey } from '@/shared/backup';
import {
  isLanguageId,
  LANGUAGE_GROUPS,
  LANGUAGES,
  languageInfo,
  runsInBrowser,
  solutionLanguageReason,
  SUBMIT_ONLY_REASON,
  type LanguageId,
} from '@/shared/languages';
import { isRunRequest } from '@/shared/messages';
import { isSubmitRequestMessage } from '@/shared/submission';

/** Baekjoon language ids, checked against the status page's filter (2026-11-24, ADR-0007). */
const BOJ_IDS: Record<LanguageId, number> = {
  javascript: 17,
  typescript: 106,
  python3: 28,
  pypy3: 73,
  c99: 0,
  c11: 75,
  cpp14: 88,
  cpp17: 84,
  cpp20: 95,
  java8: 3,
  java11: 93,
  kotlin: 69,
  rust: 113,
  go: 12,
  swift: 74,
  csharp: 86,
  ruby: 68,
};

const SUBMIT_ONLY: LanguageId[] = ['kotlin', 'rust', 'go', 'swift', 'csharp', 'ruby'];

describe('language registry', () => {
  it('maps every IDE language to its Baekjoon language id', () => {
    expect(LANGUAGES.map((l) => l.id).sort()).toEqual(Object.keys(BOJ_IDS).sort());
    for (const l of LANGUAGES) {
      expect(l.bojId, l.id).toBe(BOJ_IDS[l.id]);
      expect(BOJ_LANGUAGES[l.id].id).toBe(l.bojId);
    }
    expect(languageInfo('java11')).toMatchObject({ engine: 'java', fileName: 'Main.java' });
    expect(languageInfo('java8')).toMatchObject({ engine: 'java', fileName: 'Main.java' });
  });

  it('runs C and C++ on clang with the standard of the language', () => {
    expect(languageInfo('c99').build).toEqual({ kind: 'clang', lang: 'c', std: 'gnu99' });
    expect(languageInfo('c11').build).toEqual({ kind: 'clang', lang: 'c', std: 'gnu11' });
    expect(languageInfo('cpp14').build).toEqual({ kind: 'clang', lang: 'c++', std: 'gnu++14' });
    expect(languageInfo('cpp17').build).toEqual({ kind: 'clang', lang: 'c++', std: 'gnu++17' });
    expect(languageInfo('cpp20').build).toEqual({ kind: 'clang', lang: 'c++', std: 'gnu++20' });
    for (const id of ['c99', 'c11', 'cpp14', 'cpp17', 'cpp20'] as const) {
      expect(languageInfo(id).engine).toBe('cpp');
    }
    expect(languageInfo('c11')).toMatchObject({ fileName: 'solution.c', syntax: 'c' });
  });

  it('runs TypeScript on the JavaScript engine after stripping types', () => {
    expect(languageInfo('typescript')).toMatchObject({
      engine: 'js',
      build: { kind: 'typescript' },
      fileName: 'solution.ts',
      syntax: 'typescript',
    });
    expect(languageInfo('javascript').build).toBeUndefined();
  });

  it('keeps submit-only languages without an engine', () => {
    for (const id of SUBMIT_ONLY) {
      expect(languageInfo(id).engine, id).toBeUndefined();
      expect(runsInBrowser(id)).toBe(false);
      expect(languageInfo(id).syntax).toBe(id);
    }
    expect(runsInBrowser('c11')).toBe(true);
    expect(SUBMIT_ONLY_REASON).toContain('브라우저에서 실행할 수 없어요');
  });

  it('groups the select into languages that run and submit-only ones', () => {
    expect(LANGUAGE_GROUPS.map((g) => g.label)).toEqual(['브라우저에서 실행', '제출만']);
    expect(LANGUAGE_GROUPS[1]?.languages.map((l) => l.id)).toEqual(SUBMIT_ONLY);
    const all = LANGUAGE_GROUPS.flatMap((g) => g.languages.map((l) => l.id));
    expect(all.sort()).toEqual(LANGUAGES.map((l) => l.id).sort());
  });

  it('shares saved code within Python, C++ and Java and nowhere else', () => {
    const groups = new Map<string, string[]>();
    for (const l of LANGUAGES) groups.set(l.codeGroup, [...(groups.get(l.codeGroup) ?? []), l.id]);
    expect(groups.get('python')).toEqual(['python3', 'pypy3']);
    expect(groups.get('cpp')).toEqual(['cpp14', 'cpp17', 'cpp20']);
    expect(groups.get('java')).toEqual(['java8', 'java11']);
    expect(groups.get('c')).toEqual(['c99', 'c11']);
    expect([...groups.values()].filter((ids) => ids.length > 1)).toHaveLength(4);
    // Backups keep the code of every language, in both modes.
    for (const group of groups.keys()) {
      expect(isBackupKey(`code:1000:${group}`), group).toBe(true);
      expect(isBackupKey(`code:1000:${group}:fn`), group).toBe(true);
    }
  });

  it('keeps the M1 storage key for JavaScript', () => {
    expect(languageInfo('javascript').codeGroup).toBe('javascript');
  });

  it('starts every language without a solution and without firewall-blocked text', () => {
    for (const l of LANGUAGES) {
      expect(l.starter, l.id).not.toBe('');
      expect(l.starter).not.toMatch(/a\s*\+\s*b/);
      expect(findBlockedPatterns(l.starter), l.id).toEqual([]);
    }
    expect(languageInfo('c11').starter).toContain('#include <stdio.h>');
    expect(languageInfo('kotlin').starter).toContain('fun main()');
    expect(languageInfo('kotlin').starter).toContain('BufferedReader');
    expect(languageInfo('rust').starter).toContain('std::io');
    expect(languageInfo('go').starter).toContain('bufio');
    expect(languageInfo('swift').starter).toContain('readLine()');
    expect(languageInfo('csharp').starter).toContain('Console.ReadLine');
    expect(languageInfo('ruby').starter).toContain('gets');
  });

  it('offers solution mode exactly where a glue language exists', () => {
    for (const l of LANGUAGES) {
      const glue = l.glue === undefined ? undefined : GLUES[l.glue];
      if (glue) expect(solutionLanguageReason(l.id), l.id).toBeUndefined();
      else expect(solutionLanguageReason(l.id), l.id).toMatch(/solution 함수를 쓸 수 없어/);
    }
    expect(languageInfo('cpp14').glue).toBe('cpp');
    expect(languageInfo('java8').glue).toBe('java');
    expect(languageInfo('typescript').glue).toBe('ts');
  });

  it('validates language ids', () => {
    expect(isLanguageId('cpp17')).toBe(true);
    expect(isLanguageId('java8')).toBe(true);
    expect(isLanguageId('kotlin')).toBe(true);
    expect(isLanguageId('cobol')).toBe(false);
    expect(isLanguageId('toString')).toBe(false);
  });
});

describe('Baekjoon language ids', () => {
  it('knows every language the IDE submits, including C99 (id 0)', () => {
    expect(SUBMIT_LANGUAGES).toHaveLength(LANGUAGES.length);
    expect(isKnownLanguageId(0)).toBe(true);
    expect(isKnownLanguageId(113)).toBe(true);
    expect(isKnownLanguageId(1)).toBe(false);
    expect(languageName(0)).toBe('C99');
    expect(languageName(69)).toBe('Kotlin (JVM)');
  });

  it('accepts submit requests in the new languages only by known keys', () => {
    expect(isSubmitLanguage('rust')).toBe(true);
    expect(isSubmitLanguage('constructor')).toBe(false);
    const message = { type: 'cib:submit-request', problemId: 1000, language: 'ruby', code: 'p 1' };
    expect(isSubmitRequestMessage(message)).toBe(true);
    expect(isSubmitRequestMessage({ ...message, language: 'cobol' })).toBe(false);
  });
});

describe('run requests', () => {
  const base = {
    type: 'cib:run',
    id: 1,
    language: 'python3',
    code: 'print(1)',
    stdin: '',
    timeLimitMs: 1000,
    runtimeBase: 'chrome-extension://id/runtime/',
  };

  it('accepts every IDE language with a runtime base', () => {
    expect(isRunRequest(base)).toBe(true);
    expect(isRunRequest({ ...base, language: 'cpp20' })).toBe(true);
    expect(isRunRequest({ ...base, language: 'typescript' })).toBe(true);
    expect(isRunRequest({ ...base, language: 'java8' })).toBe(true);
  });

  it('rejects unknown languages and missing runtime base', () => {
    expect(isRunRequest({ ...base, language: 'cobol' })).toBe(false);
    expect(isRunRequest({ ...base, runtimeBase: undefined })).toBe(false);
  });
});
