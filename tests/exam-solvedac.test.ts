import { describe, expect, it, vi } from 'vitest';
import {
  buildQuery,
  describeSolvedAcError,
  fetchProblemInfo,
  parseProblemItem,
  parseSearchResponse,
  problemShowUrl,
  searchProblems,
  searchUrl,
  SolvedAcError,
  TAG_CHIPS,
  tierName,
} from '@/exam/solvedac';

/** Synthetic solved.ac items: numbers and titles made up for these tests. */
const item = (id: number, patch: Record<string, unknown> = {}) => ({
  problemId: id,
  titleKo: `문제 ${id}`,
  level: 8,
  isSolvable: true,
  tags: [{ key: 'dp' }],
  ...patch,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('solved.ac query', () => {
  it('turns the tier groups into a level range', () => {
    expect(buildQuery({ tiers: ['silver', 'gold'], tags: [] })).toBe('*s5..g1 s#200.. lang:ko');
    expect(buildQuery({ tiers: ['gold'], tags: [] })).toBe('*g5..g1 s#200.. lang:ko');
    expect(buildQuery({ tiers: ['platinum', 'bronze', 'silver', 'gold'], tags: [] })).toBe(
      '*b5..p1 s#200.. lang:ko',
    );
  });

  it('joins algorithms with OR, a chip can stand for two tags', () => {
    expect(buildQuery({ tiers: ['silver'], tags: ['dp'] })).toBe('*s5..s1 #dp s#200.. lang:ko');
    expect(buildQuery({ tiers: ['silver'], tags: ['greedy', 'bfs-dfs'] })).toBe(
      '*s5..s1 (#greedy|#bfs|#dfs) s#200.. lang:ko',
    );
    // Unknown chips are dropped, not passed into the query.
    expect(buildQuery({ tiers: ['silver'], tags: ['dp', 'x) | *r1'] })).toBe(
      '*s5..s1 #dp s#200.. lang:ko',
    );
  });

  it('leaves out problems the user solved, only for a valid Baekjoon id', () => {
    expect(buildQuery({ tiers: ['gold'], tags: [], excludeSolvedBy: 'tester_1' })).toBe(
      '*g5..g1 !s@tester_1 s#200.. lang:ko',
    );
    expect(buildQuery({ tiers: ['gold'], tags: [], excludeSolvedBy: 'a b' })).toBe(
      '*g5..g1 s#200.. lang:ko',
    );
  });

  it('asks for a random first page', () => {
    const url = new URL(searchUrl('*s5..g1 #dp lang:ko'));
    expect(url.origin + url.pathname).toBe('https://solved.ac/api/v3/search/problem');
    expect(url.searchParams.get('query')).toBe('*s5..g1 #dp lang:ko');
    expect(url.searchParams.get('sort')).toBe('random');
    expect(url.searchParams.get('page')).toBe('1');
    expect(problemShowUrl(1000)).toBe('https://solved.ac/api/v3/problem/show?problemId=1000');
  });

  it('has a chip for every algorithm in the approved design', () => {
    expect(TAG_CHIPS.filter((t) => !t.more).map((t) => t.label)).toEqual([
      '구현',
      '그리디',
      'DP',
      '그래프',
      'BFS·DFS',
      '문자열',
      '이분 탐색',
    ]);
    expect(TAG_CHIPS.filter((t) => t.more)).toHaveLength(10);
    for (const chip of TAG_CHIPS) for (const key of chip.keys) expect(key).toMatch(/^[a-z_]+$/);
  });
});

describe('solved.ac response', () => {
  it('keeps valid, solvable problems once each', () => {
    const result = parseSearchResponse({
      count: 120,
      items: [
        item(1000),
        item(1000),
        item(1001, { isSolvable: false }),
        item(1002, { level: 31 }),
        item(1003, { titleKo: '' }),
        item(0),
        'junk',
        item(1004, { titleKo: '  두   칸  ', level: 0 }),
      ],
    });
    expect(result).toEqual({
      count: 120,
      items: [
        { id: 1000, title: '문제 1000', level: 8 },
        { id: 1004, title: '두 칸', level: 0 },
      ],
    });
  });

  it('refuses a response without items', () => {
    expect(() => parseSearchResponse({ count: 3 })).toThrow(SolvedAcError);
    expect(() => parseSearchResponse([])).toThrow(SolvedAcError);
    expect(parseSearchResponse({ items: [] })).toEqual({ count: 0, items: [] });
  });

  it('keeps titles as text and shortens long ones', () => {
    const parsed = parseProblemItem(item(5, { titleKo: `<b>${'가'.repeat(300)}` }));
    expect(parsed?.title.startsWith('<b>')).toBe(true);
    expect(parsed?.title).toHaveLength(200);
  });

  it('names solved.ac tiers', () => {
    expect(tierName(1)).toBe('브론즈 5');
    expect(tierName(7)).toBe('실버 4');
    expect(tierName(12)).toBe('골드 4');
    expect(tierName(20)).toBe('플래티넘 1');
    expect(tierName(30)).toBe('루비 1');
    expect(tierName(0)).toBe('티어 없음');
  });
});

describe('solved.ac requests', () => {
  it('sends the query without cookies', async () => {
    const fetcher = vi.fn(async () => json({ count: 1, items: [item(1000)] }));
    const result = await searchProblems(
      { tiers: ['silver'], tags: ['dp'], excludeSolvedBy: 'tester' },
      fetcher,
    );
    expect(result.items).toEqual([{ id: 1000, title: '문제 1000', level: 8 }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('query')).toBe('*s5..s1 #dp !s@tester s#200.. lang:ko');
    expect(init.credentials).toBe('omit');
  });

  it('reports network, rate limit, server and format errors', async () => {
    const fail = (fetcher: () => Promise<Response>) =>
      searchProblems({ tiers: ['gold'], tags: [] }, fetcher).catch((e: unknown) => e);
    const network = await fail(() => Promise.reject(new TypeError('offline')));
    expect(network).toMatchObject({ kind: 'network' });
    expect(await fail(async () => json({}, 429))).toMatchObject({ kind: 'rate-limit' });
    expect(await fail(async () => json({}, 503))).toMatchObject({ kind: 'status', status: 503 });
    expect(await fail(async () => new Response('<html>', { status: 200 }))).toMatchObject({
      kind: 'format',
    });
    expect(describeSolvedAcError(network)).toContain('연결하지 못했어요');
    expect(describeSolvedAcError(new SolvedAcError('rate-limit'))).toContain('너무 많아요');
    expect(describeSolvedAcError(new Error('x'))).toContain('연결하지 못했어요');
  });

  it('reads one problem and checks it is the one asked for', async () => {
    await expect(fetchProblemInfo(1000, async () => json(item(1000)))).resolves.toEqual({
      id: 1000,
      title: '문제 1000',
      level: 8,
    });
    await expect(fetchProblemInfo(1000, async () => json(item(1001)))).rejects.toMatchObject({
      kind: 'format',
    });
    await expect(fetchProblemInfo(1000, async () => json({}, 404))).rejects.toMatchObject({
      kind: 'not-found',
    });
  });
});
