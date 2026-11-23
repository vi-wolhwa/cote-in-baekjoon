import { readFileSync } from 'node:fs';
import type { FrameLocator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const A_PLUS_B =
  "const [a, b] = require('fs').readFileSync('/dev/stdin').toString().trim().split(' ').map(Number); console.log(a + b);";

/** Replaces the editor content by typing, like a user would. */
async function typeCode(page: Page, root: Page | FrameLocator, code: string) {
  const content = root.locator('.cm-content');
  // Inside the overlay iframe, automated input can arrive before the frame holds focus,
  // so type and verify as one step and retry it.
  await expect(async () => {
    await content.click();
    await expect(root.locator('.cm-editor')).toHaveClass(/cm-focused/, { timeout: 500 });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(code);
    await expect(content).toContainText(code.slice(-20), { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

test('starts with a template that does not contain a solution', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await expect(page.locator('.cm-content')).toContainText("readFileSync('/dev/stdin')");
  await expect(page.locator('.cm-content')).not.toContainText('console.log');
});

test('runs the sample cases in the sandbox and reports success', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await typeCode(page, page, A_PLUS_B);
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
  await expect(page.getByTestId('case').first()).toContainText(
    '초를 초과하여 실행이 중단되었습니다',
    {
      timeout: 15_000,
    },
  );
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
  await expect(ide.getByRole('heading', { name: '테스트용 덧셈' })).toBeVisible();
  await expect(ide.getByRole('link', { name: '질문하기' })).toHaveAttribute(
    'href',
    'https://www.acmicpc.net/board/search/all/problem/1000',
  );
  await typeCode(page, ide, A_PLUS_B);
  await ide.getByRole('button', { name: '코드 실행' }).click();
  await expect(ide.getByTestId('summary')).toHaveText('2개 중 2개 성공');
  // Auto-submit is on by default, without a prompt (#41).
  await expect(ide.getByRole('checkbox', { name: '자동 제출' })).toBeChecked();
  await ide.getByRole('button', { name: '백준 문제로 돌아가기' }).click();
  await expect(page.locator('#cib-ide-overlay')).toHaveCount(0);
});
