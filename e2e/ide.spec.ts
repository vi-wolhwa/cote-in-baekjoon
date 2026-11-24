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

test('the help page footer links to the open-source license notices', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/help.html`);
  const href = await page
    .locator('.help-footer')
    .getByRole('link', { name: '오픈소스 라이선스' })
    .getAttribute('href');
  expect(href).toBe(`chrome-extension://${extensionId}/THIRD_PARTY_NOTICES.txt`);
  await page.goto(href ?? '');
  await expect(page.locator('body')).toContainText('오픈소스 라이선스 고지');
  await expect(page.locator('body')).toContainText('pyodide');
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
  // In Baekjoon's problem menu, between "1000번" and "제출", as tall as the other pills.
  const open = page.getByRole('button', { name: '코딩테스트' });
  const items = page.locator('ul.problem-menu > li');
  await expect(items.nth(1)).toHaveId('cib-open-ide-item');
  await expect(items.nth(0)).toHaveText('1000번');
  // "모의시험" (#102) follows it, before "제출".
  await expect(items.nth(2)).toHaveText('모의시험');
  await expect(items.nth(3)).toHaveText('제출');
  await expect(open).toHaveCSS('background-color', 'rgb(38, 55, 71)');
  await expect(open).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(open).toHaveCSS('font-weight', '600');
  await expect(open).toHaveCSS('border-radius', '4px');
  const pill = await items.nth(0).locator('a').boundingBox();
  const own = await open.boundingBox();
  expect(own?.height).toBeCloseTo(pill?.height ?? 0, 0);
  expect(own?.y).toBeCloseTo(pill?.y ?? 0, 0);
  // Its lighter companion: same height, navy outline and text on no fill.
  const exam = page.getByRole('button', { name: '모의시험' });
  expect((await exam.boundingBox())?.height).toBeCloseTo(pill?.height ?? 0, 0);
  await expect(exam).toHaveCSS('border-top-color', 'rgb(38, 55, 71)');
  await expect(exam).toHaveCSS('color', 'rgb(38, 55, 71)');
  await expect(exam).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await open.hover();
  await expect(open).toHaveCSS('background-color', 'rgb(47, 68, 87)');
  await open.click();
  // The click does not follow href="#".
  await expect(page).toHaveURL('https://acmicpc.net/problem/1000');
  const ide = page.frameLocator('#cib-ide-overlay');
  await expect(ide.getByRole('heading', { name: '테스트용 덧셈' })).toBeVisible();
  await expect(ide.getByRole('link', { name: '질문하기' })).toHaveAttribute(
    'href',
    'https://www.acmicpc.net/board/search/all/problem/1000',
  );
  await typeCode(page, ide, A_PLUS_B);
  await ide.getByRole('button', { name: '코드 실행' }).click();
  await expect(ide.getByTestId('summary')).toHaveText('2개 중 2개 성공');
  // Auto-submit is always on, with no setting to turn it off (#76).
  await expect(ide.getByRole('checkbox', { name: '자동 제출' })).toHaveCount(0);
  // 질문하기 uses the same button style as the test case button.
  const ask = await ide.getByRole('link', { name: '질문하기' }).getAttribute('class');
  expect(ask).toBe(
    await ide.getByRole('button', { name: '테스트 케이스 추가하기' }).getAttribute('class'),
  );
  // 돌아가기 is the main link of the top bar: bold white text on a filled pill.
  const back = ide.getByRole('button', { name: '돌아가기', exact: true });
  await expect(back).toHaveCSS('font-weight', '600');
  await expect(back).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(back).toHaveCSS('background-color', 'rgb(38, 55, 71)');
  await expect(
    ide.getByRole('navigation', { name: '경로' }).getByRole('link', { name: '도움말' }),
  ).toHaveCSS('font-weight', '400');
  const topLinks = await ide
    .locator('.topbar-links > *')
    .evaluateAll((els) => els.map((e) => e.textContent?.trim()));
  expect(topLinks).toEqual(['도움말', '문제 신고', '백업과 복원', '돌아가기']);
  await back.click();
  await expect(page.locator('#cib-ide-overlay')).toHaveCount(0);
});

test('switches languages with their own file name, starter and saved code', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await typeCode(page, page, 'console.log(42);');
  const language = page.getByRole('combobox', { name: '언어' });

  await language.selectOption('cpp17');
  await expect(page.getByText('solution.cpp')).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('#include <bits/stdc++.h>');

  await language.selectOption('python3');
  await expect(page.getByText('solution.py')).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('input = sys.stdin.readline');

  // Back to JavaScript: the code typed earlier is still there.
  await language.selectOption('javascript');
  await expect(page.locator('.cm-content')).toContainText('console.log(42);');
});

test('a selection is not hidden by the current-line highlight', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await page.locator('.cm-content').click();
  await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/);
  await expect(page.locator('.cm-activeLine')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+A');
  await expect(page.locator('.cm-selectionBackground').first()).toBeVisible();
  await expect(page.locator('.cm-activeLine')).toHaveCount(0);
  if (process.env.SCREENS) await page.screenshot({ path: 'tmp-screens/editor-selection.png' });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cm-activeLine')).toHaveCount(1);
});
