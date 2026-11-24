/**
 * A submission list in the 제출 기록 tab (ADR-0012, ide-spec §7.3): fixed-height rows, as many
 * per page as fit in the view without a scroll bar, and '이전' / '다음'. Pages past the loaded
 * rows are asked for with `onMore`. A row whose code can be shown opens on click (or Enter);
 * its last cell says so with a code icon, and a lock marks code its author did not share.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ChevronIcon, CodeIcon, LockIcon } from '../icons';
import { Spinner } from '../submit';
import { absoluteTime, relativeTime } from './format';
import type { RecordRow } from './merge';
import { ResultChip } from './result';

/** Row and header heights in pixels; history.css sets the same. */
export const ROW_PX = 36;
const HEAD_PX = 32;

export interface Column {
  label: string;
  /** Class on the header and cells; history.css sizes them and hides some when narrow. */
  cls: string;
  cell: (row: RecordRow, now: number) => ComponentChildren;
}

/** How many rows fit in `height` pixels below the header. */
export function rowsThatFit(height: number): number {
  return Math.max(1, Math.floor((height - HEAD_PX) / ROW_PX));
}

/** Whether a row's code can be shown: yes, no (not shared), or nothing to say. */
export type Access = 'open' | 'locked' | 'none';

interface Props {
  label: string;
  testId: string;
  columns: Column[];
  rows: RecordRow[];
  now: number;
  /** More rows can be loaded past the last one. */
  hasMore: boolean;
  loading: boolean;
  /** The first page is being (re)loaded: rows already on hand are not shown meanwhile. */
  reloading: boolean;
  onMore: () => void;
  access: (row: RecordRow) => Access;
  onOpen: (row: RecordRow) => void;
  empty: ComponentChildren;
  /** Changing it goes back to the first page (another problem, filter or '새로 고침'). */
  resetKey: string;
}

export function StatusTable(props: Props) {
  const body = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(10);
  const [start, setStart] = useState(0);

  useLayoutEffect(() => {
    const el = body.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (el.clientHeight > 0) setSize(rowsThatFit(el.clientHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A new page size keeps the first shown row on screen.
  useEffect(() => setStart((s) => Math.floor(s / size) * size), [size]);
  useEffect(() => setStart(0), [props.resetKey]);

  const { rows, hasMore, loading } = props;
  // Past the end (a page that failed to load): back to the last page there is.
  useEffect(() => {
    if (!loading && !hasMore && start > 0 && start >= rows.length) {
      setStart(Math.max(0, Math.floor((rows.length - 1) / size) * size));
    }
  }, [loading, hasMore, start, rows.length, size]);
  const shown = rows.slice(start, start + size);
  const hasNext = rows.length > start + size || hasMore;
  const [advance, setAdvance] = useState(false);
  const next = () => {
    const to = start + size;
    if (rows.length < to + size && hasMore) props.onMore();
    // Nothing loaded past this page yet: move on once the next rows arrive, if they do not
    // all fit on this page.
    if (rows.length > to) setStart(to);
    else setAdvance(true);
  };
  useEffect(() => {
    if (!advance || loading) return;
    setAdvance(false);
    if (rows.length > start + size) setStart(start + size);
  }, [advance, loading, rows.length, start, size]);
  // While the first page loads, or a page that is not full waits for the next one, only the
  // loading line shows: rows on hand would be drawn under it and change order once it lands.
  const waiting = loading && (props.reloading || shown.length < size);

  return (
    <div class="status-table-wrap">
      <div class="status-body" ref={body}>
        <table class="status-table" aria-label={props.label} data-testid={props.testId}>
          <thead>
            <tr>
              {props.columns.map((c) => (
                <th key={c.label} class={c.cls} scope="col">
                  {c.label}
                </th>
              ))}
              <th class="col-open" scope="col">
                <span class="visually-hidden">코드</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(waiting ? [] : shown).map((row) => {
              const access = props.access(row);
              const open = access === 'open';
              return (
                <tr
                  key={row.key}
                  class={open ? 'is-open' : undefined}
                  data-testid={`${props.testId}-row`}
                  tabIndex={open ? 0 : undefined}
                  onClick={open ? () => props.onOpen(row) : undefined}
                  onKeyDown={
                    open
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            props.onOpen(row);
                          }
                        }
                      : undefined
                  }
                >
                  {props.columns.map((c) => (
                    <td key={c.label} class={c.cls}>
                      {c.cell(row, props.now)}
                    </td>
                  ))}
                  <td class="col-open">
                    {open && (
                      <span class="row-open" title="코드 보기">
                        <CodeIcon />
                      </span>
                    )}
                    {access === 'locked' && (
                      <span class="row-locked" title="코드가 공개되지 않았어요">
                        <LockIcon size={13} />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {waiting && (
          <p class="out-busy history-busy" role="status">
            <Spinner />
            백준에서 불러오는 중
          </p>
        )}
        {!loading && rows.length === 0 && (
          <div class="history-note status-empty">{props.empty}</div>
        )}
      </div>
      {(start > 0 || hasNext) && (
        <nav class="status-pager" aria-label={`${props.label} 페이지`}>
          <button
            type="button"
            class="pager-button"
            disabled={start === 0}
            onClick={() => setStart(Math.max(0, start - size))}
          >
            <ChevronIcon left size={14} />
            이전
          </button>
          <span class="status-page-no">{Math.floor(start / size) + 1}</span>
          <button
            type="button"
            class="pager-button"
            disabled={!hasNext || (loading && rows.length <= start + size)}
            onClick={next}
          >
            다음
            <ChevronIcon size={14} />
          </button>
        </nav>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cells

const num = (v: number | undefined, unit: string) =>
  v !== undefined ? (
    <>
      {v.toLocaleString()}
      <span class="unit">{unit}</span>
    </>
  ) : (
    <span class="muted">—</span>
  );

export const COLUMNS = {
  result: {
    label: '결과',
    cls: 'col-result',
    cell: (r) => <ResultChip code={r.resultCode} text={r.resultText} />,
  },
  language: {
    label: '언어',
    cls: 'col-lang',
    cell: (r) => <span title={r.language}>{r.language}</span>,
  },
  memory: { label: '메모리', cls: 'col-num col-memory', cell: (r) => num(r.memoryKb, 'KB') },
  time: { label: '시간', cls: 'col-num col-time', cell: (r) => num(r.timeMs, 'ms') },
  length: { label: '코드 길이', cls: 'col-num col-length', cell: (r) => num(r.codeLength, 'B') },
  at: {
    label: '제출',
    cls: 'col-at',
    cell: (r, now) =>
      r.submittedAt !== undefined ? (
        <time dateTime={new Date(r.submittedAt).toISOString()} title={absoluteTime(r.submittedAt)}>
          {relativeTime(r.submittedAt, now)}
        </time>
      ) : null,
  },
  user: {
    label: '아이디',
    cls: 'col-user',
    cell: (r) => <span title={r.username}>{r.username}</span>,
  },
  rank: { label: '순위', cls: 'col-rank', cell: (r) => r.rank ?? '' },
} satisfies Record<string, Column>;
