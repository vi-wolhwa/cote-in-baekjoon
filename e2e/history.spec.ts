import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { problemHtml } from './exam-helpers';

/**
 * '제출 기록' tab (M7, ADR-0012): 내 제출 (the user's Baekjoon status list), 맞힌 사람 and 숏코딩
 * (everyone's accepted submissions, by language), and code read from Baekjoon. Baekjoon's
 * pages (lists and sources) are read in inactive tabs the extension opens and closes.
 * Synthetic pages only.
 */

const statusPage = readFileSync('tests/fixtures/status-page.html', 'utf8');
const shortPage = readFileSync('tests/fixtures/short-page.html', 'utf8');
const sourcePage = readFileSync('tests/fixtures/source-page.html', 'utf8');
const NEXT_LINK = /<a [^>]*id="next_page"[^>]*>.*?<\/a>/;
const PREV_LINK = /<a [^>]*id="prev_page"[^>]*>.*?<\/a>/;
/** The last page: no '다음 페이지'. */
const lastPage = statusPage.replace(NEXT_LINK, '');
/** The page after the fixture: older submissions 6903..6900, the last one. */
const secondPage = lastPage
  .replace(PREV_LINK, '')
  .replace(/700(\d)/g, '690$1')
  .replaceAll('data-timestamp="18', 'data-timestamp="17');

const BOJ = 'https://acmicpc.net';
const MINE = `${BOJ}/status?problem_id=1000&user_id=tester`;

test.use({ viewport: { width: 1400, height: 1000 } });

async function openIde(page: Page) {
  await page.goto('https://acmicpc.net/problem/1000');
  await page.getByRole('button', { name: '코딩테스트' }).click();
  const ide = page.frameLocator('#cib-ide-overlay');
  await expect(ide.getByRole('heading', { name: '테스트용 덧셈' })).toBeVisible();
  return ide;
}

type Pages = (url: URL) => string;
const defaultPages: Pages = (url) => {
  if (url.pathname.startsWith('/source/')) return sourcePage;
  // 맞힌 사람 and 숏코딩 are built the same way.
  if (url.pathname.startsWith('/short/') || url.pathname.startsWith('/problem/status')) {
    return shortPage;
  }
  return url.searchParams.has('top') ? secondPage : statusPage;
};

/** Serves only the problem page, so no context route touches the reading tabs. */
async function serveProblem(context: BrowserContext, body = problemHtml) {
  // Only the problem page itself: /problem/status is a reading tab's page.
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\/problem\/\d+$/, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body }),
  );
}

/**
 * Answers the tabs the extension opens to read Baekjoon pages, in the order it opens them:
 * each gets its own route (a context route would see a tab's first navigation before the
 * test knows the tab, which breaks Playwright) and is loaded at its URL. Returns the
 * distinct pages read (path and query) and how many tabs opened.
 */
function answerTabs(context: BrowserContext, urls: string[], pages: Pages = defaultPages) {
  const queue = [...urls];
  let gate: Promise<void> = Promise.resolve();
  const result = {
    read: [] as string[],
    opened: 0,
    /** Holds the pages served from now on until the returned function is called. */
    hold() {
      let release = () => {};
      gate = new Promise<void>((resolve) => (release = resolve));
      return release;
    },
  };
  context.on('page', (tab) => {
    const url = queue.shift();
    if (!url) return;
    result.opened += 1;
    void (async () => {
      await tab
        .route(
          /^https:\/\/(www\.)?acmicpc\.net\/(status|short|source|problem\/status)/,
          async (route) => {
            const target = new URL(route.request().url());
            const read = target.pathname + target.search;
            if (!result.read.includes(read)) result.read.push(read);
            await gate;
            // The extension closes the tab as soon as it has read it.
            await route
              .fulfill({ contentType: 'text/html; charset=utf-8', body: pages(target) })
              .catch(() => undefined);
          },
        )
        .catch(() => undefined);
      // Only to the commit: the extension closes the tab around its load event, and a
      // navigation still waiting for it then breaks Playwright's connection.
      if (!tab.isClosed()) await tab.goto(url, { waitUntil: 'commit' }).catch(() => undefined);
    })();
  });
  return result;
}

test('reads 내 제출 to fill the view and opens your code from Baekjoon into the editor', async ({
  page,
  context,
}) => {
  await serveProblem(context);
  const ide = await openIde(page);
  const { read } = answerTabs(context, [MINE, `${MINE}&top=6990`, `${BOJ}/source/7003`]);
  await ide.getByRole('tab', { name: '제출 기록' }).click();

  const mine = ide.getByTestId('mine-status');
  const rows = mine.getByTestId('mine-status-row');
  // Baekjoon's first page has three of mine and a next page: the view has room for more,
  // so the next page is read too.
  await expect(rows).toHaveCount(6);
  expect(read.slice(0, 2)).toEqual([
    '/status?problem_id=1000&user_id=tester',
    '/status?problem_id=1000&user_id=tester&top=6990',
  ]);
  await expect(rows.nth(0)).toContainText('정답');
  await expect(rows.nth(0)).toContainText('Python 3');
  await expect(rows.nth(0)).toContainText('31,120KB');
  await expect(rows.nth(0)).toContainText('58B');
  await expect(rows.nth(1).locator('.result-chip')).toHaveClass(/is-fail/);
  await expect(rows.nth(1)).toContainText('오답');
  await expect(rows.nth(3)).toContainText('3년 전');
  // One page: no pager.
  await expect(ide.getByRole('navigation', { name: '내 제출 페이지' })).toBeHidden();
  // Your own code always opens.
  await expect(mine.locator('.row-open')).toHaveCount(6);

  await rows.nth(0).click();
  const detail = ide.getByTestId('history-detail');
  await expect(detail.locator('.cm-content')).toContainText('scanf("%d %d", &a, &b);');
  expect(read).toContain('/source/7003');
  await detail.getByRole('button', { name: '편집기로 불러오기' }).click();
  // Always asked first; here the editor's language changes too.
  const dialog = ide.getByRole('dialog', { name: '코드 불러오기' });
  await expect(dialog).toContainText('편집기 언어를 Python 3(으)로 바꾸고');
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(ide.getByRole('combobox', { name: '언어' }).first()).toHaveValue('javascript');
  await detail.getByRole('button', { name: '편집기로 불러오기' }).click();
  await dialog.getByRole('button', { name: '불러오기' }).click();
  await expect(ide.locator('.code-section .cm-content')).toContainText('scanf');
  await expect(ide.getByRole('combobox', { name: '언어' }).first()).toHaveValue('python3');
  await expect(ide.getByText('제출 기록의 코드를 불러왔습니다.')).toBeVisible();

  await detail.getByRole('button', { name: '복사' }).click();
  await expect(detail).toContainText(/복사했어요|복사하지 못했어요/);
  await detail.getByRole('button', { name: '목록으로' }).click();
  await expect(rows).toHaveCount(6);
});

test('맞힌 사람 reads when chosen, shows shared code, keeps lists and reloads on 새로 고침', async ({
  page,
  context,
}) => {
  await serveProblem(context);
  const ide = await openIde(page);
  const tabs = answerTabs(context, [
    MINE,
    `${MINE}&top=6990`,
    `${BOJ}/problem/status/1000`,
    `${BOJ}/problem/status/1000`,
    `${BOJ}/source/8001`,
  ]);
  const { read } = tabs;
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await expect(ide.getByTestId('mine-status-row')).toHaveCount(6);
  expect(read).not.toContain('/problem/status/1000');

  const views = ide.getByRole('tablist', { name: '제출 기록 보기' });
  await views.getByRole('tab', { name: '맞힌 사람' }).click();
  const accepted = ide.getByTestId('accepted-status');
  const rows = accepted.getByTestId('accepted-status-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('alice');
  // Shared code opens; the rest shows a lock.
  await expect(accepted.locator('.row-open')).toHaveCount(1);
  await expect(accepted.locator('.row-locked')).toHaveCount(1);
  expect(read).toContain('/problem/status/1000');

  // Coming back to the tab shows the loaded lists again without reading Baekjoon.
  await ide.getByRole('tab', { name: '문제 설명' }).click();
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await views.getByRole('tab', { name: '맞힌 사람' }).click();
  await expect(rows).toHaveCount(2);
  await page.waitForTimeout(500);
  expect(tabs.opened).toBe(3);

  // 새로 고침: the old rows go away while the first page loads again, then come back.
  const release = tabs.hold();
  await ide.getByRole('button', { name: '새로 고침' }).click();
  await expect(rows).toHaveCount(0);
  await expect(ide.getByRole('tabpanel', { name: '맞힌 사람' })).toContainText(
    '백준에서 불러오는 중',
  );
  release();
  await expect(rows).toHaveCount(2);
  expect(tabs.opened).toBe(4);

  // Someone's shared code: read from its Baekjoon page and shown with colours.
  await accepted.locator('tr.is-open').click();
  const detail = ide.getByTestId('history-detail');
  await expect(detail.locator('.cm-content')).toContainText('printf');
  await expect(detail).toContainText('alice');
});

test('숏코딩 filters by language, the editor’s own language first', async ({ page, context }) => {
  await serveProblem(context);
  const ide = await openIde(page);
  const { read } = answerTabs(context, [
    MINE,
    `${MINE}&top=6990`,
    `${BOJ}/short/status/1000`,
    `${BOJ}/short/status/1000/17/1`,
    `${BOJ}/short/status/1000/1001/1`,
    `${BOJ}/source/8001`,
  ]);
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await expect(ide.getByTestId('mine-status-row')).toHaveCount(6);
  await ide.getByRole('tab', { name: '숏코딩' }).click();
  const short = ide.getByTestId('short-status');
  await expect(short.getByTestId('short-status-row')).toHaveCount(2);

  const filter = ide.getByRole('combobox', { name: '언어' }).last();
  // '모든 언어', the editor's language as Baekjoon names it, then A to Z.
  const options = await filter.locator('option').allTextContents();
  expect(options.slice(0, 3)).toEqual(['모든 언어', '현재 언어', 'C']);
  expect(options.indexOf('Java 8')).toBeLessThan(options.indexOf('Java 11'));
  expect(options.indexOf('Kotlin (JVM)')).toBeLessThan(options.indexOf('node.js'));

  await filter.selectOption({ label: '현재 언어' });
  await expect.poll(() => read).toContain('/short/status/1000/17/1');
  await filter.selectOption({ label: 'C++' });
  await expect.poll(() => read).toContain('/short/status/1000/1001/1');
  await expect(short.getByTestId('short-status-row')).toHaveCount(2);
  await expect(short.locator('.row-locked')).toHaveCount(1);

  await short.locator('tr.is-open').click();
  const detail = ide.getByTestId('history-detail');
  await expect(detail.locator('.cm-content')).toContainText('printf');
  await detail.getByRole('button', { name: '편집기로 불러오기' }).click();
  await ide
    .getByRole('dialog', { name: '코드 불러오기' })
    .getByRole('button', { name: '불러오기' })
    .click();
  await expect(ide.locator('.code-section .cm-content')).toContainText('scanf');
  await expect(ide.getByRole('combobox', { name: '언어' }).first()).toHaveValue('cpp14');
});

test('says why 내 제출 is empty when the Baekjoon id is unknown', async ({ page, context }) => {
  const loggedOut = problemHtml.replace(/<ul class="loginbar">[\s\S]*?<\/ul>/, '');
  await serveProblem(context, loggedOut);
  const ide = await openIde(page);
  const { read } = answerTabs(context, [`${BOJ}/problem/status/1000`]);
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await expect(ide.getByTestId('history')).toContainText('백준 아이디를 몰라');
  await page.waitForTimeout(300);
  expect(read).toEqual([]);
  await ide.getByRole('tab', { name: '맞힌 사람' }).click();
  await expect(ide.getByTestId('accepted-status-row')).toHaveCount(2);
  expect(read).toEqual(['/problem/status/1000']);
});

test('the split snaps to the width where every column fits', async ({ page, context }) => {
  await serveProblem(context);
  const ide = await openIde(page);
  answerTabs(context, [MINE, `${MINE}&top=6990`, `${BOJ}/problem/status/1000`]);
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  // Tabs are answered in the order they open: let 내 제출 read both of its pages first, or
  // the 맞힌 사람 tab can get 내 제출's second page.
  await expect(ide.getByTestId('mine-status-row')).toHaveCount(6);
  await ide.getByRole('tab', { name: '맞힌 사람' }).click();
  await expect(ide.getByTestId('accepted-status-row')).toHaveCount(2);

  const split = await ide.locator('.workspace > .split').boundingBox();
  const gutter = await ide.locator('.split-gutter-horizontal').first().boundingBox();
  if (!split || !gutter) throw new Error('no split');
  await page.mouse.move(gutter.x + gutter.width / 2, gutter.y + gutter.height / 2);
  await page.mouse.down();
  // 8px past the recommended width: close enough to snap.
  await page.mouse.move(split.x + 581 + 8, gutter.y + gutter.height / 2, { steps: 5 });
  await expect(ide.locator('.split-snap-label')).toHaveText('권장 너비');
  await page.mouse.up();
  await expect(ide.locator('.split-snap-label')).toHaveCount(0);

  const pane = await ide.locator('.workspace > .split > .split-pane').first().boundingBox();
  expect(Math.round(pane?.width ?? 0)).toBe(581);
  // Every column shows, and the spacer is down to nothing.
  const table = ide.getByTestId('accepted-status');
  await expect(table.locator('th.col-length')).toBeVisible();
  await expect(table.locator('th.col-rank')).toBeVisible();
  expect(Math.round((await table.locator('th.col-gap').boundingBox())?.width ?? -1)).toBe(0);
});
