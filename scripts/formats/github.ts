/**
 * Public GitHub solution repositories as a source of problem sections.
 *
 * 1. discover: a fixed, small set of searches finds candidate repositories.
 * 2. index:    one tree listing per repository maps README paths to problem ids.
 * 3. fetch:    README files are read from raw.githubusercontent.com, pinned to the
 *              indexed commit, until each problem has input/output text and samples.
 */
import { execFileSync } from 'node:child_process';
import { Cache, counters, createPacer, sleep } from './lib/cache.ts';
import { blobUrl, indexTree, rawUrl, type TreeEntry } from './lib/paths.ts';
import { parseReadme, readmeMatchesId } from './lib/readme.ts';
import {
  emptyRecord,
  hasIo,
  hasSamples,
  isComplete,
  mergePartial,
  type ProblemRecord,
} from './lib/record.ts';
import type { TopProblem } from './solvedac.ts';

const API = 'https://api.github.com';
const apiPacer = createPacer(750);
const searchPacer = createPacer(7000); // code search allows 10 requests per minute
const rawPacer = createPacer(300);

/** Repository searches: BaekjoonHub auto-push repos (sections) and README sample repos. */
export const REPO_QUERIES = [
  '"Baekjoon Online Judge created with" size:>100000',
  '"Baekjoon Online Judge created with" size:30000..100000',
  '"Baekjoon Online Judge created with" size:10000..30000',
  '"auto push repository for Baekjoon" size:>20000',
];
export const CODE_QUERIES = [
  '"예제 입력 1" "예제 출력 1" "acmicpc.net/problem" filename:README.md',
  '"예제 입력 1" "제출 정보" "acmicpc.net/problem"',
];

function token(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
}

let cachedToken: string | null = null;

async function api<T>(pathAndQuery: string, search = false): Promise<T> {
  cachedToken ??= token();
  for (let attempt = 0; ; attempt++) {
    await (search ? searchPacer : apiPacer).wait();
    if (search) counters.githubSearch++;
    else counters.githubApi++;
    let res: Response;
    try {
      res = await fetch(`${API}${pathAndQuery}`, {
        headers: {
          Authorization: `Bearer ${cachedToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'cote-in-baekjoon-format-data',
        },
      });
    } catch (e) {
      // Dropped connections (ECONNRESET, timeouts): back off and retry a few times.
      if (attempt >= 4) throw e;
      console.log(`GitHub 연결 오류: ${30 * (attempt + 1)}초 뒤 다시 시도합니다`);
      await sleep(30_000 * (attempt + 1));
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    const remaining = res.headers.get('x-ratelimit-remaining');
    if ((res.status === 403 || res.status === 429) && remaining === '0' && attempt < 2) {
      const reset = Number(res.headers.get('x-ratelimit-reset') ?? '0') * 1000;
      const wait = Math.max(5000, reset - Date.now() + 2000);
      console.log(`GitHub 속도 제한: ${Math.round(wait / 1000)}초 기다립니다`);
      await sleep(wait);
      continue;
    }
    // Code search answers 502/503 now and then under load; back off and retry.
    if (res.status >= 500 && attempt < 4) {
      console.log(`GitHub ${res.status}: ${30 * (attempt + 1)}초 뒤 다시 시도합니다`);
      await sleep(30_000 * (attempt + 1));
      continue;
    }
    throw new Error(`GitHub API ${res.status} ${pathAndQuery}`);
  }
}

export interface Candidate {
  repo: string;
  via: string;
}

export async function discover(cache: Cache): Promise<Candidate[]> {
  const known = cache.readJson<Candidate[]>(['github', 'candidates.json'], []);
  if (known.length > 0) return known;
  const found = new Map<string, string>();
  for (const q of REPO_QUERIES) {
    for (let page = 1; page <= 2; page++) {
      const query = new URLSearchParams({ q, per_page: '100', page: String(page) });
      const res = await api<{ items: { full_name: string }[] }>(
        `/search/repositories?${query}`,
        true,
      );
      for (const item of res.items) if (!found.has(item.full_name)) found.set(item.full_name, q);
      if (res.items.length < 100) break;
    }
  }
  for (const q of CODE_QUERIES) {
    for (let page = 1; page <= 10; page++) {
      const query = new URLSearchParams({ q, per_page: '100', page: String(page) });
      const res = await api<{ items: { repository: { full_name: string } }[] }>(
        `/search/code?${query}`,
        true,
      );
      for (const item of res.items) {
        const name = item.repository.full_name;
        if (!found.has(name)) found.set(name, q);
      }
      if (res.items.length < 100) break;
    }
  }
  const list = [...found].map(([repo, via]) => ({ repo, via }));
  cache.writeJson(['github', 'candidates.json'], list);
  console.log(`GitHub 후보 저장소 ${list.length}개`);
  return list;
}

export interface RepoIndex {
  repo: string;
  sha: string;
  truncated: boolean;
  /** problem id → README paths */
  paths: Record<string, string[]>;
}

const treeFile = (repo: string) => ['github', 'trees', `${repo.replace('/', '__')}.json`];

/** README index of one repository at its default branch head (cached). */
async function indexRepo(cache: Cache, repo: string): Promise<RepoIndex> {
  const cached = cache.readJson<RepoIndex | null>(treeFile(repo), null);
  if (cached) return cached;
  let result: RepoIndex = { repo, sha: '', truncated: false, paths: {} };
  try {
    const info = await api<{ default_branch: string }>(`/repos/${repo}`);
    const branch = await api<{ commit: { sha: string } }>(
      `/repos/${repo}/branches/${encodeURIComponent(info.default_branch)}`,
    );
    const sha = branch.commit.sha;
    const tree = await api<{ tree: TreeEntry[]; truncated: boolean }>(
      `/repos/${repo}/git/trees/${sha}?recursive=1`,
    );
    const map = indexTree(tree.tree);
    result = { repo, sha, truncated: tree.truncated, paths: Object.fromEntries(map) };
  } catch (error) {
    console.log(`${repo}: 색인 실패 (${(error as Error).message})`);
  }
  cache.writeJson(treeFile(repo), result);
  return result;
}

export async function indexRepos(
  cache: Cache,
  candidates: Candidate[],
  wanted: Set<number>,
): Promise<RepoIndex[]> {
  const out: RepoIndex[] = [];
  for (const [i, { repo }] of candidates.entries()) {
    const index = await indexRepo(cache, repo);
    if (Object.keys(index.paths).some((id) => wanted.has(Number(id)))) out.push(index);
    if ((i + 1) % 20 === 0) console.log(`색인 ${i + 1}/${candidates.length}`);
  }
  return out;
}

/** Commit SHA from a code search item's contents URL (`...?ref=<sha>`). */
export function refFromContentsUrl(url: string): string | null {
  const ref = new URL(url).searchParams.get('ref');
  return ref && /^[0-9a-f]{40}$/.test(ref) ? ref : null;
}

/**
 * One code search per problem still missing samples, for Markdown files that link
 * to the problem and contain a sample heading. Hits are cached per problem and
 * returned as extra indexes (grouped by repository commit).
 */
export async function searchMissing(cache: Cache, ids: number[]): Promise<RepoIndex[]> {
  const hits = cache.readJson<Record<string, { repo: string; sha: string; path: string }[]>>(
    ['github', 'hits.json'],
    {},
  );
  for (const [n, id] of ids.entries()) {
    if (hits[id]) continue;
    const q = `"acmicpc.net/problem/${id}" "예제 입력 1" extension:md`;
    const query = new URLSearchParams({ q, per_page: '30' });
    const res = await api<{
      items: { path: string; url: string; repository: { full_name: string } }[];
    }>(`/search/code?${query}`, true);
    hits[id] = res.items.flatMap((item) => {
      const sha = refFromContentsUrl(item.url);
      return sha ? [{ repo: item.repository.full_name, sha, path: item.path }] : [];
    });
    cache.writeJson(['github', 'hits.json'], hits);
    if ((n + 1) % 20 === 0) console.log(`코드 검색 ${n + 1}/${ids.length}`);
  }
  const byCommit = new Map<string, RepoIndex>();
  for (const [id, list] of Object.entries(hits)) {
    for (const hit of list) {
      const key = `${hit.repo}@${hit.sha}`;
      const index = byCommit.get(key) ?? {
        repo: hit.repo,
        sha: hit.sha,
        truncated: false,
        paths: {},
      };
      (index.paths[id] ??= []).push(hit.path);
      byCommit.set(key, index);
    }
  }
  return [...byCommit.values()];
}

interface RepoStat {
  fetched: number;
  io: number;
  samples: number;
  mismatch: number;
}

interface GithubState {
  tried: Record<string, string[]>;
  repos: Record<string, RepoStat>;
}

/** Laplace-smoothed rate of READMEs from `repo` that had the needed part. */
function score(stat: RepoStat | undefined, need: 'io' | 'samples'): number {
  const s = stat ?? { fetched: 0, io: 0, samples: 0, mismatch: 0 };
  return (s[need] + 1) / (s.fetched + 2);
}

export interface FetchOptions {
  /** README files read per problem at most. */
  maxTries: number;
}

/**
 * Fills `problems/{id}.json` from indexed repositories. Problems already complete
 * are skipped; incomplete ones only try README files not tried before.
 */
export async function fetchFromGithub(
  cache: Cache,
  top: TopProblem[],
  indexes: RepoIndex[],
  options: FetchOptions,
): Promise<void> {
  const state = cache.readJson<GithubState>(['github', 'state.json'], { tried: {}, repos: {} });
  for (const [n, problem] of top.entries()) {
    const file = ['problems', `${problem.id}.json`];
    const now = new Date().toISOString();
    const record = cache.readJson<ProblemRecord>(file, emptyRecord(problem.id, problem.title, now));
    if (isComplete(record)) continue;

    const tried = new Set(state.tried[problem.id] ?? []);
    const options_ = indexes.flatMap((index) =>
      (index.paths[problem.id] ?? []).map((p) => ({ index, path: p })),
    );
    let attempts = 0;
    while (!isComplete(record) && attempts < options.maxTries) {
      const need = hasIo(record) ? 'samples' : 'io';
      const next = options_
        .filter((o) => !tried.has(rawUrl(o.index.repo, o.index.sha, o.path)))
        .sort(
          (a, b) => score(state.repos[b.index.repo], need) - score(state.repos[a.index.repo], need),
        )[0];
      if (!next) break;
      attempts++;
      const url = rawUrl(next.index.repo, next.index.sha, next.path);
      tried.add(url);
      const stat = (state.repos[next.index.repo] ??= {
        fetched: 0,
        io: 0,
        samples: 0,
        mismatch: 0,
      });
      await rawPacer.wait();
      counters.githubRaw++;
      let text: string;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
      } catch (error) {
        console.log(`${problem.id}: ${next.index.repo} 읽기 실패 (${(error as Error).message})`);
        continue;
      }
      stat.fetched++;
      const parsed = parseReadme(text);
      if (!readmeMatchesId(parsed, problem.id)) {
        stat.mismatch++;
        continue;
      }
      if (parsed.input !== null && parsed.output !== null) stat.io++;
      if (parsed.samples.length > 0) stat.samples++;
      mergePartial(
        record,
        parsed,
        {
          kind: 'github',
          repo: next.index.repo,
          url: blobUrl(next.index.repo, next.index.sha, next.path),
        },
        new Date().toISOString(),
      );
    }
    state.tried[problem.id] = [...tried];
    if (record.source || hasSamples(record)) cache.writeJson(file, record);
    if ((n + 1) % 25 === 0) {
      cache.writeJson(['github', 'state.json'], state);
      console.log(`GitHub ${n + 1}/${top.length}`);
    }
  }
  cache.writeJson(['github', 'state.json'], state);
}
