import { describe, expect, it } from 'vitest';
import { findBlockedPatterns } from '@/boj/waf';

describe('findBlockedPatterns', () => {
  it('returns nothing for ordinary code', () => {
    const code = [
      "const input = require('fs').readFileSync('/dev/stdin').toString().trim().split(' ');",
      'const [a, b] = input.map(Number);',
      'for (let i = 0; i < a; i++) if (i <= b && b > 0) console.log(a + b);',
    ].join('\n');
    expect(findBlockedPatterns(code)).toEqual([]);
  });

  it('finds the listed literals case-insensitively, in order of appearance', () => {
    const code = 'let n = 3;\nwhile (n --> 0) {}\n// <!-- note\nconsole.log(Document.Cookie);';
    expect(findBlockedPatterns(code)).toEqual(['-->', '<!--', 'document.cookie']);
  });

  it('finds HTML-tag-like text', () => {
    expect(findBlockedPatterns('const s = "<script>";')).toEqual(['<script']);
    expect(findBlockedPatterns('const t = "<STYLE>";')).toEqual(['<STYLE']);
    expect(findBlockedPatterns('// vector<set<int>> v;')).toEqual(['<set<']);
    expect(findBlockedPatterns('x.innerHTML = 1')).toEqual(['.innerhtml']);
  });

  it('reports each snippet once', () => {
    expect(findBlockedPatterns('a --> b; c --> d;')).toEqual(['-->']);
  });

  it('skips very long input', () => {
    expect(findBlockedPatterns('<script'.padEnd(70_000, ' '))).toEqual([]);
  });
});
