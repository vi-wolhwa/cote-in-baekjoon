import { expect, test } from './fixtures';

test('help: search, keyword chips, empty state and ?q= links', async ({ page, extensionId }) => {
  const helpUrl = `chrome-extension://${extensionId}/help.html`;
  await page.goto(helpUrl);
  const search = page.getByRole('searchbox', { name: '도움말 검색' });
  const sections = page.locator('section.faq');
  await expect(sections).toHaveCount(10);

  await search.fill('C++ 예외');
  await expect(page.getByTestId('result-count')).toHaveText('1개 찾음');
  await expect(sections).toHaveCount(1);
  await expect(page.locator('#run-diff mark').first()).toHaveText('C++');
  // The search is kept in the URL.
  await expect(page).toHaveURL(`${helpUrl}?q=C%2B%2B+%EC%98%88%EC%99%B8`);

  // Esc clears; "/" focuses the box again.
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(sections).toHaveCount(10);
  await page.locator('h1').click();
  await page.keyboard.press('/');
  await expect(search).toBeFocused();

  await page.getByRole('button', { name: '코드 백업' }).click();
  await expect(search).toHaveValue('코드 백업');
  await expect(sections.first()).toHaveId('code-lost');

  await search.fill('블록체인');
  await expect(page.getByRole('heading', { name: '찾는 내용이 없나요?' })).toBeVisible();
  const report = new URL(
    (await page
      .getByTestId('empty')
      .getByRole('link', { name: '문제 신고하기' })
      .getAttribute('href')) ?? '',
  );
  expect(report.searchParams.get('template')).toBe('1-bug.yml');

  await page.goto(`${helpUrl}?q=${encodeURIComponent('캡차')}`);
  await expect(page.getByRole('searchbox', { name: '도움말 검색' })).toHaveValue('캡차');
  await expect(sections).toHaveCount(1);
  await expect(sections.first()).toHaveId('auto-submit');
});

test('help: #id scrolls to the section and keeps the search bar on top', async ({
  page,
  extensionId,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/help.html#code-lost`);
  const section = page.locator('#code-lost');
  await expect(section).toHaveClass(/flash/);
  await expect(section).toBeInViewport();
  const bar = await page.locator('.search-bar').boundingBox();
  expect(bar?.y).toBe(0);
});
