/**
 * The result screen, exam.html#{id}/result (#101): accepted count, time taken, the hardest
 * accepted problem and a row per problem. This page also submits the saved answers, one
 * after another (useBatch.ts), and shows each one's progress; judge results arrive as they
 * come, and useExamRecord() keeps the page live.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { CheckIcon, CrossIcon, DashIcon } from '@/ide/icons';
import { batchProgress, finishExam, retrySubmission } from './batch';
import { examLabel, formatClock, formatDuration, isOver } from './model';
import { summarizeExam, type Outcome, type ProblemRow } from './results';
import { PRACTICE_HASH, problemPageUrl } from './routes';
import { tierName } from './solvedac';
import { focusSubmitWindow, useBatchSubmit } from './useBatch';
import { useExamRecord, useNow } from './useExam';

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

      <ol class="result-rows" aria-label="문제별 결과">
        {summary.rows.map((row) => (
          <ResultRow
            key={row.problem.id}
            row={row}
            hidden={!over}
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

function ResultRow({
  row,
  hidden,
  onRetry,
}: {
  row: ProblemRow;
  hidden: boolean;
  onRetry: () => void;
}) {
  const [focusFailed, setFocusFailed] = useState(false);
  const outcome: Outcome = hidden ? 'none' : row.outcome;
  const stageClass = row.stage === 'failed' || row.stage === 'manual' ? ` is-${row.stage}` : '';
  const Icon = outcome === 'accepted' ? CheckIcon : outcome === 'wrong' ? CrossIcon : DashIcon;
  const meta = [tierName(row.problem.level), row.language].filter(Boolean).join(' · ');
  return (
    <li class="result-row" data-testid="result-row">
      <span class={`result-status is-${outcome}`} role="img" aria-label={OUTCOME_LABEL[outcome]}>
        <Icon size={16} />
      </span>
      <span class="result-main">
        <span class="result-name">
          {row.index + 1} · {row.problem.id} {row.problem.title}
        </span>
        <span class="result-meta">{meta}</span>
      </span>
      <span class="result-judge">
        <span class={`result-text is-${outcome}${stageClass}`} data-testid="result-text">
          {hidden ? (row.stage === 'none' ? '제출 안 함' : '답안 저장함') : row.resultText}
        </span>
        {!hidden && row.reason && <span class="result-reason">{row.reason}</span>}
        {!hidden && row.stage === 'manual' && (
          <button
            type="button"
            class="btn btn-primary result-action"
            onClick={() => void focusSubmitWindow(row.problem.id).then((ok) => setFocusFailed(!ok))}
          >
            제출 창 보기
          </button>
        )}
        {focusFailed && row.stage === 'manual' && (
          <span class="result-reason">
            제출 창을 찾지 못했어요. 창이 닫혔다면 잠시 뒤 다시 제출할 수 있어요.
          </span>
        )}
        {!hidden && row.stage === 'failed' && (
          <button type="button" class="btn btn-primary result-action" onClick={onRetry}>
            다시 제출
          </button>
        )}
        {row.submittedAfterMs !== undefined && (
          <span class="result-at">시작 후 {formatClock(row.submittedAfterMs)}</span>
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
