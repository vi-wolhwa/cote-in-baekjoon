import { expect, test } from './fixtures';

const WHITE = 'rgb(255, 255, 255)';
const DARK_PANEL = 'rgb(38, 55, 71)';

test('shows the right sidebar under the top bar, 64px wide', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const sidebar = page.getByRole('complementary', { name: '도구' });
  await expect(sidebar).toBeVisible();
  const box = await sidebar.boundingBox();
  expect(box).toMatchObject({ x: 1024 - 64, y: 47, width: 64, height: 768 - 47 });
  await expect(sidebar).toHaveCSS('background-color', DARK_PANEL);

  const toggle = sidebar.getByRole('button', { name: '라이트 테마로 바꾸기' });
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox).toMatchObject({ width: 32, height: 32, y: 47 + 16 });
  // Only tools for the problem: the theme switch, then the timer. No links.
  await expect(sidebar.getByRole('button')).toHaveText(['', '']);
  const names = await sidebar
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(names).toEqual(['라이트 테마로 바꾸기', '타이머']);
  await expect(sidebar.getByRole('link')).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: '타이머' })).toHaveAttribute('title', '타이머');
  const timerBox = await sidebar.getByRole('button', { name: '타이머' }).boundingBox();
  expect(timerBox).toMatchObject({ width: 32, height: 32 });

  // The top bar holds the extension menu.
  const top = page.getByRole('navigation', { name: '경로' });
  await expect(top.getByRole('link', { name: '도움말' })).toBeVisible();
  await expect(top.getByRole('link', { name: '문제 신고' })).toBeVisible();
  await expect(top.getByRole('button', { name: '백업과 복원' })).toBeVisible();
  await expect(page.getByRole('link', { name: '오픈소스 라이선스' })).toHaveCount(0);
  const order = await top
    .locator('.topbar-links > *')
    .evaluateAll((els) => els.map((e) => e.textContent?.trim()));
  expect(order).toEqual(['도움말', '문제 신고', '백업과 복원']);
  // The title bar, workspace and button bar end where the sidebar starts.
  const titlebar = await page.locator('.titlebar').boundingBox();
  expect((titlebar?.x ?? 0) + (titlebar?.width ?? 0)).toBe(1024 - 64);
});

test('switches the theme from the sidebar in one click and keeps it', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const keyword = page.locator('.cm-content span', { hasText: /^const$/ }).first();
  await expect(keyword).toHaveCSS('color', 'rgb(195, 143, 229)');
  await expect(page.locator('.titlebar')).toHaveCSS('background-color', DARK_PANEL);

  await page.getByRole('button', { name: '라이트 테마로 바꾸기' }).click();

  // Applies at once, without a dialog.
  await expect(page.locator('.titlebar')).toHaveCSS('background-color', WHITE);
  await expect(page.locator('.problem')).toHaveCSS('color', 'rgb(38, 55, 71)');
  await expect(keyword).toHaveCSS('color', 'rgb(156, 39, 176)');
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', WHITE);
  // The top bar stays dark.
  await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgb(12, 21, 28)');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.cm-content span', { hasText: /^const$/ }).first()).toHaveCSS(
    'color',
    'rgb(156, 39, 176)',
  );
  await expect(page.locator('.titlebar')).toHaveCSS('background-color', WHITE);
  // The button now offers the way back.
  await page.getByRole('button', { name: '다크 테마로 바꾸기' }).click();
  await expect(page.locator('.titlebar')).toHaveCSS('background-color', DARK_PANEL);
});

test('"문제 신고" opens the bug form with the language filled in', async ({
  context,
  page,
  extensionId,
}) => {
  // Never load GitHub in tests: answer the issue page with a stub.
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>stub</p>' }),
  );
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const [report] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: '문제 신고' }).click(),
  ]);
  await report.waitForLoadState();
  const url = new URL(report.url());
  expect(report.url()).toMatch(/^https:\/\/github\.com\/vi-wolhwa\/cote-in-baekjoon\/issues\/new/);
  expect(url.searchParams.get('template')).toBe('1-bug.yml');
  expect(url.searchParams.get('language')).toBe('JavaScript');
});

test('the standalone IDE has no "돌아가기"', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await expect(page.getByRole('button', { name: '돌아가기' })).toHaveCount(0);
});
