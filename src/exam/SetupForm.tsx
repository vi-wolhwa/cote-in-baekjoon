/**
 * '모의 시험' setup form (ADR-0005): one component for the popup's '모의 시험' tab and the
 * full page `exam.html#setup` the Baekjoon menu opens. Styles: setup-form.css, coloured by
 * the `--xf-*` variables each page defines.
 */
import { useState } from 'preact/hooks';
import {
  isMinutes,
  MAX_COUNT,
  MAX_MINUTES,
  MIN_COUNT,
  MIN_MINUTES,
  MINUTE_PRESETS,
  toggleTier,
  type ExamDraft,
  type Exam,
} from './model';
import { TAG_CHIPS, TIER_GROUPS } from './solvedac';
import { startExam, type StartOptions, type StartResult } from './start';

export interface SetupFormProps {
  initial: ExamDraft;
  /** The logged-in Baekjoon id, if a Baekjoon page told us. */
  handle?: string;
  /** Problem number that must be in the exam. */
  include?: number;
  onDraft: (draft: ExamDraft) => void;
  onStarted: (exam: Exam) => void;
  /** Replaced in tests. */
  start?: (options: StartOptions) => Promise<StartResult>;
}

export function SetupForm(props: SetupFormProps) {
  const { handle, include } = props;
  const [draft, setDraft] = useState<ExamDraft>(props.initial);
  const [showMore, setShowMore] = useState(() =>
    props.initial.tags.some((id) => TAG_CHIPS.find((t) => t.id === id)?.more),
  );
  const [minutesText, setMinutesText] = useState(String(props.initial.minutes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const update = (next: ExamDraft) => {
    setDraft(next);
    setError(undefined);
    props.onDraft(next);
  };

  const customValid = !draft.customMinutes || isMinutes(Number(minutesText));
  const excludeOn = draft.excludeSolved && handle !== undefined;

  // permissions.request() needs the click: start() is called before any await.
  const onStart = () => {
    if (busy || !customValid) return;
    setBusy(true);
    setError(undefined);
    const start = props.start ?? startExam;
    void start({
      draft: { ...draft, excludeSolved: excludeOn },
      ...(handle ? { handle } : {}),
      ...(include ? { include } : {}),
    }).then(
      (result) => {
        setBusy(false);
        if (result.ok) props.onStarted(result.exam);
        else setError(result.reason);
      },
      () => {
        setBusy(false);
        setError('시험을 만들지 못했어요. 다시 시도해 주세요.');
      },
    );
  };

  const tags = TAG_CHIPS.filter((t) => showMore || !t.more || draft.tags.includes(t.id));
  return (
    <div class="xf">
      {include && (
        <p class="xf-include" data-testid="include">
          <strong>{include}번</strong> 문제를 넣고 나머지를 골라요.
        </p>
      )}

      <section class="xf-card" aria-labelledby="xf-tier-title">
        <h2 id="xf-tier-title" class="xf-title">
          난이도
        </h2>
        <div class="xf-chips" role="group" aria-labelledby="xf-tier-title">
          {TIER_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              class={`xf-chip tier-${g.id}`}
              aria-pressed={draft.tiers.includes(g.id)}
              onClick={() => update({ ...draft, tiers: toggleTier(draft.tiers, g.id) })}
            >
              {g.label}
            </button>
          ))}
        </div>
      </section>

      <section class="xf-card" aria-labelledby="xf-tag-title">
        <h2 id="xf-tag-title" class="xf-title">
          알고리즘 <span class="xf-sub">(선택 안 하면 전체)</span>
        </h2>
        <div class="xf-chips" role="group" aria-labelledby="xf-tag-title">
          {tags.map((t) => {
            const on = draft.tags.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                class="xf-chip"
                aria-pressed={on}
                onClick={() =>
                  update({
                    ...draft,
                    tags: on ? draft.tags.filter((id) => id !== t.id) : [...draft.tags, t.id],
                  })
                }
              >
                {t.label}
              </button>
            );
          })}
          <button
            type="button"
            class="xf-chip xf-more"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? '접기' : '+ 더보기'}
          </button>
        </div>
      </section>

      <section class="xf-card xf-rows" aria-label="시험 설정">
        <div class="xf-row">
          <span class="xf-label" id="xf-count-label">
            문제 수
          </span>
          <div class="xf-stepper" role="group" aria-labelledby="xf-count-label">
            <button
              type="button"
              aria-label="문제 수 줄이기"
              disabled={draft.count <= MIN_COUNT}
              onClick={() => update({ ...draft, count: draft.count - 1 })}
            >
              −
            </button>
            <output aria-live="polite" data-testid="count">
              {draft.count}
            </output>
            <button
              type="button"
              aria-label="문제 수 늘리기"
              disabled={draft.count >= MAX_COUNT}
              onClick={() => update({ ...draft, count: draft.count + 1 })}
            >
              +
            </button>
          </div>
        </div>

        <div class="xf-row xf-row-wrap">
          <span class="xf-label" id="xf-time-label">
            제한 시간
          </span>
          <div class="xf-chips" role="group" aria-labelledby="xf-time-label">
            {MINUTE_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                class="xf-chip"
                aria-pressed={!draft.customMinutes && draft.minutes === m}
                onClick={() => {
                  setMinutesText(String(m));
                  update({ ...draft, minutes: m, customMinutes: false });
                }}
              >
                {m}분
              </button>
            ))}
            <button
              type="button"
              class="xf-chip"
              aria-pressed={draft.customMinutes}
              onClick={() => update({ ...draft, customMinutes: true })}
            >
              직접
            </button>
          </div>
        </div>
        {draft.customMinutes && (
          <div class="xf-row">
            <label class="xf-label" for="xf-minutes">
              직접 입력
            </label>
            <span class="xf-minutes">
              <input
                id="xf-minutes"
                type="number"
                inputMode="numeric"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                value={minutesText}
                aria-invalid={customValid ? undefined : 'true'}
                aria-describedby="xf-minutes-help"
                onInput={(e) => {
                  const text = e.currentTarget.value;
                  setMinutesText(text);
                  const n = Number(text);
                  if (isMinutes(n)) update({ ...draft, minutes: n, customMinutes: true });
                }}
              />
              분
            </span>
          </div>
        )}
        {draft.customMinutes && (
          <p id="xf-minutes-help" class={customValid ? 'xf-note' : 'xf-error'}>
            {MIN_MINUTES}분부터 {MAX_MINUTES}분까지 정할 수 있어요.
          </p>
        )}

        <div class="xf-row">
          <span class="xf-label" id="xf-exclude-label">
            이미 푼 문제 빼기
            {handle && <span class="xf-handle"> @{handle}</span>}
          </span>
          <button
            type="button"
            role="switch"
            class="xf-switch"
            aria-checked={excludeOn}
            aria-labelledby="xf-exclude-label"
            aria-describedby={handle ? undefined : 'xf-exclude-help'}
            disabled={!handle}
            onClick={() => update({ ...draft, excludeSolved: !draft.excludeSolved })}
          >
            <span class="xf-knob" />
          </button>
        </div>
        {!handle && (
          <p id="xf-exclude-help" class="xf-note">
            백준 아이디를 몰라서 끌 수만 있어요. 백준에 로그인한 채로 백준 문제 페이지를 한 번 열어
            주세요.
          </p>
        )}
      </section>

      <button
        type="button"
        class="xf-start"
        disabled={busy || !customValid}
        aria-busy={busy}
        onClick={onStart}
      >
        {busy ? '문제를 고르는 중…' : '시험 시작'}
      </button>
      {error && (
        <p class="xf-error xf-start-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
