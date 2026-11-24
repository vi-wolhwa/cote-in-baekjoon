/**
 * Left pane of the practice IDE: '문제 설명' and '제출 기록' tabs (ide-spec §7, §7.3). The
 * statement stays mounted while the history shows, so its translation and math survive.
 */
import { useState } from 'preact/hooks';
import type { Problem } from '@/boj/problem';
import type { HistoryEntry } from '@/shared/submission-history';
import type { Format } from '@/solution/dsl';
import { HistoryPane } from './history/HistoryPane';
import { ProblemPane } from './ProblemPane';

type Tab = 'problem' | 'history';

export function LeftPane(props: {
  problem: Problem;
  format: Format | undefined;
  onLoad: (entry: HistoryEntry) => void;
}) {
  const [tab, setTab] = useState<Tab>('problem');
  // The demo problem (id 0) has nothing to submit, so no history either.
  const history = props.problem.id > 0;
  return (
    <div class="left-pane">
      <div class="output-tabs left-tabs" role="tablist" aria-label="문제 영역">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'problem'}
          onClick={() => setTab('problem')}
        >
          문제 설명
        </button>
        {history && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
          >
            제출 기록
          </button>
        )}
      </div>
      <div class="left-body" role="tabpanel" hidden={tab !== 'problem'}>
        <ProblemPane problem={props.problem} format={props.format} label={false} />
      </div>
      {history && tab === 'history' && (
        <div class="left-body" role="tabpanel">
          <HistoryPane problemId={props.problem.id} onLoad={props.onLoad} />
        </div>
      )}
    </div>
  );
}
