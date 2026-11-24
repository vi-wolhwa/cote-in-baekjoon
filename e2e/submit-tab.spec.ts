import type { BrowserContext, FrameLocator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { serveBaekjoon, submitTabInfo } from './exam-helpers';

/**
 * Practice submission in a background tab (ADR-0002, 2026-11-24): no popup window, a spinner
 * in the IDE, '직접 확인' to look at the tab, and '결과 다시 확인' after it closed early.
 */

async function openIde(page: Page) {
  await page.goto('https://acmicpc.net/problem/1000');
  await page.getByRole('button', { name: '코딩테스트' }).click();
  const ide = page.frameLocator('#cib-ide-overlay');
  await expect(ide.getByRole('heading', { name: '테스트용 덧셈' })).toBeVisible();
  return ide;
}

async function typeCode(page: Page, ide: FrameLocator, code: string) {
  const content = ide.locator('.cm-content');
  await expect(async () => {
    await content.click();
    await expect(ide.locator('.cm-editor')).toHaveClass(/cm-focused/, { timeout: 500 });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(code);
    await expect(content).toContainText(code.slice(-10), { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

/** The IDE frame: an extension page, which can see tabs and windows. */
function ideFrame(page: Page) {
  const frame = page.frames().find((f) => f.url().includes('/ide.html'));
  if (!frame) throw new Error('no IDE frame');
  return frame;
}

async function submit(context: BrowserContext, ide: FrameLocator) {
  const opened = context.waitForEvent('page');
  await ide.getByRole('button', { name: '제출하기' }).click();
  await ide.getByRole('tab', { name: '채점 결과' }).click();
  return opened;
}

test('submits in a background tab with a spinner, 직접 확인 and the result', async ({
  page,
  context,
}) => {
  await serveBaekjoon(context);
  const ide = await openIde(page);
  await typeCode(page, ide, 'console.log(3);');
  const tab = await submit(context, ide);

  // No new window, and the user stays on the problem page.
  expect(await submitTabInfo(ideFrame(page), 1000)).toEqual({ windows: 1, active: false });

  // Routes miss the first navigation of a tab the extension opens: load it again.
  await tab.goto('https://acmicpc.net/submit/1000');
  const progress = ide.getByTestId('submit-progress');
  await expect(progress).toContainText('제출 중');
  await expect(progress.locator('.spinner')).toBeVisible();
  await expect(tab.getByText('잠시 뒤 자동으로 제출합니다')).toBeVisible();

  // 직접 확인 brings the tab to the front.
  await progress.getByRole('button', { name: '직접 확인' }).click();
  await expect.poll(async () => (await submitTabInfo(ideFrame(page), 1000)).active).toBe(true);

  // Baekjoon goes on to the status page; the IDE shows judging, then the result.
  const closed = tab.waitForEvent('close', { timeout: 15_000 });
  await tab.goto('https://acmicpc.net/status?from_mine=1&problem_id=1000&user_id=tester');
  const judging = ide.getByTestId('submit-judging');
  await expect(judging).toContainText('채점 중');
  await expect(judging.locator('.spinner')).toBeVisible();
  await closed;
  await expect(ide.getByTestId('judge')).toContainText('맞았습니다!! (44ms, 8.8MB)');
  // After judging, a link to Baekjoon's status page lets the user check it there.
  const link = ide.getByTestId('status-link');
  await expect(link).toHaveText('채점 현황 보기 ↗');
  await expect(link).toHaveAttribute('target', '_blank');
  const href = new URL((await link.getAttribute('href')) ?? '');
  expect(href.origin + href.pathname).toBe('https://www.acmicpc.net/status');
  expect(href.searchParams.get('problem_id')).toBe('1000');
});

test('closing the tab early offers 결과 다시 확인, which reads the status list', async ({
  page,
  context,
}) => {
  await serveBaekjoon(context);
  const ide = await openIde(page);
  await typeCode(page, ide, 'console.log(3);');
  const tab = await submit(context, ide);
  await tab.goto('https://acmicpc.net/submit/1000');
  await expect(tab.getByText('잠시 뒤 자동으로 제출합니다')).toBeVisible();
  // Closed by mistake before the result came.
  await tab.close();
  const lost = ide.getByTestId('submit-lost');
  await expect(lost).toContainText('결과를 아직 못 받았어요');

  const opened = context.waitForEvent('page');
  await lost.getByRole('button', { name: '결과 다시 확인' }).click();
  const status = await opened;
  expect(await submitTabInfo(ideFrame(page), 1000)).toEqual({ windows: 1, active: false });
  const closed = status.waitForEvent('close', { timeout: 15_000 });
  // The user's own status list (the handle came from the problem page's header).
  await status.goto('https://acmicpc.net/status?problem_id=1000&user_id=tester');
  await expect(ide.getByTestId('submit-judging')).toContainText('채점 중');
  await closed;
  await expect(ide.getByTestId('judge')).toContainText('맞았습니다!!');
});

test('a submission that needs the user says so, with 직접 확인 emphasized', async ({
  page,
  context,
}) => {
  await serveBaekjoon(context);
  const ide = await openIde(page);
  // A string Baekjoon's firewall may reject: auto-submit hands over to the user.
  await typeCode(page, ide, 'let n = 2; while (n --> 0) console.log(n);');
  const tab = await submit(context, ide);
  await tab.goto('https://acmicpc.net/submit/1000');
  const needs = ide.getByTestId('submit-needs-user');
  await expect(needs).toContainText('직접 확인이 필요해요');
  await expect(needs).toContainText('방화벽');
  const button = needs.getByRole('button', { name: '직접 확인' });
  await expect(button).toHaveClass(/is-primary/);
  await button.click();
  await expect.poll(async () => (await submitTabInfo(ideFrame(page), 1000)).active).toBe(true);
});
