/**
 * A status-list table like Baekjoon's 채점 현황 (ADR-0012, ide-spec §7.3): fixed-height rows,
 * as many per page as fit in the section without a scroll bar, and '이전 페이지' /
 * '다음 페이지' like Baekjoon's. Pages past the loaded rows are asked for with `onMore`.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Spinner } from '../submit';
import { absoluteTime, relativeTime, resultTone } from './format';
import type { RecordRow } from './merge';

/** Row and header heights in pixels; history.css sets the same. */
export const ROW_PX = 30;
const HEAD_PX = 30;

export interface Column {
  label: string;
  /** Class on the header and cells; history.css hides some columns in narrow panes. */
  cls: string;
  cell: (row: RecordRow, now: number) => ComponentChildren;
}

/** How many rows fit in `height` pixels below the header. */
export function rowsThatFit(height: number): number {
  return Math.max(1, Math.floor((height - HEAD_PX) / ROW_PX));
}

interface Props {
  label: string;
  testId: string;
  columns: Column[];
  rows: RecordRow[];
  now: number;
  /** More rows can be loaded past the last one. */
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
  /** Opens a row that has IDE code. */
  onOpen?: (row: RecordRow) => void;
  empty: ComponentChildren;
  /** Changing it goes back to the first page (another problem, '새로 고침'). */
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
  const waiting = loading && shown.length < size;

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
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const open = row.entry && props.onOpen;
              return (
                <tr
                  key={row.key}
                  class={open ? 'is-ide' : undefined}
                  data-testid={`${props.testId}-row`}
                  onClick={open ? () => props.onOpen?.(row) : undefined}
                  title={open ? '풀이 화면에서 낸 제출이에요. 눌러서 코드를 봐요.' : undefined}
                >
                  {props.columns.map((c) => (
                    <td key={c.label} class={c.cls}>
                      {c.cell(row, props.now)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {waiting && (
          <p class="out-busy history-busy" role="status">
            <Spinner />
            백준 채점 현황을 불러오는 중
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
            class="out-button"
            disabled={start === 0}
            onClick={() => setStart(Math.max(0, start - size))}
          >
            이전 페이지
          </button>
          <span class="status-page-no">{Math.floor(start / size) + 1}쪽</span>
          <button
            type="button"
            class="out-button"
            disabled={!hasNext || (loading && rows.length <= start + size)}
            onClick={next}
          >
            다음 페이지
          </button>
        </nav>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cells, as Baekjoon's 채점 현황 shows them

export function ResultCell({ row }: { row: RecordRow }) {
  return (
    <span class={`status-result is-${resultTone(row.resultCode)}`} title={row.resultText}>
      {row.resultText}
    </span>
  );
}

export const memoryCell = (row: RecordRow) =>
  row.memoryKb !== undefined ? `${row.memoryKb} KB` : '';
export const timeCell = (row: RecordRow) => (row.timeMs !== undefined ? `${row.timeMs} ms` : '');
export const lengthCell = (row: RecordRow) =>
  row.codeLength !== undefined ? `${row.codeLength} B` : '';

export function TimeCell({ at, now }: { at: number | undefined; now: number }) {
  if (at === undefined) return null;
  return (
    <time dateTime={new Date(at).toISOString()} title={absoluteTime(at)}>
      {relativeTime(at, now)}
    </time>
  );
}
