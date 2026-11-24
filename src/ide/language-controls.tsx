/**
 * Language controls shared by the practice IDE and the mock exam (ADR-0007): the language
 * select, grouped into languages that run in the browser and submit-only ones, and the
 * '코드 실행' button, which submit-only languages cannot use.
 */
import {
  LANGUAGE_GROUPS,
  runsInBrowser,
  SUBMIT_ONLY_REASON,
  type LanguageId,
} from '@/shared/languages';

export function LanguageSelect(props: {
  value: LanguageId;
  disabled: boolean;
  onChange: (language: LanguageId) => void;
}) {
  return (
    <select
      class="language"
      value={props.value}
      aria-label="언어"
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.currentTarget.value as LanguageId)}
    >
      {LANGUAGE_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.languages.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** '코드 실행', or '실행 중지' while running. Disabled, with the reason, for submit-only languages. */
export function RunButton(props: {
  language: LanguageId;
  running: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
  if (props.running) {
    return (
      <button type="button" class="btn btn-dark" onClick={props.onStop}>
        실행 중지
      </button>
    );
  }
  const runnable = runsInBrowser(props.language);
  return (
    <button
      type="button"
      class="btn btn-dark"
      disabled={!runnable}
      title={runnable ? undefined : SUBMIT_ONLY_REASON}
      onClick={props.onRun}
    >
      코드 실행
    </button>
  );
}

/** Shown on the run tab of a submit-only language. */
export function SubmitOnlyNote({ language }: { language: LanguageId }) {
  if (runsInBrowser(language)) return null;
  return (
    <p class="out-note" data-testid="run-unavailable">
      {SUBMIT_ONLY_REASON}
    </p>
  );
}
