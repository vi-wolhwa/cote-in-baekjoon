/**
 * The format editor (#114): one row per parameter in input order, with its name, type, how
 * it is read and its counts; rows can be added, removed and moved. Below them, how many
 * cases the input has and how the return value is printed. Covers all of DSL v1.
 */
import { useEffect, useState } from 'preact/hooks';
import {
  isArrayType,
  isGridType,
  MAX_PARAMS,
  PARAM_TYPES,
  RET_TYPES,
  type ParamType,
  type RetSpec,
  type RetType,
} from '@/solution/dsl';
import {
  addRow,
  casesChoice,
  casesFor,
  modeOptions,
  moveRow,
  removeRow,
  renameRow,
  rowPositions,
  setRow,
  type CasesChoice,
  type FormatTable,
  type ParamRow,
  type RowMode,
} from '@/solution/table';

interface Props {
  table: FormatTable;
  onChange: (table: FormatTable) => void;
}

function modeLabel(mode: RowMode, type: ParamType): string {
  if (mode === 'new') return '새 줄에서';
  if (mode === 'same') return '앞과 같은 줄에서';
  if (isGridType(type)) return '여러 줄에서 (한 줄에 한 행)';
  if (type === 'line[]') return '여러 줄에서 (한 줄씩 통째로)';
  return '여러 줄에서 (한 줄에 하나씩)';
}

export function FormatForm({ table, onChange }: Props) {
  const where = rowPositions(table);
  const last = table.rows.length - 1;
  return (
    <div class="format-form">
      <table class="format-table">
        <thead>
          <tr>
            <th scope="col">매개변수</th>
            <th scope="col">타입</th>
            <th scope="col">읽는 방법</th>
            <th scope="col">
              <span class="visually-hidden">순서와 삭제</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              <td>
                <NameInput
                  value={row.name}
                  label={`${i + 1}번째 매개변수 이름`}
                  onCommit={(name) => onChange(renameRow(table, i, name))}
                />
              </td>
              <td>
                <select
                  aria-label={`${i + 1}번째 매개변수 타입`}
                  value={row.type}
                  onChange={(e) =>
                    onChange(setRow(table, i, { type: e.currentTarget.value as ParamType }))
                  }
                >
                  {PARAM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <div class="format-read">
                  <span class="format-where">{where[i]}</span>
                  <ReadOptions
                    row={row}
                    index={i}
                    modes={modeOptions(table, i)}
                    onChange={(patch) => onChange(setRow(table, i, patch))}
                  />
                </div>
              </td>
              <td class="format-row-actions">
                <button
                  type="button"

                  aria-label={`${i + 1}번째 매개변수를 위로`}
                  title="위로"
                  disabled={i === 0}
                  onClick={() => onChange(moveRow(table, i, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"

                  aria-label={`${i + 1}번째 매개변수를 아래로`}
                  title="아래로"
                  disabled={i === last}
                  onClick={() => onChange(moveRow(table, i, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"

                  aria-label={`${i + 1}번째 매개변수 삭제`}
                  title="삭제"
                  onClick={() => onChange(removeRow(table, i))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          {table.rows.length === 0 && (
            <tr>
              <td colSpan={4} class="format-where">
                입력이 없는 문제예요. solution()을 매개변수 없이 불러요.
              </td>
            </tr>
          )}
          <tr class="format-add-row">
            <td colSpan={4}>
              <button
                type="button"
                class="format-add"
                aria-label="매개변수 추가"
                title="매개변수 추가"
                disabled={table.rows.length >= MAX_PARAMS}
                onClick={() => onChange(addRow(table))}
              >
                +
              </button>
            </td>
          </tr>
          <tr class="format-cases">
            <th scope="row">입력 반복</th>
            <td colSpan={3}>
              <CasesOptions table={table} onChange={onChange} />
            </td>
          </tr>
          <tr class="format-ret">
            <th scope="row">반환값</th>
            <td>
              <select
                aria-label="반환 타입"
                value={table.ret.type}
                onChange={(e) =>
                  onChange({
                    ...table,
                    ret: defaultRet(e.currentTarget.value as RetType, table.ret),
                  })
                }
              >
                {RET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </td>
            <td colSpan={2}>
              <RetOptions ret={table.ret} onChange={(ret) => onChange({ ...table, ret })} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ReadOptions(props: {
  row: ParamRow;
  index: number;
  modes: RowMode[];
  onChange: (patch: Partial<ParamRow>) => void;
}) {
  const { row, index, modes, onChange } = props;
  const n = index + 1;
  const repeat = row.mode === 'repeat';
  return (
    <span class="format-ret-options">
      {modes.length > 1 ? (
        <select
          aria-label={`${n}번째 매개변수 읽는 방법`}
          value={row.mode}
          onChange={(e) => onChange({ mode: e.currentTarget.value as RowMode })}
        >
          {modes.map((m) => (
            <option key={m} value={m}>
              {modeLabel(m, row.type)}
            </option>
          ))}
        </select>
      ) : (
        <span class="format-where">{modeLabel(row.mode, row.type)}</span>
      )}
      {isArrayType(row.type) && !repeat && (
        <CountInput
          label={`${n}번째 매개변수 개수`}
          prefix="개수"
          placeholder="줄 끝까지"
          value={row.count}
          onChange={(count) => onChange({ count })}
        />
      )}
      {repeat && (
        <CountInput
          label={`${n}번째 매개변수 줄 수`}
          prefix={isGridType(row.type) ? '행' : '줄 수'}
          placeholder="예: n"
          value={row.count}
          onChange={(count) => onChange({ count })}
        />
      )}
      {isGridType(row.type) && (
        <CountInput
          label={`${n}번째 매개변수 열 수`}
          prefix="열"
          placeholder="줄 전체"
          value={row.cols}
          onChange={(cols) => onChange({ cols })}
        />
      )}
    </span>
  );
}

function CountInput(props: {
  label: string;
  prefix: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      {props.prefix}
      <input
        type="text"
        class="format-count"
        aria-label={props.label}
        placeholder={props.placeholder}
        title="숫자나 앞에서 읽은 정수 이름 (n, n-1, n*m)"
        spellcheck={false}
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
      />
    </>
  );
}

const CASES_LABELS: Record<CasesChoice, string> = {
  once: '한 번 (케이스 하나)',
  count: '첫 줄의 수만큼',
  eof: '입력이 끝날 때까지',
  until: '이 줄이 나올 때까지',
};

function CasesOptions({ table, onChange }: Props) {
  const choice = casesChoice(table.cases);
  const until = table.cases && 'until' in table.cases ? table.cases.until : '';
  return (
    <span class="format-ret-options">
      <select
        aria-label="입력 반복"
        value={choice}
        onChange={(e) =>
          onChange({
            ...table,
            cases: casesFor(e.currentTarget.value as CasesChoice, table.cases),
          })
        }
      >
        {(Object.keys(CASES_LABELS) as CasesChoice[]).map((c) => (
          <option key={c} value={c}>
            {CASES_LABELS[c]}
          </option>
        ))}
      </select>
      {choice === 'until' && (
        <input
          type="text"
          aria-label="입력을 끝내는 줄"
          spellcheck={false}
          value={until}
          onInput={(e) => onChange({ ...table, cases: { until: e.currentTarget.value } })}
        />
      )}
      {choice !== 'once' && <span class="format-where">케이스마다 solution을 불러요</span>}
    </span>
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
  useEffect(() => setText(value), [value]);
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
  if (type === 'line[]') return { type };
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
