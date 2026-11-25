/**
 * '제출 기록' tab of the problem pane (M7, ADR-0012, ide-spec §7.3), three views of Baekjoon:
 *
 * - 내 제출: the user's own submissions for the problem (`/status?…&user_id=`).
 * - 맞힌 사람: everyone's accepted submissions, fastest first (`/problem/status`).
 * - 숏코딩: the same, shortest first (`/short/status`).
 *
 * A view loads its first page when it is first opened and later pages as the user pages on
 * (or as a tall screen needs them); 맞힌 사람 and 숏코딩 filter by language. A row whose code
 * can be shown opens SourceView, which reads the code from Baekjoon.
 */
import { useEffect, useState } from 'preact/hooks';
import { BOJ_LANGUAGES } from '@/boj/languages';
import { loadHandle } from '@/shared/handle';
import { languageInfo, type LanguageId } from '@/shared/languages';
import { LANGUAGE_FILTERS, pageUrl, type ListQuery } from '@/shared/status-page';
import type { Theme } from '@/shared/theme';
import { ExternalIcon, RefreshIcon } from '../icons';
import { statusRow, type RecordRow } from './merge';
import { useNow } from './parts';
import { SourceView } from './SourceView';
import { COLUMNS, StatusTable, type Access, type Column } from './StatusTable';
import type { LoadableCode } from './useHistoryLoad';
import { useStatusList, type ListBase, type StatusList } from './useStatusList';

type View = 'mine' | 'accepted' | 'short';
type Ranked = Exclude<View, 'mine'>;

const VIEWS: { id: View; label: string }[] = [
  { id: 'mine', label: '내 제출' },
  { id: 'accepted', label: '맞힌 사람' },
  { id: 'short', label: '숏코딩' },
];

/**
 * Who and how on the left, the measured values on the right; the spacer between them takes
 * any extra width. Narrow panes hide columns per view (history.css), least needed first.
 */
const COLUMNS_OF: Record<View, Column[]> = {
  mine: [
    COLUMNS.result,
    COLUMNS.language,
    COLUMNS.gap,
    COLUMNS.time,
    COLUMNS.memory,
    COLUMNS.length,
    COLUMNS.at,
  ],
  // Fastest first, so time leads the numbers.
  accepted: [
    COLUMNS.rank,
    COLUMNS.user,
    COLUMNS.language,
    COLUMNS.gap,
    COLUMNS.time,
    COLUMNS.memory,
    COLUMNS.length,
    COLUMNS.at,
  ],
  // Shortest first, so code length leads.
  short: [
    COLUMNS.rank,
    COLUMNS.user,
    COLUMNS.language,
    COLUMNS.gap,
    COLUMNS.length,
    COLUMNS.time,
    COLUMNS.memory,
    COLUMNS.at,
  ],
};

const EMPTY_TEXT: Record<View, string> = {
  mine: '아직 이 문제에 낸 제출이 없어요.',
  accepted: '이 조건으로 맞힌 사람이 없어요.',
  short: '이 조건의 숏코딩 기록이 없어요.',
};

/** Your own code always opens; someone else's only when Baekjoon links it. */
const mineAccess = (): Access => 'open';
const otherAccess = (row: RecordRow): Access => (row.sourceOpen ? 'open' : 'locked');

/** Baekjoon's own order: newest first, or the ranking. */
const toRows = (list: StatusList): RecordRow[] => list.rows.map(statusRow);

/** Filter choices: every language, the editor's language, or one of LANGUAGE_FILTERS. */
type Filter = 'all' | 'current' | number;

/** The filter list after '모든 언어' and '현재 언어', in alphabetical order. */
const SORTED_FILTERS = [...LANGUAGE_FILTERS].sort((a, b) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }),
);

interface Props {
  problemId: number;
  /** The editor's language, for the '현재 언어' filter. */
  language: LanguageId;
  theme: Theme;
  /** '편집기로 불러오기'; the IDE asks before replacing code. */
  onLoad: (code: LoadableCode) => void;
}

export function HistoryPane({ problemId, language, theme, onLoad }: Props) {
  const [view, setView] = useState<View>('mine');
  const [visited, setVisited] = useState<Set<View>>(() => new Set(['mine']));
  const [selected, setSelected] = useState<{ row: RecordRow; view: View }>();
  /** undefined while loading, null when unknown. */
  const [handle, setHandle] = useState<string | null>();
  const [filter, setFilter] = useState<Record<Ranked, Filter>>({ accepted: 'all', short: 'all' });
  const [resets, setResets] = useState<Record<View, number>>({ mine: 0, accepted: 0, short: 0 });
  const now = useNow();

  useEffect(() => {
    let live = true;
    void loadHandle().then((h) => live && setHandle(h ?? null));
    return () => {
      live = false;
    };
  }, []);

  // Baekjoon judges the editor's language under its own id (JavaScript is node.js, …).
  const current = languageInfo(language);
  const currentName =
    BOJ_LANGUAGES[current.id as keyof typeof BOJ_LANGUAGES]?.name ?? current.label;
  const languageIdOf = (f: Filter): { languageId?: number } =>
    f === 'all' ? {} : { languageId: f === 'current' ? current.bojId : f };

  const ranked = (kind: Ranked): ListBase | undefined =>
    visited.has(kind) ? { kind, problemId, ...languageIdOf(filter[kind]) } : undefined;
  const bases: Record<View, ListBase | undefined> = {
    mine: handle ? { kind: 'status', problemId, userId: handle } : undefined,
    accepted: ranked('accepted'),
    short: ranked('short'),
  };
  const lists = {
    mine: useStatusList(bases.mine),
    accepted: useStatusList(bases.accepted),
    short: useStatusList(bases.short),
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
    const base = bases[v] ?? { kind: v === 'mine' ? 'status' : v, problemId };
    return pageUrl(base as ListQuery).replace('https://acmicpc.net', 'https://www.acmicpc.net');
  };

  if (selected) {
    return (
      <SourceView
        row={selected.row}
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
              value={String(filter[view])}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                const next: Filter = v === 'all' || v === 'current' ? v : Number(v);
                setFilter((f) => ({ ...f, [view]: next }));
              }}
            >
              <option value="all">모든 언어</option>
              <option value="current">현재 언어 ({currentName})</option>
              {SORTED_FILTERS.map((l) => (
                <option key={l.id} value={String(l.id)}>
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
        const mineWaiting = id === 'mine' && handle === undefined;
        const filterKey = id === 'mine' ? '' : JSON.stringify(languageIdOf(filter[id]));
        return (
          <section
            key={id}
            class="history-panel"
            data-view={id}
            role="tabpanel"
            aria-label={label}
            hidden={view !== id}
          >
            {id === 'mine' && handle === null && (
              <p class="history-note">
                백준 아이디를 몰라 내 제출을 불러오지 못했어요. 백준에 로그인한 뒤 문제 페이지를
                새로고침해 주세요.
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
              rows={toRows(list)}
              now={now}
              hasMore={list.next !== undefined}
              loading={list.loading || mineWaiting || (!list.loaded && !list.error && !!bases[id])}
              reloading={mineWaiting || (list.loading && list.rows.length === 0)}
              onMore={lists[id].more}
              failed={list.error !== undefined}
              access={id === 'mine' ? mineAccess : otherAccess}
              onOpen={(row) => setSelected({ row, view: id })}
              resetKey={`${problemId}:${resets[id]}:${filterKey}`}
              empty={EMPTY_TEXT[id]}
            />
          </section>
        );
      })}
    </div>
  );
}
