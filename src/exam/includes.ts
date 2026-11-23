/**
 * '포함할 문제' in the setup form (product owner, 2026-11-24): problem numbers the user puts
 * into the exam by hand. The Baekjoon menu's '모의시험' starts the list with that problem,
 * the popup starts it empty; it is not kept in `ui:exam-draft`. The list can never be longer
 * than 문제 수: adding stops at the count, the count cannot go below the list, and starting
 * checks both again. Pure functions, unit tested.
 */
import { MAX_COUNT, MIN_COUNT } from './model';

export const MAX_PROBLEM_ID = 9_999_999;

export const FULL_MESSAGE = '문제 수를 늘리면 더 추가할 수 있어요';
export const BELOW_INCLUDED_MESSAGE = '포함한 문제보다 적게 할 수 없어요';

export type IncludeInput = { ok: true; id: number } | { ok: false; reason: string };

/** Reads the number typed in '포함할 문제' and checks it can be added. */
export function parseIncludeInput(
  text: string,
  included: readonly number[],
  count: number,
): IncludeInput {
  const value = text.trim();
  if (!value) return { ok: false, reason: '문제 번호를 입력해 주세요.' };
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(id) || id < 1 || id > MAX_PROBLEM_ID) {
    return { ok: false, reason: '1부터 9999999까지의 숫자로 입력해 주세요.' };
  }
  if (included.includes(id)) return { ok: false, reason: `${id}번은 이미 넣었어요.` };
  if (included.length >= count) return { ok: false, reason: `${FULL_MESSAGE}.` };
  return { ok: true, id };
}

/** The smallest 문제 수 the stepper allows: never below the included problems. */
export function minCount(included: readonly number[]): number {
  return Math.max(MIN_COUNT, included.length);
}

/** True when the list is full: adding is off until 문제 수 grows. */
export function isIncludeFull(included: readonly number[], count: number): boolean {
  return included.length >= count;
}

/** The last check before '시험 시작'; undefined when it may start. */
export function includeProblem(included: readonly number[], count: number): string | undefined {
  if (new Set(included).size !== included.length) return '같은 문제를 두 번 넣었어요.';
  if (included.some((id) => !Number.isInteger(id) || id < 1 || id > MAX_PROBLEM_ID)) {
    return '포함할 문제 번호가 올바르지 않아요.';
  }
  if (count < MIN_COUNT || count > MAX_COUNT) return '문제 수는 1개부터 8개까지예요.';
  if (included.length > count) {
    return `포함할 문제(${included.length}개)가 문제 수(${count}개)보다 많아요. 문제를 빼거나 문제 수를 늘려 주세요.`;
  }
  return undefined;
}
