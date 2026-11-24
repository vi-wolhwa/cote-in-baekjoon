/**
 * Most-solved problem list from the public solved.ac API (50 per page, ≥ 1 s apart).
 * solved.ac sits behind Cloudflare: when plain fetch gets a challenge page, the pages are
 * opened in Edge (Playwright) like a user would; if Edge is challenged too, the run stops:
 * challenges are not bypassed (see README).
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { Cache, counters, createPacer } from './lib/cache.ts';

export interface TopProblem {
  id: number;
  title: string;
  level: number;
  acceptedUserCount: number;
  tags: string[];
}

const PER_PAGE = 50;
const USER_AGENT = 'cote-in-baekjoon-format-data (local, low-rate)';

export function searchPageUrl(page: number): string {
  return `https://solved.ac/api/v3/search/problem?query=&sort=solved&direction=desc&page=${page}`;
}

/** Items of one search page; throws on anything that is not the expected JSON. */
export function parseSearchPage(body: unknown): TopProblem[] {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new Error('solved.ac 응답에 items가 없습니다');
  return items.map((raw) => {
    const item = raw as {
      problemId?: unknown;
      titleKo?: unknown;
      level?: unknown;
      acceptedUserCount?: unknown;
      tags?: { key?: unknown }[];
    };
    if (typeof item.problemId !== 'number' || typeof item.titleKo !== 'string') {
      throw new Error('solved.ac 항목 형식이 다릅니다');
    }
    return {
      id: item.problemId,
      title: item.titleKo,
      level: typeof item.level === 'number' ? item.level : 0,
      acceptedUserCount: typeof item.acceptedUserCount === 'number' ? item.acceptedUserCount : 0,
      tags: (item.tags ?? []).map((t) => String(t.key ?? '')).filter((k) => k !== ''),
    };
  });
}

/** Loads the top `count` problems, reusing pages already in the cache. */
export async function loadTop(cache: Cache, count: number): Promise<TopProblem[]> {
  const cached = cache.readJson<TopProblem[]>(['top.json'], []);
  // `top-end.json`: the list ran out before `count` (every problem is in the cache).
  const ended = cache.readJson<{ total: number } | null>(['top-end.json'], null);
  if (cached.length >= count || (ended && ended.total === cached.length)) {
    return cached.slice(0, count);
  }

  const pacer = createPacer(1500);
  // Whole pages already cached are kept; fetching resumes after them.
  const keptPages = Math.floor(cached.length / PER_PAGE);
  const list: TopProblem[] = cached.slice(0, keptPages * PER_PAGE);
  const pages = Math.ceil(count / PER_PAGE);
  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    for (let n = keptPages + 1; n <= pages; n++) {
      await pacer.wait();
      counters.solvedac++;
      let body: unknown = null;
      if (!page) {
        const res = await fetch(searchPageUrl(n), {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        });
        const type = res.headers.get('content-type') ?? '';
        if (res.ok && type.includes('json')) body = await res.json();
        else {
          // Cloudflare answers non-browser clients with a challenge page. Use a real
          // browser the way a user would; if it is challenged too, stop.
          console.log(`solved.ac: HTTP ${res.status} ${type} → Edge 브라우저로 엽니다`);
          // Headless Edge is challenged; a visible window is not.
          browser = await chromium.launch({ channel: 'msedge', headless: false });
          page = await browser.newPage();
        }
      }
      if (page) {
        const res = await page.goto(searchPageUrl(n), { waitUntil: 'load', timeout: 30_000 });
        const type = res?.headers()['content-type'] ?? '';
        if (!res?.ok() || !type.includes('json')) {
          throw new Error(
            `solved.ac ${n}쪽: HTTP ${res?.status()} ${type}. 챌린지라 멈춥니다(우회하지 않음).`,
          );
        }
        body = JSON.parse(await res.text());
      }
      const items = parseSearchPage(body);
      list.push(...items);
      console.log(`solved.ac ${n}/${pages}쪽`);
      if (items.length < PER_PAGE) {
        cache.writeJson(['top-end.json'], { total: list.length });
        break;
      }
      // Saved as it goes, so an interrupted run resumes.
      if (n % 20 === 0) cache.writeJson(['top.json'], list);
    }
  } finally {
    await browser?.close();
  }
  cache.writeJson(['top.json'], list);
  return list.slice(0, count);
}
