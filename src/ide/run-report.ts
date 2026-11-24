/**
 * Turns raw run responses into the result-panel model (design spec §6).
 * Kept free of UI code so the wording can be unit tested.
 */
import { outputsMatch } from '@/runner/compare';
import type { RunResponse } from '@/shared/messages';

export type CaseStatus =
  'pass' | 'fail' | 'error' | 'timeout' | 'output-limit' | 'cancelled' | 'compile-error';

export interface CaseReport {
  index: number;
  input: string;
  expected: string;
  status: CaseStatus;
  /** Main line shown after "실행 결과 〉". */
  message: string;
  /** Program output, shown in the "출력 〉" row when it helps. */
  output?: string;
  /** What the program printed when it differs from the expected output (status 'fail'). */
  actual?: string;
  /** Error details (stderr or exception). */
  error?: string;
  /** Shown when the run finished but took longer than the problem's time limit. */
  warning?: string;
  elapsedMs: number;
}

export interface RunReport {
  cases: CaseReport[];
  passed: number;
  total: number;
  allPassed: boolean;
}

export function buildCaseReport(
  index: number,
  sample: { input: string; output: string },
  response: RunResponse,
  timeLimitMs: number,
  problemLimitMs?: number,
): CaseReport {
  const base = {
    index,
    input: sample.input,
    expected: sample.output,
    elapsedMs: response.elapsedMs,
  };
  const stdout = response.result?.stdout ?? '';
  const stderr = response.result?.stderr ?? '';

  switch (response.status) {
    case 'timeout': {
      const limit = seconds(timeLimitMs);
      const reason = problemLimitMs
        ? ` 문제의 시간 제한은 ${seconds(problemLimitMs)}초이고, 브라우저 실행은 백준보다 느릴 수 있어 ${limit}초까지 기다렸습니다.`
        : '';
      return {
        ...base,
        status: 'timeout',
        message: `실행 시간이 ${limit}초를 초과하여 실행이 중단되었습니다.${reason} 실행 시간이 더 짧은 다른 방법을 찾아보세요.`,
      };
    }
    case 'output-limit':
      return { ...base, status: 'output-limit', message: '출력 크기 초과' };
    case 'cancelled':
      return { ...base, status: 'cancelled', message: '실행 중단' };
    case 'compile-error':
      return {
        ...base,
        status: 'compile-error',
        message: '컴파일 에러',
        error: response.result?.compileError || undefined,
      };
    case 'error':
      return {
        ...base,
        status: 'error',
        message: '런타임 에러',
        output: stdout || undefined,
        error: errorDetails(response.result?.error, stderr),
      };
    case 'ok':
      break;
  }

  const warning =
    problemLimitMs && response.elapsedMs > problemLimitMs
      ? `실행 시간 ${seconds(response.elapsedMs)}초가 문제의 시간 제한 ${seconds(problemLimitMs)}초를 넘었습니다. 백준에서는 시간 초과가 될 수 있습니다.`
      : undefined;
  if (outputsMatch(stdout, sample.output)) {
    return {
      ...base,
      status: 'pass',
      message: '테스트를 통과하였습니다.',
      error: stderr || undefined,
      warning,
    };
  }
  const actual = stdout.trimEnd();
  const expected = sample.output.trimEnd();
  const oneLine = !actual.includes('\n') && !expected.includes('\n') && actual.length <= 80;
  return {
    ...base,
    status: 'fail',
    message: oneLine
      ? `실행한 결괏값 ${actual || '(없음)'}이(가) 기댓값 ${expected}와(과) 다릅니다.`
      : '실행한 결괏값이 기댓값과 다릅니다.',
    output: oneLine ? undefined : stdout,
    actual: stdout,
    error: stderr || undefined,
    warning,
  };
}

function seconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}

/** "12ms" under a second, "1.23초" above. */
export function formatElapsed(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}초`;
}

export function summarize(cases: CaseReport[]): RunReport {
  const passed = cases.filter((c) => c.status === 'pass').length;
  return {
    cases,
    passed,
    total: cases.length,
    allPassed: cases.length > 0 && passed === cases.length,
  };
}

/** Time limit for a browser run: 3x the problem limit, at most 10 seconds (ADR-0004). */
export function runTimeLimit(problemLimitMs: number | undefined): number {
  return Math.min((problemLimitMs ?? 2000) * 3, 10_000);
}

/**
 * The error summary plus stderr, without repeating the summary when stderr already ends
 * with it (a Python traceback's last line is the summary).
 */
export function errorDetails(summary: string | undefined, stderr: string): string | undefined {
  const trace = stderr.trimEnd();
  if (summary && trace.includes(summary)) return trace;
  return [summary, trace].filter(Boolean).join('\n') || undefined;
}
