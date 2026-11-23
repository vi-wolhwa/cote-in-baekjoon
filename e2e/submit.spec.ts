import type { BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

/** The parts of the extension API these tests call from an extension page. */
declare const chrome: {
  runtime: { sendMessage(message: unknown): Promise<unknown> };
  storage: { local: { get(key: string): Promise<Record<string, unknown>> } };
};

// Synthetic pages only: every Baekjoon request is answered locally or aborted.
const submitHtml = readFileSync('tests/fixtures/submit-sample.html', 'utf8').replace(
  '</body>',
  `<script>
    window.__cib = { submitted: false, clicked: false };
    document.getElementById('submit_form').addEventListener('submit', (e) => {
      e.preventDefault();
      window.__cib.submitted = true;
    });
    document.getElementById('submit_button').addEventListener('click', () => {
      window.__cib.clicked = true;
    });
    // Like Baekjoon: reCAPTCHA v3 badge, and the real button only once the token is ready (#45).
    document.body.insertAdjacentHTML('beforeend',
      '<div class="grecaptcha-badge"><iframe title="reCAPTCHA" src="data:text/html,recaptcha/api2/anchor?ar=1&size=invisible"></iframe></div>');
    const realButton = document.getElementById('submit_button');
    realButton.style.display = 'none';
    setTimeout(() => {
      document.getElementById('submit_form').insertAdjacentHTML('afterbegin', '<input type="hidden" name="g-recaptcha-response" value="token">');
      realButton.style.display = '';
    }, 1500);
    // Stand-in for CodeMirror 5, created late like a page script would.
    setTimeout(() => {
      let value = '';
      document.querySelector('.CodeMirror').CodeMirror = {
        getValue: () => value,
        setValue: (v) => { value = v; },
      };
    }, 300);
  </script></body>`,
);

const statusHtml = readFileSync('tests/fixtures/status-sample.html', 'utf8').replace(
  '</body>',
  `<script>
    // Our row was submitted just now; it finishes judging a moment later.
    const row = document.getElementById('solution-5004');
    row.querySelector('[data-timestamp]').setAttribute('data-timestamp', String(Math.floor(Date.now() / 1000)));
    setTimeout(() => {
      const span = row.querySelector('span.result-text');
      span.className = 'result-text result-ac';
      span.setAttribute('data-color', 'ac');
      span.textContent = '맞았습니다!!';
      row.querySelector('td.memory').textContent = '9000';
      row.querySelector('td.time').textContent = '44';
    }, 800);
  </script></body>`,
);

/** A status page whose realtime updates never arrive (Baekjoon's Pusher over quota). */
const staleStatusHtml = readFileSync('tests/fixtures/status-sample.html', 'utf8').replace(
  '</body>',
  `<script>
    const row = document.getElementById('solution-5004');
    const stamp = row.querySelector('[data-timestamp]');
    stamp.setAttribute('data-timestamp', String(Math.floor(Date.now() / 1000)));
    // Like Baekjoon, rewrite the relative submit time ("n초 전") on a timer (#39).
    let seconds = 0;
    setInterval(() => { stamp.textContent = (++seconds) + '초 전'; }, 300);
  </script></body>`,
);

async function routeBaekjoon(context: BrowserContext, status = statusHtml) {
  const ajaxCalls: string[] = [];
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/submit/1000') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: submitHtml });
    }
    if (url.pathname === '/status') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: status });
    }
    if (url.pathname === '/status/ajax' && route.request().method() === 'POST') {
      ajaxCalls.push(route.request().postData() ?? '');
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ result: 4, memory: 9000, time: 44 }),
      });
    }
    return route.abort();
  });
  return ajaxCalls;
}

test('fills the submit page, never submits, and reports the judge result', async ({
  context,
  page,
  extensionId,
}) => {
  await routeBaekjoon(context);
  await page.goto(`chrome-extension://${extensionId}/ide.html`);

  const code = 'let n = 2;\nwhile (n --> 0) console.log(n);';
  const opened = context.waitForEvent('page');
  const response = await page.evaluate(
    (code) =>
      chrome.runtime.sendMessage({
        type: 'cib:submit-request',
        problemId: 1000,
        language: 'javascript',
        code,
      }),
    code,
  );
  expect(response).toEqual({ ok: true });

  // Playwright routes do not catch the first navigation of a tab the extension creates, and
  // the fixture makes Baekjoon's host unresolvable, so load the page again once it is ours.
  const submitPage = await opened;
  await submitPage.goto('https://acmicpc.net/submit/1000');
  await expect(
    submitPage.getByText(
      '언어와 코드를 채웠습니다. 내용을 확인하고 백준의 제출 버튼을 직접 눌러 주세요.',
    ),
  ).toBeVisible();
  await expect(submitPage.getByText(/방화벽이 막을 수 있는 문자열이 있습니다: -->/)).toBeVisible();
  expect(await submitPage.locator('select#language').inputValue()).toBe('17');
  const state = await submitPage.evaluate(() => {
    const el = document.querySelector('.CodeMirror') as Element & {
      CodeMirror: { getValue(): string };
    };
    const flags = (window as unknown as { __cib: { submitted: boolean; clicked: boolean } }).__cib;
    return { value: el.CodeMirror.getValue(), ...flags };
  });
  expect(state).toEqual({ value: code, submitted: false, clicked: false });

  // The pending code is handed out once: a reload does not refill.
  await submitPage.reload();
  await submitPage.waitForTimeout(1000);
  await expect(submitPage.locator('#cib-submit-banner')).toHaveCount(0);

  // The user submitted on Baekjoon, which redirects to their status page.
  // Start listening before judging can finish: the popup closes 0.3 s after the result.
  const closed = submitPage.waitForEvent('close', { timeout: 15_000 });
  await submitPage.goto('https://acmicpc.net/status?from_mine=1&problem_id=1000&user_id=tester');
  await expect
    .poll(() => page.evaluate(() => chrome.storage.local.get('judge:1000')), { timeout: 10_000 })
    .toMatchObject({
      'judge:1000': {
        problemId: 1000,
        solutionId: 5004,
        status: 'done',
        resultCode: 'ac',
        resultText: '맞았습니다!!',
        memoryKb: 9000,
        timeMs: 44,
      },
    });
  // Judging finished in the submit popup: it closes and the IDE comes back.
  await closed;
});

test('falls back to the status request when live updates never arrive', async ({
  context,
  page,
  extensionId,
}) => {
  const ajaxCalls = await routeBaekjoon(context, staleStatusHtml);
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const opened = context.waitForEvent('page');
  await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'cib:submit-request',
      problemId: 1000,
      language: 'javascript',
      code: 'console.log(1);',
    }),
  );
  const submitPage = await opened;
  await submitPage.goto('https://acmicpc.net/status?from_mine=1&problem_id=1000&user_id=tester');
  // Inside the submit popup the page asks the user to keep it open while judging (#47).
  await expect(submitPage.getByText('창을 닫지 말고 기다려 주세요')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => chrome.storage.local.get('judge:1000')), { timeout: 15_000 })
    .toMatchObject({ 'judge:1000': { solutionId: 5004, status: 'done', resultCode: 'ac' } });
  expect(ajaxCalls[0]).toBe('solution_id=5004');
  // Asked again only while the result was still pending.
  expect(ajaxCalls.length).toBeLessThanOrEqual(2);
});

test('auto-submit presses the submit button once the form is filled', async ({
  context,
  page,
  extensionId,
}) => {
  await routeBaekjoon(context);
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const opened = context.waitForEvent('page');
  await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'cib:submit-request',
      problemId: 1000,
      language: 'javascript',
      code: 'console.log(1);',
      autoSubmit: true,
    }),
  );
  const submitPage = await opened;
  await submitPage.goto('https://acmicpc.net/submit/1000');
  await expect(submitPage.getByText('잠시 뒤 자동으로 제출합니다')).toBeVisible();
  await expect
    .poll(
      () =>
        submitPage.evaluate(
          () => (window as unknown as { __cib: { submitted: boolean; clicked: boolean } }).__cib,
        ),
      { timeout: 5000 },
    )
    .toEqual({ submitted: true, clicked: true });
});

test('goes to the language settings when the language is not in the list, then comes back', async ({
  context,
  page,
  extensionId,
}) => {
  // The first submit page lacks node.js (17), as for a user who never added it on Baekjoon.
  let submitLoads = 0;
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/submit/1000') {
      submitLoads++;
      const body =
        submitLoads === 1
          ? submitHtml.replace('<option value="17">node.js</option>', '')
          : submitHtml;
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    }
    if (url.pathname === '/setting/language') {
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body><h1>언어 설정 (테스트용)</h1></body></html>',
      });
    }
    return route.abort();
  });
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const opened = context.waitForEvent('page');
  await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'cib:submit-request',
      problemId: 1000,
      language: 'javascript',
      code: 'console.log(1);',
      autoSubmit: true,
    }),
  );
  const popup = await opened;
  await popup.goto('https://acmicpc.net/submit/1000');

  await popup.waitForURL('https://acmicpc.net/setting/language');
  await expect(
    popup.getByText("제출하려던 언어(node.js)가 백준의 '사용할 언어' 목록에 없어서"),
  ).toBeVisible();

  await popup.getByRole('link', { name: '제출 페이지로 돌아가기' }).click();
  await popup.waitForURL('https://acmicpc.net/submit/1000');
  await expect
    .poll(
      () =>
        popup.evaluate(
          () => (window as unknown as { __cib: { submitted: boolean; clicked: boolean } }).__cib,
        ),
      { timeout: 8000 },
    )
    .toEqual({ submitted: true, clicked: true });
  expect(await popup.locator('select#language').inputValue()).toBe('17');
});
