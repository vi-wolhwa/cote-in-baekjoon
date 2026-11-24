/**
 * Every BaekjoonHub repository as a source (#116, ADR-0006: public web first). BaekjoonHub
 * pushes each solved problem as `백준/{tier}/{id}. {title}/README.md` with the problem's input and
 * output description, and sets the repository description to "... Baekjoon Online Judge created
 * with BaekjoonHub". So:
 *
 * 1. `listHubRepos`: all such repositories from the repository search (30 requests/minute, at
 *    most 1,000 results per query), split by size ranges until each range fits.
 * 2. `indexHubRepos`: their problem folders through GraphQL, many repositories per request, so
 *    no per-problem code search (10/minute) and no per-repository tree requests are needed.
 *
 * The indexes are cached like the other repository indexes; README files are then read from
 * raw.githubusercontent.com by `fetchFromGithub`. Code in the repositories is never read.
 */
import { api, token, treeFile, type RepoIndex } from './github.ts';
import type { Cache } from './lib/cache.ts';
import { problemIdFromPath } from './lib/paths.ts';
import { eachConcurrently } from './lib/pool.ts';

const QUERY = '"Baekjoon Online Judge created with" in:description';
const MAX_KB = 10_000_000;
/** Repositories per GraphQL request. */
const BATCH = 10;

export interface HubRepo {
  repo: string;
  /** Size in KB (larger ones hold more problems). */
  size: number;
}

interface SearchPage {
  total_count: number;
  items: { full_name: string; size: number }[];
}

const search = (q: string, page: number, perPage = 100) =>
  api<SearchPage>(
    `/search/repositories?${new URLSearchParams({ q, sort: 'updated', per_page: String(perPage), page: String(page) })}`,
    true,
  );

/** All repositories matching `QUERY` in the size range `lo..hi` KB, splitting ranges over 1,000. */
async function collectRange(lo: number, hi: number, out: Map<string, number>): Promise<void> {
  const q = `${QUERY} size:${lo}..${hi}`;
  const first = await search(q, 1);
  if (first.total_count > 1000 && hi > lo) {
    const mid = Math.floor((lo + hi) / 2);
    await collectRange(lo, mid, out);
    await collectRange(mid + 1, hi, out);
    return;
  }
  for (const item of first.items) out.set(item.full_name, item.size);
  const pages = Math.min(10, Math.ceil(first.total_count / 100));
  for (let page = 2; page <= pages; page++) {
    for (const item of (await search(q, page)).items) out.set(item.full_name, item.size);
  }
  console.log(`허브 저장소 ${out.size}개 (크기 ${lo}..${hi}KB, ${first.total_count}개)`);
}

export async function listHubRepos(cache: Cache): Promise<HubRepo[]> {
  const cached = cache.readJson<HubRepo[] | null>(['github', 'hub-repos.json'], null);
  if (cached) return cached;
  const found = new Map<string, number>();
  await collectRange(0, MAX_KB, found);
  const list = [...found].map(([repo, size]) => ({ repo, size })).sort((a, b) => b.size - a.size);
  cache.writeJson(['github', 'hub-repos.json'], list);
  return list;
}

interface TreeNode {
  name: string;
  object?: { entries?: TreeNode[] } | null;
}

/** One GraphQL request; null when it fails or takes too long (large trees time out). */
async function graphql<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'cote-in-baekjoon-format-data',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60_000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Problem folders of a BaekjoonHub tree (`백준/{tier}/{folder}`) as README paths by problem id. */
export function hubPaths(tiers: TreeNode[]): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const tier of tiers) {
    for (const folder of tier.object?.entries ?? []) {
      const path = `백준/${tier.name}/${folder.name}/README.md`;
      const id = problemIdFromPath(path);
      if (id !== null) (paths[id] ??= []).push(path);
    }
  }
  return paths;
}

/**
 * Indexes one batch in one request. A failed request (usually a timeout on large trees) is split
 * in halves; a single repository that still fails gets an empty index and is skipped.
 */
async function indexBatch(cache: Cache, batch: string[], out: RepoIndex[]): Promise<void> {
  const fields = batch.map((repo, k) => {
    const [owner, name] = repo.split('/');
    return `r${k}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
      object(expression: "HEAD:백준") { ... on Tree { entries { name object { ... on Tree { entries { name } } } } } }
    }`;
  });
  const res = await graphql<{
    data?: Record<string, { object: { entries?: TreeNode[] } | null } | null>;
  }>(`query { ${fields.join(' ')} }`);
  if (!res) {
    if (batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      await indexBatch(cache, batch.slice(0, mid), out);
      await indexBatch(cache, batch.slice(mid), out);
      return;
    }
    console.log(`${batch[0]}: 색인 실패`);
  }
  batch.forEach((repo, k) => {
    const tiers = res?.data?.[`r${k}`]?.object?.entries ?? [];
    const index: RepoIndex = { repo, sha: 'HEAD', truncated: false, paths: hubPaths(tiers) };
    cache.writeJson(treeFile(repo), index);
    out.push(index);
  });
}

/** Indexes `repos` not indexed yet, BATCH per request, a few requests at once. */
export async function indexHubRepos(cache: Cache, repos: HubRepo[]): Promise<RepoIndex[]> {
  const out: RepoIndex[] = [];
  const todo: string[] = [];
  for (const { repo } of repos) {
    const cached = cache.readJson<RepoIndex | null>(treeFile(repo), null);
    if (cached) out.push(cached);
    else todo.push(repo);
  }
  const batches: string[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  let done = 0;
  await eachConcurrently(batches, 4, async (batch) => {
    await indexBatch(cache, batch, out);
    if (++done % 20 === 0) console.log(`허브 색인 ${done * BATCH}/${todo.length}`);
  });
  return out;
}
