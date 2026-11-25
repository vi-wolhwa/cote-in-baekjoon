/**
 * Chrome Web Store screenshots (#66, #202), 1280×800 from a 1600×1000 viewport, and the 440×280 promo tile, from the
 * built extension and synthetic pages only: the example problem (scripts/store/problem.html),
 * a made-up mock exam and made-up submission lists. Nothing is sent to Baekjoon.
 *
 *   npm run build && PW_CHANNEL=msedge node scripts/store/screenshots.ts
 *
 * PW_CHANNEL picks the browser (default: Playwright's bundled Chromium).
 * Output: docs/store/screenshots/*.png and docs/store/promo-440x280.png
 */
import { chromium, type FrameLocator, type Page, type Worker } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

declare const chrome: {
  storage: { local: { set(items: object): Promise<void> } };
  tabs: { query(info: object): Promise<{ id: number; url: string }[]> };
};

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXTENSION = path.join(ROOT, '.output', 'chrome-mv3');
const STORE = path.join(ROOT, 'docs', 'store');
const OUT = process.env.STORE_OUT ?? path.join(STORE, 'screenshots');
const BOJ = 'https://acmicpc.net';
const PROBLEM_ID = 99999;
const USER = 'user01';
// The store takes 1280×800 images. A 1600-wide CSS viewport is scaled down into them, so panes
// get more room at a slightly smaller text size.
const CSS_WIDTH = Number(process.env.STORE_CSS_WIDTH ?? 1600);
const SIZE = { width: CSS_WIDTH, height: (CSS_WIDTH * 800) / 1280 };
const MIN = 60_000;

const PYTHON = `import sys
input = sys.stdin.readline

n = int(input())
a = list(map(int, input().split()))

best = cur = a[0]
for x in a[1:]:
    cur = max(x, cur + x)
    best = max(best, cur)
print(best)`;

const SOLUTION = `def solution(n, a):
    best = cur = a[0]
    for x in a[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    return best`;

// ---------------------------------------------------------------------------
// Synthetic pages

const problemHtml = readFileSync(path.join(import.meta.dirname, 'problem.html'), 'utf8');

/** A section of the example problem as the extension's parser would keep it. */
function section(id: string): string {
  const m = new RegExp(`<div id="${id}">([\\s\\S]*?)</div>`).exec(problemHtml);
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

function samples(): { input: string; output: string }[] {
  const pre = (id: string) =>
    new RegExp(`<pre class="sampledata" id="${id}">\\n([\\s\\S]*?)</pre>`).exec(problemHtml)?.[1] ??
    '';
  return [1, 2, 3].map((i) => ({
    input: pre(`sample-input-${i}`),
    output: pre(`sample-output-${i}`),
  }));
}

/** The mock exam's problems: the example problem and three more written for this script. */
const EXAM_PROBLEMS = [
  {
    id: PROBLEM_ID,
    title: '산책로의 전망 구간',
    level: 9,
    sections: {
      description: section('problem_description'),
      input: section('problem_input'),
      output: section('problem_output'),
    },
    samples: samples(),
  },
  {
    id: 99998,
    title: '창고 상자 정리',
    level: 11,
    sections: {
      description:
        '<p>창고에 상자 \\(N\\)개가 한 줄로 놓여 있다. 이웃한 두 상자의 자리를 바꾸는 일을 여러 번 해서 무게가 가벼운 것부터 놓이게 하려고 한다. 바꾸는 횟수의 최솟값을 구하라.</p>',
      input: '<p>첫째 줄에 \\(N\\) \\((1 \\le N \\le 200\\,000)\\), 둘째 줄에 무게가 주어진다.</p>',
      output: '<p>바꾸는 횟수의 최솟값을 출력한다.</p>',
    },
    samples: [{ input: '4\n3 1 4 2\n', output: '3\n' }],
  },
  {
    id: 99997,
    title: '버스 환승 계획',
    level: 13,
    sections: {
      description:
        '<p>정류장 \\(N\\)개와 버스 노선 \\(M\\)개가 있다. 1번 정류장에서 \\(N\\)번 정류장까지 가는 데 갈아타는 횟수의 최솟값을 구하라.</p>',
      input: '<p>첫째 줄에 \\(N\\)과 \\(M\\)이 주어지고, 다음 \\(M\\)줄에 노선이 주어진다.</p>',
      output: '<p>갈아타는 횟수의 최솟값을 출력한다. 갈 수 없으면 -1을 출력한다.</p>',
    },
    samples: [{ input: '4 2\n3 1 2 3\n2 3 4\n', output: '1\n' }],
  },
  {
    id: 99996,
    title: '동아리 회의실 배정',
    level: 15,
    sections: {
      description:
        '<p>회의 \\(N\\)개의 시작 시각과 끝 시각이 주어진다. 회의실 하나에서 겹치지 않게 열 수 있는 회의의 최대 개수를 구하라.</p>',
      input: '<p>첫째 줄에 \\(N\\), 다음 \\(N\\)줄에 시작 시각과 끝 시각이 주어진다.</p>',
      output: '<p>열 수 있는 회의의 최대 개수를 출력한다.</p>',
    },
    samples: [{ input: '3\n1 4\n3 5\n5 7\n', output: '2\n' }],
  },
];

function examRecord(now: number) {
  return {
    id: 'storeexam0001',
    startedAt: now - 37 * MIN - 12_000,
    durationMs: 120 * MIN,
    tiers: ['silver', 'gold'],
    tags: [],
    problems: EXAM_PROBLEMS.map((p) => ({
      id: p.id,
      title: p.title,
      level: p.level,
      body: {
        id: p.id,
        title: p.title,
        timeLimitText: '1 초',
        memoryLimitText: '256 MB',
        timeLimitMs: 1000,
        sections: p.sections,
        samples: p.samples,
        labels: [],
      },
    })),
    flagged: [99997],
    submissions: {},
  };
}

/** Rows of 내 제출: [submission, result class, result, memory KB, time ms, language, bytes, minutes ago]. */
const MINE: [number, string, string, string, string, string, number, number][] = [
  [8107, 'ac', '맞았습니다!!', '31120', '88', 'Python 3', 248, 2],
  [8106, 'wa', '틀렸습니다', '', '', 'C++17', 412, 9],
  [8105, 'tle', '시간 초과', '', '', 'Python 3', 231, 16],
  [8104, 'ac', '맞았습니다!!', '2020', '12', 'C++17', 398, 64],
  [8103, 'rte', '런타임 에러', '', '', 'Java 11', 702, 180],
  [8102, 'ce', '컴파일 에러', '', '', 'Java 11', 688, 185],
  [8101, 'wa', '틀렸습니다', '', '', 'Python 3', 196, 1500],
];

function statusPage(now: number): string {
  const rows = MINE.map(
    ([id, cls, text, memory, time, language, bytes, ago]) => `<tr id="solution-${id}">
      <td>${id}</td><td><a href="/user/${USER}">${USER}</a></td>
      <td><a href="/problem/${PROBLEM_ID}" class="problem_title">${PROBLEM_ID}</a></td>
      <td class="result"><span class="result-text result-${cls}" data-color="${cls}">${text}</span></td>
      <td class="memory">${memory}</td><td class="time">${time}</td>
      <td class="judge-platform"><span>2</span></td>
      <td><a href="/source/${id}">${language}</a> / <a href="/submit/${PROBLEM_ID}/${id}">수정</a></td>
      <td>${bytes}</td>
      <td><a class="real-time-update show-date" data-timestamp="${Math.floor((now - ago * MIN) / 1000)}">-</a></td>
    </tr>`,
  ).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /></head><body>
    <ul class="loginbar"><li><a href="/user/${USER}" class="username">${USER}</a></li></ul>
    <table id="status-table"><thead><tr><th>제출 번호</th><th>아이디</th><th>문제</th><th>결과</th>
    <th>메모리</th><th>시간</th><th>채점 서버</th><th>언어</th><th>코드 길이</th><th>제출한 시간</th>
    </tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

// ---------------------------------------------------------------------------
// Steps

async function openIde(page: Page): Promise<FrameLocator> {
  await page.goto(`${BOJ}/problem/${PROBLEM_ID}`);
  await page.getByRole('button', { name: '코딩테스트' }).click();
  const ide = page.frameLocator('#cib-ide-overlay');
  await ide.getByRole('heading', { name: '산책로의 전망 구간' }).waitFor();
  return ide;
}

async function setStorage(worker: Worker, items: Record<string, unknown>) {
  await worker.evaluate((v) => chrome.storage.local.set(v), items);
}

/** The IDE opens in the saved language with the saved draft (src/ide/storage.ts). */
async function saveCode(worker: Worker, group: string, language: string, code: string) {
  await setStorage(worker, {
    [`code:${PROBLEM_ID}:${group}`]: { code, savedAt: Date.now() },
    'ui:language': language,
  });
}

async function runAndWait(ide: FrameLocator) {
  await ide.getByRole('button', { name: '코드 실행' }).click();
  await ide.getByTestId('summary').waitFor({ timeout: 60_000 });
}

async function shot(page: Page, name: string) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`${name}.png`);
}

mkdirSync(OUT, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: process.env.PW_CHANNEL ?? 'chromium',
  viewport: SIZE,
  deviceScaleFactor: 1280 / CSS_WIDTH,
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    // Anything not answered below must never reach the real sites.
    '--host-resolver-rules=MAP acmicpc.net ~NOTFOUND, MAP *.acmicpc.net ~NOTFOUND, MAP solved.ac ~NOTFOUND, MAP *.solved.ac ~NOTFOUND',
  ],
});
try {
  // Only the problem page: the tabs the extension opens to read lists get their own routes.
  await context.route(/^https:\/\/(www\.)?acmicpc\.net\/problem\/\d+$/, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: problemHtml }),
  );
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const page = context.pages()[0] ?? (await context.newPage());
  await setStorage(worker, { 'ui:theme': 'dark', 'ui:solution': false });

  // 2. The problem page with the buttons the extension adds (taken first, before the IDE opens).
  await page.goto(`${BOJ}/problem/${PROBLEM_ID}`);
  await page.getByRole('button', { name: '코딩테스트' }).waitFor();
  // The toolbar popup over this page: its tab query is stubbed to this problem, and a few
  // made-up recent problems fill its lists (src/popup/model.ts).
  const now = Date.now();
  const recent: [number, string, 'ac' | 'wa', string][] = [
    [99998, '두 정류장 사이', 'ac', '맞았습니다!!'],
    [99997, '격자 위의 로봇', 'wa', '틀렸습니다'],
    [99996, '괄호 균형 맞추기', 'ac', '맞았습니다!!'],
  ];
  await setStorage(worker, {
    [`meta:${PROBLEM_ID}`]: { title: '산책로의 전망 구간', language: 'python3', openedAt: now },
    ...Object.fromEntries(
      recent.flatMap(([id, title, code, text], i) => [
        [`meta:${id}`, { title, language: 'python3', openedAt: now - (i + 1) * 3_600_000 }],
        [
          `judge:${id}`,
          {
            problemId: id,
            status: 'done',
            resultText: text,
            resultCode: code,
            updatedAt: now - (i + 1) * 3_600_000,
          },
        ],
      ]),
    ),
  });
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 300, height: 100 });
  await popup.addInitScript((url) => {
    chrome.tabs.query = (() => Promise.resolve([{ id: 1, url }])) as typeof chrome.tabs.query;
  }, `${BOJ}/problem/${PROBLEM_ID}`);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByText('지금 보는 문제').waitFor();
  await popup.waitForTimeout(300);
  const popupPng = (await popup.screenshot({ fullPage: true })).toString('base64');
  await popup.close();
  await page.bringToFront();
  await page.evaluate((png) => {
    // The real site typesets math; here a few simple TeX forms become HTML.
    const tex = (t: string) =>
      t
        .replace(/\\max_\{([^}]*)\}/g, 'max<sub>$1</sub>')
        .replace(/\\sum_\{([^}]*)\}\^\{([^}]*)\}/g, 'Σ<sub>$1</sub><sup>$2</sup>')
        .replace(/\\le/g, '≤')
        .replace(/\\ldots/g, '…')
        .replace(/\\,/g, ' ')
        .replace(/([a-zA-Z])_([a-zA-Z0-9])/g, '$1<sub>$2</sub>');
    for (const p of document.querySelectorAll('section p')) {
      p.innerHTML = p.innerHTML.replace(
        /\\\((.*?)\\\)/g,
        (_, m: string) => `<i style="font-family: 'Times New Roman', serif">${tex(m)}</i>`,
      );
    }
    // A callout around the added buttons, its note in the room above the menu.
    const menu = document.querySelector<HTMLElement>('.problem-menu');
    const open = document.getElementById('cib-open-ide');
    const exam = document.getElementById('cib-open-exam');
    if (!menu || !open || !exam) throw new Error('problem menu buttons missing');
    menu.style.marginTop = '76px';
    const first = open.getBoundingClientRect();
    const last = exam.getBoundingClientRect();
    const ring = document.createElement('div');
    ring.style.cssText = `position:absolute;left:${first.left - 8}px;top:${first.top - 8}px;width:${last.right - first.left + 16}px;height:${first.height + 16}px;border:3px solid #f59e0b;border-radius:10px;pointer-events:none`;
    const note = document.createElement('div');
    note.textContent = '문제 페이지에 생기는 버튼으로 바로 시작합니다';
    note.style.cssText = `position:absolute;left:${first.left - 8}px;top:${first.top - 58}px;padding:8px 14px;border-radius:8px;background:#f59e0b;color:#1f2933;font:600 15px 'Malgun Gothic',sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.15)`;
    // The popup as the browser shows it under the toolbar icon, with its own note.
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${png}`;
    img.style.cssText =
      'position:absolute;right:24px;top:8px;width:300px;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.28)';
    const popNote = document.createElement('div');
    popNote.textContent = '툴바 아이콘을 눌러도 시작할 수 있습니다';
    popNote.style.cssText = `${note.style.cssText};left:auto;right:340px;top:236px`;
    document.body.append(ring, note, img, popNote);
  }, popupPng);
  await shot(page, '2-entry');

  // 1. Python: every example passes. A shorter editor leaves room for the results.
  await setStorage(worker, { 'ui:split': { horizontal: 40, vertical: 48 } });
  await saveCode(worker, 'python', 'python3', PYTHON);
  let ide = await openIde(page);
  await runAndWait(ide);
  await ide.getByTestId('summary').scrollIntoViewIfNeeded();
  await shot(page, '1-solve');

  // 3. Solution function: the examples read as '입출력 예'.
  await setStorage(worker, { 'ui:solution': true, 'ui:split': { horizontal: 40, vertical: 48 } });
  await saveCode(worker, 'python:fn', 'python3', SOLUTION);
  ide = await openIde(page);
  await runAndWait(ide);
  await ide.getByTestId('summary').scrollIntoViewIfNeeded();
  await ide
    .getByRole('heading', { name: '입력', exact: true })
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await shot(page, '3-solution');

  // 4. Mock exam: problem rail and remaining time. Statements are in the record already.

  await setStorage(worker, {
    'ui:solution': false,
    'exam:storeexam0001': examRecord(now),
    [`code:${PROBLEM_ID}:python`]: { code: PYTHON, savedAt: now },
  });
  await page.goto(`chrome-extension://${extensionId}/exam.html#storeexam0001`);
  await page.getByRole('heading', { name: '산책로의 전망 구간' }).waitFor();
  await page.getByRole('button', { name: '코드 실행' }).click();
  await page.getByTestId('summary').waitFor({ timeout: 60_000 });
  await page.getByTestId('summary').scrollIntoViewIfNeeded();
  await shot(page, '4-exam');

  // 5. 제출 기록: 내 제출, read from a made-up status list in a background tab.
  context.on('page', (tab) => {
    void (async () => {
      await tab
        .route(/^https:\/\/(www\.)?acmicpc\.net\/status/, (route) =>
          route
            .fulfill({ contentType: 'text/html; charset=utf-8', body: statusPage(Date.now()) })
            .catch(() => undefined),
        )
        .catch(() => undefined);
      // Routes do not catch the first navigation of a tab the extension creates.
      if (!tab.isClosed()) {
        await tab
          .goto(`${BOJ}/status?problem_id=${PROBLEM_ID}&user_id=${USER}`, { waitUntil: 'commit' })
          .catch(() => undefined);
      }
    })();
  });
  ide = await openIde(page);
  await runAndWait(ide);
  await ide.getByTestId('summary').scrollIntoViewIfNeeded();
  await ide.getByRole('tab', { name: '제출 기록' }).click();
  await ide
    .getByTestId('mine-status-row')
    .nth(MINE.length - 1)
    .waitFor({ timeout: 30_000 });
  await shot(page, '5-history');

  // Promo tile.
  await page.setViewportSize({ width: 440, height: 280 });
  await page.goto(pathToFileURL(path.join(import.meta.dirname, 'promo.html')).href);
  await page.screenshot({ path: path.join(STORE, 'promo-440x280.png'), scale: 'css' });
  console.log('promo-440x280.png');
} finally {
  await context.close();
}
