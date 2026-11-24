/**
 * '제출 기록' tab of the problem pane (M7, ADR-0012, ide-spec §7.3): this problem's
 * submissions made through the extension, newest first, and on request one page of the
 * user's Baekjoon status list. Selecting a submission shows its code read-only with
 * '편집기로 불러오기' and '코드 복사'.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { languageInfo } from '@/shared/languages';
import { StatusLink } from '@/shared/StatusLink';
import { HISTORY_LIMIT, watchHistory, type HistoryEntry } from '@/shared/submission-history';
import { BojSection } from './BojSection';
import { absoluteTime, metricsText, relativeTime } from './format';
import { ResultBadge, useNow } from './parts';

interface Props {
  problemId: number;
  /** '편집기로 불러오기'; the IDE asks before replacing code. */
  onLoad: (entry: HistoryEntry) => void;
}

export function HistoryPane({ problemId, onLoad }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>();
  const [selected, setSelected] = useState<number>();
  const now = useNow();

  useEffect(() => watchHistory(problemId, setEntries), [problemId]);

  const entry = entries?.find((e) => e.submittedAt === selected);
  if (entry) {
    return <HistoryDetail entry={entry} onBack={() => setSelected(undefined)} onLoad={onLoad} />;
  }
  return (
    <div class="history" data-testid="history">
      <section class="history-section">
        <div class="history-head">
          <h4>풀이 화면에서 낸 제출</h4>
          {entries && entries.length > 0 && <span class="history-count">{entries.length}개</span>}
        </div>
        {entries?.length === 0 && (
          <p class="history-note">
            아직 이 화면에서 제출한 기록이 없어요. 제출하기를 누르면 코드와 채점 결과가 여기에
            쌓여요.
          </p>
        )}
        {entries && entries.length > 0 && (
          <ul class="history-list" aria-label="풀이 화면에서 낸 제출">
            {entries.map((e) => (
              <li key={e.submittedAt}>
                <button
                  type="button"
                  class="history-item"
                  data-testid="history-item"
                  onClick={() => setSelected(e.submittedAt)}
                >
                  <ResultBadge
                    code={e.result?.resultCode}
                    text={e.result?.resultText ?? '결과 없음'}
                  />
                  <span class="history-lang">{languageInfo(e.language).label}</span>
                  <span class="history-metrics">{e.result ? metricsText(e.result) : ''}</span>
                  <time class="history-time" title={absoluteTime(e.submittedAt)}>
                    {relativeTime(e.submittedAt, now)}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p class="history-note">
          이 브라우저에만 저장하고, 문제마다 최근 {HISTORY_LIMIT}개까지 남겨요.
        </p>
      </section>
      <BojSection problemId={problemId} now={now} />
    </div>
  );
}

function HistoryDetail({
  entry,
  onBack,
  onLoad,
}: {
  entry: HistoryEntry;
  onBack: () => void;
  onLoad: (entry: HistoryEntry) => void;
}) {
  const code = entry.fnCode ?? entry.code;
  const pre = useRef<HTMLPreElement>(null);
  const [copy, setCopy] = useState<'idle' | 'done' | 'selected'>('idle');
  const metrics = entry.result ? metricsText(entry.result) : '';

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopy('done');
    } catch {
      // Clipboard blocked in the frame: select the code so Ctrl+C works.
      const el = pre.current;
      const selection = el ? window.getSelection() : null;
      if (el && selection) {
        selection.selectAllChildren(el);
        setCopy(document.execCommand('copy') ? 'done' : 'selected');
      }
    }
  };

  return (
    <div class="history history-detail" data-testid="history-detail">
      <button type="button" class="history-back" onClick={onBack}>
        ← 제출 기록
      </button>
      <div class="history-detail-head">
        <ResultBadge
          code={entry.result?.resultCode}
          text={entry.result?.resultText ?? '결과 없음'}
        />
        <span class="history-lang">{languageInfo(entry.language).label}</span>
        {metrics && <span class="history-metrics">{metrics}</span>}
        <time class="history-time">{absoluteTime(entry.submittedAt)}</time>
      </div>
      {entry.result?.solutionId !== undefined && (
        <p class="history-note">
          제출 번호 {entry.result.solutionId}{' '}
          <StatusLink problemId={entry.problemId} solutionId={entry.result.solutionId} />
        </p>
      )}
      {!entry.result && (
        <p class="history-note">
          채점 결과를 받지 못한 제출이에요. 제출이 취소됐거나 결과를 읽기 전에 제출 탭이 닫혔을 수
          있어요.
        </p>
      )}
      <div class="history-actions">
        <button type="button" class="out-button is-primary" onClick={() => onLoad(entry)}>
          편집기로 불러오기
        </button>
        <button type="button" class="out-button" onClick={() => void copyCode()}>
          {copy === 'done' ? '복사했어요' : '코드 복사'}
        </button>
        {copy === 'selected' && (
          <span class="history-note" role="status">
            코드를 선택했어요. Ctrl+C로 복사해 주세요.
          </span>
        )}
      </div>
      {entry.fnCode !== undefined && <p class="history-note">solution 함수로 제출한 코드예요.</p>}
      <pre class="history-code no-mathjax" ref={pre} data-testid="history-code">
        {code}
      </pre>
    </div>
  );
}
