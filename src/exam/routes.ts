/**
 * Routes of exam.html (ADR-0005): `#setup`, `#setup?include={problemId}`, `#{id}` (the exam)
 * and `#{id}/result`. The hash comes from the URL, so anything unexpected is 'not-found'.
 */
import { isExamId } from './model';

export type ExamRoute =
  | { kind: 'setup'; include?: number }
  | { kind: 'exam'; id: string }
  | { kind: 'result'; id: string }
  | { kind: 'not-found' };

export function parseRoute(hash: string): ExamRoute {
  const value = hash.replace(/^#/, '');
  if (value === '' || value === 'setup') return { kind: 'setup' };
  const setup = /^setup\?(.*)$/.exec(value);
  if (setup) {
    const include = new URLSearchParams(setup[1]).get('include') ?? '';
    const id = Number(include);
    const valid = /^[1-9]\d{0,6}$/.test(include) && Number.isSafeInteger(id);
    return valid ? { kind: 'setup', include: id } : { kind: 'setup' };
  }
  const exam = /^([a-z0-9]+)(\/result)?$/.exec(value);
  if (exam && isExamId(exam[1])) {
    return exam[2] ? { kind: 'result', id: exam[1] } : { kind: 'exam', id: exam[1] };
  }
  return { kind: 'not-found' };
}

export function routeHash(route: ExamRoute): string {
  switch (route.kind) {
    case 'setup':
      return route.include ? `#setup?include=${route.include}` : '#setup';
    case 'exam':
      return `#${route.id}`;
    case 'result':
      return `#${route.id}/result`;
    default:
      return '#setup';
  }
}

/** The exam page URL path (without the extension origin). */
export const examPagePath = (route: ExamRoute) => `/exam.html${routeHash(route)}`;

/** '다시 풀기' opens the Baekjoon problem page with this hash: the IDE opens by itself. */
export const PRACTICE_HASH = '#cib-ide';
