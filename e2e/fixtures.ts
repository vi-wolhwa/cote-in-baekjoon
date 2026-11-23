import { chromium, test as base, type BrowserContext } from '@playwright/test';
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const extensionPath = path.resolve('.output/chrome-mv3');
const SOLVED_AC = 'https://solved.ac/*';

/**
 * The built extension with solved.ac moved from optional to required host permissions, so
 * the mock exam's permissions.request() resolves without Chrome's prompt (which automation
 * cannot answer). The production build is not changed: this patches a copy for tests only.
 * The request path itself, including a refusal, is covered by unit tests (tests/exam-start).
 */
function solvedAcGrantedCopy(): string {
  const stamp = Math.floor(statSync(path.join(extensionPath, 'manifest.json')).mtimeMs);
  const target = path.resolve(`.output/e2e-solved-ac-${stamp}`);
  if (existsSync(target)) return target;
  for (const name of readdirSync('.output')) {
    if (name.startsWith('e2e-solved-ac-')) {
      rmSync(path.resolve('.output', name), { recursive: true, force: true });
    }
  }
  // Built next to the target and renamed, so parallel workers never see a half copy.
  const temp = `${target}-${process.pid}`;
  cpSync(extensionPath, temp, { recursive: true });
  const manifestPath = path.join(temp, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    host_permissions?: string[];
    optional_host_permissions?: string[];
  };
  manifest.host_permissions = [...(manifest.host_permissions ?? []), SOLVED_AC];
  manifest.optional_host_permissions = (manifest.optional_host_permissions ?? []).filter(
    (p) => p !== SOLVED_AC,
  );
  writeFileSync(manifestPath, JSON.stringify(manifest));
  try {
    renameSync(temp, target);
  } catch {
    rmSync(temp, { recursive: true, force: true });
  }
  return target;
}

/** Launches Chromium with the built extension loaded (run `npm run build` first). */
export const test = base.extend<{
  /** Load the extension with the solved.ac permission already granted (mock exam tests). */
  grantSolvedAc: boolean;
  context: BrowserContext;
  extensionId: string;
}>({
  grantSolvedAc: [false, { option: true }],
  context: async ({ grantSolvedAc }, use) => {
    const loadPath = grantSolvedAc ? solvedAcGrantedCopy() : extensionPath;
    const context = await chromium.launchPersistentContext('', {
      channel: process.env.PW_CHANNEL ?? 'chromium',
      args: [
        `--disable-extensions-except=${loadPath}`,
        `--load-extension=${loadPath}`,
        // Tests serve Baekjoon and solved.ac with routes; anything unrouted must never
        // reach the real sites.
        '--host-resolver-rules=MAP acmicpc.net ~NOTFOUND, MAP *.acmicpc.net ~NOTFOUND, MAP solved.ac ~NOTFOUND, MAP *.solved.ac ~NOTFOUND',
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;
