/**
 * '입출력 형식' card above the editor (#114, ADR-0006). Collapsed it shows the signature and
 * where the format came from; open, it edits the parameters and the return value (or the
 * JSON), validates against the samples on every change, and saves, resets, pastes, copies an
 * AI prompt or proposes the format.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Problem } from '@/boj/problem';
import { checkFormat, formatToJson, sameFormat, type Format } from '@/solution/dsl';
import { signature, TEMPLATE } from '@/solution/edit';
import { buildPrompt, extractJson, formatProposalUrl } from '@/solution/prompt';
import { SOURCE_LABELS, type FormatSource } from '@/solution/source';
import { validateFormat } from '@/solution/validate';
import { copyText } from './clipboard';
import { FormatForm } from './FormatForm';

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

type Parsed = { ok: true; value: unknown } | { ok: false; error: string };

function parse(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'JSON 문법이 맞지 않아요. 중괄호, 쉼표, 따옴표를 확인해 주세요.' };
  }
}

export function FormatCard(props: Props) {
  const { problem, format, source, open } = props;
  const initial = () => formatToJson(format ?? TEMPLATE, true);
  const [text, setText] = useState(initial);
  const [json, setJson] = useState(false);
  const [paste, setPaste] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);

  // A new format from outside (saved, reset, another problem): start editing from it.
  useEffect(() => setText(initial()), [format && formatToJson(format)]);

  const parsed = useMemo(() => parse(text), [text]);
  const checked = parsed.ok ? checkFormat(parsed.value) : undefined;
  const validation = useMemo(
    () => (parsed.ok ? validateFormat(parsed.value, problem.samples) : undefined),
    [text, problem.samples],
  );
  const reasons = !parsed.ok
    ? [parsed.error]
    : validation && !validation.ok
      ? validation.reasons
      : [];
  const draft = validation?.ok ? validation.format : undefined;
  const changed =
    draft !== undefined && (!format || source !== 'user' || !sameFormat(draft, format));

  const update = (next: Format) => setText(formatToJson(next, true));
  const say = (message: string) => setStatus(message);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    await props.onSave(draft);
    setBusy(false);
    say('형식을 저장했어요. 이 문제는 이제 이 형식으로 풀어요.');
  };

  const reset = async () => {
    setBusy(true);
    await props.onReset();
    setBusy(false);
    say('저장한 형식을 지웠어요.');
  };

  const copyPrompt = async () => {
    const ok = await copyText(buildPrompt(problem));
    say(
      ok
        ? '프롬프트를 복사했어요. AI의 답(JSON)을 받으면 형식 붙여넣기로 넣어 주세요.'
        : '복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요.',
    );
  };

  const applyPaste = () => {
    try {
      const value = extractJson(paste ?? '');
      const r = checkFormat(value);
      setText(r.ok ? formatToJson(r.format, true) : JSON.stringify(value, null, 2));
      setPaste(undefined);
      say('붙여 넣은 형식을 편집기에 넣었어요. 확인한 뒤 저장해 주세요.');
    } catch (e) {
      say((e as Error).message);
    }
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
        {source && (
          <span class={`format-badge is-${source}`} data-testid="format-source">
            {SOURCE_LABELS[source]}
          </span>
        )}
        <code class="format-signature">{format ? signature(format) : '형식 없음'}</code>
      </div>
      {open && (
        <div class="format-body">
          {props.savedInvalid && (
            <p class="format-warn" role="alert">
              저장한 형식이 예제와 맞지 않아 쓰지 않았어요: {props.savedInvalid[0]}
            </p>
          )}
          {source === 'inferred' && (
            <p class="format-note">
              예제와 문제 설명으로 추론한 형식이에요. 틀렸다면 고쳐서 저장해 주세요.
            </p>
          )}
          {reasons.length > 0 ? (
            <ul class="format-errors" role="alert" data-testid="format-errors">
              {reasons.slice(0, 5).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p class="format-ok" data-testid="format-ok">
              예제 {problem.samples.length}개를 모두 이 형식으로 읽고 다시 쓸 수 있어요.
            </p>
          )}
          <div class="format-tabs" role="tablist" aria-label="편집 방식">
            <button type="button" role="tab" aria-selected={!json} onClick={() => setJson(false)}>
              표로 편집
            </button>
            <button type="button" role="tab" aria-selected={json} onClick={() => setJson(true)}>
              JSON으로 편집
            </button>
          </div>
          {json || !checked?.ok ? (
            <textarea
              class="format-json"
              aria-label="입출력 형식 JSON"
              spellcheck={false}
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          ) : (
            <FormatForm format={checked.format} onChange={update} />
          )}
          {!json && !checked?.ok && (
            <p class="format-note">JSON을 고치면 표 편집으로 돌아갈 수 있어요.</p>
          )}
          {paste !== undefined && (
            <div class="format-paste">
              <textarea
                aria-label="붙여 넣을 형식"
                placeholder="AI의 답이나 형식 JSON을 붙여 넣으세요."
                value={paste}
                onInput={(e) => setPaste(e.currentTarget.value)}
              />
              <button type="button" class="out-button is-primary" onClick={applyPaste}>
                적용
              </button>
              <button type="button" class="out-button" onClick={() => setPaste(undefined)}>
                취소
              </button>
            </div>
          )}
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
            <button type="button" class="out-button" onClick={() => setPaste('')}>
              형식 붙여넣기
            </button>
            <button type="button" class="out-button" onClick={() => void copyPrompt()}>
              AI에게 물어볼 프롬프트 복사
            </button>
            {problem.id > 0 && draft && (
              <a
                class="out-button"
                href={formatProposalUrl(problem.id, draft)}
                target="_blank"
                rel="noopener noreferrer"
                title="문제 번호와 형식만 담은 이슈를 엽니다. 코드와 문제 본문은 보내지 않습니다."
              >
                형식 제안
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
