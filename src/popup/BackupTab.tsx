import { useState } from 'preact/hooks';
import { describeSummary, type BackupSummary } from '@/shared/backup';
import { downloadBackup } from '@/shared/backup-download';

export function BackupTab({
  summary,
  onImport,
}: {
  summary: BackupSummary;
  /** Opens the options page: a file picker would close the popup. */
  onImport: () => void;
}) {
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();

  const exportFile = async () => {
    try {
      setMessage({ text: `내보냈습니다: ${describeSummary(await downloadBackup())}` });
    } catch {
      setMessage({ text: '내보내지 못했습니다. 다시 시도해 주세요.', error: true });
    }
  };

  return (
    <>
      <section class="card" aria-labelledby="backup-title">
        <h2 id="backup-title" class="card-title">
          저장된 데이터
        </h2>
        <dl class="summary" data-testid="backup-summary">
          <div>
            <dt>문제</dt>
            <dd>{summary.problems}개</dd>
          </div>
          <div>
            <dt>코드</dt>
            <dd>{summary.codes}개</dd>
          </div>
          <div>
            <dt>테스트 케이스</dt>
            <dd>{summary.cases}개</dd>
          </div>
          <div>
            <dt>채점 결과</dt>
            <dd>{summary.results}개</dd>
          </div>
          <div>
            <dt>설정</dt>
            <dd>{summary.settings}개</dd>
          </div>
          <div>
            <dt>모의 시험</dt>
            <dd>{summary.exams}개</dd>
          </div>
        </dl>
        <p class="note">확장 프로그램을 삭제하면 이 데이터도 지워져요. 파일로 내보내 두세요.</p>
      </section>

      <section class="card actions">
        <button type="button" class="btn-primary wide" onClick={() => void exportFile()}>
          파일로 내보내기
        </button>
        <button type="button" class="btn-secondary wide" onClick={onImport}>
          가져오기
        </button>
        <p class="note">
          가져오기는 새 탭의 백업 페이지에서 해요. 파일을 고르면 팝업이 닫히거든요.
        </p>
        {message && (
          <p class={message.error ? 'message error' : 'message'} role="status">
            {message.text}
          </p>
        )}
      </section>
    </>
  );
}
