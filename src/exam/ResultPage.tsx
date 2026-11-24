/**
 * The result screen, exam.html#{id}/result (#101): accepted count, time taken, the hardest
 * accepted problem and a row per problem. This page also submits the saved answers, one
 * after another (useBatch.ts), and shows each one's progress; judge results arrive as they
 * come, and useExamRecord() keeps the page live.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { CheckIcon, CrossIcon, DashIcon } from '@/ide/icons';
import { Spinner } from '@/ide/submit';
import {
  describeNeedsUser,
  focusSubmitTab,
  isActiveTab,
  requestRecheck,
  submitView,
  watchSubmitTab,
  type SubmitTab,
} from '@/shared/submit-tab';
import { batchProgress, finishExam, retrySubmission } from './batch';
import { examLabel, formatClock, formatDuration, isOver } from './model';
import { summarizeExam, type Outcome, type ProblemRow } from './results';
import { PRACTICE_HASH, problemPageUrl } from './routes';
import { tierName } from './solvedac';
import { useBatchSubmit } from './useBatch';
import { useExamRecord, useNow } from './useExam';
import { StatusLink } from '@/shared/StatusLink';
import { LONG_WAIT_NOTE, useLongWait, waitingSince } from '@/shared/judge-wait';

export function ResultPage({ id, onNewExam }: { id: string; onNewExam: () => void }) {
  const { state, update } = useExamRecord(id);
  const exam = state.status === 'ready' ? state.exam : undefined;
  const now = useNow(exam !== undefined && !isOver(exam, Date.now()), 1000);
  const over = exam ? isOver(exam, now) : false;
  // Opened after the end without the exam screen having queued the answers: queue them now.
  useEffect(() => {
    if (exam && over && !exam.submitQueue) {
      void update((e) => finishExam(e, Date.now())).catch(() => undefined);
    }
  }, [exam, over]);
  useBatchSubmit(exam);
  const tabs = useSubmitTabs(exam?.problems.map((p) => p.id) ?? []);

  if (state.status === 'loading') return <div class="ide-loading">결과를 불러오는 중입니다…</div>;
  if (!exam || state.status !== 'ready') {
    return (
      <ResultShell title="결과">
        <p class="exam-empty">시험 기록을 찾지 못했습니다.</p>
      </ResultShell>
    );
  }
  const full = summarizeExam(exam, state.judges, now);
  // Opened during the exam (a bookmarked URL): nothing about results until it ends.
  const summary = over ? full : { ...full, accepted: 0, hardest: undefined };
  const date = new Date(exam.startedAt);
  const progress = batchProgress(exam);
  const waiting = summary.rows.some(
    (r) => r.stage === 'submitted' && r.outcome !== 'accepted' && r.outcome !== 'wrong',
  );

  return (
    <ResultShell title={examLabel(exam)}>
      <header class="result-head">
        <h1 class="result-title">시험 결과</h1>
        <p class="result-sub">
          {date.getMonth() + 1}월 {date.getDate()}일 · {examLabel(exam)} · 제한 시간{' '}
          {formatDuration(exam.durationMs)}
        </p>
      </header>

      {!over && (
        <p class="result-note" role="status">
          아직 시험 중입니다. 시험이 끝나면 결과가 공개됩니다.
        </p>
      )}

      <section class="result-cards" aria-label="요약">
        <div class="result-card" data-testid="result-score">
          <span class="result-card-label">맞은 문제</span>
          <span class="result-card-value">
            {over ? summary.accepted : '-'} / {summary.total}
          </span>
        </div>
        <div class="result-card" data-testid="result-time">
          <span class="result-card-label">걸린 시간</span>
          <span class="result-card-value">{formatDuration(summary.elapsedMs)}</span>
        </div>
        <div class="result-card" data-testid="result-hardest">
          <span class="result-card-label">가장 어려운 맞힌 문제</span>
          <span class="result-card-value">
            {summary.hardest ? tierName(summary.hardest.level) : '-'}
          </span>
          {summary.hardest && <span class="result-card-sub">{summary.hardest.id}번</span>}
        </div>
      </section>

      {over && progress.label && (
        <p
          class={`result-progress${progress.running ? ' is-running' : ''}`}
          role="status"
          data-testid="batch-progress"
        >
          {progress.label}
          {progress.running &&
            ' · 저장한 답안을 하나씩 백준에 제출하고 있어요. 이 화면을 닫지 말아 주세요.'}
        </p>
      )}
      {over && !progress.label && (
        <p class="result-note" role="status">
          저장한 답안이 없어 백준에 제출하지 않았습니다.
        </p>
      )}

      {over && waiting && !progress.running && (
        <p class="result-note" role="status">
          채점이 끝나지 않은 제출이 있습니다. 결과가 들어오면 바로 반영됩니다.
        </p>
      )}
      {over && <LongWaitNote since={queuedSince(summary.rows, tabs)} />}

      <ol class="result-rows" aria-label="문제별 결과">
        {summary.rows.map((row) => (
          <ResultRow
            key={row.problem.id}
            row={row}
            hidden={!over}
            {...(tabs.get(row.problem.id) ? { tab: tabs.get(row.problem.id) } : {})}
            onRetry={() =>
              void update((e) => retrySubmission(e, row.problem.id, Date.now())).catch(
                () => undefined,
              )
            }
          />
        ))}
      </ol>

      <div class="result-actions">
        <button type="button" class="btn btn-primary" onClick={onNewExam}>
          새 시험
        </button>
      </div>
    </ResultShell>
  );
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  accepted: '맞음',
  wrong: '틀림',
  judging: '채점 중',
  none: '결과 없음',
};

/** The submission tab of each problem (shared/submit-tab.ts), kept live. */
function useSubmitTabs(problemIds: readonly number[]): ReadonlyMap<number, SubmitTab> {
  const [tabs, setTabs] = useState<ReadonlyMap<number, SubmitTab>>(new Map());
  const key = problemIds.join(',');
  useEffect(() => {
    const stops = problemIds.map((id) =>
      watchSubmitTab(id, (tab) =>
        setTabs((m) => {
          const next = new Map(m);
          if (tab) next.set(id, tab);
          else next.delete(id);
          return next;
        }),
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [key]);
  return tabs;
}

/** What a row shows about its submission: spinner states, the user's turn, or nothing. */
type Live = 'submitting' | 'judging' | 'needs-user' | 'lost' | undefined;

function liveState(row: ProblemRow, tab: SubmitTab | undefined): Live {
  const sent = row.stage === 'submitting' || row.stage === 'manual' || row.stage === 'submitted';
  if (!sent || !row.submission) return undefined;
  const view = submitView(tab, row.judge, row.submission.at);
  if (view.kind === 'done' || view.kind === 'idle') return undefined;
  if (view.kind === 'judging' && !view.tab && row.stage === 'submitted') return 'lost';
  if (view.kind === 'lost') return row.stage === 'submitted' ? 'lost' : 'submitting';
  return view.kind;
}

/** Since when the longest-waiting submission still being judged sits in Baekjoon's queue. */
function queuedSince(
  rows: readonly ProblemRow[],
  tabs: ReadonlyMap<number, SubmitTab>,
): number | undefined {
  const times = rows
    .filter((row) => liveState(row, tabs.get(row.problem.id)) === 'judging')
    .flatMap((row) => waitingSince(row.judge) ?? []);
  return times.length > 0 ? Math.min(...times) : undefined;
}

/** After a long "기다리는 중": the wait is Baekjoon's judge queue, not the extension. */
function LongWaitNote({ since }: { since: number | undefined }) {
  if (!useLongWait(since)) return null;
  return (
    <p class="result-note" data-testid="judge-wait-note">
      {LONG_WAIT_NOTE}
    </p>
  );
}

const LIVE_TEXT: Record<NonNullable<Live>, string> = {
  submitting: '제출 중',
  judging: '채점 중',
  'needs-user': '직접 확인이 필요해요',
  lost: '결과를 아직 못 받았어요',
};

function ResultRow({
  row,
  hidden,
  tab,
  onRetry,
}: {
  row: ProblemRow;
  hidden: boolean;
  tab?: SubmitTab;
  onRetry: () => void;
}) {
  const [notice, setNotice] = useState<string>();
  const live = hidden ? undefined : liveState(row, tab);
  const outcome: Outcome = hidden || live ? 'none' : row.outcome;
  const attention = live === 'needs-user' || live === 'lost' || row.stage === 'failed';
  const Icon = outcome === 'accepted' ? CheckIcon : outcome === 'wrong' ? CrossIcon : DashIcon;
  const meta = [tierName(row.problem.level), row.language].filter(Boolean).join(' · ');
  const text = hidden
    ? row.stage === 'none'
      ? '제출 안 함'
      : '답안 저장함'
    : live
      ? LIVE_TEXT[live]
      : row.resultText;
  const progress =
    live === 'judging' && row.judge && row.judge.status !== 'done' ? row.judge.resultText : '';
  const focus = () =>
    void focusSubmitTab(row.problem.id).then((ok) =>
      setNotice(
        ok ? undefined : '제출 탭을 찾지 못했어요. 탭이 닫혔다면 잠시 뒤 다시 확인해 주세요.',
      ),
    );
  const recheck = () =>
    void (
      row.submission ? requestRecheck(row.problem.id, row.submission.at) : Promise.resolve(false)
    ).then((ok) =>
      setNotice(ok ? undefined : '결과를 다시 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.'),
    );
  return (
    <li class="result-row" data-testid="result-row">
      <span class={`result-status is-${outcome}`} role="img" aria-label={OUTCOME_LABEL[outcome]}>
        {live === 'submitting' || live === 'judging' ? <Spinner /> : <Icon size={16} />}
      </span>
      <span class="result-main">
        <span class="result-name">
          {row.index + 1} · {row.problem.id} {row.problem.title}
        </span>
        <span class="result-meta">{meta}</span>
      </span>
      <span class="result-judge">
        <span
          class={`result-text is-${outcome}${attention ? ' is-attention' : ''}`}
          data-testid="result-text"
        >
          {text}
        </span>
        {progress && <span class="result-reason">{progress}</span>}
        {live === 'needs-user' && (
          <span class="result-reason">{describeNeedsUser(tab?.reason)}</span>
        )}
        {!hidden && !live && row.reason && <span class="result-reason">{row.reason}</span>}
        {live && live !== 'lost' && isActiveTab(tab) && (
          <button
            type="button"
            class={`btn ${live === 'needs-user' ? 'btn-primary' : 'btn-dark'} result-action`}
            onClick={focus}
          >
            직접 확인
          </button>
        )}
        {live === 'lost' && (
          <button type="button" class="btn btn-primary result-action" onClick={recheck}>
            결과 다시 확인
          </button>
        )}
        {!hidden && row.stage === 'failed' && (
          <button type="button" class="btn btn-primary result-action" onClick={onRetry}>
            다시 제출
          </button>
        )}
        {notice && <span class="result-reason">{notice}</span>}
        {row.submittedAfterMs !== undefined && (
          <span class="result-at">시작 후 {formatClock(row.submittedAfterMs)}</span>
        )}
        {!hidden && !live && row.judge?.status === 'done' && (
          <StatusLink
            class="result-status-link"
            problemId={row.problem.id}
            solutionId={row.judge.solutionId}
          />
        )}
      </span>
      <a
        class="btn btn-dark result-retry"
        href={`${problemPageUrl(row.problem.id)}${PRACTICE_HASH}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        다시 풀기
      </a>
    </li>
  );
}

function ResultShell({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div class="exam-page">
      <nav class="topbar" aria-label="경로">
        <ol class="crumbs">
          <li>모의 시험</li>
          <li aria-current="page">{title}</li>
        </ol>
      </nav>
      <main class="exam-page-main result">{children}</main>
    </div>
  );
}
