import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** The first run loads the compiler (javac + TeaVM, about 7.5 MB) before compiling. */
const FIRST_RUN_TIMEOUT = 60_000;

const main = (body: string) =>
  `import java.io.*;\nimport java.util.*;\n\npublic class Main {\n${body}\n}\n`;

const A_PLUS_B = main(`    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        long a = sc.nextLong(), b = sc.nextLong();
        System.out.println(a + b);
    }`);

/** Opens the IDE in Java 11 and replaces the editor content with `code`. */
async function openWithCode(page: Page, extensionId: string, code: string) {
  await page.goto(`chrome-extension://${extensionId}/ide.html`);
  const content = page.locator('.cm-content');
  // Saved state can still be loading right after navigation and reset the language; retry.
  await expect(async () => {
    await page.getByRole('combobox', { name: '언어' }).selectOption('java11');
    await expect(content).toContainText('public class Main', { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  // insertText puts the code in as-is (typing would trigger auto-indent and bracket closing).
  await page.keyboard.insertText(code);
  await expect(content).toContainText(code.trim().split('\n').at(-1) ?? '');
}

test.describe('Java 11', () => {
  test.describe.configure({ timeout: 120_000 });

  test('compiles and runs A+B on the sample cases', async ({ page, extensionId }) => {
    await openWithCode(page, extensionId, A_PLUS_B);
    await expect(page.getByText('Main.java', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공', {
      timeout: FIRST_RUN_TIMEOUT,
    });
  });

  test('reads with BufferedReader and StringTokenizer', async ({ page, extensionId }) => {
    await openWithCode(
      page,
      extensionId,
      main(`    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        int a = Integer.parseInt(st.nextToken());
        int b = Integer.parseInt(st.nextToken());
        StringBuilder sb = new StringBuilder();
        sb.append(a + b).append('\\n');
        System.out.print(sb);
    }`),
    );
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공', {
      timeout: FIRST_RUN_TIMEOUT,
    });
  });

  test('shows a compile error with its line number', async ({ page, extensionId }) => {
    await openWithCode(
      page,
      extensionId,
      main('    public static void main(String[] args) {\n        int x = "s";\n    }'),
    );
    await page.getByRole('button', { name: '코드 실행' }).click();
    const firstCase = page.getByTestId('case').first();
    await expect(firstCase).toContainText('컴파일 에러', { timeout: FIRST_RUN_TIMEOUT });
    await expect(firstCase).toContainText('Main.java:6: error: incompatible types');
  });

  test('shows the name of an uncaught exception', async ({ page, extensionId }) => {
    await openWithCode(
      page,
      extensionId,
      main(`    public static void main(String[] args) {
        int[] a = new int[3];
        a[5] = 1;
    }`),
    );
    await page.getByRole('button', { name: '코드 실행' }).click();
    const firstCase = page.getByTestId('case').first();
    await expect(firstCase).toContainText('런타임 에러', { timeout: FIRST_RUN_TIMEOUT });
    await expect(firstCase).toContainText('java.lang.ArrayIndexOutOfBoundsException');
  });

  /** Recursion `n` deep; prints a + b so the sample cases pass. */
  const recursion = (n: number) =>
    main(`    static int depth(int n) { return n == 0 ? 0 : 1 + depth(n - 1); }
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt();
        if (depth(${n}) == ${n}) System.out.println(a + b);
    }`);

  test('runs recursion 10,000 deep', async ({ page, extensionId }) => {
    // The program runs on its own stack (JSPI); a worker's own stack ends near 7,800.
    await openWithCode(page, extensionId, recursion(10_000));
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('summary')).toHaveText('2개 중 2개 성공', {
      timeout: FIRST_RUN_TIMEOUT,
    });
  });

  test('explains the recursion limit on a stack overflow', async ({ page, extensionId }) => {
    await openWithCode(page, extensionId, recursion(1_000_000));
    await page.getByRole('button', { name: '코드 실행' }).click();
    const firstCase = page.getByTestId('case').first();
    await expect(firstCase).toContainText('java.lang.StackOverflowError', {
      timeout: FIRST_RUN_TIMEOUT,
    });
    await expect(firstCase).toContainText('브라우저 실행은 재귀 깊이가 약 1만 단계로 제한됩니다');
  });

  test('stops an infinite loop with a timeout', async ({ page, extensionId }) => {
    await openWithCode(
      page,
      extensionId,
      main(
        '    public static void main(String[] args) {\n        long x = 0;\n        while (true) x++;\n    }',
      ),
    );
    await page.getByRole('button', { name: '코드 실행' }).click();
    await expect(page.getByTestId('case').first()).toContainText(
      '초를 초과하여 실행이 중단되었습니다',
      { timeout: FIRST_RUN_TIMEOUT },
    );
  });
});
