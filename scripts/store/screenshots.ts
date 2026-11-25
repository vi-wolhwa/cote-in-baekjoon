/**
 * Chrome Web Store screenshots (#66), 1280×800, from the built extension and a synthetic
 * problem page (scripts/store/problem.html). Nothing is sent to Baekjoon.
 *
 *   npm run build && PW_CHANNEL=msedge node scripts/store/screenshots.ts
 *
 * Output: docs/store/screenshots/*.png
 */
import { chromium, type FrameLocator, type Page, type Worker } from '@playwright/test';

declare const chrome: { storage: { local: { set(items: object): Promise<void> } } };
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXTENSION = path.join(ROOT, '.output', 'chrome-mv3');
const OUT = path.join(ROOT, 'docs', 'store', 'screenshots');
const PROBLEM_URL = 'https://www.acmicpc.net/problem/99999';
const SIZE = { width: 1280, height: 800 };

const PYTHON = `import sys
input = sys.stdin.readline

n = int(input())
a = list(map(int, input().split()))

best = cur = a[0]
for x in a[1:]:
    cur = max(x, cur + x)
    best = max(best, cur)
print(best)`;

const CPP = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (auto& x : a) cin >> x;
    int best = 0, cur = 0;  // 모두 음수일 때를 놓쳤다
    for (int x : a) {
        cur = max(0, cur + x);
        best = max(best, cur);
    }
    cout << best << '\\n';
}`;

const JAVA = `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        StringTokenizer st = new StringTokenizer(br.readLine());
        long best = Long.MIN_VALUE, cur = 0;
        for (int i = 0; i < n; i++) {
            int x = Integer.parseInt(st.nextToken());
            cur = Math.max(x, cur + x);
            best = Math.max(best, cur);
        }
        System.out.println(best)
    }
}`;

async function openIde(page: Page): Promise<FrameLocator> {
  await page.goto(PROBLEM_URL);
  await page.getByRole('button', { name: '코테 화면으로 풀기' }).click();
  const ide = page.frameLocator('#cib-ide-overlay');
  await ide.getByRole('heading', { name: '산책로의 전망 구간' }).waitFor();
  return ide;
}

/** The IDE opens in the saved language with the saved code (src/ide/storage.ts). */
async function saveCode(worker: Worker, group: string, language: string, code: string) {
  await worker.evaluate((items) => chrome.storage.local.set(items), {
    [`code:99999:${group}`]: code,
    'ui:language': language,
  });
}

async function runAndWait(ide: FrameLocator) {
  await ide.getByRole('button', { name: '코드 실행' }).click();
  await ide.getByTestId('summary').waitFor({ timeout: 60_000 });
}

async function shot(page: Page, name: string) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`${name}.png`);
}

mkdirSync(OUT, { recursive: true });
const problemHtml = readFileSync(path.join(import.meta.dirname, 'problem.html'), 'utf8');
const context = await chromium.launchPersistentContext('', {
  channel: process.env.PW_CHANNEL ?? 'chromium',
  viewport: SIZE,
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    '--host-resolver-rules=MAP acmicpc.net ~NOTFOUND, MAP *.acmicpc.net ~NOTFOUND',
  ],
});
try {
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) =>
    route.request().url() === PROBLEM_URL
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: problemHtml })
      : route.abort(),
  );
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const page = context.pages()[0] ?? (await context.newPage());

  // 1. Python: every sample passes.
  await saveCode(worker, 'python', 'python3', PYTHON);
  let ide = await openIde(page);
  await runAndWait(ide);
  await ide.getByTestId('summary').scrollIntoViewIfNeeded();
  await shot(page, '1-python-pass');

  // 2. C++: one sample fails and the panel explains why.
  await saveCode(worker, 'cpp', 'cpp17', CPP);
  ide = await openIde(page);
  await runAndWait(ide);
  await ide.getByTestId('case').nth(1).scrollIntoViewIfNeeded();
  await shot(page, '2-cpp-wrong-answer');

  // 3. Java: a compile error with its line.
  await saveCode(worker, 'java', 'java11', JAVA);
  ide = await openIde(page);
  await runAndWait(ide);
  await shot(page, '3-java-compile-error');
} finally {
  await context.close();
}
