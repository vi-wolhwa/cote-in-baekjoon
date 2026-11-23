/**
 * '시험 시작' (ADR-0005): asks for the optional solved.ac permission, picks problems and saves
 * the new exam. Must be called straight from the click handler, without awaiting anything
 * first: permissions.request() only works during the user's click.
 *
 * Included problems (the form's '포함할 문제') always go in, whatever the tier, algorithm or
 * '이미 푼 문제 빼기' say; solved.ac's `problem/show` gives their title and level. The rest
 * comes from the search. When the included problems fill the count, there is no search.
 */
import { includeProblem } from './includes';
import { createExam, examKey, newExamId, pickProblems, type Exam, type ExamDraft } from './model';
import {
  describeSolvedAcError,
  fetchProblemInfo,
  searchProblems,
  SolvedAcError,
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
  /** Problem numbers that must be in the exam, at most `draft.count`. */
  included?: readonly number[];
  now?: () => number;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

type Fetch = NonNullable<StartOptions['fetcher']>;

/** One included problem from solved.ac; a number solved.ac does not know stops the start. */
async function lookUp(id: number, fetcher: Fetch): Promise<PickedProblem> {
  try {
    return await fetchProblemInfo(id, fetcher);
  } catch (error) {
    if (error instanceof SolvedAcError && (error.kind === 'not-found' || error.kind === 'format')) {
      throw new MissingProblem(id);
    }
    throw error;
  }
}

class MissingProblem extends Error {
  constructor(readonly problemId: number) {
    super(`problem ${problemId} not found`);
  }
}

export async function startExam(options: StartOptions): Promise<StartResult> {
  const granted = await browser.permissions
    .request({ origins: [SOLVED_AC_ORIGIN] })
    .catch(() => false);
  if (!granted) return { ok: false, reason: PERMISSION_DENIED };

  const { draft } = options;
  const included = [...(options.included ?? [])];
  // Checked here again: never start with more included problems than the count.
  const invalid = includeProblem(included, draft.count);
  if (invalid) return { ok: false, reason: invalid };

  const fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  const handle = draft.excludeSolved ? options.handle : undefined;
  const need = draft.count - included.length;
  let picked: PickedProblem[] | undefined;
  try {
    const [found, known] = await Promise.all([
      need > 0
        ? searchProblems({ tiers: draft.tiers, tags: draft.tags, excludeSolvedBy: handle }, fetcher)
        : Promise.resolve({ count: 0, items: [] }),
      Promise.all(included.map((id) => lookUp(id, fetcher))),
    ]);
    picked = pickProblems(found.items, draft.count, known);
    if (!picked) {
      const others = new Set(found.items.map((p) => p.id).filter((id) => !included.includes(id)));
      return { ok: false, reason: tooFewMessage(others.size + included.length) };
    }
  } catch (error) {
    if (error instanceof MissingProblem) {
      return { ok: false, reason: `${error.problemId}번 문제를 찾지 못했어요.` };
    }
    return { ok: false, reason: describeSolvedAcError(error) };
  }

  const now = (options.now ?? Date.now)();
  const exam = createExam({
    id: newExamId(now),
    now,
    draft,
    problems: picked,
    ...(handle && need > 0 ? { excludedSolvedBy: handle } : {}),
    ...(included.length ? { included } : {}),
  });
  try {
    await browser.storage.local.set({ [examKey(exam.id)]: exam });
  } catch {
    return { ok: false, reason: '시험을 저장하지 못했어요. 다시 시도해 주세요.' };
  }
  return { ok: true, exam };
}
