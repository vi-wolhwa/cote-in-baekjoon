import { readFileSync } from 'node:fs';
import type { BrowserContext, FrameLocator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { problemHtml, serveBaekjoon } from './exam-helpers';

/**
 * '제출 기록' tab (M7, ADR-0012): 내 제출 merges the IDE's submissions (with their code) and
 * the user's Baekjoon status list; 채점 현황 shows everyone's. Baekjoon's pages are read in
 * inactive tabs the extension opens and closes. Synthetic pages only.
 */

const statusPage = readFileSync('tests/fixtures/status-page.html', 'utf8');
const NEXT_LINK = /<a [^>]*id="next_page"[^>]*>.*?<\/a>/;
const PREV_LINK = /<a [^>]*id="prev_page"[^>]*>.*?<\/a>/;
/** The last page: no '다음 페이지'. */
const lastPage = statusPage.replace(NEXT_LINK, '');
/** The page after the fixture: older submissions 6903..6900, the last one. */
const secondPage = lastPage
  .replace(PREV_LINK, '')
  .replace(/700(\d)/g, '690$1')
  .replaceAll('data-timestamp="18', 'data-timestamp="17');

const MINE = 'https://acmicpc.net/status?problem_id=1000&user_id=tester';
const ALL = 'https://acmicpc.net/status?problem_id=1000';

test.use({ viewport: { width: 1400, height: 1000 } });

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

type Pages = (params: URLSearchParams) => string;
const defaultPages: Pages = (p) => (p.has('top') ? secondPage : statusPage);

/** Serves only the problem page, so no context route touches the reading tabs. */
async function serveProblem(context: BrowserContext, body = problemHtml) {
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\/problem\//, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body }),
  );
}

/**
 * Answers the tabs the extension opens to read status pages, in the order it opens them:
 * each gets its own route (a context route would see a tab's first navigation before the
 * test knows the tab, which breaks Playwright) and is loaded at its URL. Returns the
 * distinct queries read and how many tabs opened.
 */
function answerTabs(context: BrowserContext, urls: string[], pages: Pages = defaultPages) {
  const queue = [...urls];
  const result = { read: [] as string[], opened: 0 };
  context.on('page', (tab) => {
    const url = queue.shift();
    if (!url) return;
    result.opened += 1;
    void (async () => {
      await tab
        .route(/^https:\/\/(www\.)?acmicpc\.net\/status\?/, async (route) => {
          const search = new URL(route.request().url()).search;
          if (!result.read.includes(search)) result.read.push(search);
          // The extension closes the tab as soon as it has read it.
          await route
            .fulfill({
              contentType: 'text/html; charset=utf-8',
              body: pages(new URL(route.request().url()).searchParams),
            })
            .catch(() => undefined);
        })
        .catch(() => undefined);
      if (!tab.isClosed()) await tab.goto(url).catch(() => undefined);
    })();
  });
  return result;
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

  // The submit flow is done: from here only the reading tabs load Baekjoon pages.
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  answerTabs(context, [MINE, ALL], () => lastPage);
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  const mine = ide.getByTestId('my-status');
  // Baekjoon's three rows and the IDE's submission, which Baekjoon's page does not list.
  await expect(mine.getByTestId('my-status-row')).toHaveCount(4);
  const item = mine.locator('tr.is-ide');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('맞았습니다!!');
  await expect(item).toContainText('JavaScript');
  await expect(item).toContainText('9000 KB');
  await expect(item).toContainText('44 ms');
  await expect(item.locator('.status-result')).toHaveClass(/is-pass/);
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
  await expect(mine.locator('tr.is-ide')).toHaveCount(1);
});

test('reads my and everyone’s status lists when the tab opens, and pages on', async ({
  page,
  context,
}) => {
  await serveProblem(context);
  const ide = await openIde(page);
  const tabs = answerTabs(context, [MINE, ALL, `${MINE}&top=6990`]);
  const { read } = tabs;
  await ide.getByRole('tab', { name: '제출 기록' }).click();

  const mine = ide.getByTestId('my-status');
  const rows = mine.getByTestId('my-status-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('맞았습니다!!');
  await expect(rows.nth(0)).toContainText('Python 3');
  await expect(rows.nth(0)).toContainText('31120 KB');
  await expect(rows.nth(0)).toContainText('40 ms');
  await expect(rows.nth(0)).toContainText('58 B');
  await expect(rows.nth(1).locator('.status-result')).toHaveClass(/is-fail/);
  // Made on Baekjoon: the number opens its source there.
  const source = rows.nth(0).getByRole('link', { name: '7003' });
  await expect(source).toHaveAttribute('href', 'https://www.acmicpc.net/source/7003');
  await expect(source).toHaveAttribute('target', '_blank');

  const all = ide.getByTestId('all-status');
  await expect(all.getByTestId('all-status-row')).toHaveCount(4);
  await expect(all).toContainText('someone');
  expect(read).toEqual(['?problem_id=1000&user_id=tester', '?problem_id=1000']);

  // Paging past the loaded rows reads Baekjoon's next page.
  const pager = ide.getByRole('navigation', { name: '내 제출 페이지' });
  await pager.getByRole('button', { name: '다음 페이지' }).click();
  // Three more of mine: they fit on this page, so it stays.
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(3)).toContainText('6903');
  expect(read).toHaveLength(3);
  expect(read[2]).toBe('?problem_id=1000&user_id=tester&top=6990');
  // That was the last page.
  await expect(pager).toBeHidden();

  // Coming back to the tab shows the loaded lists again without reading Baekjoon.
  await ide.getByRole('tab', { name: '문제 설명' }).click();
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await expect(all.getByTestId('all-status-row')).toHaveCount(4);
  await page.waitForTimeout(500);
  expect(tabs.opened).toBe(3);
});

test('shows the IDE’s submissions only when the Baekjoon id is unknown', async ({
  page,
  context,
}) => {
  const loggedOut = problemHtml.replace(/<ul class="loginbar">[\s\S]*?<\/ul>/, '');
  await serveProblem(context, loggedOut);
  const ide = await openIde(page);
  const { read } = answerTabs(context, [ALL]);
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await expect(ide.getByTestId('history')).toContainText('백준 아이디를 몰라');
  await expect(ide.getByTestId('my-status')).toBeVisible();
  await expect(ide.getByTestId('all-status').getByTestId('all-status-row')).toHaveCount(4);
  expect(read).toEqual(['?problem_id=1000']);
});
