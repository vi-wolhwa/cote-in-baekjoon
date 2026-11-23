import type { Problem } from '@/boj/problem';
import type { JsRunResult } from '@/runner/js/execute';

/** Content script (BOJ page) → IDE iframe. */
export interface ProblemMessage {
  type: 'cib:problem';
  problem: Problem;
}

/** IDE iframe → content script. */
export interface CloseMessage {
  type: 'cib:close';
}

/** IDE → sandbox iframe. */
export interface RunRequest {
  type: 'cib:run';
  id: number;
  language: 'javascript';
  code: string;
  stdin: string;
  timeLimitMs: number;
}

export type RunStatus = 'ok' | 'error' | 'timeout' | 'output-limit';

/** Sandbox iframe → IDE. */
export interface RunResponse {
  type: 'cib:run-result';
  id: number;
  status: RunStatus;
  result?: JsRunResult;
  elapsedMs: number;
}

export function isProblemMessage(v: unknown): v is ProblemMessage {
  if (!isObject(v) || v.type !== 'cib:problem' || !isObject(v.problem)) return false;
  const p = v.problem;
  return (
    typeof p.id === 'number' &&
    typeof p.title === 'string' &&
    isObject(p.sections) &&
    Array.isArray(p.samples) &&
    p.samples.every(
      (s) => isObject(s) && typeof s.input === 'string' && typeof s.output === 'string',
    )
  );
}

export function isCloseMessage(v: unknown): v is CloseMessage {
  return isObject(v) && v.type === 'cib:close';
}

export function isRunRequest(v: unknown): v is RunRequest {
  return (
    isObject(v) &&
    v.type === 'cib:run' &&
    typeof v.id === 'number' &&
    v.language === 'javascript' &&
    typeof v.code === 'string' &&
    typeof v.stdin === 'string' &&
    typeof v.timeLimitMs === 'number'
  );
}

export function isRunResponse(v: unknown): v is RunResponse {
  return isObject(v) && v.type === 'cib:run-result' && typeof v.id === 'number';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
