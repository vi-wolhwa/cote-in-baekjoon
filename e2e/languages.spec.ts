/**
 * M6 languages (ADR-0007): C11, C++20, TypeScript and Java 8 run on the existing engines;
 * submit-only languages (Rust here) cannot run and say why, but still submit. Every Baekjoon
 * request is answered locally or aborted; nothing is submitted.
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

declare const chrome: {
  runtime: { sendMessage(message: unknown): Promise<unknown> };
};

/** The first run loads a compiler (clang ~100 MB, TeaVM ~7.5 MB) before compiling. */
const FIRST_RUN_TIMEOUT = 60_000;
const SUBMIT_ONLY_REASON = '이 언어는 브라우저에서 실행할 수 없어요. 제출하면 백준이 채점해요';

/** Opens the demo IDE in `language` (its starter shows `marker`) and puts `code` in. */
async function openWithCode(
  page: Page,
  extensionId: string,
  language: string,
  marker: string,
  code?: string,
) {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const content = page.locator('.cm-content');
  // Saved state can still be loading right after navigation and reset the language; retry.
  await expect(async () => {
    await page.getByRole('combobox', { name: '언어' }).selectOption(language);
    await expect(content).toContainText(marker, { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  if (code === undefined) return;
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  // insertText puts the code in as-is (typing would trigger auto-indent and bracket closing).
  await page.keyboard.insertText(code);
  await expect(content).toContainText(code.trim().split('\n').at(-1) ?? '');
}

async function runPasses(page: Page) {
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공', {
    timeout: FIRST_RUN_TIMEOUT,
  });
}

test.describe('languages that run on the existing engines', () => {
  test.describe.configure({ timeout: 120_000 });

  test('C11 compiles as C and runs', async ({ page, extensionId }) => {
    await openWithCode(
      page,
      extensionId,
      'c11',
      '#include <stdio.h>',
      `#include <stdio.h>
#include <stdbool.h>

int main(void) {
    long long a, b;
    if (scanf("%lld %lld", &a, &b) != 2) return 1;
    bool ok = true;
    printf("%lld\\n", ok ? a + b : 0);
    return 0;
}
`,
    );
    await expect(page.getByText('solution.c', { exact: true })).toBeVisible();
    await runPasses(page);
  });

  test('C++20 compiles C++20 features that C++17 rejects', async ({ page, extensionId }) => {
    const code = `#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<long long> v(2);
    for (auto& x : v) cin >> x;
    ranges::sort(v);
    span<long long> s(v);
    if ((s[0] <=> s[1]) > 0) return 1;
    cout << s[0] + s[1] << '\\n';
}
`;
    await openWithCode(page, extensionId, 'cpp20', '#include <bits/stdc++.h>', code);
    await runPasses(page);

    // C++17 shares the code; the same program does not compile there.
    await page.getByRole('combobox', { name: '언어' }).selectOption('cpp17');
    await page.getByRole('button', { name: '코드 실행' }).click();
    const firstCase = page.getByTestId('case').first();
    await expect(firstCase).toContainText('컴파일 에러', { timeout: FIRST_RUN_TIMEOUT });
    // The error names the line in the user's file (cpp-run.test.ts pins the exact text).
    await expect(firstCase).toContainText(/solution\.cpp:\d+:\d+: error/);
  });

  test('TypeScript runs with type annotations and reports syntax errors', async ({
    page,
    extensionId,
  }) => {
    await openWithCode(
      page,
      extensionId,
      'typescript',
      'const input: string[]',
      `interface Pair { a: number; b: number }
const [a, b]: number[] = require('fs').readFileSync('/dev/stdin').toString().trim().split(' ').map(Number);
const pair: Pair = { a, b };
function sum<T extends Pair>(p: T): number { return p.a + p.b; }
console.log(sum(pair) as number);
`,
    );
    await expect(page.getByText('solution.ts', { exact: true })).toBeVisible();
    await runPasses(page);

    const content = page.locator('.cm-content');
    await content.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText('const x: number = 1;\nconst y: number = ;\n');
    await page.getByRole('button', { name: '코드 실행' }).click();
    const firstCase = page.getByTestId('case').first();
    await expect(firstCase).toContainText('컴파일 에러');
    await expect(firstCase).toContainText('solution.ts:2:');
  });

  test('Java 8 runs on the Java compiler', async ({ page, extensionId }) => {
    await openWithCode(
      page,
      extensionId,
      'java8',
      'public class Main',
      `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        long a = Long.parseLong(st.nextToken()), b = Long.parseLong(st.nextToken());
        System.out.println(a + b);
    }
}
`,
    );
    await expect(page.getByText('Main.java', { exact: true })).toBeVisible();
    await runPasses(page);
  });
});

// Synthetic submit page only: the form never submits.
const submitHtml = readFileSync('tests/fixtures/submit-sample.html', 'utf8').replace(
  '</body>',
  `<script>
    window.__cib = { submitted: false, clicked: false };
    document.getElementById('submit_form').addEventListener('submit', (e) => {
      e.preventDefault();
      window.__cib.submitted = true;
    });
    let value = '';
    document.querySelector('.CodeMirror').CodeMirror = {
      getValue: () => value,
      setValue: (v) => { value = v; },
    };
  </script></body>`,
);

test.describe('submit-only languages', () => {
  test('cannot run, say why, and still submit', async ({ context, page, extensionId }) => {
    await openWithCode(page, extensionId, 'rust', 'std::io');

    const select = page.getByRole('combobox', { name: '언어' });
    await expect(select.locator('optgroup')).toHaveCount(2);
    await expect(select.locator('optgroup[label="제출만"] option')).toHaveText([
      'Kotlin (JVM)',
      'Rust 2021',
      'Go',
      'Swift',
      'C#',
      'Ruby',
    ]);
    await expect(select.locator('optgroup[label="브라우저에서 실행"] option')).toHaveCount(11);

    const run = page.getByRole('button', { name: '코드 실행' });
    await expect(run).toBeDisabled();
    await expect(run).toHaveAttribute('title', SUBMIT_ONLY_REASON);
    await expect(page.getByTestId('run-unavailable')).toHaveText(SUBMIT_ONLY_REASON);
    await expect(page.getByText('solution.rs', { exact: true })).toBeVisible();
    // Rust has solution-function glue: submit-only does not block the switch.
    const toggle = page.getByRole('switch', { name: 'solution 함수' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#solution-reason')).toHaveCount(0);

    // Back to a language that runs: the button works again.
    await select.selectOption('javascript');
    await expect(run).toBeEnabled();
    await expect(page.getByTestId('run-unavailable')).toHaveCount(0);

    // Submitting fills Baekjoon's form with Rust 2021 (id 113) and never submits it.
    await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) =>
      new URL(route.request().url()).pathname === '/submit/1000'
        ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: submitHtml })
        : route.abort(),
    );
    const code = 'fn main() {\n    println!("3");\n}\n';
    const opened = context.waitForEvent('page');
    const response = await page.evaluate(
      (code) =>
        chrome.runtime.sendMessage({
          type: 'cib:submit-request',
          problemId: 1000,
          language: 'rust',
          code,
        }),
      code,
    );
    expect(response).toEqual({ ok: true });
    const submitPage = await opened;
    // Routes do not catch the first navigation of a tab the extension opens (submit.spec.ts).
    await submitPage.goto('https://acmicpc.net/submit/1000');
    await expect(submitPage.locator('select#language')).toHaveValue('113', { timeout: 10_000 });
    await expect
      .poll(() =>
        submitPage.evaluate(() => {
          const el = document.querySelector('.CodeMirror') as Element & {
            CodeMirror: { getValue(): string };
          };
          return el.CodeMirror.getValue();
        }),
      )
      .toBe(code);
    const submitted = await submitPage.evaluate(
      () => (window as unknown as { __cib: { submitted: boolean } }).__cib.submitted,
    );
    expect(submitted).toBe(false);
  });
});
