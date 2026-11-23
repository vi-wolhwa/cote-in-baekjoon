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

/** Shown before the first submission: auto-submit breaks Baekjoon's rules (#41). */
export function AutoSubmitDialog({
  onChoose,
  onClose,
}: {
  onChoose: (autoSubmit: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="자동 제출 사용 안내"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn btn-light" onClick={() => onChoose(false)}>
            직접 제출할게요
          </button>
          <button type="button" class="btn btn-primary" onClick={() => onChoose(true)}>
            위험을 이해했고 자동 제출을 사용합니다
          </button>
        </>
      }
    >
      <p>
        자동 제출을 켜면 백준 제출 창에 언어와 코드를 채운 뒤 <b>제출 버튼까지 자동으로</b>
        누릅니다. 누르기 직전 잠깐 취소할 수 있습니다.
      </p>
      <p class="modal-warning">
        백준 이용 규칙은 사용자가 공식 제출 페이지에서 직접 제출 버튼을 누르지 않는 제출을
        &lsquo;자동 제출 도구&rsquo;로 봅니다. 적발되면 지금까지 제출한 <b>모든 소스가 삭제</b>되고{' '}
        <b>제출이 금지</b>될 수 있습니다(재범 시 사실상 영구). 이 위험은 계정 주인에게 있습니다.
      </p>
      <p class="modal-help">
        선택은 하단의 &lsquo;자동 제출&rsquo; 설정으로 언제든 바꿀 수 있습니다. 보안 확인이 나오거나
        방화벽에 막힐 코드가 있으면 자동 제출하지 않습니다.
      </p>
    </Modal>
  );
}
