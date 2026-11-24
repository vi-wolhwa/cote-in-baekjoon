/**
 * Last resort: opens https://www.acmicpc.net/problem/{id} in a real browser
 * (Playwright + Edge) for problems the public sources did not cover.
 * One page per minute at most, a daily cap, every access logged
 * (lib/boj-policy.ts). Challenge pages are not bypassed: the run stops.
 */
import { chromium } from '@playwright/test';
import { Window } from 'happy-dom';
import { parseProblem } from '../../src/boj/problem.ts';
import { Cache, counters, sleep } from './lib/cache.ts';
import { htmlToText, normalizeSample } from './lib/html-text.ts';
import {
  isStopResult,
  remainingToday,
  waitBeforeNext,
  type AccessEntry,
} from './lib/boj-policy.ts';
import {
  emptyRecord,
  isComplete,
  mergePartial,
  type PartialRecord,
  type ProblemRecord,
} from './lib/record.ts';
import type { TopProblem } from './solvedac.ts';

const LOG = ['access-log.jsonl'];

/** Problem sections from a Baekjoon problem page's HTML, or null if it is not one. */
export function partFromProblemHtml(html: string, url: string): PartialRecord | null {
  const window = new Window({ url });
  try {
    const doc = new window.DOMParser().parseFromString(html, 'text/html');
    const problem = parseProblem(doc as unknown as Document, url);
    if (!problem) return null;
    const limit = problem.sections.limit ? htmlToText(problem.sections.limit) : null;
    return {
      input: htmlToText(problem.sections.input) || null,
      output: htmlToText(problem.sections.output) || null,
      constraints: limit || null,
      samples: problem.samples.map((s) => ({
        input: normalizeSample(s.input),
        output: normalizeSample(s.output),
      })),
      labels: problem.labels,
    };
  } finally {
    void window.happyDOM.close();
  }
}

export interface BojOptions {
  /** Pages to open in this run at most (the daily cap still applies). */
  limit: number;
  headed: boolean;
}

/** Opens pages for incomplete problems; returns the ids that still need it afterwards. */
export async function fetchFromBoj(
  cache: Cache,
  top: TopProblem[],
  options: BojOptions,
): Promise<void> {
  const pending = top.filter((p) => {
    const record = cache.readJson<ProblemRecord | null>(['problems', `${p.id}.json`], null);
    return !record || !isComplete(record);
  });
  const budget = remainingToday(
    cache.readLines<AccessEntry>(LOG),
    new Date().toISOString(),
    options.limit,
  );
  console.log(`백준 직접 확인 대상 ${pending.length}개, 이번 실행 상한 ${budget}쪽`);
  if (budget === 0 || pending.length === 0) return;

  const browser = await chromium.launch({ channel: 'msedge', headless: !options.headed });
  try {
    const page = await browser.newPage();
    for (const problem of pending.slice(0, budget)) {
      const wait = waitBeforeNext(cache.readLines<AccessEntry>(LOG), Date.now());
      if (wait > 0) await sleep(wait);

      const url = `https://www.acmicpc.net/problem/${problem.id}`;
      let result = 'ok';
      let part: PartialRecord | null = null;
      counters.boj++;
      try {
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const status = res?.status() ?? 0;
        if (status !== 200) result = `http-${status}`;
        else {
          part = partFromProblemHtml(await page.content(), url);
          if (!part)
            result = /just a moment|challenge|captcha/i.test(await page.title())
              ? 'challenge'
              : 'no-problem';
        }
      } catch (error) {
        result = `error: ${(error as Error).message.split('\n')[0]}`;
      }
      cache.appendLine(LOG, { time: new Date().toISOString(), id: problem.id, result });
      console.log(`백준 ${problem.id}: ${result}`);

      if (part) {
        const file = ['problems', `${problem.id}.json`];
        const now = new Date().toISOString();
        const record = cache.readJson<ProblemRecord>(
          file,
          emptyRecord(problem.id, problem.title, now),
        );
        mergePartial(record, part, { kind: 'boj', url }, now);
        cache.writeJson(file, record);
      }
      if (isStopResult(result)) {
        console.log('챌린지나 차단 응답이라 멈춥니다(우회하지 않음).');
        break;
      }
    }
  } finally {
    await browser.close();
  }
}
