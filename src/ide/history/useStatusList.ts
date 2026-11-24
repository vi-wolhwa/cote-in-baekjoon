/**
 * Pages of Baekjoon's status list for the 제출 기록 tab (ADR-0012): the first page loads when
 * the tab opens, later pages when the user pages past the loaded rows. The background reads
 * each page by opening it in an inactive tab (status-capture.ts), one at a time.
 *
 * Loaded pages are kept for this IDE frame (CACHE_MS), so switching tabs back and forth does
 * not open Baekjoon again.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  STATUS_FAILURE_TEXT,
  isStatusPageResult,
  type StatusPageRequest,
  type StatusPageResult,
  type StatusPageRow,
  type StatusQuery,
} from '@/shared/status-page';

/** A list loaded this recently is shown again without reloading it. */
export const CACHE_MS = 60_000;

export interface StatusList {
  rows: StatusPageRow[];
  /** `top` of the next (older) page; undefined once the last page is loaded. */
  nextTop?: number;
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

export async function requestStatusPage(query: StatusQuery): Promise<StatusPageResult | 'gone'> {
  const message: StatusPageRequest = { type: 'cib:status-page-request', query };
  try {
    const answer: unknown = await browser.runtime.sendMessage(message);
    return isStatusPageResult(answer) ? answer : 'gone';
  } catch {
    return 'gone';
  }
}

/** Adds a page's rows, skipping ones already there (new submissions shift the pages). */
export function appendRows(list: StatusPageRow[], page: StatusPageRow[]): StatusPageRow[] {
  const seen = new Set(list.map((r) => r.solutionId));
  return [...list, ...page.filter((r) => !seen.has(r.solutionId))];
}

/**
 * The status list for `query` (all users when `userId` is unset). `query` undefined loads
 * nothing.
 */
export function useStatusList(query: Omit<StatusQuery, 'top'> | undefined) {
  const key = query ? `${query.problemId}:${query.userId ?? ''}` : '';
  const [list, setList] = useState<StatusList>(() => cache.get(key)?.list ?? EMPTY);
  const current = useRef({ key, list });
  current.current.key = key;

  const update = (forKey: string, next: StatusList) => {
    cache.set(forKey, { list: next, at: Date.now() });
    if (current.current.key !== forKey) return;
    current.current.list = next;
    setList(next);
  };

  const load = async (top: number | undefined, reset: boolean) => {
    if (!query) return;
    const forKey = key;
    if (current.current.list.loading) return;
    const before = reset ? EMPTY : withoutError(current.current.list);
    update(forKey, { ...before, loading: true });
    const result = await requestStatusPage({ ...query, ...(top !== undefined ? { top } : {}) });
    if (result === 'gone' || !result.ok) {
      const error = STATUS_FAILURE_TEXT[result === 'gone' ? 'disconnected' : result.reason];
      return update(forKey, { ...before, loading: false, error });
    }
    const { page } = result;
    update(forKey, {
      rows: appendRows(before.rows, page.rows),
      ...(page.nextTop !== undefined ? { nextTop: page.nextTop } : {}),
      loaded: true,
      loading: false,
    });
  };

  useEffect(() => {
    if (!query) {
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
    /** Loads the next older page, if there is one. */
    more: () => {
      const { nextTop } = current.current.list;
      if (nextTop !== undefined) void load(nextTop, false);
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
