/**
 * Picks exam problems with solved.ac's search API (ADR-0005). Requests are sent only when the
 * user presses '시험 시작'; nothing is fetched ahead of time. The response is untrusted
 * input: every item is checked, and titles are only ever shown as text.
 *
 * `GET https://solved.ac/api/v3/search/problem?query=…&sort=random&page=1`
 */
import { isHandle } from '@/shared/handle';

export const SOLVED_AC_ORIGIN = 'https://solved.ac/*';
export const SOLVED_AC_API = 'https://solved.ac/api/v3';

/** Tier groups offered as chips, easiest first. Each covers solved.ac levels 5 apart. */
export const TIER_GROUPS = [
  { id: 'bronze', label: '브론즈', letter: 'b', first: 1 },
  { id: 'silver', label: '실버', letter: 's', first: 6 },
  { id: 'gold', label: '골드', letter: 'g', first: 11 },
  { id: 'platinum', label: '플래티넘', letter: 'p', first: 16 },
] as const;

export type TierGroup = (typeof TIER_GROUPS)[number]['id'];

export function isTierGroup(v: unknown): v is TierGroup {
  return TIER_GROUPS.some((g) => g.id === v);
}

/** Algorithm chips. Some chips cover two solved.ac tags (BFS·DFS). */
export interface TagChip {
  id: string;
  label: string;
  /** solved.ac tag keys (`#key` in a query). */
  keys: readonly string[];
  /** Shown only after '더보기'. */
  more?: boolean;
}

export const TAG_CHIPS: readonly TagChip[] = [
  { id: 'implementation', label: '구현', keys: ['implementation'] },
  { id: 'greedy', label: '그리디', keys: ['greedy'] },
  { id: 'dp', label: 'DP', keys: ['dp'] },
  { id: 'graphs', label: '그래프', keys: ['graphs'] },
  { id: 'bfs-dfs', label: 'BFS·DFS', keys: ['bfs', 'dfs'] },
  { id: 'string', label: '문자열', keys: ['string'] },
  { id: 'binary_search', label: '이분 탐색', keys: ['binary_search'] },
  { id: 'sorting', label: '정렬', keys: ['sorting'], more: true },
  { id: 'bruteforcing', label: '브루트포스', keys: ['bruteforcing'], more: true },
  { id: 'math', label: '수학', keys: ['math'], more: true },
  { id: 'data_structures', label: '자료 구조', keys: ['data_structures'], more: true },
  { id: 'backtracking', label: '백트래킹', keys: ['backtracking'], more: true },
  { id: 'shortest_path', label: '최단 경로', keys: ['shortest_path'], more: true },
  { id: 'simulation', label: '시뮬레이션', keys: ['simulation'], more: true },
  { id: 'prefix_sum', label: '누적 합', keys: ['prefix_sum'], more: true },
  { id: 'two_pointer', label: '두 포인터', keys: ['two_pointer'], more: true },
  { id: 'trees', label: '트리', keys: ['trees'], more: true },
];

export function isTagChipId(v: unknown): v is string {
  return TAG_CHIPS.some((t) => t.id === v);
}

export interface SearchConditions {
  tiers: readonly TierGroup[];
  tags: readonly string[];
  /** Leave out problems this Baekjoon user already solved. */
  excludeSolvedBy?: string;
}

/** Tier groups in chip order (easiest first), without duplicates or unknown ids. */
export function sortTiers(tiers: readonly TierGroup[]): TierGroup[] {
  return TIER_GROUPS.filter((g) => tiers.includes(g.id)).map((g) => g.id);
}

/**
 * The solved.ac query: `*s5..g1 (#dp|#greedy) !s@handle lang:ko`. Tiers must be a range;
 * the lowest and highest selected groups bound it.
 */
export function buildQuery(c: SearchConditions): string {
  const tiers = sortTiers(c.tiers);
  const low = TIER_GROUPS.find((g) => g.id === tiers[0]) ?? TIER_GROUPS[1];
  const high = TIER_GROUPS.find((g) => g.id === tiers[tiers.length - 1]) ?? low;
  const parts = [`*${low.letter}5..${high.letter}1`];
  const keys = [...new Set(c.tags.flatMap((id) => TAG_CHIPS.find((t) => t.id === id)?.keys ?? []))];
  if (keys.length === 1) parts.push(`#${keys[0]}`);
  else if (keys.length > 1) parts.push(`(${keys.map((k) => `#${k}`).join('|')})`);
  // Checked again here: the id goes into a query string.
  if (isHandle(c.excludeSolvedBy)) {
    parts.push(`!s@${c.excludeSolvedBy}`);
  }
  parts.push('lang:ko');
  return parts.join(' ');
}

export function searchUrl(query: string): string {
  const params = new URLSearchParams({ query, page: '1', sort: 'random' });
  return `${SOLVED_AC_API}/search/problem?${params.toString()}`;
}

export function problemShowUrl(problemId: number): string {
  return `${SOLVED_AC_API}/problem/show?problemId=${problemId}`;
}

/** A problem as the exam keeps it. */
export interface PickedProblem {
  id: number;
  /** Untrusted text: render as text only. */
  title: string;
  /** solved.ac level: 0 unrated, 1 Bronze V … 30 Ruby I. */
  level: number;
}

export const MAX_TITLE_LENGTH = 200;

/** One solved.ac problem object, or undefined when it is not usable. */
export function parseProblemItem(v: unknown): PickedProblem | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const id = o.problemId;
  const level = o.level;
  const title = o.titleKo;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 9_999_999) return undefined;
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > 30) {
    return undefined;
  }
  if (typeof title !== 'string' || title.trim() === '') return undefined;
  // Problems that can no longer be submitted (deleted, private) are useless in an exam.
  if (o.isSolvable === false) return undefined;
  return { id, title: title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH), level };
}

export interface SearchResult {
  /** All matching problems on solved.ac, not only this page. */
  count: number;
  items: PickedProblem[];
}

/** The search response: `{ count, items: [...] }`. Throws when the shape is wrong. */
export function parseSearchResponse(v: unknown): SearchResult {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SolvedAcError('format');
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.items)) throw new SolvedAcError('format');
  const items: PickedProblem[] = [];
  for (const raw of o.items) {
    const item = parseProblemItem(raw);
    if (item && !items.some((p) => p.id === item.id)) items.push(item);
  }
  const count =
    typeof o.count === 'number' && Number.isInteger(o.count) && o.count >= 0 ? o.count : 0;
  return { count: Math.max(count, items.length), items };
}

export type SolvedAcErrorKind = 'network' | 'status' | 'rate-limit' | 'format' | 'not-found';

export class SolvedAcError extends Error {
  constructor(
    readonly kind: SolvedAcErrorKind,
    readonly status?: number,
  ) {
    super(`solved.ac ${kind}${status ? ` ${status}` : ''}`);
  }
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(url: string, fetcher: Fetch): Promise<unknown> {
  let response: Response;
  try {
    // No cookies: the exam needs nothing from the user's solved.ac session.
    response = await fetcher(url, {
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new SolvedAcError('network');
  }
  if (response.status === 429) throw new SolvedAcError('rate-limit', 429);
  if (response.status === 404) throw new SolvedAcError('not-found', 404);
  if (!response.ok) throw new SolvedAcError('status', response.status);
  try {
    return await response.json();
  } catch {
    throw new SolvedAcError('format');
  }
}

export async function searchProblems(
  conditions: SearchConditions,
  fetcher: Fetch = fetch,
): Promise<SearchResult> {
  return parseSearchResponse(await getJson(searchUrl(buildQuery(conditions)), fetcher));
}

/** One problem by number (the problem the Baekjoon menu's '모의시험' was pressed on). */
export async function fetchProblemInfo(
  problemId: number,
  fetcher: Fetch = fetch,
): Promise<PickedProblem> {
  const item = parseProblemItem(await getJson(problemShowUrl(problemId), fetcher));
  if (!item || item.id !== problemId) throw new SolvedAcError('format');
  return item;
}

/** What the setup form says for each failure. */
export function describeSolvedAcError(error: unknown): string {
  const kind = error instanceof SolvedAcError ? error.kind : 'network';
  switch (kind) {
    case 'rate-limit':
      return 'solved.ac 요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.';
    case 'not-found':
      return 'solved.ac에서 문제 정보를 찾지 못했어요.';
    case 'format':
      return 'solved.ac 응답을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    case 'status':
      return 'solved.ac가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.';
    default:
      return 'solved.ac에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
  }
}

const TIER_NAMES = ['브론즈', '실버', '골드', '플래티넘', '다이아몬드', '루비'];

/** "골드 4" for level 12; "티어 없음" for 0. */
export function tierName(level: number): string {
  if (!Number.isInteger(level) || level < 1 || level > 30) return '티어 없음';
  const group = TIER_NAMES[Math.floor((level - 1) / 5)] ?? '';
  return `${group} ${5 - ((level - 1) % 5)}`;
}
