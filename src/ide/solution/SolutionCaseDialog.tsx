/**
 * '테스트 케이스 추가' in solution-function mode (#36): a column per parameter and one for
 * the expected return value. Each cell is checked against the format; cases are stored as
 * standard input/output like the other dialog, so running them does not change. Cases that
 * do not fit the format (saved in standard I/O mode) are kept and shown as they are.
 */
import { useState } from 'preact/hooks';
import type { Sample } from '@/boj/problem';
import {
  emptyRow,
  isEmptyRow,
  rowToSample,
  RET_CELL,
  sampleToRow,
  type CaseRow,
  type RowErrors,
} from '@/solution/cases';
import type { Format } from '@/solution/dsl';
import { Modal } from '../Modal';

interface Props {
  format: Format;
  samples: Sample[];
  cases: Sample[];
  onSave: (cases: Sample[]) => void;
  onClose: () => void;
}

type Entry = { kind: 'row'; row: CaseRow } | { kind: 'raw'; sample: Sample };

export function SolutionCaseDialog({ format, samples, cases, onSave, onClose }: Props) {
  const [entries, setEntries] = useState<Entry[]>(() => {
    const loaded: Entry[] = cases.map((c) => {
      const row = sampleToRow(format, c);
      return row ? { kind: 'row', row } : { kind: 'raw', sample: c };
    });
    return loaded.length ? loaded : [{ kind: 'row', row: emptyRow(format) }];
  });
  const [errors, setErrors] = useState<Map<number, RowErrors>>(new Map());

  const setCell = (i: number, key: string, value: string) =>
    setEntries(
      entries.map((e, j) => {
        if (j !== i || e.kind !== 'row') return e;
        const row =
          key === RET_CELL
            ? { ...e.row, expected: value }
            : { ...e.row, params: { ...e.row.params, [key]: value } };
        return { kind: 'row', row };
      }),
    );

  const save = () => {
    const out: Sample[] = [];
    const found = new Map<number, RowErrors>();
    entries.forEach((e, i) => {
      if (e.kind === 'raw') return out.push(e.sample);
      if (isEmptyRow(e.row)) return;
      const r = rowToSample(format, e.row);
      if (r.ok) out.push(r.sample);
      else found.set(i, r.errors);
    });
    setErrors(found);
    if (found.size > 0) return;
    onSave(out);
    onClose();
  };

  const number = (i: number) => samples.length + i + 1;
  const sampleRows = samples.map((s) => sampleToRow(format, s));

  return (
    <Modal
      title="테스트 케이스 추가"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn btn-light" onClick={onClose}>
            취소
          </button>
          <button type="button" class="btn btn-primary" onClick={save}>
            확인
          </button>
        </>
      }
    >
      <p class="modal-help">
        예제 {samples.length}개 다음에 실행됩니다. 값은 <code>3</code>, <code>[1, 2, 3]</code>,{' '}
        <code>"abc"</code>, <code>[["#", "."]]</code>처럼 적어 주세요.
      </p>
      <div class="case-scroll">
        <table class="case-table case-table-fn">
          <thead>
            <tr>
              <th scope="col">#</th>
              {format.params.map((p) => (
                <th scope="col" key={p.name}>
                  {p.name} <span class="case-type">{p.type}</span>
                </th>
              ))}
              <th scope="col">
                기댓값 <span class="case-type">{format.ret.type}</span>
              </th>
              <th scope="col">
                <span class="visually-hidden">삭제</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s, i) => {
              const row = sampleRows[i];
              return (
                <tr key={`s${i}`} class="case-fixed">
                  <td>{i + 1}</td>
                  {row ? (
                    <>
                      {format.params.map((p) => (
                        <td key={p.name}>
                          <pre>{row.params[p.name]}</pre>
                        </td>
                      ))}
                      <td>
                        <pre>{row.expected}</pre>
                      </td>
                    </>
                  ) : (
                    <td colSpan={format.params.length + 1}>
                      <pre>{s.input.trimEnd()}</pre>
                    </td>
                  )}
                  <td>예제</td>
                </tr>
              );
            })}
            {entries.map((e, i) => (
              <tr key={`c${i}`}>
                <td>{number(i)}</td>
                {e.kind === 'raw' ? (
                  <td colSpan={format.params.length + 1}>
                    <pre>{e.sample.input.trimEnd()}</pre>
                    <p class="case-raw-note">
                      표준 입출력으로 저장한 케이스예요. 그대로 실행합니다.
                    </p>
                  </td>
                ) : (
                  <>
                    {format.params.map((p) => (
                      <Cell
                        key={p.name}
                        label={`테스트 ${number(i)} ${p.name}`}
                        value={e.row.params[p.name] ?? ''}
                        error={errors.get(i)?.cells[p.name]}
                        onInput={(v) => setCell(i, p.name, v)}
                      />
                    ))}
                    <Cell
                      label={`테스트 ${number(i)} 기댓값`}
                      value={e.row.expected}
                      error={errors.get(i)?.cells[RET_CELL] ?? errors.get(i)?.row}
                      onInput={(v) => setCell(i, RET_CELL, v)}
                    />
                  </>
                )}
                <td>
                  <button
                    type="button"
                    class="btn btn-icon"
                    aria-label={`테스트 ${number(i)} 삭제`}
                    onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        class="btn btn-outline"
        onClick={() => setEntries([...entries, { kind: 'row', row: emptyRow(format) }])}
      >
        + 추가하기
      </button>
    </Modal>
  );
}

function Cell(props: {
  label: string;
  value: string;
  error?: string | undefined;
  onInput: (v: string) => void;
}) {
  return (
    <td>
      <textarea
        rows={1}
        aria-label={props.label}
        aria-invalid={props.error ? true : undefined}
        spellcheck={false}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
      {props.error && (
        <p class="case-error" role="alert">
          {props.error}
        </p>
      )}
    </td>
  );
}
