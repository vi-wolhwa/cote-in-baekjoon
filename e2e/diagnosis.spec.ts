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
  await expect(page.getByRole('button', { name: '코딩테스트' })).toHaveCount(0);
});

test('puts the button after the title when the problem menu is missing', async ({
  context,
  page,
}) => {
  const noMenu = problemHtml.replace(/<ul class="nav nav-pills[^]*?<\/ul>/, '');
  expect(noMenu).not.toContain('problem-menu');
  await context.route('https://acmicpc.net/**', (route) =>
    route.request().url() === 'https://acmicpc.net/problem/1000'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: noMenu })
      : route.abort(),
  );
  await page.goto('https://acmicpc.net/problem/1000');
  const open = page.locator('h1').getByRole('button', { name: '코딩테스트' });
  await expect(open).toBeVisible();
  await expect(open).toHaveCSS('background-color', 'rgb(38, 55, 71)');
  // The fallback works, so a missing menu alone is not reported.
  await expect(page.locator('#cib-diagnosis-notice')).toHaveCount(0);
  await open.click();
  await expect(page.locator('#cib-ide-overlay')).toBeVisible();
});

test('stays quiet on a normal problem page', async ({ context, page }) => {
  await context.route('https://acmicpc.net/**', (route) =>
    route.request().url() === 'https://acmicpc.net/problem/1000'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: problemHtml })
      : route.abort(),
  );
  await page.goto('https://acmicpc.net/problem/1000');
  await expect(page.getByRole('button', { name: '코딩테스트' })).toBeVisible();
  await expect(page.locator('#cib-diagnosis-notice')).toHaveCount(0);
});
