import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { problemHtml } from './exam-helpers';

/**
 * Translation of a foreign-language statement (ADR-0010). The browser's on-device Translator
 * is replaced with a fake one (marks what it translated), so these tests check the flow:
 * automatic translation, switching to the original and keeping that choice, the button when
 * the model must be downloaded first, and browsers without a translator.
 */

const ENGLISH = problemHtml
  .replace(
    '<p>정수 \\(A\\)와 \\(B\\)를 더한다.</p>',
    '<p>Add the two integers \\(A\\) and \\(B\\).</p>',
  )
  .replace('<p>첫 줄에 두 정수가 주어진다.</p>', '<p>The first line contains two integers.</p>')
  .replace('<p>합을 출력한다.</p>', '<p>Print their sum.</p>');

async function serveEnglish(context: BrowserContext) {
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) =>
    new URL(route.request().url()).pathname === '/problem/1000'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: ENGLISH })
      : route.abort(),
  );
}

/** A fake on-device translator with the given availability ('available', 'downloadable', …). */
async function fakeTranslator(context: BrowserContext, availability: string | null) {
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
        return { translate: async (text: string) => `KO(${text})` };
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

test('translates an English statement and keeps the choice of the original', async ({
  page,
  context,
}) => {
  await serveEnglish(context);
  await fakeTranslator(context, 'available');
  const ide = await openIde(page);
  const bar = ide.getByTestId('translate-bar');
  await expect(bar.getByRole('button', { name: '번역' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bar).toContainText('영어에서 기계 번역했어요');
  const problem = ide.locator('.problem');
  await expect(problem).toContainText('KO(Add the two integers');
  await expect(problem).toContainText('KO(Print their sum.)');
  if (process.env.SCREENS) await page.screenshot({ path: 'tmp-screens/translate.png' });

  await bar.getByRole('button', { name: '원문' }).click();
  await expect(problem).toContainText('Add the two integers');
  await expect(problem).not.toContainText('KO(');

  // The original stays chosen on the next problem page.
  await page.reload();
  await page.getByRole('button', { name: '코딩테스트' }).click();
  const again = page.frameLocator('#cib-ide-overlay');
  await expect(again.getByTestId('translate-bar')).toContainText('한국어로 번역');
  await expect(again.locator('.problem')).not.toContainText('KO(');
});

test('asks for a click when the translation model must be downloaded first', async ({
  page,
  context,
}) => {
  await serveEnglish(context);
  await fakeTranslator(context, 'downloadable');
  const ide = await openIde(page);
  const bar = ide.getByTestId('translate-bar');
  await expect(bar).toContainText('처음에는 번역 모델을 내려받아요');
  await bar.getByRole('button', { name: '한국어로 번역' }).click();
  await expect(ide.locator('.problem')).toContainText('KO(Print their sum.)');
  await expect(bar.getByRole('button', { name: '번역' })).toHaveAttribute('aria-pressed', 'true');
});

test('says so and shows the original where the browser has no translator', async ({
  page,
  context,
}) => {
  await serveEnglish(context);
  await fakeTranslator(context, null);
  const ide = await openIde(page);
  await expect(ide.getByTestId('translate-bar')).toContainText(
    '영어 문제예요. 이 브라우저는 내장 번역을 지원하지 않아 원문으로 보여요.',
  );
  await expect(ide.locator('.problem')).toContainText('Add the two integers');
});
