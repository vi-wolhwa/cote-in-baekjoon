import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// These tests compare stored items exactly: keep the solution switch at its default so the
// fixture writes nothing to storage.
test.use({ solutionMode: true });

declare const chrome: {
  storage: {
    local: {
      get: (keys: null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
      clear: () => Promise<void>;
    };
  };
};

const storageItems = (page: Page) => page.evaluate(() => chrome.storage.local.get(null));

test('exports the saved code and restores it into an empty profile', async ({
  page,
  extensionId,
}) => {
  const options = `chrome-extension://${extensionId}/options.html`;
  await page.goto(options);
  await page.evaluate(() =>
    chrome.storage.local.set({
      'code:1000:javascript': 'console.log(3)',
      'cases:1000': [{ input: '1 2', output: '3' }],
      'ui:keymap': 'vim',
    }),
  );
  await page.reload();
  await expect(page.getByTestId('current')).toContainText('문제 1개 (코드 1개, 테스트 케이스 1개');

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일로 내보내기' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^코딩테스트-in-백준-백업-\d{4}-\d\d-\d\d\.json$/);
  const file = await download.path();
  const backup = JSON.parse(readFileSync(file, 'utf8')) as { items: Record<string, unknown> };
  expect(backup.items['code:1000:javascript']).toBe('console.log(3)');

  // Simulate a reinstall, then keep one newer item to see that merging does not overwrite it.
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ 'ui:keymap': 'emacs' });
  });
  await page.reload();
  await page.getByLabel('백업 파일').setInputFiles(file);
  await expect(page.getByTestId('pending')).toContainText('문제 1개');
  await page.getByRole('button', { name: '합치기' }).click();
  await expect(page.getByRole('status')).toContainText('합쳤습니다');

  expect(await storageItems(page)).toEqual({
    'code:1000:javascript': 'console.log(3)',
    'cases:1000': [{ input: '1 2', output: '3' }],
    'ui:keymap': 'emacs',
  });

  // Replacing takes the backup as it is.
  await page.getByLabel('백업 파일').setInputFiles(file);
  await page.getByLabel(/덮어쓰기/).check();
  await page.getByRole('button', { name: '덮어쓰기' }).click();
  await expect(page.getByRole('status')).toContainText('백업으로 바꿨습니다');
  expect((await storageItems(page))['ui:keymap']).toBe('vim');
});

test('rejects a file that is not a backup', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel('백업 파일').setInputFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByRole('status')).toHaveText('코딩테스트 in 백준 백업 파일이 아닙니다.');
});

test('opens from the IDE top bar', async ({ page, context, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const opened = context.waitForEvent('page');
  await page
    .getByRole('navigation', { name: '경로' })
    .getByRole('button', { name: '백업과 복원' })
    .click();
  const options = await opened;
  await expect(options).toHaveURL(`chrome-extension://${extensionId}/options.html`);
});
