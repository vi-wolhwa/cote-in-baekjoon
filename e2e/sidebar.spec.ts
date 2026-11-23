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

  const gear = sidebar.getByRole('button', { name: '설정' });
  const gearBox = await gear.boundingBox();
  expect(gearBox).toMatchObject({ width: 32, height: 32, y: 47 + 16 });
  for (const name of ['문제 신고', '도움말', '백업과 복원']) {
    await expect(
      sidebar.getByRole(name === '백업과 복원' ? 'button' : 'link', { name }),
    ).toHaveAttribute('title', name);
  }
  // The title bar, workspace and button bar end where the sidebar starts.
  const titlebar = await page.locator('.titlebar').boundingBox();
  expect((titlebar?.x ?? 0) + (titlebar?.width ?? 0)).toBe(1024 - 64);
});

test('switches to the light theme from settings and keeps it', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const keyword = page.locator('.cm-content span', { hasText: /^const$/ }).first();
  await expect(keyword).toHaveCSS('color', 'rgb(195, 143, 229)');
  await expect(page.locator('.titlebar')).toHaveCSS('background-color', DARK_PANEL);

  await page.getByRole('button', { name: '설정' }).click();
  const dialog = page.getByRole('dialog', { name: '설정' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'Light' }).check();

  // Applies at once, behind the open dialog.
  await expect(page.locator('.titlebar')).toHaveCSS('background-color', WHITE);
  await expect(page.locator('.problem')).toHaveCSS('color', 'rgb(38, 55, 71)');
  await expect(keyword).toHaveCSS('color', 'rgb(156, 39, 176)');
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', WHITE);
  // The top bar stays dark.
  await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgb(12, 21, 28)');
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.cm-content span', { hasText: /^const$/ }).first()).toHaveCSS(
    'color',
    'rgb(156, 39, 176)',
  );
  await expect(page.locator('.titlebar')).toHaveCSS('background-color', WHITE);
  await page.getByRole('button', { name: '설정' }).click();
  await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
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
