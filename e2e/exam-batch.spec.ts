import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  handleSubmitTab,
  MIN,
  seedExam,
  serveBaekjoon,
  storedExam,
  submitTabInfo,
} from './exam-helpers';

/**
 * After the exam the saved answers go to Baekjoon one after another (ADR-0005): each in its
 * own background tab, the next only once the previous one was reported and closed.
 */
test('시험 종료 submits the saved answers one at a time and shows the results', async ({
  page,
  context,
  extensionId,
}) => {
  await serveBaekjoon(context);
  const startedAt = Date.now() - 30 * MIN;
  const id = await seedExam(page, extensionId, {
    startedAt,
    read: [1000, 1001, 1002],
    answers: {
      1000: { code: 'console.log(3);', language: 'javascript', savedAt: startedAt + 5 * MIN },
      1001: { code: 'print(3)', language: 'python3', savedAt: startedAt + 9 * MIN },
    },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);
  await expect(page.locator('.problem')).toContainText('합을 출력한다.');

  const windows: Page[] = [];
  context.on('page', (p) => windows.push(p));
  await page.getByRole('button', { name: '시험 종료' }).click();
  const dialog = page.getByRole('dialog', { name: '시험 종료' });
  await expect(dialog.getByTestId('end-summary')).toHaveText(
    '저장한 답안 2개를 백준에 제출합니다. 답안이 없는 문제 1개는 제출하지 않습니다.',
  );
  let opened = context.waitForEvent('page');
  await dialog.getByRole('button', { name: '시험 종료' }).click();
  await expect(page).toHaveURL(new RegExp(`exam.html#${id}/result$`));

  // The first answer: its background tab, and nothing else opens meanwhile.
  const first = await opened;
  // A tab in the same window, behind the result page: no window, no focus change.
  expect(await submitTabInfo(page, 1000)).toEqual({ windows: 1, active: false });
  const progress = page.getByTestId('batch-progress');
  await expect(progress).toContainText('제출 중 1/2');
  const rows = page.getByTestId('result-row');
  await expect(rows.nth(0).getByTestId('result-text')).toHaveText('제출 중');
  await expect(rows.nth(1).getByTestId('result-text')).toHaveText('제출 대기');
  await expect(rows.nth(2).getByTestId('result-text')).toHaveText('제출 안 함');
  await page.waitForTimeout(500);
  expect(windows).toHaveLength(1);
  opened = context.waitForEvent('page');
  await handleSubmitTab(first, 1000);
  expect(new URL(first.url()).searchParams.get('problem_id')).toBe('1000');
  await expect(rows.nth(0).getByTestId('result-text')).toHaveText('맞았습니다!!');

  // Then the second, after the first tab closed.
  const second = await opened;
  expect(first.isClosed()).toBe(true);
  await expect(progress).toContainText('제출 중 2/2');
  await handleSubmitTab(second, 1001);
  await expect(rows.nth(1).getByTestId('result-text')).toHaveText('맞았습니다!!');
  await expect(progress).toHaveText('제출 완료 2/2');
  await expect(rows.nth(1).getByTestId('status-link')).toHaveAttribute(
    'href',
    /^https:\/\/www\.acmicpc\.net\/status\?problem_id=1001/,
  );
  await expect(page.getByTestId('result-score')).toContainText('2 / 3');
  await expect(rows.nth(1)).toContainText('Python 3');

  const exam = await storedExam(page, id);
  expect(exam.submitQueue).toMatchObject({
    1000: { state: 'submitted' },
    1001: { state: 'submitted' },
  });
  expect(Object.keys(exam.submissions)).toEqual(['1000', '1001']);
  // A reload sends nothing again.
  await page.reload();
  await expect(progress).toHaveText('제출 완료 2/2');
  await page.waitForTimeout(1000);
  expect(windows).toHaveLength(2);
});

test('a submission tab closed before sending fails that answer, the next goes on, and it can be resent', async ({
  page,
  context,
  extensionId,
}) => {
  await serveBaekjoon(context);
  const startedAt = Date.now() - 130 * MIN;
  // The time ran out while the page was closed: opening it submits.
  const id = await seedExam(page, extensionId, {
    startedAt,
    read: [1000, 1001, 1002],
    answers: {
      1000: { code: 'console.log(3);', language: 'javascript', savedAt: startedAt + 5 * MIN },
      1002: { code: 'console.log(4);', language: 'javascript', savedAt: startedAt + 7 * MIN },
    },
  });
  let opened = context.waitForEvent('page');
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);
  await expect(page).toHaveURL(new RegExp(`exam.html#${id}/result$`));
  const first = await opened;
  opened = context.waitForEvent('page');
  await first.close();
  const rows = page.getByTestId('result-row');
  await expect(rows.nth(0).getByTestId('result-text')).toHaveText('제출 실패');
  await expect(rows.nth(0)).toContainText('제출 탭이 제출 전에 닫혀 제출하지 못했어요.');
  await handleSubmitTab(await opened, 1002);
  await expect(rows.nth(2).getByTestId('result-text')).toHaveText('맞았습니다!!');
  await expect(page.getByTestId('batch-progress')).toHaveText('제출 완료 1/2');

  opened = context.waitForEvent('page');
  await rows.nth(0).getByRole('button', { name: '다시 제출' }).click();
  await handleSubmitTab(await opened, 1000);
  await expect(rows.nth(0).getByTestId('result-text')).toHaveText('맞았습니다!!');
  await expect(page.getByTestId('batch-progress')).toHaveText('제출 완료 2/2');
});
