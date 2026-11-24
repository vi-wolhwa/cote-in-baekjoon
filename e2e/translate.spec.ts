import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { problemHtml } from './exam-helpers';

/**
 * Translation of a foreign-language statement (ADR-0010). Web translation is answered by a fake
 * service (marks what it translated, keeps the markers), and the browser's on-device translator
 * is a fake too, so these tests check the flow: automatic web translation, switching to the
 * original and keeping that choice, and the on-device fallback when web translation fails.
 */

const ENGLISH = problemHtml
  .replace(
    '<p>정수 \\(A\\)와 \\(B\\)를 더한다.</p>',
    '<p>Add the two integers \\(A\\) and \\(B\\), then print <code>YES</code>.</p>',
  )
  .replace('<p>첫 줄에 두 정수가 주어진다.</p>', '<p>The first line contains two integers.</p>')
  .replace('<p>합을 출력한다.</p>', '<p>Print their sum.</p>');

async function serveEnglish(context: BrowserContext, web: 'ok' | 'down') {
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) =>
    new URL(route.request().url()).pathname === '/problem/1000'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: ENGLISH })
      : route.abort(),
  );
  await context.route(/^https:\/\/translate\.googleapis\.com\//, (route) => {
    if (web === 'down') return route.abort();
    const q = new URLSearchParams(route.request().postData() ?? '').get('q') ?? '';
    const lines = q
      .split('\n')
      .map((l, i, all) => [`KO(${l})${i < all.length - 1 ? '\n' : ''}`, l]);
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([lines, null, 'en']),
    });
  });
}

/** A fake on-device translator with the given availability, or none. */
async function fakeDevice(context: BrowserContext, availability: string | null) {
  await context.addInitScript((avail) => {
    const g = globalThis as Record<string, unknown>;
    delete g.LanguageDetector;
    if (avail === null) {
      delete g.Translator;
      return;
    }
    let state = avail;
    g.Translator = {
      availability: async () => state,
      create: async () => {
        state = 'available';
        return { translate: async (text: string) => `DEV(${text})` };
      },
    };
  }, availability);
}

async function openIde(page: Page) {
  await page.goto('https://acmicpc.net/problem/1000');
  await page.getByRole('button', { name: '코딩테스트' }).click();
  const ide = page.frameLocator('#cib-ide-overlay');
  await expect(ide.getByRole('heading', { name: '테스트용 덧셈' })).toBeVisible();
  return ide;
}

test('translates an English statement on the web and keeps the choice of the original', async ({
  page,
  context,
}) => {
  await serveEnglish(context, 'ok');
  await fakeDevice(context, null);
  const ide = await openIde(page);
  const bar = ide.getByTestId('translate-bar');
  await expect(bar.getByRole('button', { name: '번역' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bar).toContainText('영어에서 기계 번역했어요');
  const problem = ide.locator('.problem');
  await expect(problem).toContainText('KO(Print their sum.)');
  // Inline code stays where it was in the sentence.
  await expect(problem.locator('.problem-html p').first()).toContainText('then print YES.)');
  await expect(problem.locator('.problem-html p code').first()).toHaveText('YES');
  if (process.env.SCREENS) await page.screenshot({ path: 'tmp-screens/translate.png' });

  await bar.getByRole('button', { name: '원문' }).click();
  await expect(problem).toContainText('Add the two integers');
  await expect(problem).not.toContainText('KO(');

  // The original stays chosen on the next problem page; one click translates again.
  await page.reload();
  await page.getByRole('button', { name: '코딩테스트' }).click();
  const again = page.frameLocator('#cib-ide-overlay');
  const bar2 = again.getByTestId('translate-bar');
  await expect(again.locator('.problem')).not.toContainText('KO(');
  await bar2.getByRole('button', { name: '한국어로 번역' }).click();
  await expect(again.locator('.problem')).toContainText('KO(Print their sum.)');
});

test('falls back to the on-device translator when web translation fails', async ({
  page,
  context,
}) => {
  await serveEnglish(context, 'down');
  await fakeDevice(context, 'available');
  const ide = await openIde(page);
  await expect(ide.locator('.problem')).toContainText('DEV(Print their sum.)');
});

test('asks for a click when the on-device model must be downloaded first', async ({
  page,
  context,
}) => {
  await serveEnglish(context, 'down');
  await fakeDevice(context, 'downloadable');
  const ide = await openIde(page);
  const bar = ide.getByTestId('translate-bar');
  await expect(bar).toContainText('처음에는 번역 모델을 내려받아요');
  await bar.getByRole('button', { name: '한국어로 번역' }).click();
  await expect(ide.locator('.problem')).toContainText('DEV(Print their sum.)');
});

test('shows the original and a retry when nothing can translate', async ({ page, context }) => {
  await serveEnglish(context, 'down');
  await fakeDevice(context, null);
  const ide = await openIde(page);
  const bar = ide.getByTestId('translate-bar');
  await expect(bar).toContainText('번역하지 못해 원문으로 보여요.');
  await expect(bar.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(ide.locator('.problem')).toContainText('Add the two integers');
});
