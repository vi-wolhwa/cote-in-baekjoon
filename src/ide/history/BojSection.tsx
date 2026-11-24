/**
 * '백준 기록' in the 제출 기록 tab (ADR-0012): one page of the user's own Baekjoon status
 * list for the problem, read only when the user presses '백준 기록 불러오기'. The source of a
 * row opens on Baekjoon's own page in a new tab; the extension never fetches it.
 */
import { useEffect, useState } from 'preact/hooks';
import {
  FAILURE_TEXT,
  requestBojHistory,
  sourceUrl,
  type BojHistoryRow,
} from '@/shared/boj-history';
import { Spinner } from '../submit';
import { absoluteTime, metricsText, relativeTime } from './format';
import { ResultBadge } from './parts';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; handle: string; rows: BojHistoryRow[] }
  | { kind: 'error'; message: string };

export function BojSection({ problemId, now }: { problemId: number; now: number }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  // Rows of another problem never stay on screen.
  useEffect(() => setState({ kind: 'idle' }), [problemId]);

  const load = async () => {
    setState({ kind: 'loading' });
    const result = await requestBojHistory();
    setState(
      result.ok
        ? { kind: 'done', handle: result.handle, rows: result.rows }
        : { kind: 'error', message: FAILURE_TEXT[result.reason] },
    );
  };

  return (
    <section class="history-section" data-testid="boj-history">
      <div class="history-head">
        <h4>백준 기록</h4>
        <button
          type="button"
          class="out-button"
          disabled={state.kind === 'loading'}
          onClick={() => void load()}
        >
          백준 기록 불러오기
        </button>
      </div>
      <p class="history-note">
        누를 때만 백준 채점 현황에서 이 문제의 내 제출 한 페이지(최근 20개)를 읽어 와요. 백준에서
        직접 낸 제출도 보여요.
      </p>
      {state.kind === 'loading' && (
        <p class="out-busy history-busy" role="status">
          <Spinner />
          불러오는 중
        </p>
      )}
      {state.kind === 'error' && (
        <p class="history-error" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'done' && state.rows.length === 0 && (
        <p class="history-note" role="status">
          백준에 {state.handle} 님이 이 문제에 낸 제출이 없어요.
        </p>
      )}
      {state.kind === 'done' && state.rows.length > 0 && (
        <ul class="history-list" aria-label="백준 기록">
          {state.rows.map((r) => (
            <li key={r.solutionId} class="history-item is-boj" data-testid="boj-item">
              <ResultBadge code={r.resultCode} text={r.resultText || '결과 없음'} />
              <span class="history-lang">{r.language}</span>
              <span class="history-metrics">
                {[metricsText(r), r.codeLength !== undefined ? `${r.codeLength}B` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {r.submittedAt !== undefined && (
                <time class="history-time" title={absoluteTime(r.submittedAt)}>
                  {relativeTime(r.submittedAt, now)}
                </time>
              )}
              <span class="history-tag">백준 기록</span>
              <a
                class="history-source"
                href={sourceUrl(r.solutionId)}
                target="_blank"
                rel="noopener noreferrer"
                title={`제출 번호 ${r.solutionId}의 코드를 백준에서 엽니다`}
              >
                코드 보기 ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
