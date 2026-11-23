import { useState } from 'preact/hooks';
import type { Sample } from '@/boj/problem';
import { Modal } from './Modal';

export function ResetDialog({
  onConfirm,
  onClose,
}: {
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="초기화 안내"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn btn-light" onClick={onClose}>
            취소
          </button>
          <button type="button" class="btn btn-primary" onClick={onConfirm}>
            확인
          </button>
        </>
      }
    >
      <p>
        지금까지 작성한 모든 코드가 삭제되고 문제를 처음 시작했을 때의 상태로 돌아갑니다. 초기화
        하시겠습니까?
      </p>
    </Modal>
  );
}

interface CaseDialogProps {
  samples: Sample[];
  cases: Sample[];
  onSave: (cases: Sample[]) => void;
  onClose: () => void;
}

/** "테스트 케이스 추가" for stdin problems: Input / Output columns. */
export function TestCaseDialog({ samples, cases, onSave, onClose }: CaseDialogProps) {
  const [rows, setRows] = useState<Sample[]>(cases.length ? cases : [{ input: '', output: '' }]);

  const update = (i: number, key: keyof Sample, value: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  const save = () => {
    onSave(rows.filter((r) => r.input.trim() !== '' || r.output.trim() !== ''));
    onClose();
  };

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
        예제 {samples.length}개 다음에 실행됩니다. 입력과 기댓값은 표준 입출력 형식 그대로 적어
        주세요.
      </p>
      <table class="case-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Input</th>
            <th scope="col">Output</th>
            <th scope="col">
              <span class="visually-hidden">삭제</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s, i) => (
            <tr key={`s${i}`} class="case-fixed">
              <td>{i + 1}</td>
              <td>
                <pre>{s.input.trimEnd()}</pre>
              </td>
              <td>
                <pre>{s.output.trimEnd()}</pre>
              </td>
              <td>예제</td>
            </tr>
          ))}
          {rows.map((r, i) => (
            <tr key={`c${i}`}>
              <td>{samples.length + i + 1}</td>
              <td>
                <textarea
                  aria-label={`테스트 ${samples.length + i + 1} 입력`}
                  value={r.input}
                  onInput={(e) => update(i, 'input', e.currentTarget.value)}
                />
              </td>
              <td>
                <textarea
                  aria-label={`테스트 ${samples.length + i + 1} 기댓값`}
                  value={r.output}
                  onInput={(e) => update(i, 'output', e.currentTarget.value)}
                />
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn-icon"
                  aria-label={`테스트 ${samples.length + i + 1} 삭제`}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        class="btn btn-outline"
        onClick={() => setRows([...rows, { input: '', output: '' }])}
      >
        + 추가하기
      </button>
    </Modal>
  );
}
