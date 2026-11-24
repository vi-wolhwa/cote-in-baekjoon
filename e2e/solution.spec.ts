import type { BrowserContext, FrameLocator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  MIN,
  problemHtml,
  readCaptureTabs,
  seedExam,
  serveBaekjoon,
  storedExam,
} from './exam-helpers';

/**
 * solution 함수 mode (ADR-0006, #113–#115, #36): on by default with a format inferred from
 * the samples, code kept per mode, the format editor, the per-parameter test case dialog and
 * submission of the function with its glue code. SCREENS=1 also saves screenshots to
 * tmp-screens/ (not committed).
 */
test.use({ solutionMode: true });

declare const chrome: {
  storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } };
};

const JS_SOLUTION = 'function solution(a, b) {\n  return a + b;\n}';

async function shot(page: Page, name: string) {
  if (process.env.SCREENS) await page.screenshot({ path: `tmp-screens/${name}.png` });
}

/** Replaces the editor content; insertText avoids auto-indent and bracket closing. */
async function writeCode(page: Page, root: Page | FrameLocator, code: string) {
  const content = root.locator('.cm-content');
  await expect(async () => {
    await content.click();
    await expect(root.locator('.cm-editor')).toHaveClass(/cm-focused/, { timeout: 500 });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(code);
    await expect(content).toContainText(code.split('\n').at(-1) ?? code, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

const toggle = (root: Page | FrameLocator) => root.getByRole('switch', { name: 'solution 함수' });

test('opens in solution mode with a format inferred from the samples', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('format-source')).toHaveText('예제로 추론함');
  await expect(page.getByText('solution(a: int, b: int) → int')).toBeVisible();
  await expect(page.locator('.file-tab')).toHaveText('solution.js');
  await expect(page.locator('.cm-content')).toContainText('function solution(a, b) {');

  // The samples read as '입출력 예': a column per parameter and result, a row per case.
  const io = page.getByTestId('io-table');
  await expect(io.locator('th')).toHaveText(['a', 'b', 'result']);
  await expect(io.locator('tbody tr').first().locator('td')).toHaveText(['1', '2', '3']);
  await expect(page.getByText('예제 입력 1')).toHaveCount(0);
  // Standard input/output shows the samples as they are.
  await toggle(page).click();
  await expect(io).toHaveCount(0);
  await expect(page.getByText('예제 입력 1')).toBeVisible();
  await toggle(page).click();
  await expect(io).toBeVisible();

  // A wrong result reads as values: parameters in, a return value out.
  await writeCode(page, page, 'function solution(a, b) {\n  return a - b;\n}');
  await page.getByRole('button', { name: '코드 실행' }).click();
  const first = page.getByTestId('case').first();
  await expect(first.locator('td').nth(0)).toHaveText('1, 2');
  await expect(first.locator('td').nth(1)).toHaveText('3');
  await expect(first.locator('td').nth(2)).toHaveText(
    '실행한 결괏값 -1이(가) 기댓값 3와(과) 다릅니다.',
  );

  await writeCode(page, page, JS_SOLUTION);
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공');
  await shot(page, 'solution-dark');

  await page.evaluate(() => chrome.storage.local.set({ 'ui:theme': 'light' }));
  await page.reload();
  await page.getByRole('button', { name: '입출력 형식' }).click();
  await expect(page.getByTestId('format-check')).toBeVisible();
  await shot(page, 'solution-light-format-card');
});

test('runs a TypeScript solution function with typed starting code', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await page.getByRole('combobox', { name: '언어' }).selectOption('typescript');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.file-tab')).toHaveText('solution.ts');
  await expect(page.locator('.cm-content')).toContainText(
    'function solution(a: number, b: number): number {',
  );
  await writeCode(
    page,
    page,
    'function solution(a: number, b: number): number {\n  return a + b;\n}',
  );
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공');
});

test('runs a Python solution function', async ({ page, extensionId }) => {
  test.setTimeout(60_000);
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await page.getByRole('combobox', { name: '언어' }).selectOption('python3');
  await expect(page.locator('.cm-content')).toContainText('def solution(a, b):');
  await writeCode(page, page, 'def solution(a, b):\n    return a + b');
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공', { timeout: 30_000 });
});

test('switching to standard I/O and back keeps the code of both modes', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await writeCode(page, page, JS_SOLUTION);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.cm-content')).toContainText("readFileSync('/dev/stdin')");
  await expect(page.locator('.file-tab')).toHaveText('solution.js');
  await writeCode(page, page, 'console.log(3);');

  await toggle(page).click();
  await expect(page.locator('.cm-content')).toContainText('return a + b;');
  await toggle(page).click();
  await expect(page.locator('.cm-content')).toContainText('console.log(3);');
  // The choice is remembered like the language.
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
});

test('editing the format validates it against the samples, and saving makes it the users', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await page.getByRole('button', { name: '입출력 형식' }).click();

  // An edit that does not fit the samples: a warning icon whose tooltip says why; saving is off.
  await page.getByRole('combobox', { name: '반환 타입' }).selectOption('bool');
  await expect(page.getByTestId('format-errors')).toBeHidden();
  await page.getByTestId('format-warning').hover();
  await expect(page.getByTestId('format-errors')).toBeVisible();
  await expect(page.getByTestId('format-errors')).toContainText(
    "예제 1 출력: '3'은(는) 'YES'도 'NO'도 아니에요",
  );
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeDisabled();
  await shot(page, 'solution-format-error');

  await page.getByRole('combobox', { name: '반환 타입' }).selectOption('long');
  await page.getByRole('textbox', { name: '1번째 매개변수 이름' }).fill('x');
  await page.getByRole('textbox', { name: '1번째 매개변수 이름' }).press('Enter');
  await expect(page.getByTestId('format-check')).toBeVisible();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByTestId('format-source')).toHaveText('직접 정의함');
  // The untouched starting code follows the new signature.
  await expect(page.locator('.cm-content')).toContainText('function solution(x, b) {');

  // A parameter added on its own line does not fit the one-line samples; deleting it does.
  await page.getByRole('button', { name: '매개변수 추가' }).click();
  await expect(page.getByRole('textbox', { name: '3번째 매개변수 이름' })).toHaveValue('n');
  await expect(page.getByTestId('format-warning')).toBeVisible();
  await page.getByRole('combobox', { name: '3번째 매개변수 읽는 방법' }).selectOption('same');
  await expect(page.getByTestId('format-warning')).toBeVisible();
  await shot(page, 'solution-format-table');
  await page.getByRole('button', { name: '3번째 매개변수 삭제' }).click();

  // A name used twice: one message, and both name fields marked.
  const second = page.getByRole('textbox', { name: '2번째 매개변수 이름' });
  await second.fill('x');
  await second.press('Enter');
  await expect(second).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('textbox', { name: '1번째 매개변수 이름' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page.getByTestId('format-warning').hover();
  await expect(page.getByTestId('format-errors').locator('li')).toHaveText([
    "'x' 이름을 다른 매개변수도 써요. 이름을 다르게 해 주세요.",
  ]);
  await second.fill('b');
  await second.press('Enter');
  await expect(second).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('format-check')).toBeVisible();
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeDisabled();

  // 형식 초기화 goes back to the inferred format.
  await page.getByRole('button', { name: '형식 초기화' }).click();
  await expect(page.getByTestId('format-source')).toHaveText('예제로 추론함');
});

test('the test case dialog has a column per parameter and checks each value', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  await writeCode(page, page, JS_SOLUTION);
  await page.getByRole('button', { name: '+ 테스트 케이스 추가하기' }).click();
  const dialog = page.getByRole('dialog', { name: '테스트 케이스 추가' });
  await expect(dialog.getByRole('columnheader', { name: 'a int' })).toBeVisible();
  await expect(dialog.getByRole('columnheader', { name: '기댓값 int' })).toBeVisible();
  await dialog.getByRole('textbox', { name: '테스트 3 a' }).fill('3');
  await dialog.getByRole('textbox', { name: '테스트 3 b' }).fill('[4]');
  await dialog.getByRole('textbox', { name: '테스트 3 기댓값' }).fill('"7"');
  await dialog.getByRole('button', { name: '확인' }).click();
  await expect(dialog.getByText('정수가 필요해요')).toHaveCount(2);
  await shot(page, 'solution-case-dialog');

  await dialog.getByRole('textbox', { name: '테스트 3 b' }).fill('4');
  await dialog.getByRole('textbox', { name: '테스트 3 기댓값' }).fill('7');
  await dialog.getByRole('button', { name: '확인' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByTestId('summary')).toHaveText('3개 중 3개 성공');
  // Stored as standard input/output, so the standard I/O dialog shows it as text.
  await toggle(page).click();
  await page.getByRole('button', { name: '+ 테스트 케이스 추가하기' }).click();
  await expect(page.getByRole('textbox', { name: '테스트 3 입력' })).toHaveValue('3 4\n');
});

async function openIde(page: Page) {
  await page.goto('https://acmicpc.net/problem/1000');
  await page.getByRole('button', { name: '코딩테스트' }).click();
  const ide = page.frameLocator('#cib-ide-overlay');
  await expect(ide.getByRole('heading', { name: '테스트용 덧셈' })).toBeVisible();
  return ide;
}

test('submits the function together with its glue code', async ({ page, context }) => {
  await serveBaekjoon(context);
  const ide = await openIde(page);
  await expect(toggle(ide)).toHaveAttribute('aria-checked', 'true');
  await writeCode(page, ide, JS_SOLUTION);
  const opened = context.waitForEvent('page');
  await ide.getByRole('button', { name: '제출하기' }).click();
  const tab = await opened;
  await tab.goto('https://acmicpc.net/submit/1000');
  await expect
    .poll(
      () =>
        tab.evaluate(() => {
          const el = document.querySelector('.CodeMirror') as Element & {
            CodeMirror?: { getValue(): string };
          };
          return el.CodeMirror?.getValue() ?? '';
        }),
      { timeout: 10_000 },
    )
    .toContain('function solution(a, b) {\n  return a + b;\n}');
  const submitted = await tab.evaluate(() =>
    (
      document.querySelector('.CodeMirror') as Element & { CodeMirror: { getValue(): string } }
    ).CodeMirror.getValue(),
  );
  expect(submitted).toContain("require('fs').readFileSync('/dev/stdin')");
  expect(submitted).toContain('__cib_o.push(__cib_f(solution(__cib_v0, __cib_v1)))');
});

/** A problem page whose samples no DSL v1 format can read: name and score per line. */
async function serveUnknownFormat(context: BrowserContext) {
  const html = problemHtml
    .replace('1 2\n</pre>', '2\nkim 90\nlee 85\n</pre>')
    .replace('3\n</pre>', 'kim\n</pre>')
    .replace('10 20\n</pre>', '3\nan 1\nbo 2\ncy 3\n</pre>')
    .replace('30\n</pre>', 'cy\n</pre>');
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) =>
    new URL(route.request().url()).pathname === '/problem/1000'
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
      : route.abort(),
  );
}

test('without a format the switch is off and says why, and a format can be made', async ({
  page,
  context,
}) => {
  await serveUnknownFormat(context);
  const ide = await openIde(page);
  const sw = toggle(ide);
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(sw).toHaveAttribute('aria-disabled', 'true');
  await expect(ide.locator('.solution-toggle')).toHaveAttribute(
    'title',
    '입출력 형식을 알 수 없어 표준 입출력으로 풀어요',
  );
  await expect(ide.locator('.cm-content')).toContainText("readFileSync('/dev/stdin')");
  await sw.hover();
  await shot(page, 'solution-toggle-disabled');

  await ide.getByRole('button', { name: '형식 만들기' }).click();
  await expect(ide.getByTestId('format-warning')).toBeVisible();
});

test('in the mock exam, the answer keeps the function and the program with glue', async ({
  page,
  extensionId,
}) => {
  const id = await seedExam(page, extensionId, {
    startedAt: Date.now() - MIN,
    read: [1000, 1001, 1002],
  });
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  // 1000 is in the bundled format data (#123), which needs no badge.
  await expect(page.getByTestId('format-source')).toHaveCount(0);
  // A wrong format can be reported; the link never carries a "format" parameter (GitHub: 406).
  await page.getByRole('button', { name: '입출력 형식' }).click();
  const report = new URL(
    (await page.getByRole('link', { name: '형식 오류 신고' }).getAttribute('href')) ?? '',
  );
  expect(report.searchParams.get('template')).toBe('4-format.yml');
  expect(report.searchParams.get('problem')).toBe('1000');
  expect(report.searchParams.get('source')).toBe('형식 데이터');
  expect(report.searchParams.get('io_format')).toContain('"name":"a"');
  expect(report.searchParams.has('format')).toBe(false);
  await page.getByRole('button', { name: '입출력 형식' }).click();
  await writeCode(page, page, JS_SOLUTION);
  await page.getByRole('button', { name: '코드 실행' }).click();
  await expect(page.getByText('solution(a: int, b: int) → int')).toBeVisible();
  await expect(page.getByTestId('summary')).toHaveText('1개 중 1개 성공');
  await page.getByRole('button', { name: '제출하기' }).click();
  await expect(page.getByTestId('exam-answer')).toBeVisible();
  const answer = (await storedExam(page, id)).answers?.['1000'] as unknown as {
    code: string;
    solution: string;
  };
  expect(answer.solution).toBe(JS_SOLUTION);
  expect(answer.code.startsWith(`${JS_SOLUTION}\n`)).toBe(true);
  expect(answer.code).toContain('__cib_o.push(__cib_f(solution(__cib_v0, __cib_v1)))');
  await expect(page.getByTestId('answer-differs')).toHaveCount(0);
});

test('in the mock exam, a statement read after the editor opened switches it to the function', async ({
  page,
  context,
  extensionId,
}) => {
  await serveBaekjoon(context);
  const id = await seedExam(page, extensionId, { startedAt: Date.now() - MIN });
  readCaptureTabs(context, page);
  await page.goto(`chrome-extension://${extensionId}/exam.html#${id}`);
  await expect(page.locator('.problem')).toContainText('합을 출력한다.', { timeout: 20_000 });
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.cm-content')).toContainText('function solution(a, b) {');
  await expect(page.locator('.file-tab')).toHaveText('solution.js');
});

test('a saved starting code with an old header comment becomes the current one', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const ruby = 'def solution(a, b)\n  answer = 0\n  return answer\nend\n';
  await page.evaluate(
    (code) =>
      chrome.storage.local.set({
        'ui:language': 'ruby',
        'code:0:ruby:fn': `# 입력을 읽고 결과를 출력하는 코드는 자동으로 붙습니다.\n\n${code}`,
      }),
    ruby,
  );
  await page.reload();
  await expect(page.locator('.file-tab')).toHaveText('solution.rb');
  await expect(page.locator('.cm-content')).toContainText('def solution(a, b)');
  await expect(page.locator('.cm-content')).not.toContainText('자동으로 붙습니다');
});
