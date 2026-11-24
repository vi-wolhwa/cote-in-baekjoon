/** Shared setup for the mock exam E2E tests: synthetic Baekjoon pages only. */
import { readFileSync } from 'node:fs';
import type { BrowserContext, Frame, Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

declare const chrome: {
  storage: {
    local: {
      get: (keys: string | null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
    session: { get: (keys: string | null) => Promise<Record<string, unknown>> };
  };
};

export const MIN = 60_000;
export const problemHtml = readFileSync('tests/fixtures/problem-sample.html', 'utf8');
export const A_PLUS_B =
  "const [a, b] = require('fs').readFileSync('/dev/stdin').toString().trim().split(' ').map(Number); console.log(a + b);";

/** The submit page presses its own button; Baekjoon would then redirect to the status page. */
const submitHtml = readFileSync('tests/fixtures/submit-sample.html', 'utf8').replace(
  '</body>',
  `<script>
    document.getElementById('submit_form').addEventListener('submit', (e) => e.preventDefault());
    setTimeout(() => {
      let value = '';
      document.querySelector('.CodeMirror').CodeMirror = {
        getValue: () => value,
        setValue: (v) => { value = v; },
      };
    }, 100);
  </script></body>`,
);

/** Our submission (5004) of `problemId` finishes judging as 맞았습니다!! a moment later. */
function statusHtml(problemId: string) {
  return readFileSync('tests/fixtures/status-sample.html', 'utf8')
    .replaceAll('href="/problem/1000"', `href="/problem/${problemId}"`)
    .replace(
      '</body>',
      `<script>
    const row = document.getElementById('solution-5004');
    row.querySelector('[data-timestamp]').setAttribute('data-timestamp', String(Math.floor(Date.now() / 1000)));
    setTimeout(() => {
      const span = row.querySelector('span.result-text');
      span.className = 'result-text result-ac';
      span.setAttribute('data-color', 'ac');
      span.textContent = '맞았습니다!!';
      row.querySelector('td.memory').textContent = '9000';
      row.querySelector('td.time').textContent = '44';
    }, 1500);
  </script></body>`,
    );
}

export async function serveBaekjoon(context: BrowserContext) {
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\//, (route) => {
    const url = new URL(route.request().url());
    const html = (body: string) => route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    if (/^\/problem\/\d+$/.test(url.pathname)) return html(problemHtml);
    if (/^\/submit\/\d+$/.test(url.pathname)) return html(submitHtml);
    if (url.pathname === '/status')
      return html(statusHtml(url.searchParams.get('problem_id') ?? ''));
    return route.abort();
  });
}

/** The problem a background tab is reading now, from the capture record (one at a time). */
async function pendingCapture(page: Page): Promise<number | undefined> {
  const all = await page
    .evaluate(() => chrome.storage.session.get(null))
    .catch(() => ({}) as Record<string, unknown>);
  for (const [key, value] of Object.entries(all)) {
    const record = value as { state?: string; problemId?: number };
    if (key.startsWith('cib:capture:') && record.state === 'pending') return record.problemId;
  }
  return undefined;
}

/**
 * The exam reads its problems in background tabs (ADR-0005). Routes do not catch the first
 * navigation of a tab the extension creates (see submit.spec.ts), so each capture tab is
 * loaded again; it closes by itself once read. Returns the problems read this way.
 */
export function readCaptureTabs(context: BrowserContext, examPage: Page): number[] {
  const read: number[] = [];
  context.on('page', (tab) => {
    void (async () => {
      await tab.waitForEvent('close', { timeout: 1000 }).catch(() => undefined);
      if (tab.isClosed()) return;
      const problemId = await pendingCapture(examPage);
      if (problemId === undefined) return; // A submit window, not a capture tab.
      read.push(problemId);
      await tab.goto(`https://acmicpc.net/problem/${problemId}`).catch(() => undefined);
    })();
  });
  return read;
}

/**
 * A submission's background tab: load its pages like Baekjoon would, until it closes. Routes
 * do not catch the first navigation of a tab the extension creates, so it is loaded again.
 */
export async function handleSubmitTab(tab: Page, problemId: number) {
  await tab.goto(`https://acmicpc.net/submit/${problemId}`);
  await expect(tab.getByText('잠시 뒤 자동으로 제출합니다')).toBeVisible();
  const closed = tab.waitForEvent('close', { timeout: 15_000 });
  await tab.goto(`https://acmicpc.net/status?from_mine=1&problem_id=${problemId}&user_id=tester`);
  await closed;
}

interface TabsApi {
  chrome: {
    tabs: { query(q: object): Promise<{ id?: number }[]> };
    windows: { getAll(): Promise<unknown[]> };
    storage: { session: { get(k: string): Promise<Record<string, unknown>> } };
  };
}

/**
 * Where the submission of `problemId` runs, seen from an extension page (`frame`): the number
 * of windows and whether its tab is the active one. (Playwright reports every page as
 * visible, so `document.visibilityState` cannot tell.)
 */
export async function submitTabInfo(frame: Page | Frame, problemId: number) {
  return frame.evaluate(async (key) => {
    const api = (globalThis as unknown as TabsApi).chrome;
    const [active] = await api.tabs.query({ active: true, currentWindow: true });
    const record = (await api.storage.session.get(key))[key] as { tabId?: number } | undefined;
    return {
      windows: (await api.windows.getAll()).length,
      active: record?.tabId !== undefined && active?.id === record.tabId,
    };
  }, `cib:submit-tab:${problemId}`);
}

export async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not visible');
  return found;
}

export const TITLES = ['테스트용 덧셈', '테스트 문제 둘', '테스트 문제 셋'];

/** What parseProblem() makes of the synthetic page, for exams seeded as already read. */
export const body = (id: number) => ({
  id,
  title: '테스트용 덧셈',
  timeLimitText: '0.5 초 (추가 시간 없음)',
  memoryLimitText: '256 MB',
  timeLimitMs: 500,
  sections: {
    description: '<p>정수를 더한다.</p>',
    input: '<p>두 정수</p>',
    output: '<p>합을 출력한다.</p>',
  },
  samples: [{ input: '1 2\n', output: '3\n' }],
  labels: [],
});

export interface SeedOptions {
  id?: string;
  startedAt: number;
  minutes?: number;
  endedAt?: number;
  /** Problems whose statement is in the record already. */
  read?: number[];
  submissions?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

/** An exam record as '시험 시작' would store it: three problems. */
export async function seedExam(page: Page, extensionId: string, options: SeedOptions) {
  const id = options.id ?? 'e2eexam0001';
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(
    ({ id, options, titles, bodies }) =>
      chrome.storage.local.set({
        [`exam:${id}`]: {
          id,
          startedAt: options.startedAt,
          durationMs: (options.minutes ?? 120) * 60_000,
          ...(options.endedAt ? { endedAt: options.endedAt } : {}),
          tiers: ['silver', 'gold'],
          tags: [],
          problems: [1000, 1001, 1002].map((pid, i) => ({
            id: pid,
            title: titles[i],
            level: [7, 12, 14][i],
            ...(options.read?.includes(pid) ? { body: bodies[i] } : {}),
          })),
          flagged: [],
          submissions: options.submissions ?? {},
          ...(options.answers ? { answers: options.answers } : {}),
        },
        'ui:language': 'javascript',
        ...(options.extra ?? {}),
      }),
    { id, options, titles: TITLES, bodies: [body(1000), body(1001), body(1002)] },
  );
  return id;
}

export async function storedExam(page: Page, id: string) {
  const items = await page.evaluate((key) => chrome.storage.local.get(key), `exam:${id}`);
  return items[`exam:${id}`] as {
    endedAt?: number;
    problems: { id: number; body?: { title: string } }[];
    answers?: Record<string, { code: string; language: string }>;
    submitQueue?: Record<string, { state: string }>;
    submissions: Record<string, unknown>;
  };
}

export async function typeCode(page: Page, code: string) {
  const content = page.locator('.cm-content');
  await expect(async () => {
    await content.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(code);
    await expect(content).toContainText(code.slice(-20), { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}
