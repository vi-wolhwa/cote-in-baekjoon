/**
 * '입출력 형식' card above the editor (#114, ADR-0006). Collapsed it shows the signature (and
 * a badge when the format was inferred or is the user's own); open, it edits the format as a
 * table, validates it against the samples on every change, saves or resets it, and links to
 * a prefilled issue to report a wrong format.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Problem } from '@/boj/problem';
import { formatToJson, sameFormat, type Format } from '@/solution/dsl';
import { signature, TEMPLATE } from '@/solution/edit';
import { SOURCE_LABELS, type FormatSource } from '@/solution/source';
import { fromTable, tableErrors, toTable } from '@/solution/table';
import { validateFormat } from '@/solution/validate';
import { describeBrowser, issueUrl } from '@/shared/report';
import { FormatForm } from './FormatForm';
import { FormatStatus } from './FormatStatus';

interface Props {
  problem: Pick<Problem, 'id' | 'samples' | 'sections'>;
  format?: Format;
  source?: FormatSource;
  /** Reasons a saved format stopped passing the samples. */
  savedInvalid?: string[];
  open: boolean;
  onOpen: (open: boolean) => void;
  onSave: (format: Format) => Promise<void>;
  onReset: () => Promise<void>;
}

/** Sources worth a badge: an inferred format may be wrong, a user format can be reset. */
const BADGE_SOURCES: readonly FormatSource[] = ['inferred', 'user'];

function reportUrl(problemId: number, format: Format, source: FormatSource | undefined): string {
  return issueUrl('format', {
    version: browser.runtime.getManifest().version,
    browser: describeBrowser(navigator),
    problemId,
    format: formatToJson(format, true),
    ...(source ? { formatSource: SOURCE_LABELS[source] } : {}),
  });
}

export function FormatCard(props: Props) {
  const { problem, format, source, open } = props;
  const initial = () => toTable(format ?? TEMPLATE);
  const [table, setTable] = useState(initial);
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);

  // A new format from outside (saved, reset, another problem): start editing from it.
  useEffect(() => setTable(initial()), [format && formatToJson(format)]);

  const errors = tableErrors(table);
  const validation = useMemo(
    () => (errors.length ? undefined : validateFormat(fromTable(table), problem.samples)),
    [table, problem.samples],
  );
  const reasons = errors.length ? errors : validation && !validation.ok ? validation.reasons : [];
  const draft = validation?.ok ? validation.format : undefined;
  // A saved format that stopped fitting, then (while editing) what the draft gets wrong.
  const warnings = [
    ...(props.savedInvalid
      ? [`저장한 형식이 예제와 맞지 않아 쓰지 않았어요: ${props.savedInvalid[0] ?? ''}`]
      : []),
    ...(open ? reasons : []),
  ];
  const changed =
    draft !== undefined && (!format || source !== 'user' || !sameFormat(draft, format));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    await props.onSave(draft);
    setBusy(false);
    setStatus('형식을 저장했어요. 이 문제는 이제 이 형식으로 풀어요.');
  };

  const reset = async () => {
    setBusy(true);
    await props.onReset();
    setBusy(false);
    setStatus('저장한 형식을 지웠어요.');
  };

  return (
    <section class={`format-card${open ? ' is-open' : ''}`} aria-label="입출력 형식">
      <div class="format-head">
        <button
          type="button"
          class="format-toggle"
          aria-expanded={open}
          onClick={() => props.onOpen(!open)}
        >
          <span class="format-chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          입출력 형식
        </button>
        {source && BADGE_SOURCES.includes(source) && (
          <span class={`format-badge is-${source}`} data-testid="format-source">
            {SOURCE_LABELS[source]}
          </span>
        )}
        <code class="format-signature">{format ? signature(format) : '형식 없음'}</code>
        {(open || warnings.length > 0) && (
          <FormatStatus
            messages={warnings}
            okText={`예제 ${problem.samples.length}개를 모두 이 형식으로 읽고 다시 쓸 수 있어요.`}
          />
        )}
      </div>
      {open && (
        <div class="format-body">
          {source === 'inferred' && (
            <p class="format-note">
              예제와 문제 설명으로 추론한 형식이에요. 틀렸다면 고쳐서 저장해 주세요.
            </p>
          )}
          <FormatForm table={table} onChange={setTable} />
          <div class="format-actions">
            <button
              type="button"
              class="out-button is-primary"
              disabled={!changed || busy}
              onClick={() => void save()}
            >
              저장
            </button>
            {source === 'user' && (
              <button type="button" class="out-button" disabled={busy} onClick={() => void reset()}>
                형식 초기화
              </button>
            )}
            {problem.id > 0 && format && (
              <a
                class="out-button"
                href={reportUrl(problem.id, format, source)}
                target="_blank"
                rel="noopener noreferrer"
                title="문제 번호와 형식만 담은 이슈를 엽니다. 코드와 문제 본문은 보내지 않습니다."
              >
                형식 오류 신고
              </a>
            )}
          </div>
          {status && (
            <p class="format-status" role="status">
              {status}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
