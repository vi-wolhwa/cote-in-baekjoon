/**
 * '코드 실행': runs every sample and added case in the sandbox, one after another, and turns
 * the responses into the result panel model. Shared by the practice IDE and the mock exam.
 */
import type { Sample } from '@/boj/problem';
import type { SandboxRunner } from '@/runner/client';
import type { RunResponse } from '@/shared/messages';
import { languageInfo, SUBMIT_ONLY_REASON, type LanguageId } from '@/shared/languages';
import type { RunOutputProps } from './RunOutput';
import { buildCaseReport, runTimeLimit, summarize, type CaseReport } from './run-report';

export interface RunCasesInput {
  runner: SandboxRunner;
  language: LanguageId;
  code: string;
  cases: readonly Sample[];
  /** The problem's time limit, if known. */
  problemLimitMs?: number;
  /** Engines that already loaded in this session; the first Python/C++ run takes seconds. */
  warmEngines: Set<string>;
  onProgress: (output: RunOutputProps) => void;
  /** Rewrites each response (solution mode maps messages back to the user code). */
  transform?: (response: RunResponse) => RunResponse;
}

export async function runCases(input: RunCasesInput): Promise<RunOutputProps> {
  const { runner, language, code, cases, problemLimitMs, warmEngines } = input;
  const engine = languageInfo(language).engine;
  if (!engine) return { state: 'message', text: SUBMIT_ONLY_REASON };
  if (cases.length === 0) {
    return {
      state: 'message',
      text: '실행할 테스트 케이스가 없습니다. 테스트 케이스를 추가해 주세요.',
    };
  }
  const limit = runTimeLimit(problemLimitMs);
  const firstLoad = !warmEngines.has(engine);
  const reports: CaseReport[] = [];
  for (const [i, sample] of cases.entries()) {
    input.onProgress({
      state: 'running',
      done: i,
      total: cases.length,
      preparing: firstLoad && i === 0,
    });
    const raw = await runner.run(language, code, sample.input, limit);
    const response = input.transform ? input.transform(raw) : raw;
    reports.push(buildCaseReport(i + 1, sample, response, limit, problemLimitMs));
    if (response.status !== 'cancelled' && response.status !== 'timeout') warmEngines.add(engine);
    // A compile error is the same for every case: show it once.
    if (response.status === 'cancelled' || response.status === 'compile-error') break;
  }
  return { state: 'report', report: summarize(reports) };
}
