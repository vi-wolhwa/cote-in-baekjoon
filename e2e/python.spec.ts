import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Loading Pyodide takes a few seconds on the first run. */
const FIRST_RUN_TIMEOUT = 30_000;

/**
 * Switches to Python 3 and replaces the editor content. insertText avoids the editor's
 * auto-indent after ':', which would change the meaning of Python code typed key by key.
 */
async function writePython(page: Page, code: string) {
  await page.getByRole('combobox', { name: '언어' }).selectOption('python3');
  await expect(page.getByText('solution.py')).toBeVisible();
  const content = page.locator('.cm-content');
  await expect(async () => {
    await content.click();
    await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/, { timeout: 500 });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(code);
    await expect(content).toContainText(code.split('\n').at(-1) ?? code, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

test.describe('Python 3', () => {
  test.describe.configure({ timeout: 60_000 });

  test('runs an A+B solution on the sample cases', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/ide.html`);
    await writePython(
      page,
      'import sys\ninput = sys.stdin.readline\na, b = map(int, input().split())\nprint(a + b)',
    );
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공', {
      timeout: FIRST_RUN_TIMEOUT,
    });
  });

  test('stops an infinite loop with a timeout', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/ide.html`);
    await writePython(page, 'while True: pass');
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('case').first()).toContainText(
      '초를 초과하여 실행이 중단되었습니다',
      { timeout: FIRST_RUN_TIMEOUT },
    );
  });

  test('shows a runtime error with the exception', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/ide.html`);
    await writePython(page, 'print(1 // 0)');
    await page.getByRole('button', { name: '코드 실행' }).click();
    const firstCase = page.getByTestId('case').first();
    await expect(firstCase).toContainText('런타임 에러', { timeout: FIRST_RUN_TIMEOUT });
    await expect(firstCase).toContainText('ZeroDivisionError');
  });

  test('cannot reach the network', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/ide.html`);
    await writePython(
      page,
      [
        'import js',
        'try:',
        '    xhr = js.XMLHttpRequest.new()',
        "    xhr.open('GET', 'https://example.com', False)",
        '    xhr.send()',
        "    print('reached')",
        'except Exception:',
        "    print('blocked')",
      ].join('\n'),
    );
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('case').first()).toContainText('blocked', {
      timeout: FIRST_RUN_TIMEOUT,
    });
  });
});
