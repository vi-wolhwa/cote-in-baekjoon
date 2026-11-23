import type { Problem } from '@/boj/problem';
import type { EngineResult } from '@/runner/engine';
import { isLanguageId, type LanguageId } from '@/shared/languages';

/** Content script (BOJ page) → IDE iframe. */
export interface ProblemMessage {
  type: 'cib:problem';
  problem: Problem;
}

/** IDE iframe → content script. */
export interface CloseMessage {
  type: 'cib:close';
}

/** IDE iframe → content script: listening, please send the problem. */
export interface ReadyMessage {
  type: 'cib:ready';
}

/** Toolbar popup → problem page content script: open the IDE, like the title button (#79). */
export interface OpenIdeMessage {
  type: 'cib:open-ide';
}

/**
 * Problem page content script → background: the Baekjoon menu's '모의시험' (#102). Content
 * scripts cannot open extension pages with the tabs API, so the background opens
 * exam.html#setup?include={problemId}.
 */
export interface OpenExamSetupMessage {
  type: 'cib:open-exam-setup';
  problemId: number;
}

/** IDE → sandbox iframe. */
export interface RunRequest {
  type: 'cib:run';
  id: number;
  language: LanguageId;
  code: string;
  stdin: string;
  timeLimitMs: number;
  /** Extension URL of the bundled runtimes (`.../runtime/`), see EngineInput. */
  runtimeBase: string;
}

export type RunStatus = 'ok' | 'error' | 'timeout' | 'output-limit' | 'cancelled' | 'compile-error';

/** IDE → sandbox iframe: stop every running program. */
export interface CancelRequest {
  type: 'cib:cancel';
}

/** Sandbox iframe → IDE. */
export interface RunResponse {
  type: 'cib:run-result';
  id: number;
  status: RunStatus;
  result?: EngineResult;
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

export function isReadyMessage(v: unknown): v is ReadyMessage {
  return isObject(v) && v.type === 'cib:ready';
}

export function isCloseMessage(v: unknown): v is CloseMessage {
  return isObject(v) && v.type === 'cib:close';
}

export function isOpenIdeMessage(v: unknown): v is OpenIdeMessage {
  return isObject(v) && v.type === 'cib:open-ide';
}

export function isOpenExamSetupMessage(v: unknown): v is OpenExamSetupMessage {
  return (
    isObject(v) &&
    v.type === 'cib:open-exam-setup' &&
    typeof v.problemId === 'number' &&
    Number.isInteger(v.problemId) &&
    v.problemId >= 1 &&
    v.problemId <= 9_999_999
  );
}

export function isRunRequest(v: unknown): v is RunRequest {
  return (
    isObject(v) &&
    v.type === 'cib:run' &&
    typeof v.id === 'number' &&
    isLanguageId(v.language) &&
    typeof v.code === 'string' &&
    typeof v.stdin === 'string' &&
    typeof v.timeLimitMs === 'number' &&
    typeof v.runtimeBase === 'string'
  );
}

export function isCancelRequest(v: unknown): v is CancelRequest {
  return isObject(v) && v.type === 'cib:cancel';
}

export function isRunResponse(v: unknown): v is RunResponse {
  return isObject(v) && v.type === 'cib:run-result' && typeof v.id === 'number';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
