/**
 * Collects input/output descriptions and samples of the most-solved Baekjoon
 * problems into the local cache `data/boj-cache/` (ADR-0006, issue #116).
 * Nothing collected here is committed. See scripts/formats/README.md.
 *
 *   node scripts/formats/collect.ts --top 1000            solved.ac list + GitHub
 *   node scripts/formats/collect.ts --top 1000 --boj 20   ... + up to 20 Baekjoon pages
 *   node scripts/formats/collect.ts --top 1000 --search-missing   ... + code search for gaps
 *   node scripts/formats/collect.ts --top 1000 --velog            ... + Velog blog posts for gaps
 *   KAKAO_REST_API_KEY=… node scripts/formats/collect.ts --top 1000 --blog   ... + Tistory etc. via Kakao blog search
 *   node scripts/formats/collect.ts --top 1000 --stats    report only
 *
 * Every step is resumable: finished pages, indexes and problems are reused.
 */
import { parseArgs } from 'node:util';
import { fetchFromBoj } from './boj.ts';
import { discover, discoverMore, fetchFromGithub, indexRepos, searchMissing } from './github.ts';
import { Cache, counters } from './lib/cache.ts';
import { hasDescription, isComplete, type ProblemRecord } from './lib/record.ts';
import { coverage, topEntries } from './lib/stats.ts';
import { loadTop, type TopProblem } from './solvedac.ts';
import { blogCounters, fetchFromBlogs } from './blog.ts';
import { indexHubRepos, listHubRepos } from './hub.ts';
import { fetchFromVelog, velogCounters } from './velog.ts';

const { values } = parseArgs({
  options: {
    top: { type: 'string', default: '1000' },
    cache: { type: 'string', default: 'data/boj-cache' },
    boj: { type: 'string', default: '0' },
    headed: { type: 'boolean', default: false },
    'max-tries': { type: 'string', default: '6' },
    'skip-github': { type: 'boolean', default: false },
    'search-missing': { type: 'boolean', default: false },
    'more-repos': { type: 'boolean', default: false },
    hub: { type: 'boolean', default: false },
    velog: { type: 'boolean', default: false },
    blog: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '1' },
    stats: { type: 'boolean', default: false },
  },
});

function positiveInt(name: string, raw: string, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new Error(`--${name}는 0~${max} 사이 정수여야 합니다: ${raw}`);
  }
  return n;
}

const top = positiveInt('top', values.top, 50000);
const bojLimit = positiveInt('boj', values.boj, 100);
/** Problems handled at once by the blog sources (each request keeps its own pacing). */
const concurrency = Math.max(1, positiveInt('concurrency', values.concurrency, 16));
const maxTries = positiveInt('max-tries', values['max-tries'], 50);
const cache = new Cache(values.cache);
const started = Date.now();

function describedInCache(id: number): boolean {
  const r = cache.readJson<ProblemRecord | null>(['problems', `${id}.json`], null);
  return r !== null && hasDescription(r);
}

function completeInCache(id: number): boolean {
  const r = cache.readJson<ProblemRecord | null>(['problems', `${id}.json`], null);
  return r !== null && isComplete(r);
}

function report(list: TopProblem[]): void {
  const records = new Map<number, ProblemRecord>();
  for (const p of list) {
    const r = cache.readJson<ProblemRecord | null>(['problems', `${p.id}.json`], null);
    if (r) records.set(p.id, r);
  }
  const c = coverage(
    list.map((p) => p.id),
    records,
  );
  const missingIds = list.filter((p) => {
    const r = records.get(p.id);
    return !r || !isComplete(r);
  });
  const stats = {
    generatedAt: new Date().toISOString(),
    coverage: c,
    topIoRepos: topEntries(c.ioByRepo, 15),
    topSampleRepos: topEntries(c.samplesByRepo, 15),
    needBojIds: missingIds.map((p) => p.id),
    requests: counters,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  cache.writeJson(['stats.json'], stats);
  console.log(
    [
      `대상 ${c.total}`,
      `입출력 설명 ${c.withIo} (${JSON.stringify(c.ioBySource)})`,
      `예제 ${c.withSamples} (${JSON.stringify(c.samplesBySource)})`,
      `둘 다 ${c.complete}`,
      `백준 직접 필요 ${c.needBoj} (아무것도 없음 ${c.missing}, 설명만 없음 ${c.needBojIoOnly}, 예제만 없음 ${c.needBojSamplesOnly})`,
      `요청 ${JSON.stringify(counters)}, ${stats.seconds}초`,
    ].join('\n'),
  );
}

const list = await loadTop(cache, top);
if (!values.stats) {
  if (!values['skip-github']) {
    const candidates = values['more-repos'] ? await discoverMore(cache) : await discover(cache);
    const indexes = await indexRepos(cache, candidates, new Set(list.map((p) => p.id)));
    console.log(`문제가 있는 저장소 ${indexes.length}개`);
    await fetchFromGithub(cache, list, indexes, { maxTries, concurrency });
    if (values['search-missing']) {
      // Descriptions first: a format can be written from the description alone (ADR-0006).
      const noText = list.filter((p) => !describedInCache(p.id)).map((p) => p.id);
      console.log(`설명이 없는 문제 ${noText.length}개를 코드 검색합니다(7초 간격)`);
      const forText = await searchMissing(cache, noText, 'description');
      const missing = list.filter((p) => !completeInCache(p.id)).map((p) => p.id);
      console.log(`예제가 없는 문제 ${missing.length}개를 코드 검색합니다(7초 간격)`);
      const extra = [...forText, ...(await searchMissing(cache, missing))];
      await fetchFromGithub(cache, list, [...indexes, ...extra], { maxTries, concurrency });
    }
  }
  if (values.hub) {
    // Every BaekjoonHub repository: descriptions for every problem someone has solved and pushed.
    const repos = await listHubRepos(cache);
    console.log(`허브 저장소 ${repos.length}개`);
    const hubIndexes = await indexHubRepos(cache, repos);
    await fetchFromGithub(cache, list, hubIndexes, {
      maxTries: 3,
      concurrency,
      descriptionOnly: true,
    });
  }
  if (values.velog) {
    const filled = await fetchFromVelog(cache, list, concurrency);
    console.log(`velog로 ${filled}문제를 채웠습니다 ${JSON.stringify(velogCounters)}`);
  }
  if (values.blog) {
    const key = process.env.KAKAO_REST_API_KEY;
    if (!key) throw new Error('KAKAO_REST_API_KEY가 없습니다');
    const filled = await fetchFromBlogs(cache, list, key, concurrency);
    console.log(`블로그로 ${filled}문제를 채웠습니다 ${JSON.stringify(blogCounters)}`);
  }
  if (bojLimit > 0) await fetchFromBoj(cache, list, { limit: bojLimit, headed: values.headed });
}
report(list);
