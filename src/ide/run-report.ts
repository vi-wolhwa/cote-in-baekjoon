/**
 * Turns raw run responses into the result-panel model (design spec §6).
 * Kept free of UI code so the wording can be unit tested.
 */
import { outputsMatch } from '@/runner/compare';
import type { RunResponse } from '@/shared/messages';

export type CaseStatus = 'pass' | 'fail' | 'error' | 'timeout' | 'output-limit' | 'cancelled';

export interface CaseReport {
  index: number;
  input: string;
  expected: string;
  status: CaseStatus;
  /** Main line shown after "실행 결과 〉". */
  message: string;
  /** Program output, shown in the "출력 〉" row when it helps. */
  output?: string;
  /** Error details (stderr or exception). */
  error?: string;
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
      const seconds = Math.round(timeLimitMs / 100) / 10;
      return {
        ...base,
        status: 'timeout',
        message: `실행 시간이 ${seconds}초를 초과하여 실행이 중단되었습니다. 실행 시간이 더 짧은 다른 방법을 찾아보세요.`,
      };
    }
    case 'output-limit':
      return { ...base, status: 'output-limit', message: '출력 크기 초과' };
    case 'cancelled':
      return { ...base, status: 'cancelled', message: '실행 중단' };
    case 'error':
      return {
        ...base,
        status: 'error',
        message: '런타임 에러',
        output: stdout || undefined,
        error: [response.result?.error, stderr].filter(Boolean).join('\n') || undefined,
      };
    case 'ok':
      break;
  }

  if (outputsMatch(stdout, sample.output)) {
    return {
      ...base,
      status: 'pass',
      message: '테스트를 통과하였습니다.',
      error: stderr || undefined,
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
    error: stderr || undefined,
  };
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
