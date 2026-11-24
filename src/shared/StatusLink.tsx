/**
 * "채점 현황 보기": opens Baekjoon's status page for a finished submission in a new tab, so the
 * user can check it there (2026-11-24 product owner request). A plain link: the browser opens
 * it only when the user clicks.
 */
import { useEffect, useState } from 'preact/hooks';
import { judgeStatusUrl, loadHandle } from './handle';

interface Props {
  problemId: number;
  solutionId?: number;
  class?: string;
}

export function StatusLink({ problemId, solutionId, class: className }: Props) {
  const [handle, setHandle] = useState<string>();
  useEffect(() => {
    let active = true;
    void loadHandle().then((h) => active && setHandle(h));
    return () => {
      active = false;
    };
  }, []);
  return (
    <a
      class={className ?? 'status-link'}
      href={judgeStatusUrl(problemId, solutionId, handle)}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="status-link"
    >
      채점 현황 보기 ↗
    </a>
  );
}
