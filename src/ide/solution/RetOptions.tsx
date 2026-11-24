/**
 * The format editor's return value options (#114): how the value is printed, and per case a
 * label ("Case #{i}: ") and a blank line after the case's output.
 */
import type { RetSpec, RetType } from '@/solution/dsl';

/** Allowed errors offered for real answers: 10^-2 … 10^-12. */
const TOL_EXPONENTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Options that make sense for a new return type, keeping what still applies. */
export function defaultRet(type: RetType, old: RetSpec): RetSpec {
  const kept: Pick<RetSpec, 'label' | 'blank'> = {
    ...(old.label !== undefined ? { label: old.label } : {}),
    ...(old.blank ? { blank: true } : {}),
  };
  return { ...printing(type, old), ...kept };
}

function printing(type: RetType, old: RetSpec): RetSpec {
  if (type === 'bool') return { type, yes: old.yes ?? 'YES', no: old.no ?? 'NO' };
  if (type === 'double') {
    return { type, digits: old.digits ?? 6, ...(old.tol !== undefined ? { tol: old.tol } : {}) };
  }
  if (type === 'line[]') return { type };
  if (type.endsWith('[][]')) return { type, ...(type === 'char[][]' ? {} : { sep: ' ' }) };
  if (type.endsWith('[]')) return { type, sep: old.sep === '\n' ? '\n' : ' ' };
  return { type };
}

export function RetOptions({ ret, onChange }: { ret: RetSpec; onChange: (r: RetSpec) => void }) {
  if (ret.type === 'bool') {
    return (
      <span class="format-ret-options">
        참
        <input
          type="text"
          aria-label="참일 때 출력"
          value={ret.yes ?? ''}
          onInput={(e) => onChange({ ...ret, yes: e.currentTarget.value })}
        />
        거짓
        <input
          type="text"
          aria-label="거짓일 때 출력"
          value={ret.no ?? ''}
          onInput={(e) => onChange({ ...ret, no: e.currentTarget.value })}
        />
      </span>
    );
  }
  if (ret.type === 'double') {
    return (
      <span class="format-ret-options">
        소수
        <input
          type="number"
          min={0}
          max={15}
          aria-label="소수 자리 수"
          value={ret.digits ?? 6}
          onInput={(e) => onChange({ ...ret, digits: Number(e.currentTarget.value) })}
        />
        자리
        <select
          aria-label="허용 오차"
          value={ret.tol === undefined ? '' : String(Math.round(-Math.log10(ret.tol)))}
          onChange={(e) => {
            const k = e.currentTarget.value;
            const next: RetSpec = { ...ret };
            if (k === '') delete next.tol;
            else next.tol = 10 ** -Number(k);
            onChange(next);
          }}
        >
          <option value="">오차 없이 같아야 함</option>
          {TOL_EXPONENTS.map((k) => (
            <option key={k} value={String(k)}>
              오차 10^-{k}까지 허용
            </option>
          ))}
        </select>
      </span>
    );
  }
  if (ret.type === 'line[]') return <span class="format-where">원소마다 한 줄씩 그대로 출력</span>;
  if (!ret.type.endsWith('[]')) return <span class="format-where">한 줄에 출력</span>;
  const grid = ret.type.endsWith('[][]');
  const sep = ret.sep ?? (ret.type === 'char[][]' ? '' : ' ');
  return (
    <select
      aria-label="구분자"
      value={sep === '\n' ? 'newline' : sep === '' ? 'none' : 'space'}
      onChange={(e) => {
        const v = e.currentTarget.value;
        onChange({ ...ret, sep: v === 'newline' ? '\n' : v === 'none' ? '' : ' ' });
      }}
    >
      <option value="space">{grid ? '행마다 한 줄, 열 사이 공백' : '한 줄에 공백으로 구분'}</option>
      {grid ? (
        <option value="none">행마다 한 줄, 열 사이 없음</option>
      ) : (
        <option value="newline">한 줄에 하나씩</option>
      )}
    </select>
  );
}

/** A label's trailing newline is shown and typed as the two characters `\n`. */
export const labelText = (label: string | undefined) => (label ?? '').replace(/\n$/, '\\n');
export const labelFromText = (text: string) => text.replace(/\\n$/, '\n');

/** Per-case output: a label before each case (only with several cases) and a blank line after. */
export function CaseOutputOptions(props: {
  ret: RetSpec;
  cases: boolean;
  onChange: (r: RetSpec) => void;
}) {
  const { ret, onChange } = props;
  return (
    <span class="format-ret-options">
      {props.cases && (
        <>
          케이스 머리말
          <input
            type="text"
            class="format-label"
            aria-label="케이스 머리말"
            placeholder="Case #{i}: "
            title="케이스마다 출력 앞에 붙는 말이에요. {i} 자리에 케이스 번호가 들어가요. 끝에 \n을 쓰면 머리말 다음 줄부터 출력해요"
            spellcheck={false}
            value={labelText(ret.label)}
            onInput={(e) => {
              const text = e.currentTarget.value;
              const next: RetSpec = { ...ret };
              if (text === '') delete next.label;
              else next.label = labelFromText(text);
              onChange(next);
            }}
          />
        </>
      )}
      <label class="format-check">
        <input
          type="checkbox"
          checked={ret.blank === true}
          onChange={(e) => {
            const next: RetSpec = { ...ret };
            if (e.currentTarget.checked) next.blank = true;
            else delete next.blank;
            onChange(next);
          }}
        />
        케이스 뒤 빈 줄
      </label>
    </span>
  );
}
