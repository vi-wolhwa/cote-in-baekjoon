import { describe, expect, it } from 'vitest';
import { BOJ_LANGUAGES } from '@/boj/languages';
import { LANGUAGES, isLanguageId, languageInfo } from '@/shared/languages';
import { isRunRequest } from '@/shared/messages';

describe('language registry', () => {
  it('maps every IDE language to a Baekjoon language id', () => {
    expect(languageInfo('cpp17')).toMatchObject({ bojId: BOJ_LANGUAGES.cpp17.id, engine: 'cpp' });
    expect(languageInfo('python3')).toMatchObject({ bojId: 28, engine: 'python' });
    expect(languageInfo('pypy3')).toMatchObject({ bojId: 73, engine: 'python' });
    expect(languageInfo('javascript')).toMatchObject({ bojId: 17, engine: 'js' });
    expect(languageInfo('java11')).toMatchObject({
      bojId: BOJ_LANGUAGES.java11.id,
      engine: 'java',
      fileName: 'Main.java',
    });
  });

  it('lets Python 3 and PyPy3 share saved code', () => {
    expect(languageInfo('python3').codeGroup).toBe(languageInfo('pypy3').codeGroup);
    expect(new Set(LANGUAGES.map((l) => l.codeGroup)).size).toBe(LANGUAGES.length - 1);
  });

  it('keeps the M1 storage key for JavaScript', () => {
    expect(languageInfo('javascript').codeGroup).toBe('javascript');
  });

  it('starts every language without a solution', () => {
    for (const l of LANGUAGES) expect(l.starter).not.toMatch(/a\s*\+\s*b/);
  });

  it('validates language ids', () => {
    expect(isLanguageId('cpp17')).toBe(true);
    expect(isLanguageId('java11')).toBe(true);
    expect(isLanguageId('kotlin')).toBe(false);
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
    expect(isRunRequest({ ...base, language: 'cpp17' })).toBe(true);
    expect(isRunRequest({ ...base, language: 'java11' })).toBe(true);
  });

  it('rejects unknown languages and missing runtime base', () => {
    expect(isRunRequest({ ...base, language: 'kotlin' })).toBe(false);
    expect(isRunRequest({ ...base, runtimeBase: undefined })).toBe(false);
  });
});
