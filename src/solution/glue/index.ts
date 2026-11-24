/**
 * The glue languages of the solution-function mode (ADR-0006): prefix, glue, starting code
 * and file name per glue family. Adding a language: one file here and one entry below.
 */
import { maskNonCode } from '@/runner/java/preprocess';
import { cppStarter, javaStarter, jsStarter, pythonStarter } from './base-starters';
import { cLanguage } from './c';
import { CPP_PREFIX, cppGlue } from './cpp';
import { JAVA_PREFIX, javaGlue, unpublicSolution } from './java';
import { jsGlue } from './js';
import { pythonGlue } from './python';
import { tsLanguage } from './ts';
import type { GlueId, GlueLanguage } from './types';

export type { GlueId, GlueLanguage } from './types';

export const GLUES: Partial<Record<GlueId, GlueLanguage>> = {
  js: { prefix: '', glue: jsGlue, starter: jsStarter, fileName: 'solution.js' },
  ts: tsLanguage,
  python: { prefix: '', glue: pythonGlue, starter: pythonStarter, fileName: 'solution.py' },
  c: cLanguage,
  cpp: { prefix: CPP_PREFIX, glue: cppGlue, starter: cppStarter, fileName: 'solution.cpp' },
  java: {
    prefix: JAVA_PREFIX,
    user: (code) => unpublicSolution(code, maskNonCode(code)),
    glue: javaGlue,
    starter: javaStarter,
    fileName: 'Solution.java',
  },
};

export function glueLanguage(id: GlueId): GlueLanguage {
  const language = GLUES[id];
  if (!language) throw new Error(`solution 함수 연결 코드가 없는 언어예요: ${id}`);
  return language;
}
