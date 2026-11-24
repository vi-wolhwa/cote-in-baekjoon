/**
 * Submission on the IDE side (ADR-0002): Baekjoon's submit page opens in a background tab,
 * is filled and submitted there, and its status page reports the result. The IDE shows a
 * spinner meanwhile, with '직접 확인' to bring that tab to the front, and '결과 다시 확인'
 * when the tab closed before the result came.
 */
import { useEffect, useState } from 'preact/hooks';
import { findBlockedPatterns } from '@/boj/waf';
import {
  describeNeedsUser,
  focusSubmitTab,
  isActiveTab,
  requestRecheck,
  submitView,
  watchSubmitTab,
  type SubmitTab,
  type SubmitView,
} from '@/shared/submit-tab';
import {
  requestSubmit,
  watchJudgeResult,
  type JudgeResult,
  type SubmitLanguage,
} from '@/shared/submission';
import { StatusLink } from '@/shared/StatusLink';
import { LONG_WAIT_NOTE, useLongWait, waitingSince } from '@/shared/judge-wait';

export interface SubmitInfo {
  /** When the submission being shown was asked for (this session, or a tab still running). */
  since?: number;
  /** requestSubmit() is on its way. */
  opening: boolean;
  warnings: string[];
  error?: string;
  /** The latest stored result of the problem (maybe an older submission's). */
  last?: JudgeResult;
  view: SubmitView;
}

export function useSubmit(problemId: number, getCode: () => string, language: SubmitLanguage) {
  const [since, setSince] = useState<number>();
  const [opening, setOpening] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [judge, setJudge] = useState<JudgeResult>();
  const [tab, setTab] = useState<SubmitTab>();

  useEffect(() => {
    if (!problemId) return;
    const stopResults = watchJudgeResult(problemId, setJudge);
    const stopTab = watchSubmitTab(problemId, (next) => {
      setTab(next);
      // Opened again while a submission tab still runs (or closed early): follow it.
      if (next && (isActiveTab(next) || next.state === 'closed')) {
        setSince((s) => s ?? next.since);
      }
    });
    return () => {
      stopResults();
      stopTab();
    };
  }, [problemId]);

  /** Always auto-submits: Baekjoon's submit button is pressed for the user (#76). */
  const start = async () => {
    const code = getCode();
    setWarnings(findBlockedPatterns(code));
    setError(undefined);
    setSince(Date.now());
    setOpening(true);
    const res = await requestSubmit({ problemId, language, code, autoSubmit: true });
    setOpening(false);
    if (!res.ok) setError(res.reason);
    return res.ok;
  };

  const view = submitView(tab, judge, since);
  const info: SubmitInfo = {
    ...(since !== undefined ? { since } : {}),
    opening,
    warnings,
    ...(error ? { error } : {}),
    ...(judge ? { last: judge } : {}),
    view,
  };
  return {
    info,
    start,
    focus: () => focusSubmitTab(problemId),
    recheck: () =>
      since !== undefined ? requestRecheck(problemId, since) : Promise.resolve(false),
  };
}

/** A small spinning ring next to "제출 중" / "채점 중". */
export function Spinner() {
  return <span class="spinner" aria-hidden="true" />;
}

export function SubmitPanel({
  info,
  onFocus,
  onRecheck,
}: {
  info: SubmitInfo;
  onFocus: () => void;
  onRecheck: () => void;
}) {
  const { view } = info;
  if (info.error) return <p class="out-fail">{info.error}</p>;
  if (info.opening || view.kind === 'submitting') {
    return (
      <div data-testid="submit-progress">
        <Warnings items={info.warnings} />
        <p class="out-busy" role="status">
          <Spinner />
          제출 중
        </p>
        <p class="out-note">
          백준 제출 페이지를 뒤쪽 탭에서 열어 제출하고 있습니다. 채점이 끝나면 탭은 저절로 닫힙니다.
        </p>
        {view.kind === 'submitting' && <FocusButton onFocus={onFocus} />}
      </div>
    );
  }
  switch (view.kind) {
    case 'idle':
      return (
        <>
          <p class="out-muted">
            제출하기를 누르면 백준 제출 페이지를 뒤쪽 탭에서 열어 언어와 코드를 채우고 제출합니다.
            창은 뜨지 않고, 채점이 끝나면 결과가 여기에 표시됩니다.
          </p>
          {info.last && (
            <>
              <h3 class="out-heading">지난 제출</h3>
              <JudgeView result={info.last} />
            </>
          )}
        </>
      );
    case 'needs-user':
      return (
        <div data-testid="submit-needs-user">
          <Warnings items={info.warnings} />
          <p class="out-warn-title" role="alert">
            직접 확인이 필요해요
          </p>
          <p class="out-note">{describeNeedsUser(view.tab.reason)}</p>
          <FocusButton onFocus={onFocus} emphasized />
        </div>
      );
    case 'judging':
      return (
        <div data-testid="submit-judging">
          <p class="out-busy" role="status">
            <Spinner />
            채점 중
            {view.judge && view.judge.status !== 'done' && (
              <span class="out-muted"> · {view.judge.resultText}</span>
            )}
          </p>
          <LongWaitNote judge={view.judge} />
          {view.tab && <FocusButton onFocus={onFocus} />}
        </div>
      );
    case 'lost':
      return (
        <div data-testid="submit-lost">
          <p class="out-warn-title" role="alert">
            결과를 아직 못 받았어요
          </p>
          <p class="out-note">
            채점 결과를 읽기 전에 제출 탭이 닫혔습니다. 제출이 됐다면 백준 채점 현황에서 결과를 다시
            읽어 올 수 있어요.
          </p>
          <button type="button" class="out-button is-primary" onClick={onRecheck}>
            결과 다시 확인
          </button>
        </div>
      );
    case 'done':
      return (
        <>
          <h3 class="out-heading">채점을 시작합니다.</h3>
          <JudgeView result={view.judge} />
        </>
      );
  }
}

/** After a long "기다리는 중": the wait is Baekjoon's judge queue, not the extension. */
function LongWaitNote({ judge }: { judge: JudgeResult | undefined }) {
  if (!useLongWait(waitingSince(judge))) return null;
  return (
    <p class="out-note" data-testid="judge-wait-note">
      {LONG_WAIT_NOTE}
    </p>
  );
}

function FocusButton({ onFocus, emphasized }: { onFocus: () => void; emphasized?: boolean }) {
  return (
    <button
      type="button"
      class={`out-button${emphasized ? ' is-primary' : ''}`}
      title="백준 제출 탭을 앞으로 가져옵니다"
      onClick={onFocus}
    >
      직접 확인
    </button>
  );
}

export function Warnings({ items }: { items: string[] }) {
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
          {result.solutionId ? ` (제출 번호 ${result.solutionId})` : ''}.{' '}
          <StatusLink problemId={result.problemId} solutionId={result.solutionId} />
        </p>
      )}
    </div>
  );
}
