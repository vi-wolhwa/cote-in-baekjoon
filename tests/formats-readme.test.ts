import { describe, expect, it } from 'vitest';
import { htmlToText, normalizeSample } from '../scripts/formats/lib/html-text.ts';
import {
  classifyHeading,
  extractBlock,
  parseReadme,
  readmeMatchesId,
} from '../scripts/formats/lib/readme.ts';

/*
 * Synthetic READMEs that mirror the two layouts the collector reads. The problem
 * text is made up for these tests; no real Baekjoon problem text is used.
 */
const HUB_README = `# [Bronze V] 테스트 덧셈 - 9001

[문제 링크](https://www.acmicpc.net/problem/9001)

### 성능 요약

메모리: 1000 KB, 시간: 10 ms

### 분류

수학

### 문제 설명

<p>두 수를 더한다.</p>

### 입력

 <p>첫째 줄에 정수 A와 B가 주어진다. (0 &lt; A, B &lt; 10)</p>

### 출력

 <p>첫째 줄에 A+B를 출력한다.</p>
`;

const SAMPLE_README = `# [9002. 테스트 곱셈](https://www.acmicpc.net/problem/9002)

## 문제
두 수를 곱한다.

## 예제 입력 1
\`\`\`
2 3
\`\`\`

## 예제 출력 1
\`\`\`
6
\`\`\`

## 예제 입력 2
\`\`\`
# 7
  1 1
\`\`\`

## 예제 출력 2
\`\`\`
1
\`\`\`

## 제출 정보
| 난이도 | 언어 |
|--------|------|
| Bronze 5 | C++17 |
`;

describe('classifyHeading', () => {
  it('recognises description and sample headings', () => {
    expect(classifyHeading('입력 ')).toEqual({ kind: 'input' });
    expect(classifyHeading('출력')).toEqual({ kind: 'output' });
    expect(classifyHeading('**입력**')).toEqual({ kind: 'input' });
    expect(classifyHeading('제한')).toEqual({ kind: 'constraints' });
    expect(classifyHeading('예제 입력 2')).toEqual({ kind: 'sample-in', n: 2 });
    expect(classifyHeading('예제 출력')).toEqual({ kind: 'sample-out', n: 1 });
    expect(classifyHeading('문제 설명')).toEqual({ kind: 'other' });
    expect(classifyHeading('입력 예시 풀이')).toEqual({ kind: 'other' });
  });
});

describe('parseReadme', () => {
  it('reads BaekjoonHub sections as plain text', () => {
    const r = parseReadme(HUB_README);
    expect(r.linkedId).toBe(9001);
    expect(r.input).toBe('첫째 줄에 정수 A와 B가 주어진다. (0 < A, B < 10)');
    expect(r.output).toBe('첫째 줄에 A+B를 출력한다.');
    expect(r.samples).toEqual([]);
    expect(readmeMatchesId(r, 9001)).toBe(true);
    expect(readmeMatchesId(r, 9002)).toBe(false);
  });

  it('reads samples from code fences, keeping `#` lines inside them', () => {
    const r = parseReadme(SAMPLE_README);
    expect(r.input).toBeNull();
    expect(r.samples).toEqual([
      { input: '2 3', output: '6' },
      { input: '# 7\n  1 1', output: '1' },
    ]);
  });

  it('pairs samples by number and drops unpaired ones', () => {
    const md =
      '## 예제 입력 1\n```\n1\n```\n## 예제 입력 2\n```\n2\n```\n## 예제 출력 2\n```\n4\n```\n';
    expect(parseReadme(md).samples).toEqual([{ input: '2', output: '4' }]);
  });

  it("reads BaekjoonHub's Empty placeholder as an empty section", () => {
    const r = parseReadme('# x - 9004\n### 입력\n\n Empty\n\n### 출력\n\n <p>A</p>\n');
    expect(r.input).toBe('');
    expect(r.output).toBe('A');
  });

  it('matches the id from the first heading when there is no link', () => {
    const r = parseReadme('# 9003번: 테스트\n### 입력\n<p>N</p>\n### 출력\n<p>M</p>\n');
    expect(readmeMatchesId(r, 9003)).toBe(true);
    expect(readmeMatchesId(r, 900)).toBe(false);
    expect(readmeMatchesId(r, 9003, '테스트')).toBe(true);
    // Another judge's problem with the same number.
    expect(readmeMatchesId(r, 9003, '다른 문제')).toBe(false);
  });
});

describe('extractBlock', () => {
  it('reads a <pre> block and decodes its entities', () => {
    expect(extractBlock('<pre>a &lt; b\r\n1 2  \n</pre>')).toBe('a < b\n1 2');
  });

  it('drops the quote marker of a quoted block but keeps a real ">" sample', () => {
    expect(extractBlock('> <pre>\n3\n1 2 3\n> </pre>\n')).toBe('3\n1 2 3');
    expect(extractBlock('<pre>&gt;\n</pre>')).toBe('>');
  });

  it('keeps entity-like text in Markdown fences as written', () => {
    expect(extractBlock('```text\n&lt;\n```')).toBe('&lt;');
  });

  it('returns null without a block', () => {
    expect(extractBlock('설명만 있음')).toBeNull();
  });
});

describe('htmlToText', () => {
  it('keeps paragraph breaks, list items, sup/sub and entities', () => {
    expect(
      htmlToText(
        '<p>N (1 &le; N &le; 10<sup>5</sup>)</p><ul><li>a<sub>i</sub></li><li>b</li></ul>',
      ),
    ).toBe('N (1 ≤ N ≤ 10^5)\n\n- a_i\n- b');
  });

  it('turns <br> into a line break and collapses spaces', () => {
    expect(htmlToText('첫째   줄<br/>둘째&nbsp;줄')).toBe('첫째 줄\n둘째 줄');
  });
});

describe('normalizeSample', () => {
  it('drops CR, trailing spaces and outer blank lines but keeps inner spacing', () => {
    expect(normalizeSample('\n 1  2 \r\n3\n\n')).toBe(' 1  2\n3');
  });

  it('drops zero-width spaces and an indent shared by every line of a copied block', () => {
    expect(normalizeSample('    3\u200B\n    1\u00A02\n\n    4')).toBe('3\n1 2\n\n4');
    expect(normalizeSample('  *\n ***', false)).toBe('  *\n ***');
    expect(normalizeSample('7\u200B', false)).toBe('7\u200B');
  });
});
