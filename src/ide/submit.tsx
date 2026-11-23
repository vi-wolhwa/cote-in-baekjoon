import { useEffect, useState } from 'preact/hooks';
import { requestSubmit, watchJudgeResult, type JudgeResult } from '@/shared/submission';

export type SubmitState =
  | { phase: 'idle' }
  | { phase: 'opening' }
  | { phase: 'waiting' }
  | { phase: 'result'; result: JudgeResult }
  | { phase: 'error'; reason: string };

/** Submission flow on the IDE side (ADR-0002): open the official page, then show its result. */
export function useSubmit(problemId: number, getCode: () => string, language: 'javascript') {
  const [state, setState] = useState<SubmitState>({ phase: 'idle' });

  useEffect(() => {
    if (!problemId) return;
    return watchJudgeResult(problemId, (result) => setState({ phase: 'result', result }));
  }, [problemId]);

  const start = async () => {
    setState({ phase: 'opening' });
    const res = await requestSubmit({ problemId, language, code: getCode() });
    setState(res.ok ? { phase: 'waiting' } : { phase: 'error', reason: res.reason });
  };

  return { state, start };
}

export function SubmitPanel({ state }: { state: SubmitState }) {
  switch (state.phase) {
    case 'idle':
      return (
        <p class="out-muted">
          제출하기를 누르면 백준 제출 페이지가 열리고 언어와 코드가 채워집니다. 백준의 제출 버튼은
          직접 눌러 주세요.
        </p>
      );
    case 'opening':
      return <p class="out-muted">백준 제출 페이지를 여는 중입니다…</p>;
    case 'waiting':
      return (
        <p class="out-muted">
          새 탭의 백준 제출 페이지에서 코드를 확인하고 제출 버튼을 눌러 주세요. 채점이 끝나면 결과가
          여기에 표시됩니다.
        </p>
      );
    case 'error':
      return <p class="out-fail">{state.reason}</p>;
    case 'result':
      return <JudgeView result={state.result} />;
  }
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
      <h3 class="out-heading">채점을 시작합니다.</h3>
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
