import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** The first run loads the compiler (~100 MB) before compiling. */
const FIRST_RUN_TIMEOUT = 60_000;

/** Opens the IDE in C++17 and replaces the editor content with `code`. */
async function openWithCode(page: Page, extensionId: string, code: string) {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const content = page.locator('.cm-content');
  // Saved state can still be loading right after navigation and reset the language; retry.
  await expect(async () => {
    await page.getByRole('combobox', { name: '언어' }).selectOption('cpp17');
    await expect(content).toContainText('#include <bits/stdc++.h>', { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  // insertText puts the code in as-is (typing would trigger auto-indent and bracket closing).
  await page.keyboard.insertText(code);
  await expect(content).toContainText(code.trim().split('\n').at(-1) ?? '');
}

test.describe('C++17', () => {
  test.describe.configure({ timeout: 120_000 });

  /** DFS along a path graph of `n` nodes; prints a + b so the sample cases pass. */
  const dfs = (n: number) => `#include <bits/stdc++.h>
using namespace std;
vector<int> g[${n + 1}];
bool seen[${n + 1}];
int dfs(int u) {
    seen[u] = true;
    int depth = 0;
    for (int v : g[u]) if (!seen[v]) depth = max(depth, dfs(v) + 1);
    return depth;
}
int main() {
    for (int i = 1; i < ${n}; i++) g[i].push_back(i + 1);
    long long a, b;
    cin >> a >> b;
    if (dfs(1) == ${n - 1}) cout << a + b << endl;
}
`;

  test('runs recursion 10,000 deep', async ({ page, extensionId }) => {
    // The program runs on its own stack (JSPI); a worker's own stack ends near 6,000.
    await openWithCode(page, extensionId, dfs(10_000));
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공', {
      timeout: FIRST_RUN_TIMEOUT,
    });
  });

  test('explains the recursion limit on a stack overflow', async ({ page, extensionId }) => {
    await openWithCode(page, extensionId, dfs(1_000_000));
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('case').first()).toContainText(
      '브라우저 실행은 재귀 깊이가 약 1만 단계로 제한됩니다',
      { timeout: FIRST_RUN_TIMEOUT },
    );
  });

  test('stops an infinite loop with a timeout', async ({ page, extensionId }) => {
    await openWithCode(
      page,
      extensionId,
      'int main() {\n    for (volatile int i = 0;; i++) {}\n}\n',
    );
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('case').first()).toContainText(
      '초를 초과하여 실행이 중단되었습니다',
      { timeout: FIRST_RUN_TIMEOUT },
    );
  });
});
