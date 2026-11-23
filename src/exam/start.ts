/**
 * '시험 시작' (ADR-0005): asks for the optional solved.ac permission, picks problems and saves
 * the new exam. Must be called straight from the click handler, without awaiting anything
 * first: permissions.request() only works during the user's click.
 */
import { createExam, examKey, newExamId, pickProblems, type Exam, type ExamDraft } from './model';
import {
  describeSolvedAcError,
  fetchProblemInfo,
  searchProblems,
  SOLVED_AC_ORIGIN,
  type PickedProblem,
} from './solvedac';

export type StartResult = { ok: true; exam: Exam } | { ok: false; reason: string };

export const PERMISSION_DENIED =
  '문제를 고르려면 solved.ac 접근을 허용해야 해요. 다시 눌러 허용해 주세요.';

export function tooFewMessage(available: number): string {
  return `조건에 맞는 문제가 ${available}개뿐이에요. 조건을 넓혀 주세요.`;
}

export interface StartOptions {
  draft: ExamDraft;
  /** The logged-in Baekjoon id, when known. */
  handle?: string;
  /** A problem that must be in the exam (from the Baekjoon menu). */
  include?: number;
  now?: () => number;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

export async function startExam(options: StartOptions): Promise<StartResult> {
  const granted = await browser.permissions
    .request({ origins: [SOLVED_AC_ORIGIN] })
    .catch(() => false);
  if (!granted) return { ok: false, reason: PERMISSION_DENIED };

  const { draft, include } = options;
  const fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  const handle = draft.excludeSolved ? options.handle : undefined;
  let picked: PickedProblem[] | undefined;
  try {
    const [found, included] = await Promise.all([
      searchProblems({ tiers: draft.tiers, tags: draft.tags, excludeSolvedBy: handle }, fetcher),
      include ? fetchProblemInfo(include, fetcher) : Promise.resolve(undefined),
    ]);
    picked = pickProblems(found.items, draft.count, included);
    if (!picked) {
      const others = found.items.filter((p) => p.id !== include).length;
      return { ok: false, reason: tooFewMessage(others + (included ? 1 : 0)) };
    }
  } catch (error) {
    return { ok: false, reason: describeSolvedAcError(error) };
  }

  const now = (options.now ?? Date.now)();
  const exam = createExam({
    id: newExamId(now),
    now,
    draft,
    problems: picked,
    ...(handle ? { excludedSolvedBy: handle } : {}),
    ...(include ? { include } : {}),
  });
  try {
    await browser.storage.local.set({ [examKey(exam.id)]: exam });
  } catch {
    return { ok: false, reason: '시험을 저장하지 못했어요. 다시 시도해 주세요.' };
  }
  return { ok: true, exam };
}
