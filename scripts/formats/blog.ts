/**
 * Blog posts (Tistory and others) as a public source (ADR-0006: public web first). For problems
 * still incomplete, searches blogs through the Kakao (Daum) blog search API — free, with a REST
 * API key in KAKAO_REST_API_KEY (local only, never committed) — reads the posts whose title
 * carries the problem number and takes their 입력/출력 sections and 예제 blocks. Code in the
 * posts is not read. Nothing leaves the cache.
 *
 * Requests: search 1 per problem, then at most MAX_POSTS pages; one request per second.
 */
import { parseHTML } from 'linkedom';
import type { Cache } from './lib/cache.ts';
import { parseReadme } from './lib/readme.ts';
import { emptyRecord, isComplete, mergePartial, type ProblemRecord } from './lib/record.ts';
import { eachConcurrently } from './lib/pool.ts';
import type { TopProblem } from './solvedac.ts';
import { markPlainHeadings, titleHasId } from './velog.ts';

const SEARCH = 'https://dapi.kakao.com/v2/search/blog';
const GAP_MS = 1000;
const MAX_POSTS = 8;
/** Pages are cut at this length; some blogs inline megabytes of images or scripts. */
const MAX_HTML = 1_000_000;

export const blogCounters = { search: 0, page: 0 };
let refusedInRow = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BlogDoc {
  title: string;
  url: string;
}

async function search(key: string, p: TopProblem): Promise<BlogDoc[] | null> {
  await sleep(GAP_MS);
  blogCounters.search++;
  const params = new URLSearchParams({ query: `백준 ${p.id} ${p.title} 예제 입력`, size: '10' });
  const res = await fetch(`${SEARCH}?${params.toString()}`, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  if (res.status === 429) throw new Error('kakao 429: 오늘 무료 한도를 다 썼습니다');
  const json = (await res.json().catch(() => ({}))) as {
    documents?: BlogDoc[];
    errorType?: string;
    message?: string;
  };
  if (!json.documents) {
    // Bursts are refused now and then: skip the problem for this run (not marked tried), wait,
    // and stop when refusals keep coming (daily free quota used up).
    console.log(`kakao ${res.status} ${json.errorType ?? ''} ${json.message ?? ''}`.trim());
    if (++refusedInRow >= 20) throw new Error('kakao: 계속 거절합니다(무료 한도 소진?)');
    await sleep(10_000);
    return null;
  }
  refusedInRow = 0;
  const strip = (s: string) => s.replace(/<[^>]+>/g, '');
  return json.documents
    .map((d) => ({ title: strip(d.title), url: d.url }))
    .filter((d) => titleHasId(d.title, p.id));
}

/**
 * A blog page's article as Markdown-like text the README reader understands: headings and
 * section-name lines become `###` headings, `<pre>` blocks become code fences.
 */
export function articleText(html: string): string {
  const clean = html.slice(0, MAX_HTML).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, '');
  const doc = parseHTML(`<!doctype html><html><body>${clean}</body></html>`).document;
  const root =
    doc.querySelector(
      '.tt_article_useless_p_margin, .entry-content, #article-view, .se-main-container, #postViewArea, article',
    ) ?? doc.body;
  const out: string[] = [];
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName;
      // Code blocks: <pre>, or Naver's SmartEditor code component.
      if (tag === 'PRE' || (child.getAttribute('class') ?? '').split(' ').includes('se-code')) {
        out.push('```', (child.textContent ?? '').replace(/\r/g, ''), '```');
      } else if (/^H[1-6]$/.test(tag)) {
        out.push(`### ${(child.textContent ?? '').trim()}`);
      } else if (child.querySelector('pre, h1, h2, h3, h4, h5, h6, p, div, table')) {
        walk(child);
      } else {
        const text = (child.textContent ?? '').trim();
        if (text) out.push(text);
      }
    }
  };
  walk(root as unknown as Element);
  return markPlainHeadings(out.join('\n'));
}

/** Naver blog posts keep their body in a frame; read the frame's page instead. */
export function readableUrl(url: string): string {
  const m = /^https?:\/\/(?:m\.)?blog\.naver\.com\/([\w-]+)\/(\d+)/.exec(url);
  return m ? `https://blog.naver.com/PostView.naver?blogId=${m[1]}&logNo=${m[2]}` : url;
}

async function page(url: string): Promise<string | null> {
  await sleep(GAP_MS);
  blogCounters.page++;
  try {
    const res = await fetch(readableUrl(url), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

interface BlogState {
  tried: Record<string, string[]>;
}

export async function fetchFromBlogs(
  cache: Cache,
  list: TopProblem[],
  key: string,
  concurrency = 1,
): Promise<number> {
  const state = cache.readJson<BlogState>(['blog', 'state.json'], { tried: {} });
  let filled = 0;
  let done = 0;
  await eachConcurrently(list, concurrency, async (p) => {
    const path = ['problems', `${p.id}.json`];
    const record =
      cache.readJson<ProblemRecord | null>(path, null) ??
      emptyRecord(p.id, p.title, new Date().toISOString());
    if (isComplete(record) || state.tried[p.id]) return;
    const docs = await search(key, p);
    if (!docs) return;
    const read: string[] = [];
    for (const doc of docs.slice(0, MAX_POSTS)) {
      const html = await page(doc.url);
      read.push(doc.url);
      if (!html) continue;
      const parsed = parseReadme(articleText(html));
      const part = {
        input: parsed.input,
        output: parsed.output,
        samples: parsed.samples,
        ...(parsed.constraints ? { constraints: parsed.constraints } : {}),
      };
      if (mergePartial(record, part, { kind: 'blog', url: doc.url }, new Date().toISOString())) {
        cache.writeJson(path, record);
      }
      if (isComplete(record)) {
        filled++;
        break;
      }
    }
    state.tried[p.id] = read;
    cache.writeJson(['blog', 'state.json'], state);
    if (++done % 25 === 0) console.log(`blog ${done}문제 확인, ${filled}문제 채움`);
  });
  return filled;
}
