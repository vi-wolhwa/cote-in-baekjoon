import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

test('runs the sample cases in the sandbox and reports success', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공');
});

test('stops an infinite loop with a timeout', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('while (true) {}');
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('case').first()).toContainText('시간 초과', { timeout: 15_000 });
});

test('user code cannot reach the network from the sandbox', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(
    "fetch('https://example.com').then(() => console.log('3'), () => console.log('blocked'));",
  );
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('case').first()).toContainText('blocked');
});

test('opens the IDE overlay from a Baekjoon problem page', async ({ context, page }) => {
  const html = readFileSync('tests/fixtures/problem-sample.html', 'utf8');
  // Serve a synthetic problem page instead of contacting Baekjoon.
  await context.route('https://acmicpc.net/**', (route) =>
    route.request().url() === 'https://acmicpc.net/problem/1000'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
      : route.abort(),
  );
  await page.goto('https://acmicpc.net/problem/1000');
  await page.getByRole('button', { name: '코테 화면으로 풀기' }).click();
  const ide = page.frameLocator('#cib-ide-overlay');
  await expect(ide.getByText('1000번 · 테스트용 덧셈')).toBeVisible();
  await ide.getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('#cib-ide-overlay')).toHaveCount(0);
});
