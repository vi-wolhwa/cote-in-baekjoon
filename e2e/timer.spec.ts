import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const problemHtml = readFileSync('tests/fixtures/problem-sample.html', 'utf8');

declare const chrome: {
  storage: { local: { get: (key: string) => Promise<Record<string, unknown>> } };
};

async function openTimer(page: Page) {
  await page
    .getByRole('complementary', { name: '도구' })
    .getByRole('button', { name: '타이머' })
    .click();
  const pop = page.getByRole('dialog', { name: '타이머' });
  await expect(pop).toBeVisible();
  return pop;
}

test('stopwatch: starts by default, counts, pauses and resets', async ({ page, extensionId }) => {
  await page.clock.install({ time: new Date('2026-11-24T10:00:00+09:00') });
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const pop = await openTimer(page);
  await expect(pop.getByRole('radio', { name: '스톱워치' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const display = pop.getByTestId('timer-display');
  await expect(display).toHaveText('00:00');
  await expect(display).toHaveAttribute('aria-live', 'off');
  // Nothing to reset yet.
  await expect(pop.getByRole('button', { name: '초기화' })).toBeDisabled();

  await pop.getByRole('button', { name: '시작' }).click();
  await page.clock.runFor(65_000);
  await expect(display).toHaveText('01:05');
  const badge = page.getByTestId('timer-badge');
  await expect(badge).toHaveText('01:05');
  const button = page.getByRole('button', { name: '타이머' });
  await expect(button).toHaveClass(/is-running/);
  // The mode cannot change while counting.
  await expect(pop.getByRole('radio', { name: '타이머' })).toBeDisabled();

  // Esc closes the popover; the time keeps counting.
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(button).toBeFocused();
  await page.clock.runFor(3_600_000);
  await expect(badge).toHaveText('1:01:05');

  await button.click();
  await pop.getByRole('button', { name: '일시정지' }).click();
  await page.clock.runFor(30_000);
  await expect(display).toHaveText('1:01:05');
  await expect(button).toHaveClass(/is-paused/);

  await pop.getByRole('button', { name: '초기화' }).click();
  await expect(display).toHaveText('00:00');
  await expect(badge).toHaveCount(0);

  // Clicking outside closes it.
  await page.locator('.titlebar').click();
  await expect(pop).toHaveCount(0);
});

test('timer: 30분 by default, quick picks, and 시간 종료 at zero', async ({
  page,
  extensionId,
}) => {
  await page.clock.install({ time: new Date('2026-11-24T10:00:00+09:00') });
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const pop = await openTimer(page);
  await pop.getByRole('radio', { name: '타이머' }).click();
  const hours = pop.getByRole('textbox', { name: '시간' });
  const minutes = pop.getByRole('textbox', { name: '분' });
  await expect(hours).toHaveValue('0');
  await expect(minutes).toHaveValue('30');
  await expect(pop.getByRole('button', { name: '30분' })).toHaveAttribute('aria-pressed', 'true');

  await pop.getByRole('button', { name: '60분' }).click();
  await expect(hours).toHaveValue('1');
  await expect(minutes).toHaveValue('00');
  await expect(pop.getByRole('button', { name: '60분' })).toHaveAttribute('aria-pressed', 'true');
  await pop.getByRole('button', { name: '시작' }).click();
  const display = pop.getByTestId('timer-display');
  await expect(display).toHaveText('1:00:00');
  await expect(pop.getByText('1시간 타이머')).toBeVisible();
  await pop.getByRole('button', { name: '초기화' }).click();

  // 0분 is refused; 1분 is the shortest.
  await minutes.fill('0');
  await hours.fill('0');
  await expect(pop.getByRole('button', { name: '시작' })).toBeDisabled();
  await expect(pop.getByText('1분에서 9시간 59분 사이로 정해 주세요.')).toBeVisible();
  await minutes.fill('1');
  await pop.getByRole('button', { name: '시작' }).click();
  await expect(display).toHaveText('01:00');

  await page.clock.runFor(59_000);
  await expect(display).toHaveText('00:01');
  await page.clock.runFor(2_000);
  await expect(display).toHaveText('00:00');
  await expect(pop.getByText('시간 종료 · 1분이 지났어요.')).toBeVisible();
  await expect(display).toHaveCSS('color', 'rgb(255, 123, 123)');
  const button = page.getByRole('button', { name: '타이머' });
  await expect(page.getByTestId('timer-badge')).toHaveClass(/is-done/);
  await expect(page.getByRole('status').filter({ hasText: '시간 종료' })).toHaveCount(1);

  await pop.getByRole('button', { name: '다시 시작' }).click();
  await expect(display).toHaveText('01:00');
  await expect(page.getByTestId('timer-badge')).toHaveClass(/is-running/);
  await expect(button).toHaveCount(1);
});

test('the popover keeps one height in every mode and state', async ({ page, extensionId }) => {
  await page.clock.install({ time: new Date('2026-11-24T10:00:00+09:00') });
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const pop = await openTimer(page);
  const height = async () => Math.round((await pop.boundingBox())?.height ?? 0);
  const stopwatch = await height();
  await pop.getByRole('button', { name: '시작' }).click();
  expect(await height()).toBe(stopwatch);
  await pop.getByRole('button', { name: '초기화' }).click();
  await pop.getByRole('radio', { name: '타이머' }).click();
  expect(await height()).toBe(stopwatch);
  await pop.getByRole('textbox', { name: '분' }).fill('0');
  await expect(pop.getByText('1분에서 9시간 59분 사이로 정해 주세요.')).toBeVisible();
  expect(await height()).toBe(stopwatch);
  await pop.getByRole('textbox', { name: '분' }).fill('1');
  await pop.getByRole('button', { name: '시작' }).click();
  expect(await height()).toBe(stopwatch);
  await page.clock.runFor(61_000);
  await expect(pop.getByText('시간 종료 · 1분이 지났어요.')).toBeVisible();
  expect(await height()).toBe(stopwatch);

  // The sidebar button keeps its size; the time shows under it.
  const button = await page.getByRole('button', { name: '타이머' }).boundingBox();
  expect(button).toMatchObject({ width: 32, height: 32 });
});

test('the popover opens by itself when the countdown ends', async ({ page, extensionId }) => {
  await page.clock.install({ time: new Date('2026-11-24T10:00:00+09:00') });
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const pop = await openTimer(page);
  await pop.getByRole('radio', { name: '타이머' }).click();
  await pop.getByRole('textbox', { name: '분' }).fill('1');
  await pop.getByRole('button', { name: '시작' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '타이머' })).toHaveCount(0);

  await page.clock.runFor(61_000);
  const opened = page.getByRole('dialog', { name: '타이머' });
  await expect(opened).toBeVisible();
  await expect(opened.getByText('시간 종료 · 1분이 지났어요.')).toBeVisible();
});

test('the timer survives closing the IDE and reloading the problem page', async ({
  context,
  page,
  extensionId,
}) => {
  await context.route('https://acmicpc.net/**', (route) =>
    route.request().url() === 'https://acmicpc.net/problem/1000'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: problemHtml })
      : route.abort(),
  );
  await page.goto('https://acmicpc.net/problem/1000');
  await page.getByRole('button', { name: '코테 화면으로 풀기' }).click();
  let ide = page.frameLocator('#cib-ide-overlay');
  await ide.getByRole('button', { name: '타이머' }).click();
  await ide.getByRole('dialog', { name: '타이머' }).getByRole('button', { name: '시작' }).click();
  await expect(ide.getByTestId('timer-badge')).toHaveText(/^00:0[1-9]$/, { timeout: 5_000 });

  await ide.getByRole('button', { name: '돌아가기' }).click();
  await page.reload();
  await page.getByRole('button', { name: '코테 화면으로 풀기' }).click();
  ide = page.frameLocator('#cib-ide-overlay');
  const badge = ide.getByTestId('timer-badge');
  await expect(badge).toHaveText(/^00:0[1-9]$/);
  await expect(ide.getByRole('button', { name: '타이머' })).toHaveClass(/is-running/);

  // Kept per problem in storage.local.
  const reader = await context.newPage();
  await reader.goto(`chrome-extension://${extensionId}/popup.html`);
  const stored = await reader.evaluate(() => chrome.storage.local.get('timer:1000'));
  await reader.close();
  expect(stored['timer:1000']).toMatchObject({ mode: 'stopwatch', running: true, elapsedMs: 0 });
});

test('the popover follows the light theme', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  let pop = await openTimer(page);
  await expect(pop).toHaveCSS('background-color', 'rgb(38, 55, 71)');
  await expect(pop).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(pop).toHaveCSS('border-top-color', 'rgb(23, 35, 52)');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '라이트 테마로 바꾸기' }).click();

  pop = await openTimer(page);
  await expect(pop).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(pop).toHaveCSS('color', 'rgb(38, 55, 71)');
  await expect(pop).toHaveCSS('border-top-color', 'rgb(215, 226, 235)');
  // Anchored to the left of the sidebar.
  const box = await pop.boundingBox();
  const sidebar = await page.getByRole('complementary', { name: '도구' }).boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(sidebar?.x ?? 0);
});
