import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  A_PLUS_B,
  box,
  MIN,
  readCaptureTabs,
  seedExam,
  serveBaekjoon,
  storedExam,
  typeCode,
} from './exam-helpers';

/** The exam screen and the result screen (#101), with synthetic Baekjoon pages only. */

declare const chrome: {
  storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } };
};

test('reads every problem by itself, and 제출하기 only saves the answer', async ({
  page,
  context,
  extensionId,
}) => {
  await serveBaekjoon(context);
  const id = await seedExam(page, extensionId, { startedAt: Date.now() - MIN });
  await page.setViewportSize({ width: 1280, height: 800 });
  const pages: Page[] = [];
  context.on('page', (p) => pages.push(p));
  const read = readCaptureTabs(context, page);
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);

  await expect(page.locator('.crumbs')).toHaveText(/모의 시험.*실버~골드 3문제/);
  await expect(page.getByText('결과는 시험이 끝나면 공개')).toBeVisible();
  // The problem rail: a column of rounded squares left of the problem pane, 1 to 3.
  const rail = page.getByTestId('rail-item');
  await expect(rail).toHaveText(['1', '2', '3']);
  await expect(rail.nth(0)).toHaveAttribute('aria-current', 'step');
  await expect(rail.nth(0)).toHaveCSS('background-color', 'rgb(0, 120, 255)');
  await expect(rail.nth(1)).toHaveCSS('border-radius', '8px');
  const [first, second] = await Promise.all([box(rail.nth(0)), box(rail.nth(1))]);
  expect([first.width, first.height]).toEqual([40, 40]);
  expect(second.y - first.y).toBe(52);
  expect(second.x).toBe(first.x);
  const railBox = await box(page.getByRole('navigation', { name: '문제 목록' }));
  const paneBox = await box(page.locator('.split').first());
  expect(railBox.x + railBox.width).toBeLessThanOrEqual(paneBox.x);
  expect(railBox.y).toBe(47);

  // Problem 1 is read first; the others follow one at a time without any click.
  await expect(page.locator('.problem')).toContainText('합을 출력한다.');
  await expect
    .poll(async () => (await storedExam(page, id)).problems.map((p) => p.body?.title), {
      timeout: 20_000,
    })
    .toEqual(['테스트용 덧셈', '테스트용 덧셈', '테스트용 덧셈']);
  expect(read).toEqual([1000, 1001, 1002]);
  await expect(rail.nth(2)).not.toHaveClass(/is-unread|is-loading/);
  // The exam tab stays in front, and every background tab is gone.
  expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
  await expect.poll(() => pages.filter((t) => !t.isClosed()).length).toBe(0);
  expect(pages).toHaveLength(3);
  await expect(page.getByTestId('remaining')).toContainText(/1:5[89]:\d\d/);

  // Moving is instant now: no new tab.
  await rail.nth(1).click();
  await expect(page.locator('.title')).toContainText('2번테스트 문제 둘');
  await expect(page.locator('.problem')).toContainText('합을 출력한다.');
  await page.getByRole('button', { name: '다시 볼 문제' }).click();
  await expect(rail.nth(1).getByTestId('rail-flagged')).toBeVisible();
  await expect(rail.nth(1)).toHaveAccessibleName('2번 문제 · 테스트 문제 둘 · 다시 볼 문제');
  // Back to 1 with the keyboard.
  await rail.nth(1).focus();
  await page.keyboard.press('ArrowUp');
  await expect(rail.nth(0)).toHaveAttribute('aria-current', 'step');
  await expect(rail.nth(0)).toBeFocused();

  await typeCode(page, A_PLUS_B);
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공');

  // 제출하기 saves the answer: no submit window opens.
  await page.getByRole('button', { name: '제출하기' }).click();
  await expect(page.getByTestId('exam-answer')).toContainText(
    '답안을 저장했습니다. 시험이 끝나면 한꺼번에 제출합니다.',
  );
  const check = rail.nth(0).getByTestId('rail-submitted');
  await expect(check).toBeVisible();
  await expect(check).toHaveCSS('background-color', 'rgb(31, 171, 90)');
  const [button, badge] = await Promise.all([box(rail.nth(0)), box(check)]);
  expect(badge.x + badge.width).toBeGreaterThan(button.x + button.width);
  expect(badge.y + badge.height).toBeGreaterThan(button.y + button.height);
  await expect(rail.nth(0)).toHaveAccessibleName('1번 문제 · 테스트용 덧셈 · 답안 저장함');
  await page.waitForTimeout(500);
  expect(pages).toHaveLength(3);
  const saved = await storedExam(page, id);
  expect(saved.answers?.['1000']).toMatchObject({ code: A_PLUS_B, language: 'javascript' });
  expect(saved.submissions).toEqual({});

  // Editing after saving: only the saved answer will be submitted.
  const differs = page.getByTestId('answer-differs');
  await expect(differs).toHaveCount(0);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' // 고침');
  await expect(differs).toHaveText('저장한 답안과 달라요');
  await page.getByRole('button', { name: '제출하기' }).click();
  await expect(differs).toHaveCount(0);
  expect((await storedExam(page, id)).answers?.['1000']?.code).toContain('// 고침');

  // 시험 종료 says what will be submitted.
  await page.getByRole('button', { name: '시험 종료' }).click();
  const dialog = page.getByRole('dialog', { name: '시험 종료' });
  await expect(dialog.getByTestId('end-summary')).toHaveText(
    '저장한 답안 1개를 백준에 제출합니다. 답안이 없는 문제 2개는 제출하지 않습니다.',
  );
  await dialog.getByRole('button', { name: '계속 풀기' }).click();
});

test('a problem that cannot be read in time shows an error and can be retried', async ({
  page,
  context,
  extensionId,
}) => {
  await serveBaekjoon(context);
  // Only problem 1 is left to read.
  const id = await seedExam(page, extensionId, {
    startedAt: Date.now() - MIN,
    read: [1001, 1002],
  });
  await page.clock.install();
  let opened = context.waitForEvent('page');
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);
  // The background tab never loads (its first navigation is not routed).
  const stuck = await opened;
  await page.clock.runFor(22_000);
  await expect(page.getByRole('alert')).toContainText('20초 안에 읽지 못했습니다');
  await expect.poll(() => stuck.isClosed()).toBe(true);

  opened = context.waitForEvent('page');
  await page.getByRole('button', { name: '다시 시도' }).click();
  const retried = await opened;
  await retried.goto('https://acmicpc.net/problem/1000').catch(() => undefined);
  await expect(page.locator('.problem')).toContainText('합을 출력한다.');
});

test('ends by itself when the time runs out', async ({ page, context, extensionId }) => {
  await serveBaekjoon(context);
  const start = new Date('2026-11-24T10:00:00+09:00').getTime();
  const id = await seedExam(page, extensionId, {
    startedAt: start,
    minutes: 10,
    read: [1000, 1001, 1002],
  });
  await page.clock.install({ time: start + 10 * MIN - 6_000 });
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);
  const remaining = page.getByTestId('remaining');
  // The page clock keeps running while the page loads: a second or two may pass.
  await expect(remaining).toContainText(/0:00:0[2-6]/);
  // Under five minutes the time is red.
  await expect(remaining).toHaveClass(/is-warning/);
  await expect(page.getByRole('button', { name: '제출하기' })).toBeEnabled();

  await page.clock.runFor(7_000);
  await expect(page).toHaveURL(new RegExp(`exam.html#${id}/result$`));
  await expect(page.getByRole('heading', { name: '시험 결과' })).toBeVisible();
  await expect(page.getByTestId('result-time')).toContainText('10분');
  await expect(page.getByText('저장한 답안이 없어 백준에 제출하지 않았습니다.')).toBeVisible();
  expect(await storedExam(page, id)).toMatchObject({ endedAt: start + 10 * MIN, submitQueue: {} });

  // Opening the exam again goes straight back to the results.
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);
  await expect(page).toHaveURL(new RegExp(`exam.html#${id}/result$`));
});

test('results: late and stale judge results', async ({ page, extensionId }) => {
  const now = Date.now();
  const startedAt = now - 50 * MIN;
  const judge = (problemId: number, code: string, text: string, at: number, status = 'done') => ({
    problemId,
    solutionId: problemId * 10,
    status,
    resultText: text,
    resultCode: code,
    updatedAt: at,
  });
  // An exam from an earlier version, which submitted during the exam.
  const id = await seedExam(page, extensionId, {
    startedAt,
    minutes: 120,
    endedAt: now - MIN,
    read: [1000, 1001, 1002],
    submissions: {
      1000: { language: 'python3', at: startedAt + 12 * MIN },
      1001: { language: 'cpp17', at: startedAt + 30 * MIN },
    },
    extra: {
      'judge:1000': judge(1000, 'wa', '틀렸습니다', startedAt + 12 * MIN + 5_000),
      'judge:1001': judge(
        1001,
        'judging',
        '채점 중 (40%)',
        startedAt + 30 * MIN + 5_000,
        'judging',
      ),
      // Practice before the exam: not the exam's result.
      'judge:1002': judge(1002, 'ac', '맞았습니다!!', startedAt - 60 * MIN),
    },
  });
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}/result`);
  const rows = page.getByTestId('result-row');
  await expect(rows.nth(0)).toContainText('틀렸습니다');
  await expect(rows.nth(0)).toContainText('Python 3');
  await expect(rows.nth(0)).toContainText('시작 후 0:12:00');
  await expect(rows.nth(1)).toContainText('채점 중 (40%)');
  await expect(rows.nth(2)).toContainText('제출 안 함');
  await expect(page.getByTestId('result-score')).toContainText('0 / 3');
  await expect(page.getByTestId('result-time')).toContainText('49분');

  // Judging finishes after the exam ended: the page updates by itself.
  await page.evaluate(
    (value) => chrome.storage.local.set({ 'judge:1001': value }),
    judge(1001, 'ac', '맞았습니다!!', Date.now()),
  );
  await expect(rows.nth(1)).toContainText('맞았습니다!!');
  await expect(rows.nth(1).getByRole('img', { name: '맞음' })).toBeVisible();
  await expect(page.getByTestId('result-score')).toContainText('1 / 3');
  await expect(page.getByTestId('result-hardest')).toContainText('골드 4');
  await expect(rows.nth(1).getByRole('link', { name: '다시 풀기' })).toHaveAttribute(
    'href',
    'https://www.acmicpc.net/problem/1001#cib-ide',
  );
});

test('switching problems never changes the pane widths', async ({ page, extensionId }) => {
  // Sizes the user dragged: the old code drew the defaults for a frame on every switch.
  const id = await seedExam(page, extensionId, {
    startedAt: Date.now() - MIN,
    read: [1000, 1001, 1002],
    extra: { 'ui:split': { horizontal: 30, vertical: 55 } },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);
  await expect(page.locator('.problem')).toContainText('합을 출력한다.');
  const widths = await page.evaluate(async () => {
    const seen: number[] = [];
    const sample = () => {
      const pane = document.querySelector('.workspace .split-pane');
      seen.push(pane ? Math.round(pane.getBoundingClientRect().width * 100) / 100 : -1);
    };
    const frames = (n: number) =>
      new Promise<void>((resolve) => {
        let left = n;
        const tick = () => {
          sample();
          left -= 1;
          if (left <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    const items = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="rail-item"]')];
    for (const i of [1, 2, 0]) {
      items[i]?.click();
      sample();
      await frames(10);
    }
    return seen;
  });
  expect(widths.length).toBeGreaterThan(30);
  expect(new Set(widths).size).toBe(1);
  expect(widths[0]).toBeGreaterThan(0);
});
