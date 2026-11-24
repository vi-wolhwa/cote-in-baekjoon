/**
 * One submission in the 제출 기록 tab (ADR-0012, ide-spec §7.3): its result and numbers on
 * top, '편집기로 불러오기', copy and Baekjoon's page as actions, and the code below with the
 * editor's colours. The code is read from the submission's Baekjoon source page when the view
 * opens (your own always, someone else's when they shared it).
 */
import { useEffect, useState } from 'preact/hooks';
import { sourceUrl, userUrl } from '@/shared/status-page';
import type { Theme } from '@/shared/theme';
import { ChevronIcon, CopyIcon, ExternalIcon, ImportIcon } from '../icons';
import { Spinner } from '../submit';
import { CodeView } from './CodeView';
import { fullTime, relativeTime } from './format';
import { submitLanguageOfName, syntaxOfName } from './languages';
import type { RecordRow } from './merge';
import { ResultChip } from './result';
import type { LoadableCode } from './useHistoryLoad';
import { requestSource } from './useStatusList';

interface Props {
  row: RecordRow;
  theme: Theme;
  now: number;
  /** Shows whose code it is (other people's submissions). */
  showUser: boolean;
  onBack: () => void;
  onLoad: (code: LoadableCode) => void;
}

type Code =
  { kind: 'loading' } | { kind: 'ready'; code: string } | { kind: 'error'; message: string };

export function SourceView({ row, theme, now, showUser, onBack, onLoad }: Props) {
  const [code, setCode] = useState<Code>({ kind: 'loading' });
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    let live = true;
    void requestSource(row.solutionId).then((r) => {
      if (!live) return;
      setCode('code' in r ? { kind: 'ready', code: r.code } : { kind: 'error', message: r.error });
    });
    return () => {
      live = false;
    };
  }, [row.solutionId]);

  // Baekjoon's language name decides the editor language (node.js → JavaScript, …).
  const language = submitLanguageOfName(row.language);
  const syntax = syntaxOfName(row.language);
  const loadable: LoadableCode | undefined =
    language && code.kind === 'ready' ? { language, code: code.code } : undefined;

  const copy = async () => {
    if (code.kind !== 'ready') return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  const stats: [string, string][] = [
    ['메모리', row.memoryKb !== undefined ? `${row.memoryKb.toLocaleString()} KB` : '—'],
    ['시간', row.timeMs !== undefined ? `${row.timeMs.toLocaleString()} ms` : '—'],
    ['코드 길이', row.codeLength !== undefined ? `${row.codeLength.toLocaleString()} B` : '—'],
    ['제출', row.submittedAt !== undefined ? relativeTime(row.submittedAt, now) : '—'],
  ];

  return (
    <div class="source-view" data-testid="history-detail">
      <div class="source-top">
        <button
          type="button"
          class="icon-button"
          aria-label="목록으로"
          title="목록으로"
          onClick={onBack}
        >
          <ChevronIcon left />
        </button>
        <div class="source-title">
          <ResultChip code={row.resultCode} text={row.resultText} />
          <span class="source-lang">{row.language}</span>
          {showUser && row.username && (
            <a
              class="source-user user-link"
              href={userUrl(row.username)}
              target="_blank"
              rel="noopener noreferrer"
              title={`${row.username}의 백준 페이지`}
            >
              {row.username}
            </a>
          )}
        </div>
        <div class="source-actions">
          {loadable && (
            <button
              type="button"
              class="source-button is-primary"
              onClick={() => onLoad(loadable)}
              title="이 코드를 편집기에 넣어요"
            >
              <ImportIcon size={14} />
              편집기로 불러오기
            </button>
          )}
          <button
            type="button"
            class="source-button"
            disabled={code.kind !== 'ready'}
            onClick={() => void copy()}
          >
            <CopyIcon size={14} />
            {copied === 'done' ? '복사했어요' : '복사'}
          </button>
          {row.solutionId !== undefined && (
            <a
              class="icon-button"
              href={sourceUrl(row.solutionId)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="백준에서 보기"
              title="백준에서 보기"
            >
              <ExternalIcon />
            </a>
          )}
        </div>
      </div>
      <dl class="source-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd title={label === '제출' && row.submittedAt ? fullTime(row.submittedAt) : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {copied === 'failed' && (
        <p class="history-note" role="status">
          복사하지 못했어요. 코드를 드래그해 선택한 뒤 Ctrl+C로 복사해 주세요.
        </p>
      )}
      <div class="source-code">
        {code.kind === 'loading' && (
          <p class="out-busy history-busy" role="status">
            <Spinner />
            백준에서 코드를 불러오는 중
          </p>
        )}
        {code.kind === 'error' && (
          <p class="history-error" role="alert">
            {code.message}
          </p>
        )}
        {code.kind === 'ready' && <CodeView code={code.code} syntax={syntax} theme={theme} />}
      </div>
    </div>
  );
}
