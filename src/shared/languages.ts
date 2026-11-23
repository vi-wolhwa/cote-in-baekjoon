/**
 * Languages offered in the IDE (M2). Each maps to a Baekjoon language for submission and to
 * an in-browser engine for "코드 실행".
 */
import { BOJ_LANGUAGES, type SubmitLanguage } from '@/boj/languages';

export type LanguageId = SubmitLanguage;

/** In-browser engine family; several Baekjoon languages can share one. */
export type EngineId = 'js' | 'python' | 'cpp' | 'java';

export interface LanguageInfo {
  id: LanguageId;
  /** Shown in the language select. */
  label: string;
  /** File tab name, like the coding-test screen. */
  fileName: string;
  engine: EngineId;
  /** Languages with the same group share saved code (Python 3 and PyPy3). */
  codeGroup: string;
  bojId: number;
  starter: string;
}

const PYTHON_STARTER = `import sys
input = sys.stdin.readline

`;

export const LANGUAGES: readonly LanguageInfo[] = [
  {
    id: 'cpp17',
    label: 'C++17',
    fileName: 'solution.cpp',
    engine: 'cpp',
    codeGroup: 'cpp',
    bojId: BOJ_LANGUAGES.cpp17.id,
    starter: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  },
  {
    id: 'python3',
    label: 'Python 3',
    fileName: 'solution.py',
    engine: 'python',
    codeGroup: 'python',
    bojId: BOJ_LANGUAGES.python3.id,
    starter: PYTHON_STARTER,
  },
  {
    id: 'pypy3',
    label: 'PyPy3',
    fileName: 'solution.py',
    engine: 'python',
    codeGroup: 'python',
    bojId: BOJ_LANGUAGES.pypy3.id,
    starter: PYTHON_STARTER,
  },
  {
    id: 'java11',
    label: 'Java 11',
    fileName: 'Main.java',
    engine: 'java',
    codeGroup: 'java',
    bojId: BOJ_LANGUAGES.java11.id,
    starter: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));

    }
}
`,
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    fileName: 'solution.js',
    engine: 'js',
    codeGroup: 'javascript',
    bojId: BOJ_LANGUAGES.javascript.id,
    starter: `const input = require('fs').readFileSync('/dev/stdin').toString().trim().split('\\n');

`,
  },
];

export const DEFAULT_LANGUAGE: LanguageId = 'javascript';

export function languageInfo(id: LanguageId): LanguageInfo {
  return LANGUAGES.find((l) => l.id === id) ?? (LANGUAGES.at(-1) as LanguageInfo);
}

export function isLanguageId(v: unknown): v is LanguageId {
  return typeof v === 'string' && LANGUAGES.some((l) => l.id === v);
}
