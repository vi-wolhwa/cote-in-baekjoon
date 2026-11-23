import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

const problemHtml = readFileSync('tests/fixtures/problem-sample.html', 'utf8');

test('says so when the problem page layout changed (#87)', async ({ context, page }) => {
  // Simulate Baekjoon renaming the title element: the button cannot be placed.
  const changed = problemHtml.replace('id="problem_title"', 'id="problem-title-v2"');
  await context.route('https://acmicpc.net/**', (route) =>
    route.request().url() === 'https://acmicpc.net/problem/1000'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: changed })
      : route.abort(),
  );
  await page.goto('https://acmicpc.net/problem/1000');

  const notice = page.locator('#cib-diagnosis-notice');
  await expect(notice.getByRole('alert')).toContainText('문제 페이지의 구조가 바뀐 것 같아요');
  await expect(notice.getByRole('alert')).toContainText('문제 제목');
  const href = await notice.getByRole('link', { name: '문제 신고하기' }).getAttribute('href');
  const url = new URL(href ?? '');
  expect(url.pathname).toBe('/vi-wolhwa/cote-in-baekjoon/issues/new');
  expect(url.searchParams.get('problem')).toBe('1000');
  expect(url.searchParams.get('what')).toContain('문제 제목');
  await expect(page.getByRole('button', { name: '코테 화면으로 풀기' })).toHaveCount(0);
});

test('stays quiet on a normal problem page', async ({ context, page }) => {
  await context.route('https://acmicpc.net/**', (route) =>
    route.request().url() === 'https://acmicpc.net/problem/1000'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: problemHtml })
      : route.abort(),
  );
  await page.goto('https://acmicpc.net/problem/1000');
  await expect(page.getByRole('button', { name: '코테 화면으로 풀기' })).toBeVisible();
  await expect(page.locator('#cib-diagnosis-notice')).toHaveCount(0);
});
