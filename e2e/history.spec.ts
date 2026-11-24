import { readFileSync } from 'node:fs';
import type { BrowserContext, FrameLocator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { problemHtml, serveBaekjoon } from './exam-helpers';

/**
 * '제출 기록' tab (M7, ADR-0012): 내 제출 merges the IDE's submissions (with their code) and
 * the user's Baekjoon status list; 채점 현황 and 숏코딩 show everyone's, by language. Baekjoon's
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
const ALL = `${BOJ}/status?problem_id=1000`;

test.use({ viewport: { width: 1400, height: 1000 } });

async function openIde(page: Page) {
  await page.goto('https://acmicpc.net/problem/1000');
  await page.getByRole('button', { name: '코딩테스트' }).click();
  const ide = page.frameLocator('#cib-ide-overlay');
  await expect(ide.getByRole('heading', { name: '테스트용 덧셈' })).toBeVisible();
  return ide;
}

async function typeCode(page: Page, ide: FrameLocator, code: string) {
  // The editor, not the read-only code view of 제출 기록.
  const content = ide.locator('.code-section .cm-content');
  await expect(async () => {
    await content.click();
    await expect(ide.locator('.code-section .cm-editor')).toHaveClass(/cm-focused/, {
      timeout: 500,
    });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(code);
    await expect(content).toContainText(code.slice(-10), { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

type Pages = (url: URL) => string;
const defaultPages: Pages = (url) => {
  if (url.pathname.startsWith('/source/')) return sourcePage;
  if (url.pathname.startsWith('/short/')) return shortPage;
  return url.searchParams.has('top') ? secondPage : statusPage;
};

/** Serves only the problem page, so no context route touches the reading tabs. */
async function serveProblem(context: BrowserContext, body = problemHtml) {
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\/problem\//, (route) =>
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
        .route(/^https:\/\/(www\.)?acmicpc\.net\/(status|short|source)/, async (route) => {
          const target = new URL(route.request().url());
          const read = target.pathname + target.search;
          if (!result.read.includes(read)) result.read.push(read);
          await gate;
          // The extension closes the tab as soon as it has read it.
          await route
            .fulfill({ contentType: 'text/html; charset=utf-8', body: pages(target) })
            .catch(() => undefined);
        })
        .catch(() => undefined);
      // Only to the commit: the extension closes the tab around its load event, and a
      // navigation still waiting for it then breaks Playwright's connection.
      if (!tab.isClosed()) await tab.goto(url, { waitUntil: 'commit' }).catch(() => undefined);
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
  answerTabs(context, [MINE], () => lastPage);
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  const mine = ide.getByTestId('mine-status');
  // Baekjoon's three rows and the IDE's submission, which Baekjoon's page does not list.
  await expect(mine.getByTestId('mine-status-row')).toHaveCount(4);
  const item = mine.getByTestId('mine-status-row').filter({ hasText: 'JavaScript' });
  await expect(item).toContainText('정답');
  await expect(item).toContainText('9,000KB');
  await expect(item).toContainText('44ms');
  await expect(item.locator('.result-chip')).toHaveClass(/is-pass/);
  // The statement is still there, only hidden.
  await expect(ide.locator('.problem')).toBeHidden();

  await item.click();
  const detail = ide.getByTestId('history-detail');
  await expect(detail.locator('.cm-content')).toHaveText(submitted);
  await expect(detail).toContainText('JavaScript');

  // Changed code is not replaced without asking.
  await typeCode(page, ide, 'console.log(4); // second');
  await detail.getByRole('button', { name: '편집기로 불러오기' }).click();
  const dialog = ide.getByRole('dialog', { name: '코드 불러오기' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(ide.locator('.code-section .cm-content')).toContainText('second');
  await detail.getByRole('button', { name: '편집기로 불러오기' }).click();
  await dialog.getByRole('button', { name: '불러오기' }).click();
  await expect(ide.locator('.code-section .cm-content')).toHaveText(submitted);
  await expect(ide.getByText('제출 기록의 코드를 불러왔습니다.')).toBeVisible();

  await detail.getByRole('button', { name: '복사' }).click();
  await expect(detail).toContainText(/복사했어요|복사하지 못했어요/);
  await detail.getByRole('button', { name: '목록으로' }).click();
  await expect(mine.getByTestId('mine-status-row')).toHaveCount(4);
});

test('reads 내 제출 when the tab opens, 채점 현황 when it is chosen, and pages on', async ({
  page,
  context,
}) => {
  await serveProblem(context);
  const ide = await openIde(page);
  const tabs = answerTabs(context, [MINE, ALL, `${MINE}&top=6990`, ALL, `${BOJ}/source/7003`]);
  const { read } = tabs;
  await ide.getByRole('tab', { name: '제출 기록' }).click();

  const mine = ide.getByTestId('mine-status');
  const rows = mine.getByTestId('mine-status-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('정답');
  await expect(rows.nth(0)).toContainText('Python 3');
  await expect(rows.nth(0)).toContainText('31,120KB');
  await expect(rows.nth(0)).toContainText('58B');
  await expect(rows.nth(1).locator('.result-chip')).toHaveClass(/is-fail/);
  await expect(rows.nth(1)).toContainText('오답');
  // Only 내 제출 is read when the tab opens.
  await page.waitForTimeout(300);
  expect(read).toEqual(['/status?problem_id=1000&user_id=tester']);

  const views = ide.getByRole('tablist', { name: '제출 기록 보기' });
  await views.getByRole('tab', { name: '채점 현황' }).click();
  const all = ide.getByTestId('all-status');
  await expect(all.getByTestId('all-status-row')).toHaveCount(4);
  await expect(all).toContainText('someone');
  // Shared code opens; the rest shows a lock.
  await expect(all.locator('tr.is-open')).toHaveCount(2);
  await expect(all.locator('.row-locked')).toHaveCount(2);
  expect(read[1]).toBe('/status?problem_id=1000');

  // Paging past the loaded rows reads Baekjoon's next page.
  await views.getByRole('tab', { name: '내 제출' }).click();
  const pager = ide.getByRole('navigation', { name: '내 제출 페이지' });
  await pager.getByRole('button', { name: '다음' }).click();
  // Three more of mine: they fit on this page, so it stays.
  await expect(rows).toHaveCount(6);
  // The older page's first row, after this page's three.
  await expect(rows.nth(3)).toContainText(/2023-11-1[45]/);
  expect(read[2]).toBe('/status?problem_id=1000&user_id=tester&top=6990');
  // That was the last page.
  await expect(pager).toBeHidden();

  // Coming back to the tab shows the loaded lists again without reading Baekjoon.
  await ide.getByRole('tab', { name: '문제 설명' }).click();
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await views.getByRole('tab', { name: '채점 현황' }).click();
  await expect(all.getByTestId('all-status-row')).toHaveCount(4);
  await page.waitForTimeout(500);
  expect(tabs.opened).toBe(3);

  // 새로 고침: the old rows go away while the first page loads again, then come back.
  const release = tabs.hold();
  await ide.getByRole('button', { name: '새로 고침' }).click();
  await expect(all.getByTestId('all-status-row')).toHaveCount(0);
  await expect(ide.getByRole('tabpanel', { name: '채점 현황' })).toContainText(
    '백준에서 불러오는 중',
  );
  release();
  await expect(all.getByTestId('all-status-row')).toHaveCount(4);
  expect(tabs.opened).toBe(4);

  // Someone's shared code: read from its Baekjoon page and shown with colours.
  await all.locator('tr.is-open').first().click();
  const detail = ide.getByTestId('history-detail');
  await expect(detail.locator('.cm-content')).toContainText('scanf("%d %d", &a, &b);');
  await expect(detail).toContainText('tester');
  expect(read).toContain('/source/7003');
});

test('숏코딩 reads the ranking by language and opens shared code into the editor', async ({
  page,
  context,
}) => {
  await serveProblem(context);
  const ide = await openIde(page);
  const { read } = answerTabs(context, [
    MINE,
    `${BOJ}/short/status/1000`,
    `${BOJ}/short/status/1000/1001/1`,
    `${BOJ}/source/8001`,
  ]);
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await expect(ide.getByTestId('mine-status-row')).toHaveCount(3);
  await ide.getByRole('tab', { name: '숏코딩' }).click();
  const short = ide.getByTestId('short-status');
  await expect(short.getByTestId('short-status-row')).toHaveCount(2);
  await expect(short.getByTestId('short-status-row').first()).toContainText('alice');

  await ide.getByRole('combobox', { name: '언어' }).last().selectOption({ label: 'C++' });
  await expect.poll(() => read).toContain('/short/status/1000/1001/1');
  await expect(short.getByTestId('short-status-row')).toHaveCount(2);
  await expect(short.locator('.row-locked')).toHaveCount(1);

  await short.locator('tr.is-open').click();
  const detail = ide.getByTestId('history-detail');
  await expect(detail.locator('.cm-content')).toContainText('printf');
  await detail.getByRole('button', { name: '편집기로 불러오기' }).click();
  await expect(ide.locator('.code-section .cm-content')).toContainText('scanf');
  await expect(ide.getByRole('combobox', { name: '언어' }).first()).toHaveValue('cpp14');
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
  await expect(ide.getByTestId('mine-status')).toBeVisible();
  await page.waitForTimeout(300);
  expect(read).toEqual([]);
  await ide.getByRole('tab', { name: '채점 현황' }).click();
  await expect(ide.getByTestId('all-status').getByTestId('all-status-row')).toHaveCount(4);
  expect(read).toEqual(['/status?problem_id=1000']);
});
