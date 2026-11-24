import { describe, expect, it } from 'vitest';
import { HELP_SECTIONS, HELP_SUGGESTIONS, type HelpSection } from '@/shared/help-content';
import { highlight, normalize, plainText, queryTerms, searchHelp } from '@/shared/help-search';

const ids = (query: string, sections?: readonly HelpSection[]) =>
  searchHelp(query, sections).map((hit) => hit.section.id);

describe('normalize', () => {
  it('lower-cases, composes Hangul and collapses spaces', () => {
    // "자동" written as separate jamo (NFD) still matches the composed text.
    expect(normalize('  JAVA\t\n자동   제출 ')).toBe('java 자동 제출');
    expect(normalize('자동')).toBe('자동');
  });

  it('splits a query into distinct words', () => {
    expect(queryTerms(' C++  예외 c++ ')).toEqual(['c++', '예외']);
    expect(queryTerms('   ')).toEqual([]);
  });

  it('reads help text without its inline marks', () => {
    expect(plainText('**시간**: `throw` [링크](https://e.example/x)')).toBe('시간: throw 링크');
  });
});

describe('searchHelp', () => {
  it('returns every section in page order for an empty query', () => {
    const hits = searchHelp('  ');
    expect(hits.map((h) => h.section.id)).toEqual(HELP_SECTIONS.map((s) => s.id));
    expect(hits.every((h, i) => h.items === HELP_SECTIONS[i]?.items)).toBe(true);
  });

  it('returns nothing when no section has the words', () => {
    expect(searchHelp('블록체인')).toEqual([]);
  });

  it('needs every word of a multi-word query in the same section', () => {
    expect(ids('c++')).toEqual(['languages', 'run-diff', 'solution-function', 'slow-start']);
    expect(ids('C++ 예외')).toEqual(['run-diff']);
    expect(ids('c++ 블록체인')).toEqual([]);
  });

  it('is case-insensitive and ignores spaces inside the text', () => {
    expect(ids('JAVA')).toEqual(ids('java'));
    expect(ids('자동제출')).toContain('auto-submit');
  });

  it('finds sections by their keywords', () => {
    expect(ids('캡차')).toEqual(['auto-submit']);
    expect(ids('코드 사라짐')).toEqual(['code-lost']);
    expect(ids('시간 초과')).toEqual(['run-diff']);
    // A keyword answers the question: the whole section is shown.
    const [hit] = searchHelp('캡차');
    expect(hit?.items).toEqual(HELP_SECTIONS.find((s) => s.id === 'auto-submit')?.items);
  });

  it('ranks title matches first', () => {
    const sections: HelpSection[] = [
      { id: 'body', title: '다른 질문', items: ['여기에 백업 이야기가 있어요'], report: 'bug' },
      { id: 'keyword', title: '저장', items: ['내용'], keywords: ['백업'], report: 'bug' },
      { id: 'title', title: '백업이 안 돼요', items: ['내용'], report: 'bug' },
    ];
    expect(ids('백업', sections)).toEqual(['title', 'keyword', 'body']);
    expect(searchHelp('백업', sections)[0]?.titleMatch).toBe(true);
  });

  it('shows only the items with a word, unless the title answers the query', () => {
    const [runDiff] = searchHelp('재귀');
    expect(runDiff?.section.id).toBe('run-diff');
    expect(runDiff?.items).toHaveLength(1);
    expect(runDiff?.items[0]).toContain('재귀 깊이');

    const [noButton] = searchHelp('버튼이 안 보여요');
    expect(noButton?.section.id).toBe('no-button');
    expect(noButton?.titleMatch).toBe(true);
    expect(noButton?.items).toHaveLength(3);
  });

  it('finds something for every suggested keyword', () => {
    for (const word of HELP_SUGGESTIONS) expect(ids(word), word).not.toEqual([]);
    expect(ids('자동 제출')[0]).toBe('auto-submit');
    expect(ids('채점 결과')[0]).toBe('judge-result');
    expect(ids('코드 백업')[0]).toBe('code-lost');
    expect(ids('언어 추가')[0]).toBe('auto-submit');
  });
});

describe('highlight', () => {
  it('marks every occurrence of each word, case-insensitively', () => {
    expect(highlight('Java와 java', ['java'])).toEqual([
      { text: 'Java', mark: true },
      { text: '와 ', mark: false },
      { text: 'java', mark: true },
    ]);
  });

  it('merges overlapping matches', () => {
    expect(highlight('자동 제출', ['자동 제', '제출'])).toEqual([
      { text: '자동 제출', mark: true },
    ]);
  });

  it('returns the text unmarked when nothing matches', () => {
    expect(highlight('<b>x</b>', ['y'])).toEqual([{ text: '<b>x</b>', mark: false }]);
    expect(highlight('abc', [])).toEqual([{ text: 'abc', mark: false }]);
    expect(highlight('', ['a'])).toEqual([]);
  });
});
