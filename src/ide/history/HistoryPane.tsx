/**
 * '제출 기록' tab of the problem pane (M7, ADR-0012, ide-spec §7.3), two tables like
 * Baekjoon's 채점 현황:
 *
 * - 내 제출: the submissions made in the IDE merged with the user's rows of Baekjoon's status
 *   list, so submissions made on Baekjoon show too. A row made in the IDE opens its code
 *   read-only with '편집기로 불러오기' and '코드 복사'.
 * - 채점 현황: everyone's submissions for the problem, as on Baekjoon.
 *
 * Both load their first page when the tab opens and later pages as the user pages on.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { languageInfo } from '@/shared/languages';
import { StatusLink } from '@/shared/StatusLink';
import { judgeStatusUrl, loadHandle } from '@/shared/handle';
import { sourceUrl, statusPageUrl, userUrl } from '@/shared/status-page';
import { HISTORY_LIMIT, watchHistory, type HistoryEntry } from '@/shared/submission-history';
import { absoluteTime, metricsText } from './format';
import { mergeRecords, type RecordRow } from './merge';
import { ResultBadge, useNow } from './parts';
import {
  ResultCell,
  StatusTable,
  TimeCell,
  lengthCell,
  memoryCell,
  timeCell,
  type Column,
} from './StatusTable';
import { useStatusList, type StatusList } from './useStatusList';

interface Props {
  problemId: number;
  /** '편집기로 불러오기'; the IDE asks before replacing code. */
  onLoad: (entry: HistoryEntry) => void;
}

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

const COMMON: Column[] = [
  { label: '결과', cls: 'col-result', cell: (row) => <ResultCell row={row} /> },
  { label: '메모리', cls: 'col-num col-memory', cell: memoryCell },
  { label: '시간', cls: 'col-num col-time', cell: timeCell },
  {
    label: '언어',
    cls: 'col-lang',
    cell: (row) => <span title={row.language}>{row.language}</span>,
  },
  { label: '코드 길이', cls: 'col-num col-length', cell: lengthCell },
  {
    label: '제출한 시간',
    cls: 'col-at',
    cell: (row, now) => <TimeCell at={row.submittedAt} now={now} />,
  },
];

/** 내 제출: a row made in the IDE opens its code; one made on Baekjoon links its source. */
const MINE: Column[] = [
  {
    label: '제출 번호',
    cls: 'col-id',
    cell: (row) =>
      row.entry ? (
        <button type="button" class="status-open" title="코드 보기">
          {row.solutionId ?? '—'}
        </button>
      ) : row.solutionId !== undefined ? (
        <a href={sourceUrl(row.solutionId)} {...external} title="백준에서 코드 보기">
          {row.solutionId}
        </a>
      ) : (
        '—'
      ),
  },
  ...COMMON,
];

const EVERYONE: Column[] = [
  { label: '제출 번호', cls: 'col-id', cell: (row) => row.solutionId ?? '' },
  {
    label: '아이디',
    cls: 'col-user',
    cell: (row) =>
      row.username ? (
        <a href={userUrl(row.username)} {...external} title={row.username}>
          {row.username}
        </a>
      ) : (
        ''
      ),
  },
  ...COMMON,
];

const toRows = (list: StatusList): RecordRow[] => mergeRecords([], list.rows, true);

export function HistoryPane({ problemId, onLoad }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>();
  const [selected, setSelected] = useState<number>();
  /** undefined while loading, null when unknown. */
  const [handle, setHandle] = useState<string | null>();
  const [mineReset, setMineReset] = useState(0);
  const [allReset, setAllReset] = useState(0);
  const now = useNow();

  useEffect(() => watchHistory(problemId, setEntries), [problemId]);
  useEffect(() => {
    let live = true;
    void loadHandle().then((h) => live && setHandle(h ?? null));
    return () => {
      live = false;
    };
  }, []);

  // Mine first: the background reads one page at a time anyway, and mine matters more.
  const mine = useStatusList(handle ? { problemId, userId: handle } : undefined);
  const mineSettled = handle === null || mine.list.loaded || mine.list.error !== undefined;
  const allStarted = useRef(false);
  if (mineSettled) allStarted.current = true;
  const all = useStatusList(allStarted.current ? { problemId } : undefined);

  // Until Baekjoon's rows arrive (or when they cannot), every IDE submission shows.
  const complete = !handle || !mine.list.loaded || mine.list.nextTop === undefined;
  const records = mergeRecords(entries ?? [], mine.list.rows, complete);
  const entry = entries?.find((e) => e.submittedAt === selected);

  return (
    <>
      {entry && (
        <HistoryDetail entry={entry} onBack={() => setSelected(undefined)} onLoad={onLoad} />
      )}
      {/* Hidden, not removed, while one submission shows: the pages stay where they were. */}
      <div class="history" data-testid="history" hidden={entry !== undefined}>
        <section class="history-section status-section" aria-label="내 제출">
          <div class="history-head">
            <h4>내 제출</h4>
            {handle && <span class="history-count">{handle}</span>}
            <span class="history-head-actions">
              {handle && (
                <button
                  type="button"
                  class="out-button"
                  disabled={mine.list.loading}
                  onClick={() => {
                    setMineReset((n) => n + 1);
                    mine.reload();
                  }}
                >
                  새로 고침
                </button>
              )}
              <a
                class="history-source"
                href={
                  handle ? statusPageUrl({ problemId, userId: handle }) : judgeStatusUrl(problemId)
                }
                {...external}
              >
                백준에서 보기 ↗
              </a>
            </span>
          </div>
          {handle === null && (
            <p class="history-note">
              백준 아이디를 몰라 풀이 화면에서 낸 제출만 보여요. 백준에 로그인한 뒤 문제 페이지를
              새로고침하면 백준에서 낸 제출도 함께 보여요.
            </p>
          )}
          {mine.list.error && (
            <p class="history-error" role="alert">
              {mine.list.error}
            </p>
          )}
          <StatusTable
            label="내 제출"
            testId="my-status"
            columns={MINE}
            rows={records}
            now={now}
            hasMore={!!handle && mine.list.nextTop !== undefined}
            loading={mine.list.loading || entries === undefined || handle === undefined}
            reloading={
              entries === undefined ||
              handle === undefined ||
              (mine.list.loading && mine.list.rows.length === 0)
            }
            onMore={mine.more}
            onOpen={(row) => row.entry && setSelected(row.entry.submittedAt)}
            resetKey={`${problemId}:${mineReset}`}
            empty="아직 이 문제에 낸 제출이 없어요."
          />
          <p class="history-note">
            풀이 화면에서 낸 제출은 굵게 보이고, 누르면 코드를 보고 편집기로 불러올 수 있어요.
            코드는 이 브라우저에만 문제마다 최근 {HISTORY_LIMIT}개까지 남겨요.
          </p>
        </section>
        <section class="history-section status-section" aria-label="채점 현황">
          <div class="history-head">
            <h4>채점 현황</h4>
            <span class="history-head-actions">
              <button
                type="button"
                class="out-button"
                disabled={all.list.loading || !allStarted.current}
                onClick={() => {
                  setAllReset((n) => n + 1);
                  all.reload();
                }}
              >
                새로 고침
              </button>
              <a class="history-source" href={statusPageUrl({ problemId })} {...external}>
                백준에서 보기 ↗
              </a>
            </span>
          </div>
          {all.list.error && (
            <p class="history-error" role="alert">
              {all.list.error}
            </p>
          )}
          <StatusTable
            label="채점 현황"
            testId="all-status"
            columns={EVERYONE}
            rows={toRows(all.list)}
            now={now}
            hasMore={all.list.nextTop !== undefined}
            loading={all.list.loading || (!all.list.loaded && !all.list.error)}
            reloading={all.list.rows.length === 0}
            onMore={all.more}
            resetKey={`${problemId}:${allReset}`}
            empty="아직 이 문제에 낸 제출이 없어요."
          />
        </section>
      </div>
    </>
  );
}

function HistoryDetail({
  entry,
  onBack,
  onLoad,
}: {
  entry: HistoryEntry;
  onBack: () => void;
  onLoad: (entry: HistoryEntry) => void;
}) {
  const code = entry.fnCode ?? entry.code;
  const pre = useRef<HTMLPreElement>(null);
  const [copy, setCopy] = useState<'idle' | 'done' | 'selected'>('idle');
  const metrics = entry.result ? metricsText(entry.result) : '';

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopy('done');
    } catch {
      // Clipboard blocked in the frame: select the code so Ctrl+C works.
      const el = pre.current;
      const selection = el ? window.getSelection() : null;
      if (el && selection) {
        selection.selectAllChildren(el);
        setCopy(document.execCommand('copy') ? 'done' : 'selected');
      }
    }
  };

  return (
    <div class="history history-detail" data-testid="history-detail">
      <button type="button" class="history-back" onClick={onBack}>
        ← 제출 기록
      </button>
      <div class="history-detail-head">
        <ResultBadge
          code={entry.result?.resultCode}
          text={entry.result?.resultText ?? '결과 없음'}
        />
        <span class="history-lang">{languageInfo(entry.language).label}</span>
        {metrics && <span class="history-metrics">{metrics}</span>}
        <time class="history-time">{absoluteTime(entry.submittedAt)}</time>
      </div>
      {entry.result?.solutionId !== undefined && (
        <p class="history-note">
          제출 번호 {entry.result.solutionId}{' '}
          <StatusLink problemId={entry.problemId} solutionId={entry.result.solutionId} />
        </p>
      )}
      {!entry.result && (
        <p class="history-note">
          채점 결과를 받지 못한 제출이에요. 제출이 취소됐거나 결과를 읽기 전에 제출 탭이 닫혔을 수
          있어요.
        </p>
      )}
      <div class="history-actions">
        <button type="button" class="out-button is-primary" onClick={() => onLoad(entry)}>
          편집기로 불러오기
        </button>
        <button type="button" class="out-button" onClick={() => void copyCode()}>
          {copy === 'done' ? '복사했어요' : '코드 복사'}
        </button>
        {copy === 'selected' && (
          <span class="history-note" role="status">
            코드를 선택했어요. Ctrl+C로 복사해 주세요.
          </span>
        )}
      </div>
      {entry.fnCode !== undefined && <p class="history-note">solution 함수로 제출한 코드예요.</p>}
      <pre class="history-code no-mathjax" ref={pre} data-testid="history-code">
        {code}
      </pre>
    </div>
  );
}
