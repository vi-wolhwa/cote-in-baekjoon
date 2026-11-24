// @vitest-environment happy-dom
/**
 * Statement translation (ADR-0010): structure, math and code survive; blocks whose markers the
 * translator loses fall back to piece-by-piece translation; the language guess from scripts.
 */
import { describe, expect, it } from 'vitest';
import { guessLanguage, statementText, translateHtml } from '@/ide/translate/html';

/** A fake translator that marks what it translated and keeps markers like `[0]`. */
const fake = async (text: string) => `«${text}»`;

describe('translateHtml', () => {
  it('translates a paragraph as one sentence, keeping math, code and sub/superscripts', async () => {
    const html =
      '<p>Given <b>two</b> integers $A$ and \\(B\\), print <code>A+B</code> mod 10<sup>9</sup>.</p>';
    const seen: string[] = [];
    const out = await translateHtml(html, async (t) => {
      seen.push(t);
      return fake(t);
    });
    expect(seen).toEqual(['Given two integers [3] and [5], print [7] mod 10[9].']);
    expect(out).toBe(
      '<p>«Given two integers $A$ and \\(B\\), print <code>A+B</code> mod 10<sup>9</sup>.»</p>',
    );
  });

  it('translates list items and cells on their own and leaves pre blocks alone', async () => {
    const html =
      '<ul><li>First rule</li><li>Second rule</li></ul><pre>1 2</pre><table><tr><td>Name</td></tr></table>';
    const out = await translateHtml(html, fake);
    expect(out).toContain('<ul><li>«First rule»</li><li>«Second rule»</li></ul><pre>1 2</pre>');
    expect(out).toContain('<td>«Name»</td>');
  });

  it('translates text without any block element', async () => {
    expect(await translateHtml('Print the answer.', fake)).toBe('«Print the answer.»');
  });

  it('falls back to piece by piece when the translator drops a marker', async () => {
    const out = await translateHtml('<p>Read $N$ and print it.</p>', async (t) =>
      t.includes('[') ? 'N을 읽고 출력한다.' : `«${t}»`,
    );
    expect(out).toBe('<p>«Read» $N$ «and print it.»</p>');
  });

  it('does not translate math or numbers alone', async () => {
    const calls: string[] = [];
    await translateHtml('<p>$1 \\le N \\le 100$</p><p>1 2 3</p>', async (t) => {
      calls.push(t);
      return t;
    });
    expect(calls).toEqual([]);
  });
});

describe('language guess', () => {
  it('tells Korean, English, Japanese and Chinese apart by script', () => {
    expect(
      guessLanguage('두 정수 A와 B를 입력받은 다음, A+B를 출력하는 프로그램을 작성하시오.'),
    ).toBe('ko');
    expect(guessLanguage('Write a program that reads two integers and prints their sum.')).toBe(
      'en',
    );
    expect(
      guessLanguage('二つの整数を読み込んで、その和を出力するプログラムを書いてください。'),
    ).toBe('ja');
    expect(guessLanguage('编写一个程序，读入两个整数并输出它们的和，这是一个简单的问题。')).toBe(
      'zh',
    );
    expect(guessLanguage('A B')).toBeUndefined();
  });

  it('reads statement text without code and math', () => {
    expect(statementText('<p>Print $N$ values</p><pre>1 2</pre><code>x</code>')).toBe(
      'Print values',
    );
  });
});
