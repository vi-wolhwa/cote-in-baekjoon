/**
 * Pages of a Baekjoon list (status or short-coding ranking) for the 제출 기록 tab (ADR-0012):
 * the first page loads when its view opens, later pages when the user pages past the loaded
 * rows. The background reads each page by opening it in an inactive tab (status-capture.ts),
 * one at a time.
 *
 * Loaded lists are kept for this IDE frame (CACHE_MS), so switching views back and forth does
 * not open Baekjoon again.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  STATUS_FAILURE_TEXT,
  isPageResult,
  type PageQuery,
  type PageResult,
  type ShortQuery,
  type SourcePage,
  type StatusPageRequest,
  type StatusPageRow,
  type StatusQuery,
} from '@/shared/status-page';

/** A list loaded this recently is shown again without reloading it. */
export const CACHE_MS = 60_000;

/** A list without its paging cursor. */
export type ListBase = Omit<StatusQuery, 'top'> | Omit<ShortQuery, 'page'>;

export interface StatusList {
  rows: StatusPageRow[];
  /** Where the next page starts; undefined once the last page is loaded. */
  next?: number;
  /** At least one page arrived. */
  loaded: boolean;
  loading: boolean;
  error?: string;
}

interface Cached {
  list: StatusList;
  at: number;
}

const cache = new Map<string, Cached>();
const EMPTY: StatusList = { rows: [], loaded: false, loading: false };

export async function requestPage(query: PageQuery): Promise<PageResult | 'gone'> {
  const message: StatusPageRequest = { type: 'cib:status-page-request', query };
  try {
    const answer: unknown = await browser.runtime.sendMessage(message);
    return isPageResult(answer) ? answer : 'gone';
  } catch {
    return 'gone';
  }
}

/** A submission's source from its Baekjoon page, or the text saying why not. */
export async function requestSource(solutionId: number): Promise<SourcePage | { error: string }> {
  const result = await requestPage({ kind: 'source', solutionId });
  if (result === 'gone') return { error: STATUS_FAILURE_TEXT.disconnected };
  if (!result.ok) return { error: STATUS_FAILURE_TEXT[result.reason] };
  return 'source' in result ? result.source : { error: STATUS_FAILURE_TEXT.layout };
}

/** Adds a page's rows, skipping ones already there (new submissions shift the pages). */
export function appendRows(list: StatusPageRow[], page: StatusPageRow[]): StatusPageRow[] {
  const seen = new Set(list.map((r) => r.solutionId));
  return [...list, ...page.filter((r) => !seen.has(r.solutionId))];
}

function withCursor(base: ListBase, next: number | undefined): PageQuery {
  if (next === undefined) return base;
  return base.kind === 'short' ? { ...base, page: next } : { ...base, top: next };
}

/** The list for `base`; undefined loads nothing. */
export function useStatusList(base: ListBase | undefined) {
  const key = base ? JSON.stringify(base) : '';
  const [list, setList] = useState<StatusList>(() => cache.get(key)?.list ?? EMPTY);
  const current = useRef({ key, list });
  current.current.key = key;

  const update = (forKey: string, next: StatusList) => {
    cache.set(forKey, { list: next, at: Date.now() });
    if (current.current.key !== forKey) return;
    current.current.list = next;
    setList(next);
  };

  const load = async (cursor: number | undefined, reset: boolean) => {
    if (!base) return;
    const forKey = key;
    if (current.current.list.loading) return;
    const before = reset ? EMPTY : withoutError(current.current.list);
    update(forKey, { ...before, loading: true });
    const result = await requestPage(withCursor(base, cursor));
    if (result === 'gone' || !result.ok || !('page' in result)) {
      const reason = result === 'gone' ? 'disconnected' : result.ok ? 'layout' : result.reason;
      return update(forKey, { ...before, loading: false, error: STATUS_FAILURE_TEXT[reason] });
    }
    const { page } = result;
    update(forKey, {
      rows: appendRows(before.rows, page.rows),
      ...(page.next !== undefined ? { next: page.next } : {}),
      loaded: true,
      loading: false,
    });
  };

  useEffect(() => {
    if (!base) {
      current.current.list = EMPTY;
      setList(EMPTY);
      return;
    }
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS && !cached.list.error) {
      current.current.list = cached.list;
      setList(cached.list);
      return;
    }
    current.current.list = EMPTY;
    setList(EMPTY);
    void load(undefined, true);
  }, [key]);

  return {
    list,
    /** Loads the next page, if there is one. */
    more: () => {
      const { next } = current.current.list;
      if (next !== undefined) void load(next, false);
    },
    /** Loads the first page again. */
    reload: () => void load(undefined, true),
  };
}

function withoutError({ error: _error, ...rest }: StatusList): StatusList {
  return rest;
}

/** For tests. */
export function clearStatusCache(): void {
  cache.clear();
}
