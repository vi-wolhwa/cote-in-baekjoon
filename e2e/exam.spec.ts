import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** The exam screen and the result screen (#101), with synthetic Baekjoon pages only. */

declare const chrome: {
  storage: {
    local: {
      get: (keys: string | null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
};

const MIN = 60_000;
const problemHtml = readFileSync('tests/fixtures/problem-sample.html', 'utf8');
const A_PLUS_B =
  "const [a, b] = require('fs').readFileSync('/dev/stdin').toString().trim().split(' ').map(Number); console.log(a + b);";

/** The submit page presses its own button; Baekjoon would then redirect to the status page. */
const submitHtml = readFileSync('tests/fixtures/submit-sample.html', 'utf8').replace(
  '</body>',
  `<script>
    document.getElementById('submit_form').addEventListener('submit', (e) => e.preventDefault());
    setTimeout(() => {
      let value = '';
      document.querySelector('.CodeMirror').CodeMirror = {
        getValue: () => value,
        setValue: (v) => { value = v; },
      };
    }, 100);
  </script></body>`,
);

/** Our submission (5004) for problem 1000 finishes judging as 맞았습니다!! a moment later. */
const statusHtml = readFileSync('tests/fixtures/status-sample.html', 'utf8').replace(
  '</body>',
  `<script>
    const row = document.getElementById('solution-5004');
    row.querySelector('[data-timestamp]').setAttribute('data-timestamp', String(Math.floor(Date.now() / 1000)));
    setTimeout(() => {
      const span = row.querySelector('span.result-text');
      span.className = 'result-text result-ac';
      span.setAttribute('data-color', 'ac');
      span.textContent = '맞았습니다!!';
      row.querySelector('td.memory').textContent = '9000';
      row.querySelector('td.time').textContent = '44';
    }, 1500);
  </script></body>`,
);

async function serveBaekjoon(context: BrowserContext) {
  const problemLoads: string[] = [];
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) => {
    const url = new URL(route.request().url());
    if (/^\/problem\/\d+$/.test(url.pathname)) {
      problemLoads.push(url.pathname);
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: problemHtml });
    }
    if (url.pathname === '/submit/1000') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: submitHtml });
    }
    if (url.pathname === '/status') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: statusHtml });
    }
    return route.abort();
  });
  return problemLoads;
}

interface SeedOptions {
  id?: string;
  startedAt: number;
  minutes?: number;
  submissions?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

/** An exam record as '시험 시작' would store it: three problems, no statements yet. */
async function seedExam(page: Page, extensionId: string, options: SeedOptions) {
  const id = options.id ?? 'e2eexam0001';
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(
    ({ id, options }) =>
      chrome.storage.local.set({
        [`exam:${id}`]: {
          id,
          startedAt: options.startedAt,
          durationMs: (options.minutes ?? 120) * 60_000,
          tiers: ['silver', 'gold'],
          tags: [],
          problems: [
            { id: 1000, title: '테스트용 덧셈', level: 7 },
            { id: 1001, title: '테스트 문제 둘', level: 12 },
            { id: 1002, title: '테스트 문제 셋', level: 14 },
          ],
          flagged: [],
          submissions: options.submissions ?? {},
        },
        'ui:language': 'javascript',
        ...(options.extra ?? {}),
      }),
    { id, options },
  );
  return id;
}

async function typeCode(page: Page, code: string) {
  const content = page.locator('.cm-content');
  await expect(async () => {
    await content.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(code);
    await expect(content).toContainText(code.slice(-20), { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

test('moves between problems, flags one, runs code and submits without showing the result', async ({
  page,
  context,
  extensionId,
}) => {
  const problemLoads = await serveBaekjoon(context);
  const id = await seedExam(page, extensionId, { startedAt: Date.now() - MIN });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);

  await expect(page.locator('.crumbs')).toHaveText(/모의 시험.*실버~골드 3문제/);
  await expect(page.getByText('결과는 시험이 끝나면 공개')).toBeVisible();
  const strip = page.getByTestId('strip-item');
  await expect(strip).toHaveCount(3);
  await expect(strip.nth(0)).toHaveAttribute('aria-current', 'step');
  // The statement is fetched when the problem is first opened, and kept in the exam.
  await expect(page.locator('.problem')).toContainText('합을 출력한다.');
  expect(problemLoads).toEqual(['/problem/1000']);
  await expect(page.getByTestId('remaining')).toContainText(/1:5[89]:\d\d/);

  await strip.nth(1).click();
  await expect(strip.nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.title')).toContainText('2번테스트 문제 둘');
  await page.getByRole('button', { name: '다시 볼 문제' }).click();
  await expect(strip.nth(1).getByTestId('strip-flagged')).toBeVisible();
  await expect(strip.nth(1)).toHaveAccessibleName('2번 문제, 다시 볼 문제');

  // Back to 1: no second request for its statement.
  await strip.nth(0).click();
  await expect(page.locator('.problem')).toContainText('합을 출력한다.');
  expect(problemLoads).toEqual(['/problem/1000', '/problem/1001']);

  await typeCode(page, A_PLUS_B);
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공');

  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: '제출하기' }).click();
  const popup = await opened;
  await expect(strip.nth(0).getByTestId('strip-submitted')).toBeVisible();
  await expect(page.getByTestId('exam-submitted')).toContainText(
    '제출했습니다. 결과는 시험이 끝나면 공개됩니다.',
  );

  // Routes miss the first navigation of a window the extension opens: load it again.
  await popup.goto('https://acmicpc.net/submit/1000');
  await expect(popup.getByText('잠시 뒤 자동으로 제출합니다')).toBeVisible();
  // Baekjoon redirects to the status page after the submit; the result is covered there.
  const closed = popup.waitForEvent('close', { timeout: 15_000 });
  await popup.goto('https://acmicpc.net/status?from_mine=1&problem_id=1000&user_id=tester');
  const cover = popup.locator('#cib-exam-cover');
  await expect(cover).toBeVisible();
  await expect(cover).toContainText('제출했습니다. 결과는 시험이 끝나면 공개됩니다.');
  const box = await cover.boundingBox();
  const viewport = popup.viewportSize();
  expect(box).toMatchObject({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });
  await expect(popup.locator('#cib-judging-notice')).toHaveCount(0);
  await closed;

  // The result is stored and kept in the exam, but the exam screen still does not show it.
  await expect
    .poll(async () => {
      const items = await page.evaluate((key) => chrome.storage.local.get(key), `exam:${id}`);
      return (items[`exam:${id}`] as { submissions: Record<string, { judge?: unknown }> })
        .submissions['1000']?.judge;
    })
    .toMatchObject({ solutionId: 5004, resultCode: 'ac' });
  await expect(page.getByText('맞았습니다')).toHaveCount(0);

  // 시험 종료 asks first, then shows the result.
  await page.getByRole('button', { name: '시험 종료' }).click();
  const dialog = page.getByRole('dialog', { name: '시험 종료' });
  await expect(dialog).toContainText('아직 제출하지 않은 문제가 2개 있습니다.');
  await dialog.getByRole('button', { name: '시험 종료' }).click();
  await expect(page).toHaveURL(new RegExp(`exam.html#${id}/result$`));
  await expect(page.getByTestId('result-score')).toContainText('1 / 3');
  const rows = page.getByTestId('result-row');
  await expect(rows.nth(0)).toContainText('1 · 1000 테스트용 덧셈');
  await expect(rows.nth(0)).toContainText('맞았습니다!!');
  await expect(rows.nth(0)).toContainText('JavaScript');
  await expect(rows.nth(1)).toContainText('제출하지 않음');
  await expect(page.getByTestId('result-hardest')).toContainText('실버 4');
});

test('ends by itself when the time runs out', async ({ page, context, extensionId }) => {
  await serveBaekjoon(context);
  const start = new Date('2026-11-24T10:00:00+09:00').getTime();
  const id = await seedExam(page, extensionId, { startedAt: start, minutes: 10 });
  await page.clock.install({ time: start + 10 * MIN - 6_000 });
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);
  const remaining = page.getByTestId('remaining');
  await expect(remaining).toContainText('0:00:06');
  // Under five minutes the time is red.
  await expect(remaining).toHaveClass(/is-warning/);
  await expect(page.getByRole('button', { name: '제출하기' })).toBeEnabled();

  await page.clock.runFor(7_000);
  await expect(page).toHaveURL(new RegExp(`exam.html#${id}/result$`));
  await expect(page.getByRole('heading', { name: '시험 결과' })).toBeVisible();
  await expect(page.getByTestId('result-time')).toContainText('10분');
  const stored = await page.evaluate((key) => chrome.storage.local.get(key), `exam:${id}`);
  expect(stored[`exam:${id}`]).toMatchObject({ endedAt: start + 10 * MIN });

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
  const id = await seedExam(page, extensionId, {
    startedAt,
    minutes: 120,
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
  await page.evaluate(
    ({ key, endedAt }) =>
      chrome.storage.local
        .get(key)
        .then((items) =>
          chrome.storage.local.set({ [key]: { ...(items[key] as object), endedAt } }),
        ),
    { key: `exam:${id}`, endedAt: now - MIN },
  );
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}/result`);
  const rows = page.getByTestId('result-row');
  await expect(rows.nth(0)).toContainText('틀렸습니다');
  await expect(rows.nth(0)).toContainText('Python 3');
  await expect(rows.nth(0)).toContainText('시작 후 0:12:00');
  await expect(rows.nth(1)).toContainText('채점 중 (40%)');
  await expect(rows.nth(2)).toContainText('제출하지 않음');
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
