/**
 * '포함할 문제 (선택)' card of the setup form: problem numbers as removable chips and a
 * number field with '추가' (Enter adds too). Adding stops when the list reaches 문제 수
 * (includes.ts). Styles: setup-form.css.
 */
import { useState } from 'preact/hooks';
import { FULL_MESSAGE, isIncludeFull, parseIncludeInput } from './includes';

export function IncludeCard({
  included,
  count,
  onChange,
}: {
  included: readonly number[];
  count: number;
  onChange: (included: number[]) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const full = isIncludeFull(included, count);

  const add = () => {
    const parsed = parseIncludeInput(text, included, count);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setError(undefined);
    setText('');
    onChange([...included, parsed.id]);
  };

  return (
    <section class="xf-card" aria-labelledby="xf-include-title" data-testid="include-card">
      <h2 id="xf-include-title" class="xf-title">
        포함할 문제 <span class="xf-sub">(선택)</span>
      </h2>
      {included.length > 0 && (
        <ul class="xf-chips xf-included" aria-label="포함할 문제 목록">
          {included.map((id) => (
            <li key={id}>
              <button
                type="button"
                class="xf-chip xf-included-chip"
                aria-label={`${id}번 빼기`}
                data-testid="included"
                onClick={() => {
                  setError(undefined);
                  onChange(included.filter((x) => x !== id));
                }}
              >
                {id}번 <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        class="xf-add"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="문제 번호"
          aria-label="포함할 문제 번호"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby="xf-include-help"
          value={text}
          disabled={full}
          onInput={(e) => {
            setText(e.currentTarget.value);
            setError(undefined);
          }}
        />
        <button type="submit" class="xf-chip xf-add-button" disabled={full}>
          추가
        </button>
      </form>
      {/* A full list explains itself; an older error about a typed number no longer applies. */}
      <p
        id="xf-include-help"
        class={error && !full ? 'xf-error' : 'xf-note'}
        role={error && !full ? 'alert' : undefined}
      >
        {full
          ? FULL_MESSAGE
          : (error ??
            '넣은 문제는 난이도·알고리즘과 관계없이 꼭 나와요. 나머지는 조건대로 골라요.')}
      </p>
    </section>
  );
}
