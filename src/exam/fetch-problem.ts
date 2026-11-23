/**
 * Fetches a problem statement for the exam screen (ADR-0005): only when the user opens that
 * problem for the first time in an exam, never ahead of time. No cookies are sent. The page
 * is untrusted: parseProblem() reads it and the problem pane sanitizes the HTML.
 */
import { parseProblem, type Problem } from '@/boj/problem';

export const problemPageUrl = (id: number) => `https://www.acmicpc.net/problem/${id}`;

export class ProblemFetchError extends Error {
  constructor(readonly kind: 'network' | 'status' | 'parse') {
    super(`problem ${kind}`);
  }
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchProblemBody(id: number, fetcher: Fetch = fetch): Promise<Problem> {
  const url = problemPageUrl(id);
  let response: Response;
  try {
    response = await fetcher(url, { credentials: 'omit' });
  } catch {
    throw new ProblemFetchError('network');
  }
  if (!response.ok) throw new ProblemFetchError('status');
  const html = await response.text().catch(() => '');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const problem = parseProblem(doc, url);
  if (!problem || problem.id !== id) throw new ProblemFetchError('parse');
  return problem;
}

export function describeFetchError(error: unknown): string {
  const kind = error instanceof ProblemFetchError ? error.kind : 'network';
  if (kind === 'parse') {
    return '문제 내용을 읽지 못했습니다. 백준 페이지 구조가 바뀌었을 수 있습니다.';
  }
  if (kind === 'status') return '백준에서 문제를 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
  return '백준에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
}
