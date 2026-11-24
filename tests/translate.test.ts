// @vitest-environment happy-dom
/**
 * Statement translation (ADR-0010): structure, math and code stay in their place in the
 * sentence; blocks whose markers the translator loses fall back to piece-by-piece translation;
 * web translation batches the paragraphs; the language guess from scripts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  guessLanguage,
  statementText,
  translateHtml,
  type TranslateMany,
} from '@/ide/translate/html';
import { finalSound, fitParticle } from '@/ide/translate/josa';
import { webTranslate } from '@/ide/translate/web';

/** A fake translator that marks what it translated and keeps the markers. */
const fake: TranslateMany = async (texts) => texts.map((t) => `«${t}»`);

describe('translateHtml', () => {
  it('translates a paragraph as one sentence with code and math markers in place', async () => {
    const html =
      '<p>Given <b>two</b> integers $A$ and \\(B\\), print <code>A+B</code> mod 10<sup>9</sup>.</p>';
    const seen: string[] = [];
    const out = await translateHtml(html, async (texts) => {
      seen.push(...texts);
      return fake(texts);
    });
    expect(seen).toEqual(['Given two integers ZQX3 and ZQX5, print ZQX7 mod 10ZQX9.']);
    expect(out).toBe(
      '<p>«Given two integers $A$ and \\(B\\), print <code>A+B</code> mod 10<sup>9</sup>.»</p>',
    );
  });

  it('puts markers back where the translation moved them (word order of Korean)', async () => {
    const out = await translateHtml('<p>Print <code>YES</code> if $N$ is even.</p>', async () => [
      'ZQX3이 짝수이면 ZQX1을 출력한다.',
    ]);
    expect(out).toBe('<p>$N$이 짝수이면 <code>YES</code>를 출력한다.</p>');
  });

  it('sends every block of a section in one call and leaves pre blocks alone', async () => {
    const calls: string[][] = [];
    const html =
      '<ul><li>First rule</li><li>Second rule</li></ul><pre>1 2</pre><table><tr><td>Name</td></tr></table>';
    const out = await translateHtml(html, async (texts) => {
      calls.push(texts);
      return fake(texts);
    });
    expect(calls).toEqual([['First rule', 'Second rule', 'Name']]);
    expect(out).toContain('<ul><li>«First rule»</li><li>«Second rule»</li></ul><pre>1 2</pre>');
    expect(out).toContain('<td>«Name»</td>');
  });

  it('translates text without any block element', async () => {
    expect(await translateHtml('Print the answer.', fake)).toBe('«Print the answer.»');
  });

  it('falls back to piece by piece, in order, when the translator drops a marker', async () => {
    const out = await translateHtml(
      '<p>Read $N$ and print <code>N</code> again.</p>',
      async (texts) => texts.map((t) => (t.includes('ZQX') ? 'N을 읽고 출력한다.' : `«${t}»`)),
    );
    expect(out).toBe('<p>«Read» $N$ «and print» <code>N</code> «again.»</p>');
  });

  it('does not translate math or numbers alone', async () => {
    const calls: string[][] = [];
    await translateHtml('<p>$1 \\le N \\le 100$</p><p>1 2 3</p>', async (texts) => {
      calls.push(texts);
      return texts;
    });
    expect(calls).toEqual([]);
  });
});

describe('webTranslate', () => {
  afterEach(() => vi.unstubAllGlobals());

  const reply = (lines: string[], detected = 'en') =>
    new Response(JSON.stringify([lines.map((l) => [l, '']), null, detected]), { status: 200 });

  it('sends the texts as lines of one request and splits the answer', async () => {
    const fetchMock = vi.fn(async () => reply(['가\n', '나']));
    vi.stubGlobal('fetch', fetchMock);
    expect(await webTranslate(['a', 'b'])).toEqual({ texts: ['가', '나'], detected: 'en' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('tl=ko');
    expect(String(init.body)).toBe('q=a%0Ab');
  });

  it('sends texts one by one when the lines do not come back one for one', async () => {
    const answers = [reply(['가나']), reply(['가']), reply(['나'])];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answers.shift() as Response),
    );
    expect((await webTranslate(['a', 'b'])).texts).toEqual(['가', '나']);
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

describe('particles after code and math', () => {
  it('reads how a piece ends', () => {
    expect(finalSound('N')).toBe('consonant');
    expect(finalSound('S')).toBe('vowel');
    expect(finalSound('L')).toBe('rieul');
    expect(finalSound('YES')).toBe('vowel');
    expect(finalSound('sum')).toBe('consonant');
    expect(finalSound('printf')).toBe('vowel');
    expect(finalSound(String.raw`$1 \le N \le 10^5$`)).toBe('vowel');
    expect(finalSound('$10^3$')).toBe('consonant');
    expect(finalSound('$x_1$')).toBe('rieul');
  });

  it('fits the particle to the piece, leaving words alone', () => {
    expect(fitParticle('YES', '을 출력한다')).toBe('를 출력한다');
    expect(fitParticle('N', '가 주어진다')).toBe('이 주어진다');
    expect(fitParticle('b', '으로 나눈다')).toBe('로 나눈다');
    expect(fitParticle('L', '로 나눈다')).toBe('로 나눈다');
    expect(fitParticle('M', '와 같다')).toBe('과 같다');
    expect(fitParticle('S', '이면 된다')).toBe('이면 된다');
    expect(fitParticle('?', '을 출력한다')).toBe('을 출력한다');
  });
});
