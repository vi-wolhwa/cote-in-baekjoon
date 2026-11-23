import { useEffect, useRef, useState } from 'preact/hooks';
import { findBlockedPatterns } from '@/boj/waf';
import {
  requestSubmit,
  watchJudgeResult,
  watchSubmitWindow,
  type JudgeResult,
} from '@/shared/submission';

export type SubmitState =
  | { phase: 'idle'; last?: JudgeResult }
  | { phase: 'opening'; warnings: string[] }
  | { phase: 'waiting'; warnings: string[] }
  | { phase: 'closed' }
  | { phase: 'result'; result: JudgeResult }
  | { phase: 'error'; reason: string };

/** Submission flow on the IDE side (ADR-0002): open the official page, then show its result. */
export function useSubmit(problemId: number, getCode: () => string, language: 'javascript') {
  const [state, setState] = useState<SubmitState>({ phase: 'idle' });
  /** Results older than the latest 제출하기 click belong to an earlier submission. */
  const startedAt = useRef(0);

  useEffect(() => {
    if (!problemId) return;
    const stopResults = watchJudgeResult(problemId, (result) => {
      if (startedAt.current === 0) setState({ phase: 'idle', last: result });
      else if (result.updatedAt >= startedAt.current) setState({ phase: 'result', result });
    });
    // The user closed the submit window without a result: say so instead of waiting forever.
    const stopWindow = watchSubmitWindow(problemId, (windowState) => {
      if (windowState === 'closed') {
        setState((s) => (s.phase === 'waiting' || s.phase === 'opening' ? { phase: 'closed' } : s));
      }
    });
    return () => {
      stopResults();
      stopWindow();
    };
  }, [problemId]);

  const start = async () => {
    const code = getCode();
    const warnings = findBlockedPatterns(code);
    startedAt.current = Date.now();
    setState({ phase: 'opening', warnings });
    const res = await requestSubmit({ problemId, language, code });
    setState(res.ok ? { phase: 'waiting', warnings } : { phase: 'error', reason: res.reason });
  };

  return { state, start };
}

export function SubmitPanel({ state }: { state: SubmitState }) {
  switch (state.phase) {
    case 'idle':
      return (
        <>
          <p class="out-muted">
            제출하기를 누르면 백준 제출 창이 열리고 언어와 코드가 채워집니다. 백준의 제출 버튼을
            직접 누르면, 채점이 끝난 뒤 창이 닫히고 결과가 여기에 표시됩니다.
          </p>
          {state.last && (
            <>
              <h3 class="out-heading">지난 제출</h3>
              <JudgeView result={state.last} />
            </>
          )}
        </>
      );
    case 'opening':
      return (
        <>
          <Warnings items={state.warnings} />
          <p class="out-muted">백준 제출 페이지를 여는 중입니다…</p>
        </>
      );
    case 'waiting':
      return (
        <>
          <Warnings items={state.warnings} />
          <p class="out-muted">
            열린 백준 제출 창에서 코드를 확인하고 제출 버튼을 직접 눌러 주세요. 채점이 끝나면 창이
            닫히고 결과가 여기에 표시됩니다.
          </p>
        </>
      );
    case 'closed':
      return (
        <p class="out-muted">
          제출 창이 닫혔습니다. 제출하지 않았다면 제출하기를 다시 눌러 주세요.
        </p>
      );
    case 'error':
      return <p class="out-fail">{state.reason}</p>;
    case 'result':
      return (
        <>
          <h3 class="out-heading">채점을 시작합니다.</h3>
          <JudgeView result={state.result} />
        </>
      );
  }
}

function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p class="out-fail">
      코드에 백준 방화벽이 막을 수 있는 문자열이 있습니다: {items.join(', ')}. 주석이나 문자열을
      바꾼 뒤 제출해 주세요.
    </p>
  );
}

function JudgeView({ result }: { result: JudgeResult }) {
  const done = result.status === 'done';
  const accepted = result.resultCode === 'ac';
  const detail = [
    result.timeMs !== undefined ? `${result.timeMs}ms` : undefined,
    result.memoryKb !== undefined ? `${(result.memoryKb / 1024).toFixed(1)}MB` : undefined,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div class="out-report" data-testid="judge">
      <table class="out-case">
        <tbody>
          <tr>
            <th scope="row">
              채점 결과 <span class="out-sep">〉</span>
            </th>
            <td class={!done ? 'out-muted' : accepted ? 'out-pass' : 'out-fail'}>
              {result.resultText}
              {done && detail && ` (${detail})`}
            </td>
          </tr>
        </tbody>
      </table>
      {done && (
        <p class="out-note">
          백준 채점 결과입니다
          {result.solutionId ? ` (제출 번호 ${result.solutionId})` : ''}.
        </p>
      )}
    </div>
  );
}
