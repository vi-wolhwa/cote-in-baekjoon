import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HELP_SECTIONS, helpMarkdown, inlineParts } from '@/shared/help-content';

describe('docs/help.md', () => {
  it('is generated from src/shared/help-content.ts (run `npm run help:md`)', () => {
    const file = readFileSync('docs/help.md', 'utf8').replace(/\r\n/g, '\n');
    expect(file).toBe(helpMarkdown());
  });

  it('has the sections in order with their questions', () => {
    const md = helpMarkdown();
    expect(md.startsWith('# 자주 묻는 질문과 해결 방법\n')).toBe(true);
    const headings = md.split('\n').filter((l) => l.startsWith('## '));
    expect(headings).toEqual(HELP_SECTIONS.map((s) => `## ${s.title}`));
    expect(md).toContain('- **메모리**: 메모리 제한은 검사하지 않습니다.');
    expect(md).toContain('issues/new?template=2-run-diff.yml');
  });
});

describe('HELP_SECTIONS', () => {
  it('has unique anchor ids', () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/);
  });

  it('reports run differences with the run-diff form and the rest as bugs', () => {
    for (const s of HELP_SECTIONS) expect(s.report).toBe(s.id === 'run-diff' ? 'run-diff' : 'bug');
  });
});

describe('inlineParts', () => {
  it('splits code, bold and links from plain text', () => {
    expect(inlineParts('a `b` **c** [d](https://e.example/f) g')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'code', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'strong', text: 'c' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'd', href: 'https://e.example/f' },
      { kind: 'text', text: ' g' },
    ]);
  });

  it('keeps HTML and non-https links as plain text', () => {
    expect(inlineParts('<img src=x> [x](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '<img src=x> [x](javascript:alert(1))' },
    ]);
  });
});
