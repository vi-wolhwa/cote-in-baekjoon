/**
 * The format editor (#114): one row per parameter in input order, with its name, type, how
 * it is read and its counts; rows can be added, removed and moved. Below them, how many
 * cases the input has and how the return value is printed. Covers all of DSL v1; a block of
 * lines shows as a header row above its parameters (ReadOptions.tsx).
 */
import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { MAX_PARAMS, PARAM_TYPES, RET_TYPES, type ParamType, type RetType } from '@/solution/dsl';
import {
  addRow,
  casesChoice,
  casesFor,
  setBlockCount,
  setCases,
  modeOptions,
  moveRow,
  nameError,
  removeRow,
  renameRow,
  rowPositions,
  setRow,
  type CasesChoice,
  type FormatTable,
} from '@/solution/table';
import { BlockHeader, END_HINT, ReadOptions } from './ReadOptions';
import { CaseOutputOptions, defaultRet, RetOptions } from './RetOptions';

interface Props {
  table: FormatTable;
  onChange: (table: FormatTable) => void;
}

export function FormatForm({ table, onChange }: Props) {
  const where = rowPositions(table);
  const last = table.rows.length - 1;
  return (
    <div class="format-form">
      <table class="format-table">
        <colgroup>
          <col class="format-col-name" />
          <col class="format-col-type" />
          <col />
          <col class="format-col-line" />
          <col class="format-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">매개변수</th>
            <th scope="col">타입</th>
            <th scope="col">읽는 방법</th>
            <th scope="col" class="format-line-head">
              줄
            </th>
            <th scope="col">
              <span class="visually-hidden">순서와 삭제</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => {
            const block = row.block?.id !== table.rows[i - 1]?.block?.id ? row.block : undefined;
            return (
              <Fragment key={i}>
                {block && (
                  <tr class="format-block">
                    <td />
                    <td colSpan={4}>
                      <BlockHeader
                        block={block}
                        onCount={(count) => onChange(setBlockCount(table, block.id, count))}
                      />
                    </td>
                  </tr>
                )}
                <tr>
                  <td>
                    <NameInput
                      value={row.name}
                      label={`${i + 1}번째 매개변수 이름`}
                      error={nameError(table, i)}
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
                    <ReadOptions
                      row={row}
                      index={i}
                      modes={modeOptions(table, i)}
                      onChange={(patch) => onChange(setRow(table, i, patch))}
                    />
                  </td>
                  <td class="format-line" title="입력에서 읽는 위치">
                    {where[i]}
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
              </Fragment>
            );
          })}
          {table.rows.length === 0 && (
            <tr>
              <td colSpan={5} class="format-where">
                입력이 없는 문제예요. solution()을 매개변수 없이 불러요.
              </td>
            </tr>
          )}
          <tr class="format-add-row">
            <td>
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
            <td colSpan={4} />
          </tr>
          <tr class="format-cases">
            <th scope="row">입력 반복</th>
            <td colSpan={2}>
              <CasesOptions table={table} onChange={onChange} />
            </td>
            <td colSpan={2} />
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
            <td>
              <RetOptions ret={table.ret} onChange={(ret) => onChange({ ...table, ret })} />
            </td>
            <td colSpan={2} />
          </tr>
          {(table.cases !== null || table.ret.blank) && (
            <tr class="format-case-out">
              <th scope="row">케이스 출력</th>
              <td colSpan={2}>
                <CaseOutputOptions
                  ret={table.ret}
                  cases={table.cases !== null}
                  onChange={(ret) => onChange({ ...table, ret })}
                />
              </td>
              <td colSpan={2} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const CASES_LABELS: Record<CasesChoice, string> = {
  once: '한 번',
  count: '첫 줄의 수만큼',
  eof: '입력이 끝날 때까지',
  until: '끝내는 줄까지',
};

function CasesOptions({ table, onChange }: Props) {
  const choice = casesChoice(table.cases);
  const until = table.cases && 'until' in table.cases ? table.cases.until : '';
  return (
    <span class="format-ret-options">
      <select
        class="format-cases-select"
        aria-label="입력 반복"
        value={choice}
        onChange={(e) =>
          onChange(setCases(table, casesFor(e.currentTarget.value as CasesChoice, table.cases)))
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
          class="format-count"
          placeholder="예: 0 0"
          aria-label="입력을 끝내는 줄"
          title={END_HINT}
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
  error,
  onCommit,
}: {
  value: string;
  label: string;
  /** Shown as a red border and the tooltip. */
  error?: string | undefined;
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
      class={error ? 'is-invalid' : undefined}
      aria-label={label}
      aria-invalid={error ? 'true' : undefined}
      title={error}
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
