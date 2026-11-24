/**
 * '제출 기록' tab of the problem pane (M7, ADR-0012, ide-spec §7.3), three views:
 *
 * - 내 제출: submissions made in the IDE merged with the user's Baekjoon status list.
 * - 채점 현황: everyone's submissions for the problem, as on Baekjoon.
 * - 숏코딩: Baekjoon's short-coding ranking for the problem.
 *
 * A view loads its first page when it is first opened and later pages as the user pages on;
 * 채점 현황 and 숏코딩 filter by language. A row whose code can be shown opens SourceView.
 */
import { useEffect, useState } from 'preact/hooks';
import { loadHandle } from '@/shared/handle';
import { LANGUAGE_FILTERS, pageUrl, type ListQuery } from '@/shared/status-page';
import { watchHistory, type HistoryEntry } from '@/shared/submission-history';
import type { Theme } from '@/shared/theme';
import { ExternalIcon, RefreshIcon } from '../icons';
import { mergeRecords, statusRow, type RecordRow } from './merge';
import { useNow } from './parts';
import { SourceView } from './SourceView';
import { COLUMNS, StatusTable, type Access, type Column } from './StatusTable';
import { useStatusList, type ListBase, type StatusList } from './useStatusList';

type View = 'mine' | 'all' | 'short';

const VIEWS: { id: View; label: string }[] = [
  { id: 'mine', label: '내 제출' },
  { id: 'all', label: '채점 현황' },
  { id: 'short', label: '숏코딩' },
];

const COLUMNS_OF: Record<View, Column[]> = {
  mine: [
    COLUMNS.result,
    COLUMNS.language,
    COLUMNS.memory,
    COLUMNS.time,
    COLUMNS.length,
    COLUMNS.at,
  ],
  all: [
    COLUMNS.user,
    COLUMNS.result,
    COLUMNS.language,
    COLUMNS.memory,
    COLUMNS.time,
    COLUMNS.length,
    COLUMNS.at,
  ],
  short: [
    COLUMNS.rank,
    COLUMNS.user,
    COLUMNS.language,
    COLUMNS.length,
    COLUMNS.memory,
    COLUMNS.time,
    COLUMNS.at,
  ],
};

const EMPTY_TEXT: Record<View, string> = {
  mine: '아직 이 문제에 낸 제출이 없어요.',
  all: '이 조건의 제출이 없어요.',
  short: '이 조건의 숏코딩 기록이 없어요.',
};

/** Your own code always opens; someone else's only when Baekjoon links it. */
const mineAccess = (row: RecordRow): Access =>
  row.entry || row.solutionId !== undefined ? 'open' : 'none';
const otherAccess = (row: RecordRow): Access => (row.sourceOpen ? 'open' : 'locked');

/** Baekjoon's own order: newest first, or the short-coding ranking. */
const toRows = (list: StatusList): RecordRow[] => list.rows.map((r) => statusRow(r));

/** -1 is Baekjoon's '모든 언어'. */
const withLanguage = (languageId: number) => (languageId === -1 ? {} : { languageId });

interface Props {
  problemId: number;
  theme: Theme;
  /** '편집기로 불러오기'; the IDE asks before replacing code. */
  onLoad: (entry: HistoryEntry) => void;
}

export function HistoryPane({ problemId, theme, onLoad }: Props) {
  const [view, setView] = useState<View>('mine');
  const [visited, setVisited] = useState<Set<View>>(() => new Set(['mine']));
  const [selected, setSelected] = useState<{ row: RecordRow; view: View }>();
  const [entries, setEntries] = useState<HistoryEntry[]>();
  /** undefined while loading, null when unknown. */
  const [handle, setHandle] = useState<string | null>();
  const [language, setLanguage] = useState<Record<'all' | 'short', number>>({
    all: -1,
    short: -1,
  });
  const [resets, setResets] = useState<Record<View, number>>({ mine: 0, all: 0, short: 0 });
  const now = useNow();

  useEffect(() => watchHistory(problemId, setEntries), [problemId]);
  useEffect(() => {
    let live = true;
    void loadHandle().then((h) => live && setHandle(h ?? null));
    return () => {
      live = false;
    };
  }, []);

  const bases: Record<View, ListBase | undefined> = {
    mine: handle ? { kind: 'status', problemId, userId: handle } : undefined,
    all: visited.has('all')
      ? { kind: 'status', problemId, ...withLanguage(language.all) }
      : undefined,
    short: visited.has('short')
      ? { kind: 'short', problemId, ...withLanguage(language.short) }
      : undefined,
  };
  const lists = {
    mine: useStatusList(bases.mine),
    all: useStatusList(bases.all),
    short: useStatusList(bases.short),
  };

  const mine = lists.mine.list;
  // Until Baekjoon's rows arrive (or when they cannot), every IDE submission shows.
  const complete = !handle || !mine.loaded || mine.next === undefined;
  const rowsOf: Record<View, RecordRow[]> = {
    mine: mergeRecords(entries ?? [], mine.rows, complete),
    all: toRows(lists.all.list),
    short: toRows(lists.short.list),
  };

  const open = (v: View) => {
    setView(v);
    setVisited((s) => (s.has(v) ? s : new Set([...s, v])));
  };
  const refresh = () => {
    setResets((r) => ({ ...r, [view]: r[view] + 1 }));
    lists[view].reload();
  };
  const linkOf = (v: View): string => {
    const base = bases[v] ?? { kind: v === 'short' ? 'short' : 'status', problemId };
    return pageUrl(base as ListQuery).replace('https://acmicpc.net', 'https://www.acmicpc.net');
  };

  if (selected) {
    return (
      <SourceView
        row={selected.row}
        problemId={problemId}
        theme={theme}
        now={now}
        showUser={selected.view !== 'mine'}
        onBack={() => setSelected(undefined)}
        onLoad={onLoad}
      />
    );
  }

  const busy = lists[view].list.loading || (view === 'mine' && handle === undefined);
  return (
    <div class="history" data-testid="history">
      <div class="history-toolbar">
        <div class="history-views" role="tablist" aria-label="제출 기록 보기">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              class="history-view-tab"
              onClick={() => open(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div class="history-tools">
          {view !== 'mine' && (
            <select
              class="history-filter"
              aria-label="언어"
              value={language[view]}
              onChange={(e) => {
                const id = Number((e.target as HTMLSelectElement).value);
                setLanguage((l) => ({ ...l, [view]: id }));
              }}
            >
              <option value={-1}>모든 언어</option>
              {LANGUAGE_FILTERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            class="icon-button"
            aria-label="새로 고침"
            title="새로 고침"
            disabled={busy || (view === 'mine' && !handle)}
            onClick={refresh}
          >
            <RefreshIcon />
          </button>
          <a
            class="icon-button"
            href={linkOf(view)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="백준에서 보기"
            title="백준에서 보기"
          >
            <ExternalIcon />
          </a>
        </div>
      </div>
      {VIEWS.filter((v) => visited.has(v.id)).map(({ id, label }) => {
        const list = lists[id].list;
        const mineWaiting = id === 'mine' && (entries === undefined || handle === undefined);
        return (
          <section
            key={id}
            class="history-panel"
            role="tabpanel"
            aria-label={label}
            hidden={view !== id}
          >
            {id === 'mine' && handle === null && (
              <p class="history-note">
                백준 아이디를 몰라 풀이 화면에서 낸 제출만 보여요. 백준에 로그인한 뒤 문제 페이지를
                새로고침하면 백준에서 낸 제출도 함께 보여요.
              </p>
            )}
            {list.error && (
              <p class="history-error" role="alert">
                {list.error}
              </p>
            )}
            <StatusTable
              label={label}
              testId={`${id}-status`}
              columns={COLUMNS_OF[id]}
              rows={rowsOf[id]}
              now={now}
              hasMore={list.next !== undefined && (id !== 'mine' || !!handle)}
              loading={
                list.loading || mineWaiting || (id !== 'mine' && !list.loaded && !list.error)
              }
              reloading={mineWaiting || (list.loading && list.rows.length === 0)}
              onMore={lists[id].more}
              access={id === 'mine' ? mineAccess : otherAccess}
              onOpen={(row) => setSelected({ row, view: id })}
              resetKey={`${problemId}:${resets[id]}:${id === 'mine' ? '' : language[id]}`}
              empty={EMPTY_TEXT[id]}
            />
          </section>
        );
      })}
    </div>
  );
}
