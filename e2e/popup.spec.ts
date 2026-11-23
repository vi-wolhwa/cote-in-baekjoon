import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

interface Tab {
  id?: number;
  url?: string;
}

declare const chrome: {
  storage: {
    local: {
      get: (keys: null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
  tabs: {
    query: (info: object) => Promise<Tab[]>;
    getCurrent: () => Promise<Tab | undefined>;
  };
};

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Synthetic Baekjoon pages; nothing reaches the real site. */
async function serveBaekjoon(context: BrowserContext) {
  const problem = readFileSync('tests/fixtures/problem-sample.html', 'utf8');
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) =>
    /\/problem\/\d+$/.test(route.request().url())
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: problem })
      : route.abort(),
  );
}

async function openPopup(page: Page, extensionId: string) {
  await page.setViewportSize({ width: 300, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
}

/** Judge results and problem meta as the IDE and status page would store them. */
async function seed(page: Page) {
  await page.evaluate(
    ({ MIN, DAY }) => {
      const now = Date.now();
      const judge = (problemId: number, resultCode: string, text: string, at: number) => ({
        problemId,
        solutionId: problemId * 7,
        status: 'done',
        resultText: text,
        resultCode,
        updatedAt: now - at,
      });
      return chrome.storage.local.set({
        'judge:1000': judge(1000, 'ac', '맞았습니다!!', 3 * MIN),
        'meta:1000': { title: 'A+B', language: 'cpp17', openedAt: now - 10 * MIN },
        'judge:1001': judge(1001, 'wa', '틀렸습니다', 2 * 60 * MIN),
        'meta:1001': { title: 'A-B', language: 'python3', openedAt: now - 3 * 60 * MIN },
        'judge:2557': judge(2557, 'tle', '시간 초과', 9 * DAY),
        'meta:1008': { title: 'A/B', language: 'java11', openedAt: now - 30 * MIN },
        'code:1000:cpp': 'int main(){}',
        'ui:keymap': 'vim',
      });
    },
    { MIN, DAY },
  );
  await page.reload();
}

test('home: empty state, and the search opens a problem page', async ({
  page,
  context,
  extensionId,
}) => {
  await serveBaekjoon(context);
  await openPopup(page, extensionId);
  await expect(page.getByRole('heading', { name: '코테 in 백준' })).toBeVisible();
  await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  await expect(page.getByText('아직 푼 문제가 없어요')).toBeVisible();
  await expect(page.getByTestId('stat')).toHaveText(['0제출한 문제', '0맞은 문제', '0최근 7일']);
  // The popup is open on its own tab here, not on a problem page: no hero card.
  await expect(page.getByText('지금 보는 문제')).toHaveCount(0);

  const input = page.getByLabel('문제 번호');
  await input.fill('abc');
  await page.getByRole('button', { name: '열기' }).click();
  await expect(page.getByRole('alert')).toHaveText('1부터 9999999까지의 숫자로 입력해 주세요.');
  await input.fill('10000000');
  await page.getByRole('button', { name: '열기' }).click();
  await expect(page.getByRole('alert')).toHaveText('1부터 9999999까지의 숫자로 입력해 주세요.');

  await input.fill('1000');
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: '열기' }).click();
  const problem = await opened;
  await expect(problem).toHaveURL('https://www.acmicpc.net/problem/1000');
});

test('home: stats and recent problems from saved results', async ({
  page,
  context,
  extensionId,
}) => {
  await serveBaekjoon(context);
  await openPopup(page, extensionId);
  await seed(page);

  await expect(page.getByTestId('stat')).toHaveText(['3제출한 문제', '1맞은 문제', '2최근 7일']);
  const rows = page.getByTestId('recent');
  await expect(rows).toHaveText([
    /^1000 · A\+B3분 전C\+\+17$/,
    /^1008 · A\/B30분 전Java 11$/,
    /^1001 · A-B2시간 전Python 3$/,
    /^2557번9일 전$/,
  ]);
  await expect(rows.nth(0).getByRole('img', { name: '맞았습니다!!' })).toHaveClass(
    /status-accepted/,
  );
  await expect(rows.nth(1).locator('.status')).toHaveClass(/status-opened/);
  await expect(rows.nth(2).locator('.status')).toHaveClass(/status-wrong/);
  await expect(rows.nth(3).locator('.status')).toHaveClass(/status-other/);

  const opened = context.waitForEvent('page');
  await rows.nth(2).click();
  await expect(await opened).toHaveURL('https://www.acmicpc.net/problem/1001');
});

test('home: opens the IDE in the problem tab, which saves the problem meta', async ({
  page,
  context,
  extensionId,
}) => {
  await serveBaekjoon(context);
  await page.goto('https://acmicpc.net/problem/1000');
  await expect(page.getByRole('button', { name: '코딩테스트' })).toBeVisible();
  // Leave only the problem tab, so the popup's stand-in active tab below is that one.
  for (const other of context.pages()) if (other !== page) await other.close();

  // A real toolbar popup cannot be opened from a test. Open popup.html in a tab and answer
  // its active-tab query with the problem tab, as activeTab would.
  const popup = await context.newPage();
  await popup.addInitScript(() => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async () => {
      const self = await chrome.tabs.getCurrent();
      const other = (await query({})).find((t) => t.id !== self?.id);
      return other ? [{ ...other, url: 'https://acmicpc.net/problem/1000' }] : [];
    };
  });
  await openPopup(popup, extensionId);
  await expect(popup.getByText('지금 보는 문제')).toBeVisible();
  await expect(popup.getByText('1000번', { exact: true })).toBeVisible();
  await popup.getByRole('button', { name: '코테 화면으로 풀기 →' }).click();

  const ide = page.frameLocator('#cib-ide-overlay');
  await expect(ide.getByRole('heading', { name: '테스트용 덧셈' })).toBeVisible();
  await expect
    .poll(() => storage(context, extensionId))
    .toMatchObject({ 'meta:1000': { title: '테스트용 덧셈', language: 'javascript' } });

  // The IDE's top bar links to the help page.
  await expect(
    ide.getByRole('navigation', { name: '경로' }).getByRole('link', { name: '도움말' }),
  ).toHaveAttribute('href', `chrome-extension://${extensionId}/help.html`);
});

/** storage.local read from a fresh extension page. */
async function storage(context: BrowserContext, extensionId: string) {
  const reader = await context.newPage();
  await reader.goto(`chrome-extension://${extensionId}/popup.html`);
  const items = await reader.evaluate(() => chrome.storage.local.get(null));
  await reader.close();
  return items;
}

test('backup: summary and export from the popup', async ({ page, extensionId }) => {
  await openPopup(page, extensionId);
  await seed(page);
  await page.getByRole('tab', { name: '백업' }).click();
  await expect(page.getByTestId('backup-summary')).toContainText('문제4개');
  await expect(page.getByTestId('backup-summary')).toContainText('코드1개');
  await expect(page.getByTestId('backup-summary')).toContainText('채점 결과3개');
  await expect(page.getByTestId('backup-summary')).toContainText('설정1개');

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일로 내보내기' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^코딩테스트-in-백준-백업-\d{4}-\d\d-\d\d\.json$/);
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8')) as {
    items: Record<string, unknown>;
  };
  expect(Object.keys(backup.items).sort()).toEqual([
    'code:1000:cpp',
    'judge:1000',
    'judge:1001',
    'judge:2557',
    'meta:1000',
    'meta:1001',
    'meta:1008',
    'ui:keymap',
  ]);
  await expect(page.getByRole('status')).toContainText('내보냈습니다');
});

test('backup: import opens the options page', async ({ page, context, extensionId }) => {
  await openPopup(page, extensionId);
  await page.getByRole('tab', { name: '백업' }).click();
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: '가져오기' }).click();
  await expect(await opened).toHaveURL(`chrome-extension://${extensionId}/options.html`);
});

test('help: report link, questions and the help page', async ({ page, context, extensionId }) => {
  await openPopup(page, extensionId);
  await page.getByRole('tab', { name: '도움말' }).click();
  const report = page.getByRole('link', { name: '문제 신고하기' });
  const href = new URL((await report.getAttribute('href')) ?? '');
  expect(href.origin + href.pathname).toBe(
    'https://github.com/vi-wolhwa/cote-in-baekjoon/issues/new',
  );
  expect(href.searchParams.get('template')).toBe('1-bug.yml');
  expect(href.searchParams.get('version')).toMatch(/^\d+\.\d+\.\d+ \/ (Chrome|Edge) \d+$/);
  expect(href.searchParams.has('problem')).toBe(false);
  expect(
    new URL(
      (await page.getByRole('link', { name: '기능 제안하기' }).getAttribute('href')) ?? '',
    ).searchParams.get('template'),
  ).toBe('3-feature.yml');
  await expect(page.getByRole('link', { name: '오픈소스 라이선스' })).toHaveAttribute(
    'href',
    `chrome-extension://${extensionId}/THIRD_PARTY_NOTICES.txt`,
  );

  const opened = context.waitForEvent('page');
  await page.getByRole('link', { name: '백준과 실행 결과가 달라요' }).click();
  const help = await opened;
  await expect(help).toHaveURL(`chrome-extension://${extensionId}/help.html#run-diff`);
  await expect(help.getByRole('heading', { level: 1 })).toHaveText('도움말');
  const section = help.locator('#run-diff');
  await expect(section.getByRole('heading')).toHaveText('백준과 실행 결과가 달라요');
  await expect(section.locator('code').first()).toHaveText('throw');
  const runDiff = new URL((await section.getByTestId('report-link').getAttribute('href')) ?? '');
  expect(runDiff.searchParams.get('template')).toBe('2-run-diff.yml');
  const bug = new URL(
    (await help.locator('#no-button').getByTestId('report-link').getAttribute('href')) ?? '',
  );
  expect(bug.searchParams.get('template')).toBe('1-bug.yml');
  await expect(help.getByTestId('report-link')).toHaveCount(6);
});
