import { readFileSync } from 'node:fs';
import type { BrowserContext, FrameLocator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { problemHtml, serveBaekjoon } from './exam-helpers';

/**
 * '제출 기록' tab (M7, ADR-0012): submissions made through the IDE with their code and
 * result, '편집기로 불러오기', and '백준 기록 불러오기', which reads one status page only when
 * pressed. Synthetic pages only.
 */

const historyHtml = readFileSync('tests/fixtures/status-history.html', 'utf8');

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

/** Baekjoon with the user's status list for '백준 기록'; returns the status requests made. */
async function serveHistory(context: BrowserContext, problem = problemHtml) {
  const requests: string[] = [];
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) => {
    const url = new URL(route.request().url());
    const html = (body: string) => route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    if (url.pathname === '/problem/1000') return html(problem);
    if (url.pathname === '/status') {
      requests.push(url.search);
      return html(historyHtml);
    }
    return route.abort();
  });
  return requests;
}

test('records a submission with its result and loads its code back', async ({ page, context }) => {
  await serveBaekjoon(context);
  const ide = await openIde(page);
  const submitted = 'console.log(3); // first';
  await typeCode(page, ide, submitted);

  const opened = context.waitForEvent('page');
  await ide.getByRole('button', { name: '제출하기' }).click();
  const tab = await opened;
  // Routes miss the first navigation of a tab the extension opens: load it again.
  await tab.goto('https://acmicpc.net/submit/1000');
  await expect(tab.getByText('잠시 뒤 자동으로 제출합니다')).toBeVisible();
  const closed = tab.waitForEvent('close', { timeout: 15_000 });
  await tab.goto('https://acmicpc.net/status?from_mine=1&problem_id=1000&user_id=tester');
  await closed;

  await ide.getByRole('tab', { name: '제출 기록' }).click();
  const item = ide.getByTestId('history-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('맞았습니다!!');
  await expect(item).toContainText('JavaScript');
  await expect(item).toContainText('44ms · 8.8MB');
  await expect(item.locator('.history-badge')).toHaveClass(/is-pass/);
  // The statement is still there, only hidden.
  await expect(ide.locator('.problem')).toBeHidden();

  await item.click();
  const detail = ide.getByTestId('history-detail');
  await expect(detail.getByTestId('history-code')).toHaveText(submitted);
  await expect(detail).toContainText('제출 번호 5004');

  // Changed code is not replaced without asking.
  await typeCode(page, ide, 'console.log(4); // second');
  await detail.getByRole('button', { name: '편집기로 불러오기' }).click();
  const dialog = ide.getByRole('dialog', { name: '코드 불러오기' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(ide.locator('.cm-content')).toContainText('second');
  await detail.getByRole('button', { name: '편집기로 불러오기' }).click();
  await dialog.getByRole('button', { name: '불러오기' }).click();
  await expect(ide.locator('.cm-content')).toHaveText(submitted);
  await expect(ide.getByText('제출 기록의 코드를 불러왔습니다.')).toBeVisible();

  await detail.getByRole('button', { name: '코드 복사' }).click();
  await expect(detail).toContainText(/복사했어요|Ctrl\+C로 복사해 주세요/);
  await detail.getByRole('button', { name: '← 제출 기록' }).click();
  await expect(ide.getByTestId('history-item')).toHaveCount(1);
});

test('백준 기록 불러오기 reads one status page, only when pressed', async ({ page, context }) => {
  const requests = await serveHistory(context);
  const ide = await openIde(page);
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await expect(ide.getByTestId('history')).toContainText('아직 이 화면에서 제출한 기록이 없어요');
  // Opening the tab sends nothing.
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);

  const boj = ide.getByTestId('boj-history');
  await boj.getByRole('button', { name: '백준 기록 불러오기' }).click();
  const rows = boj.getByTestId('boj-item');
  await expect(rows).toHaveCount(3);
  expect(requests).toEqual(['?problem_id=1000&user_id=tester']);
  await expect(rows.nth(0)).toContainText('맞았습니다!!');
  await expect(rows.nth(0)).toContainText('Python 3');
  await expect(rows.nth(0)).toContainText('40ms · 30.4MB · 58B');
  await expect(rows.nth(0)).toContainText('백준 기록');
  await expect(rows.nth(1).locator('.history-badge')).toHaveClass(/is-fail/);
  const source = rows.nth(0).getByRole('link', { name: '코드 보기 ↗' });
  await expect(source).toHaveAttribute('href', 'https://www.acmicpc.net/source/7003');
  await expect(source).toHaveAttribute('target', '_blank');

  // A second press right away is turned down, not sent.
  await boj.getByRole('button', { name: '백준 기록 불러오기' }).click();
  await expect(boj.getByRole('alert')).toContainText('몇 초 뒤에 다시 눌러 주세요');
  expect(requests).toHaveLength(1);
});

test('백준 기록 불러오기 asks to log in instead of sending a request', async ({
  page,
  context,
}) => {
  const loggedOut = problemHtml.replace(/<ul class="loginbar">[\s\S]*?<\/ul>/, '');
  const requests = await serveHistory(context, loggedOut);
  const ide = await openIde(page);
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  const boj = ide.getByTestId('boj-history');
  await boj.getByRole('button', { name: '백준 기록 불러오기' }).click();
  await expect(boj.getByRole('alert')).toContainText('백준에 로그인하지 않은 상태예요');
  expect(requests).toEqual([]);
});
