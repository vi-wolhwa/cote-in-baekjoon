import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Mock exam setup (#100, #102): popup tab, exam.html#setup and the Baekjoon menu. */
test.use({ grantSolvedAc: true });

declare const chrome: {
  storage: {
    local: {
      get: (keys: string | null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
};

const problemHtml = readFileSync('tests/fixtures/problem-sample.html', 'utf8');

/** Synthetic solved.ac problems: numbers and titles made up for these tests. */
function items(ids: number[]) {
  return ids.map((id, i) => ({
    problemId: id,
    titleKo: `테스트 문제 ${id}`,
    level: 6 + i,
    isSolvable: true,
    tags: [],
  }));
}

/** Answers solved.ac's search (and problem/show) locally and records the queries. */
async function stubSolvedAc(context: BrowserContext, found: number[]) {
  const queries: URL[] = [];
  await context.route(/^https:\/\/solved\.ac\//, (route) => {
    const url = new URL(route.request().url());
    queries.push(url);
    if (url.pathname === '/api/v3/search/problem') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ count: found.length, items: items(found) }),
      });
    }
    if (url.pathname === '/api/v3/problem/show') {
      const id = Number(url.searchParams.get('problemId'));
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(items([id])[0]),
      });
    }
    return route.abort();
  });
  return queries;
}

async function openPopupExamTab(page: Page, extensionId: string) {
  await page.setViewportSize({ width: 300, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('tab', { name: '모의 시험' }).click();
}

test('popup: builds the solved.ac query and opens the new exam', async ({
  page,
  context,
  extensionId,
}) => {
  const queries = await stubSolvedAc(context, [2001, 2002, 2003, 2004, 2005]);
  await openPopupExamTab(page, extensionId);

  // Defaults: 실버~골드, every algorithm, 4문제, 120분.
  await expect(page.getByRole('button', { name: '실버' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '골드' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '브론즈' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByTestId('count')).toHaveText('4');
  await expect(page.getByRole('button', { name: '120분' })).toHaveAttribute('aria-pressed', 'true');
  // No Baekjoon id yet: '이미 푼 문제 빼기' is off and says why.
  const exclude = page.getByRole('switch', { name: /이미 푼 문제 빼기/ });
  await expect(exclude).toBeDisabled();
  await expect(page.getByText('백준 아이디를 몰라서')).toBeVisible();

  // A content script saw the user on Baekjoon.
  await page.evaluate(() => chrome.storage.local.set({ 'boj:handle': 'tester' }));
  await page.reload();
  await page.getByRole('tab', { name: '모의 시험' }).click();
  await expect(exclude).toBeEnabled();
  await expect(exclude).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('@tester')).toBeVisible();

  // Conditions: 골드 only, DP and BFS·DFS, 3문제, 90분.
  await page.getByRole('button', { name: '실버' }).click();
  await page.getByRole('button', { name: 'DP' }).click();
  await page.getByRole('button', { name: 'BFS·DFS' }).click();
  await page.getByRole('button', { name: '문제 수 줄이기' }).click();
  await page.getByRole('button', { name: '90분' }).click();
  await expect
    .poll(() => page.evaluate(() => chrome.storage.local.get('ui:exam-draft')))
    .toEqual({
      'ui:exam-draft': {
        tiers: ['gold'],
        tags: ['dp', 'bfs-dfs'],
        count: 3,
        minutes: 90,
        customMinutes: false,
        excludeSolved: true,
      },
    });

  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: '시험 시작' }).click();
  const examPage = await opened;
  await expect(examPage).toHaveURL(
    new RegExp(`^chrome-extension://${extensionId}/exam.html#[a-z0-9]{8,24}$`),
  );

  const search = queries.find((q) => q.pathname === '/api/v3/search/problem');
  expect(search?.searchParams.get('query')).toBe(
    '*g5..g1 (#dp|#bfs|#dfs) !s@tester s#200.. lang:ko',
  );
  expect(search?.searchParams.get('sort')).toBe('random');
  expect(search?.searchParams.get('page')).toBe('1');

  const id = new URL(examPage.url()).hash.slice(1);
  const stored = await examPage.evaluate((key) => chrome.storage.local.get(key), `exam:${id}`);
  expect(stored[`exam:${id}`]).toMatchObject({
    id,
    durationMs: 90 * 60_000,
    tiers: ['gold'],
    tags: ['dp', 'bfs-dfs'],
    excludedSolvedBy: 'tester',
    problems: [{ id: 2001 }, { id: 2002 }, { id: 2003 }],
    flagged: [],
    submissions: {},
  });
});

test('popup: too few problems, and the past exams list', async ({ page, context, extensionId }) => {
  await stubSolvedAc(context, [2001, 2002]);
  await openPopupExamTab(page, extensionId);
  await page.getByRole('button', { name: '시험 시작' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    '조건에 맞는 문제가 2개뿐이에요. 조건을 넓혀 주세요.',
  );

  // '직접' minutes outside 10~300 cannot start.
  await page.getByRole('button', { name: '직접' }).click();
  await page.getByLabel('직접 입력').fill('5');
  await expect(page.getByRole('button', { name: '시험 시작' })).toBeDisabled();
  await page.getByLabel('직접 입력').fill('45');
  await expect(page.getByRole('button', { name: '시험 시작' })).toBeEnabled();

  const now = Date.now();
  const exam = (id: string, startedAt: number, endedAt?: number) => ({
    id,
    startedAt,
    durationMs: 60 * 60_000,
    ...(endedAt ? { endedAt } : {}),
    tiers: ['silver', 'gold'],
    tags: [],
    problems: [
      { id: 3001, title: '가', level: 7 },
      { id: 3002, title: '나', level: 12 },
    ],
    flagged: [],
    submissions: {
      3001: { language: 'python3', at: startedAt + 60_000 },
    },
  });
  await page.evaluate(
    ({ older, newer, judgeAt }) =>
      chrome.storage.local.set({
        [`exam:${older.id}`]: older,
        [`exam:${newer.id}`]: newer,
        'judge:3001': {
          problemId: 3001,
          solutionId: 77,
          status: 'done',
          resultText: '맞았습니다!!',
          resultCode: 'ac',
          updatedAt: judgeAt,
        },
      }),
    {
      older: exam('olderexam01', now - 3 * 86_400_000, now - 3 * 86_400_000 + 3_000_000),
      newer: exam('newerexam01', now - 10 * 60_000),
      judgeAt: now - 3 * 86_400_000 + 120_000,
    },
  );
  await page.reload();
  await page.getByRole('tab', { name: '모의 시험' }).click();
  const rows = page.getByTestId('past-exam');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('실버~골드 2문제');
  await expect(rows.nth(0)).toContainText('진행 중');
  await expect(rows.nth(1)).toContainText('1/2');
});

test('the Baekjoon menu opens the setup page with the problem included', async ({
  page,
  context,
  extensionId,
}) => {
  const queries = await stubSolvedAc(context, [2001, 2002, 2003, 2004]);
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) =>
    /\/problem\/\d+$/.test(route.request().url())
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: problemHtml })
      : route.abort(),
  );
  await page.goto('https://www.acmicpc.net/problem/1000');
  const menu = page.locator('ul.problem-menu > li');
  await expect(menu).toHaveText([
    '1000번',
    '코딩테스트',
    '모의시험',
    '제출',
    '맞힌 사람',
    '채점 현황',
    '질문 게시판',
  ]);
  // The content script remembered the logged-in user from the header.
  await expect
    .poll(async () => {
      const ext = await context.newPage();
      await ext.goto(`chrome-extension://${extensionId}/popup.html`);
      const v = await ext.evaluate(() => chrome.storage.local.get('boj:handle'));
      await ext.close();
      return v;
    })
    .toEqual({ 'boj:handle': 'tester' });

  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: '모의시험' }).click();
  const setup = await opened;
  await expect(setup).toHaveURL(`chrome-extension://${extensionId}/exam.html#setup?include=1000`);
  await expect(setup.getByRole('heading', { name: '모의 시험 만들기' })).toBeVisible();
  // The menu's problem starts the 포함할 문제 list; it can be removed like any other.
  await expect(setup.getByTestId('included')).toHaveText(['1000번 ×']);
  await expect(setup.getByRole('button', { name: '1000번 빼기' })).toBeEnabled();

  await setup.getByRole('button', { name: '시험 시작' }).click();
  await expect(setup).toHaveURL(new RegExp(`exam.html#[a-z0-9]{8,24}$`));
  expect(queries.map((q) => q.pathname)).toContain('/api/v3/problem/show');
  const id = new URL(setup.url()).hash.slice(1);
  const stored = (await setup.evaluate((key) => chrome.storage.local.get(key), `exam:${id}`))[
    `exam:${id}`
  ] as { included: number[]; problems: { id: number }[] };
  expect(stored.included).toEqual([1000]);
  expect(stored.problems.map((p) => p.id).sort()).toEqual([1000, 2001, 2002, 2003]);
});

test('popup: problems to include, never more than 문제 수', async ({
  page,
  context,
  extensionId,
}) => {
  const queries = await stubSolvedAc(context, [2001, 3000, 2002, 2003]);
  await openPopupExamTab(page, extensionId);
  const card = page.getByTestId('include-card');
  const input = card.getByLabel('포함할 문제 번호');
  const add = card.getByRole('button', { name: '추가' });
  // From the popup the list starts empty.
  await expect(card.getByTestId('included')).toHaveCount(0);

  await input.fill('3000');
  await add.click();
  await input.fill('4000');
  await input.press('Enter');
  await input.fill('3000');
  await add.click();
  await expect(card.getByRole('alert')).toHaveText('3000번은 이미 넣었어요.');
  await input.fill('10000000');
  await add.click();
  await expect(card.getByRole('alert')).toHaveText('1부터 9999999까지의 숫자로 입력해 주세요.');
  await expect(card.getByTestId('included')).toHaveText(['3000번 ×', '4000번 ×']);

  // 문제 수 2 with two included: adding is off and the count cannot go lower.
  const minus = page.getByRole('button', { name: '문제 수 줄이기' });
  await minus.click();
  await minus.click();
  await expect(page.getByTestId('count')).toHaveText('2');
  await expect(minus).toBeDisabled();
  await expect(minus).toHaveAttribute('title', '포함한 문제보다 적게 할 수 없어요');
  await expect(input).toBeDisabled();
  await expect(add).toBeDisabled();
  await expect(card).toContainText('문제 수를 늘리면 더 추가할 수 있어요');

  // Back to 3 and remove one: one included, two from the search.
  await page.getByRole('button', { name: '문제 수 늘리기' }).click();
  await expect(input).toBeEnabled();
  await card.getByRole('button', { name: '4000번 빼기' }).click();
  await expect(card.getByTestId('included')).toHaveText(['3000번 ×']);
  // The list is not saved with the conditions.
  const draft = await page.evaluate(() => chrome.storage.local.get('ui:exam-draft'));
  expect(Object.keys(draft['ui:exam-draft'] as object)).not.toContain('included');

  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: '시험 시작' }).click();
  const examPage = await opened;
  const id = new URL(examPage.url()).hash.slice(1);
  const stored = (await examPage.evaluate((key) => chrome.storage.local.get(key), `exam:${id}`))[
    `exam:${id}`
  ] as { included: number[]; problems: { id: number }[] };
  expect(stored.included).toEqual([3000]);
  expect(stored.problems.map((p) => p.id).sort()).toEqual([2001, 2002, 3000]);
  expect(queries.filter((q) => q.pathname === '/api/v3/problem/show')).toHaveLength(1);
});

test('popup: only included problems, no search', async ({ page, context, extensionId }) => {
  const queries = await stubSolvedAc(context, [2001, 2002]);
  await openPopupExamTab(page, extensionId);
  const minus = page.getByRole('button', { name: '문제 수 줄이기' });
  await minus.click();
  await minus.click();
  const input = page.getByLabel('포함할 문제 번호');
  await input.fill('3000');
  await input.press('Enter');
  await input.fill('4000');
  await input.press('Enter');
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: '시험 시작' }).click();
  const examPage = await opened;
  await expect(examPage).toHaveURL(/exam\.html#[a-z0-9]{8,24}$/);
  expect(queries.map((q) => q.pathname)).toEqual(['/api/v3/problem/show', '/api/v3/problem/show']);
});
