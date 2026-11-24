/**
 * The table view of the format editor: each parameter's name, type and where it is read,
 * and the return value's type and output options. Line layout and case loops are edited
 * as JSON; this view keeps every reference when a parameter is renamed.
 */
import { useState } from 'preact/hooks';
import {
  PARAM_TYPES,
  RET_TYPES,
  type Format,
  type ParamType,
  type RetSpec,
  type RetType,
} from '@/solution/dsl';
import { casesText, positions, renameParam, retypeParam, setRet } from '@/solution/edit';

interface Props {
  format: Format;
  onChange: (format: Format) => void;
}

export function FormatForm({ format, onChange }: Props) {
  const where = positions(format);
  const loop = casesText(format);
  return (
    <div class="format-form">
      <table class="format-table">
        <thead>
          <tr>
            <th scope="col">매개변수</th>
            <th scope="col">타입</th>
            <th scope="col">읽는 위치</th>
          </tr>
        </thead>
        <tbody>
          {format.params.map((p, i) => (
            <tr key={`${i}:${p.name}`}>
              <td>
                <NameInput
                  value={p.name}
                  label={`${i + 1}번째 매개변수 이름`}
                  onCommit={(name) => onChange(renameParam(format, p.name, name))}
                />
              </td>
              <td>
                <select
                  aria-label={`${p.name}의 타입`}
                  value={p.type}
                  onChange={(e) =>
                    onChange(retypeParam(format, p.name, e.currentTarget.value as ParamType))
                  }
                >
                  {PARAM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td class="format-where">
                {where.get(p.name)}
                {p.len !== undefined && ` · 길이 ${p.len}`}
                {p.cols !== undefined && ` · 열 ${p.cols}`}
              </td>
            </tr>
          ))}
          <tr class="format-ret">
            <th scope="row">반환값</th>
            <td>
              <select
                aria-label="반환 타입"
                value={format.ret.type}
                onChange={(e) =>
                  onChange(setRet(format, defaultRet(e.currentTarget.value as RetType, format.ret)))
                }
              >
                {RET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <RetOptions ret={format.ret} onChange={(ret) => onChange(setRet(format, ret))} />
            </td>
          </tr>
        </tbody>
      </table>
      {loop && (
        <p class="format-note">
          여러 케이스: {loop}. 케이스마다 solution을 부르고 결과를 줄마다 출력해요.
        </p>
      )}
    </div>
  );
}

/** A name field that applies on blur or Enter, so renaming does not fight the validation. */
function NameInput({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const commit = () => {
    const name = text.trim();
    if (name && name !== value) onCommit(name);
    else setText(value);
  };
  return (
    <input
      type="text"
      aria-label={label}
      value={text}
      spellcheck={false}
      onInput={(e) => setText(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

/** Options that make sense for a new return type, keeping what still applies. */
function defaultRet(type: RetType, old: RetSpec): RetSpec {
  if (type === 'bool') return { type, yes: old.yes ?? 'YES', no: old.no ?? 'NO' };
  if (type === 'double') return { type, digits: old.digits ?? 6 };
  if (type.endsWith('[][]')) return { type, ...(type === 'char[][]' ? {} : { sep: ' ' }) };
  if (type.endsWith('[]')) return { type, sep: old.sep === '\n' ? '\n' : ' ' };
  return { type };
}

function RetOptions({ ret, onChange }: { ret: RetSpec; onChange: (r: RetSpec) => void }) {
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
      </span>
    );
  }
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
      <option value="space">{grid ? '열 사이 공백' : '공백으로 구분'}</option>
      {grid ? (
        <option value="none">열 사이 없음</option>
      ) : (
        <option value="newline">한 줄에 하나씩</option>
      )}
    </select>
  );
}
