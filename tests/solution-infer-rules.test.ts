/**
 * Rules added to format inference for #124, one synthetic problem each (statements and
 * samples written for these tests; none is Baekjoon text). Each test checks the part of the
 * format the rule decides.
 */
import { describe, expect, it } from 'vitest';
import type { Sample } from '@/boj/problem';
import { formatToJson, type Format } from '@/solution/dsl';
import { inferCandidates, inferFormat } from '@/solution/infer';
import { unprintable } from '@/solution/infer-ret';
import {
  arrayLetters,
  errorTolerance,
  fixedCounts,
  INT_LIMIT,
  maxBound,
  scalarNames,
  sentenceLine,
  sentences,
  textHints,
} from '@/solution/infer-text';
import { cueName } from '@/solution/infer-vocab';

const s = (input: string, output: string): Sample => ({ input, output });

function infer(input: string, output: string, samples: Sample[]): Format {
  const f = inferFormat({ samples, inputHtml: `<p>${input}</p>`, outputHtml: `<p>${output}</p>` });
  if (!f) throw new Error('no format');
  return f;
}

const json = (f: Format) => JSON.parse(formatToJson(f)) as Record<string, unknown>;

describe('text', () => {
  it('reads 2^31-1 as the int limit', () => {
    expect(maxBound('2^31-1보다 작거나 같다')).toBe(INT_LIMIT);
    expect(maxBound('2^31 - 1')).toBe(INT_LIMIT);
  });

  it('finds sizes the text states', () => {
    expect([...fixedCounts('둘째 줄에 5개의 정수가 주어진다')]).toContain(5);
    expect([...fixedCounts('총 다섯 줄의 입력이 주어진다')]).toContain(5);
    expect([...fixedCounts('첫째 줄부터 열 번째 줄까지 수가 주어진다')]).toContain(10);
    expect([...fixedCounts('세 정수가 주어진다')]).not.toContain(3);
    expect([...fixedCounts('세 정수가 주어진다', true)]).toContain(3);
  });

  it('names numbered scalars and skips labels', () => {
    expect(scalarNames('첫째 줄에 x_1, y_1, x_2, y_2가 주어진다')).toEqual([
      'x1',
      'y1',
      'x2',
      'y2',
    ]);
    expect(scalarNames('첫째 줄에 P_1의 좌표 x_1, y_1이 주어진다')).toEqual(['x1', 'y1']);
    expect(scalarNames('첫째 줄에 X사의 요금 A가 주어진다')).toEqual(['A']);
    expect(scalarNames('N개의 줄에 K가 주어진다', { counts: false })).toEqual(['K']);
  });

  it('finds array letters the text names in words', () => {
    expect(arrayLetters('첫째 줄에 수열 A의 크기 N이 주어진다')).toEqual(['A']);
    expect(arrayLetters('둘째 줄에는 B에 있는 수가 주어진다')).toEqual(['B']);
    expect(arrayLetters('x_1, y_1이 주어진다')).toEqual([]);
  });

  it('splits clauses about different lines and reads more ordinals', () => {
    expect(sentences('첫째 줄에 N, 둘째 줄에 M이 주어진다.')).toEqual([
      '첫째 줄에 N',
      '둘째 줄에 M이 주어진다',
    ]);
    expect(sentenceLine('2행에는 B가 주어진다')).toBe(2);
    expect(sentenceLine('세 번째 행에는 C가 주어진다')).toBe(3);
  });

  it('reads 64-bit, int-bounded and modulo answers', () => {
    expect(textHints('', '<p>답은 long long 범위이다.</p>').wide).toBe(true);
    expect(textHints('', '<p>답은 2^31-1 이하이다.</p>').intAnswer).toBe(true);
    expect(textHints('', '<p>1,000,000,007로 나눈 나머지를 출력한다.</p>').intAnswer).toBe(true);
  });

  it('suggests array names from the words of a sentence', () => {
    expect(cueName('다음 N개의 줄에 각 통나무의 높이가 주어진다')).toBe('heights');
    expect(cueName('다음 M개의 줄에 간선의 정보와 비용이 주어진다', true)).toBe('edges');
    expect(cueName('다음 M개의 줄에 간선의 정보와 비용이 주어진다')).toBe('costs');
  });
});

describe('layout', () => {
  it('reads a line the text names value by value as scalars', () => {
    const f = infer('첫째 줄에 x, y, w, h가 주어진다.', '답을 출력한다.', [s('6 2 10 3\n', '1\n')]);
    expect(f.lines).toEqual([['x', 'y', 'w', 'h']]);
  });

  it('reads as many lines as the text says from the first line', () => {
    const f = infer(
      '첫째 줄부터 일곱 번째 줄까지 한 줄에 하나의 자연수가 주어진다.',
      '합을 출력한다.',
      [s('3\n8\n1\n9\n4\n6\n2\n', '33\n')],
    );
    expect(f.lines).toEqual([{ repeat: 7, of: 'arr' }]);
  });

  it('gives an array the size the text states', () => {
    const f = infer('첫째 줄에 다섯 개의 자연수가 주어진다.', '최솟값을 출력한다.', [
      s('4 8 1 9 3\n', '1\n'),
    ]);
    expect(f.params).toEqual([{ name: 'arr', type: 'int[]', len: 5 }]);
  });

  it('keeps blocks of the same rows together', () => {
    const f = infer(
      '첫째 줄에 N과 M이 주어진다. 둘째 줄부터 M개의 줄에 간선의 양 끝점 u와 v가 주어진다.',
      '답을 출력한다.',
      [s('2 5\n1 2\n2 3\n3 4\n4 5\n5 1\n', '3\n')],
    );
    expect(f.lines).toEqual([['n', 'm'], { repeat: 'm', of: 'edges' }]);
  });

  it('reads rows of digits as a character grid when another number is their width', () => {
    const f = infer(
      '첫째 줄에 N과 M이 주어진다. 둘째 줄부터 N개의 줄에 M자리 수가 주어진다.',
      '답을 출력한다.',
      [s('2 3\n123\n456\n', '7\n')],
    );
    expect(f.params[2]).toEqual({ name: 'board', type: 'char[][]', cols: 'm' });
  });

  it('reads words one per line as strings, not a grid', () => {
    const f = infer(
      '첫째 줄에 단어의 개수 N이 주어진다. 둘째 줄부터 N개의 줄에 단어가 하나씩 주어진다.',
      '가장 긴 단어의 길이를 출력한다.',
      [s('3\nabc\nxyz\npqr\n', '3\n')],
    );
    expect(f.params[1]?.type).toBe('string[]');
  });

  it('reads long digit strings and numbers past 64 bits as text', () => {
    const zero = infer('첫째 줄에 0과 1로 이루어진 문자열 S가 주어진다.', '답을 출력한다.', [
      s('0011\n', '2\n'),
    ]);
    expect(zero.params).toEqual([{ name: 's', type: 'string' }]);
    const huge = infer('첫째 줄에 A와 B가 주어진다. (0 ≤ A, B ≤ 10^10000)', 'A+B를 출력한다.', [
      s('1 2\n', '3\n'),
      s('99999999999999999999 1\n', '100000000000000000000\n'),
    ]);
    expect(json(huge)).toMatchObject({
      params: [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'string' },
      ],
      ret: { type: 'string' },
    });
  });
});

describe('cases', () => {
  it('reads the test case count as cases, not as rows of a block', () => {
    const f = infer(
      '첫째 줄에 테스트 데이터의 수 T가 주어진다. 다음 T개의 줄에 두 정수 A와 B가 주어진다.',
      '각 테스트 데이터마다 A+B를 출력한다.',
      [s('3\n1 2\n3 4\n5 6\n', '3\n7\n11\n')],
    );
    expect(f.cases).toEqual({ count: 'T' });
    expect(f.lines).toEqual([['a', 'b']]);
  });

  it('stops at an end line the text mentions', () => {
    const f = infer(
      '입력은 여러 줄로 이루어져 있다. 각 줄에 A와 B가 주어진다. 입력의 마지막에는 0 두 개가 들어온다.',
      '각 줄마다 A+B를 출력한다.',
      [s('1 2\n3 4\n0 0\n', '3\n7\n')],
    );
    expect(f.cases).toEqual({ until: '0 0' });
  });
});

describe('return value', () => {
  it('keeps int answers within int when the input is large', () => {
    const f = infer(
      '첫째 줄에 N이 주어진다. (1 ≤ N ≤ 1,000,000,000)',
      'N의 자릿수 합을 출력한다.',
      [s('123\n', '6\n')],
    );
    expect(f.ret).toEqual({ type: 'int' });
  });

  it('reads two answers the description names as true and false', () => {
    const f = infer(
      '첫째 줄에 N이 주어진다.',
      '가능하면 "Nice"를, 그렇지 않으면 "Sad"를 출력한다.',
      [s('4\n', 'Nice\n')],
    );
    expect(f.ret).toEqual({ type: 'bool', yes: 'Nice', no: 'Sad' });
    const winner = infer(
      '첫째 줄에 N이 주어진다.',
      '먼저 이기면 SK를, 나중에 이기면 CY를 출력한다.',
      [s('5\n', 'SK\n'), s('4\n', 'CY\n')],
    );
    expect(winner.ret).toEqual({ type: 'string' });
  });

  it('gives up on outputs a solution cannot print alone', () => {
    expect(unprintable([s('2\n1 2\n3 4\n', 'Case #1: 3\nCase #2: 7\n')])).toBe(true);
    expect(unprintable([s('5\n', '3\n1 2 3\n')])).toBe(true);
    // A readable error bound is printable (a double with `tol`); an unreadable one is not.
    expect(unprintable([s('1 3\n', '0.333333\n')], '절대오차가 10^-6 이하이면 정답이다')).toBe(
      false,
    );
    expect(unprintable([s('1 3\n', '0.333333\n')], '오차가 작으면 정답이다')).toBe(true);
    expect(unprintable([s('3\n1\n2\n3\n', '1\n2\n3\n')])).toBe(false);
  });

  it('reads the allowed error of real answers', () => {
    expect(errorTolerance('절대/상대 오차가 10^-6 이하이면 정답이다')).toBe(1e-6);
    expect(errorTolerance('정답과의 오차는 10-9까지 허용한다')).toBe(1e-9);
    expect(errorTolerance('absolute error up to 1e-4 is accepted')).toBe(1e-4);
    expect(errorTolerance('10^-6 이하로 출력한다')).toBeUndefined();
    expect(errorTolerance('오차가 작으면 정답이다')).toBeUndefined();
  });

  it('prints real answers with an error bound as a double with tol', () => {
    const [best] = inferCandidates({
      samples: [s('1 3\n', '0.333333\n'), s('2 3\n', '0.6666666667\n')],
      inputHtml: '<p>두 정수 A와 B가 주어진다.</p>',
      outputHtml:
        '<p>A/B를 출력한다. 실제 정답과 출력값의 절대오차 또는 상대오차가 10<sup>-9</sup> 이하이면 정답이다.</p>',
    });
    expect(best?.format.ret).toEqual({ type: 'double', digits: 10, tol: 1e-9 });
  });
});
