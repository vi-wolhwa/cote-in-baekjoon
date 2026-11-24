/**
 * Velog blog posts as a public source (ADR-0006: public web first). For problems the GitHub
 * step left incomplete, searches Velog for "백준 {id} {title}", reads the posts whose title
 * carries the problem number and takes their 입력/출력 sections and samples (the same
 * Markdown reader as for READMEs). Code in the posts is not read. Nothing leaves the cache.
 *
 * Velog's public GraphQL endpoint needs no key. One request per second.
 */
import type { Cache } from './lib/cache.ts';
import { parseReadme } from './lib/readme.ts';
import { emptyRecord, isComplete, mergePartial, type ProblemRecord } from './lib/record.ts';
import { eachConcurrently } from './lib/pool.ts';
import type { TopProblem } from './solvedac.ts';

const ENDPOINT = 'https://v2.velog.io/graphql';
const GAP_MS = 1000;
/** Posts read per problem at most. */
const MAX_POSTS = 5;

export const velogCounters = { search: 0, post: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graphql<T>(query: string, variables: Record<string, string>): Promise<T | null> {
  await sleep(GAP_MS);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) throw new Error('velog 429: 요청이 너무 많습니다');
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: T };
  return json.data ?? null;
}

interface PostRef {
  title: string;
  url_slug: string;
  user: { username: string };
}

/** The problem number as a whole number in a title (`[백준 12847]`, `BOJ 12847 -`). */
export function titleHasId(title: string, id: number): boolean {
  return new RegExp(`(^|\\D)${id}(\\D|$)`).test(title);
}

/** Lines that are only a section name (no `#` or bold) become headings the reader knows. */
export function markPlainHeadings(body: string): string {
  return body.replace(
    /^[ \t]*((?:예제\s*(?:입력|출력)\s*\d*)|입력|출력|제한)[ \t]*:?[ \t]*$/gm,
    '### $1',
  );
}

async function searchPosts(p: TopProblem): Promise<PostRef[]> {
  velogCounters.search++;
  const data = await graphql<{ searchPosts: { posts: PostRef[] } }>(
    'query($k:String!){ searchPosts(keyword:$k, limit:10){ posts { title url_slug user { username } } } }',
    { k: `백준 ${p.id} ${p.title}` },
  );
  return (data?.searchPosts.posts ?? []).filter((x) => titleHasId(x.title, p.id));
}

async function postBody(ref: PostRef): Promise<string | null> {
  velogCounters.post++;
  const data = await graphql<{ post: { body: string } | null }>(
    'query($u:String!,$s:String!){ post(username:$u, url_slug:$s){ body } }',
    { u: ref.user.username, s: ref.url_slug },
  );
  return data?.post?.body ?? null;
}

interface VelogState {
  /** Problems already searched, with the posts read. */
  tried: Record<string, string[]>;
}

export async function fetchFromVelog(
  cache: Cache,
  list: TopProblem[],
  concurrency = 1,
): Promise<number> {
  const state = cache.readJson<VelogState>(['velog', 'state.json'], { tried: {} });
  let filled = 0;
  let done = 0;
  await eachConcurrently(list, concurrency, async (p) => {
    const path = ['problems', `${p.id}.json`];
    const record =
      cache.readJson<ProblemRecord | null>(path, null) ??
      emptyRecord(p.id, p.title, new Date().toISOString());
    if (isComplete(record) || state.tried[p.id]) return;
    const read: string[] = [];
    for (const ref of (await searchPosts(p)).slice(0, MAX_POSTS)) {
      const body = await postBody(ref);
      read.push(`${ref.user.username}/${ref.url_slug}`);
      if (!body) continue;
      const parsed = parseReadme(markPlainHeadings(body));
      const url = `https://velog.io/@${ref.user.username}/${encodeURIComponent(ref.url_slug)}`;
      const part = {
        input: withoutCode(parsed.input),
        output: withoutCode(parsed.output),
        samples: parsed.samples,
        ...(parsed.constraints ? { constraints: parsed.constraints } : {}),
      };
      if (mergePartial(record, part, { kind: 'velog', url }, new Date().toISOString())) {
        cache.writeJson(path, record);
      }
      if (isComplete(record)) {
        filled++;
        break;
      }
    }
    state.tried[p.id] = read;
    cache.writeJson(['velog', 'state.json'], state);
    if (++done % 25 === 0) console.log(`velog ${done}문제 확인, ${filled}문제 채움`);
  });
  return filled;
}

/**
 * A section with any code blocks removed: blog posts often put the solution right after the
 * output description, and solution code is never read (ADR-0006). Empty when only code was left.
 */
export function withoutCode(text: string | null): string | null {
  if (text === null) return null;
  return text
    .replace(/(^|\n)[ \t]*(```|~~~)[\s\S]*?(\n[ \t]*\2[^\n]*|$)/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
