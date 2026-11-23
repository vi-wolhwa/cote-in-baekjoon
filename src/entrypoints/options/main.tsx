/**
 * Options page: backup and restore (#42). Opened from the extension's "옵션" menu and from
 * the IDE's top bar.
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  MAX_BACKUP_BYTES,
  backupFileName,
  createBackup,
  parseBackup,
  planRestore,
  summarizeBackup,
  type BackupSummary,
  type RestoreMode,
} from '@/shared/backup';
import './style.css';

type Pending = { items: Record<string, unknown>; skipped: number; exportedAt?: string };

function describe(s: BackupSummary): string {
  return `문제 ${s.problems}개 (코드 ${s.codes}개, 테스트 케이스 ${s.cases}개, 채점 결과 ${s.results}개), 설정 ${s.settings}개`;
}

function Options() {
  const [current, setCurrent] = useState<BackupSummary | undefined>();
  const [pending, setPending] = useState<Pending | undefined>();
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | undefined>();
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const all = await browser.storage.local.get(null);
    setCurrent(summarizeBackup(createBackup(all).items));
  };
  useEffect(() => void refresh(), []);

  const exportBackup = async () => {
    const backup = createBackup(await browser.storage.local.get(null));
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setMessage({ text: `내보냈습니다: ${describe(summarizeBackup(backup.items))}` });
  };

  const pickFile = async (file: File | undefined) => {
    setPending(undefined);
    setMessage(undefined);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setMessage({ text: '파일이 너무 큽니다.', error: true });
      return;
    }
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setMessage({ text: result.reason, error: true });
      return;
    }
    setPending(result);
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const plan = planRestore(await browser.storage.local.get(null), pending.items, mode);
      if (plan.remove.length) await browser.storage.local.remove(plan.remove);
      await browser.storage.local.set(plan.set);
      const added = summarizeBackup(plan.set);
      setMessage({
        text:
          mode === 'replace'
            ? `백업으로 바꿨습니다: ${describe(added)}`
            : `합쳤습니다. 새로 추가: ${describe(added)}`,
      });
      setPending(undefined);
      await refresh();
    } catch {
      setMessage({ text: '복원하지 못했습니다. 저장 공간을 확인해 주세요.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="page">
      <h1>백업과 복원</h1>
      <p class="lead">
        코드와 테스트 케이스는 이 브라우저에만 저장되고, 확장 프로그램을 삭제하면 함께 지워집니다.
        파일로 내보내 두면 다시 설치하거나 다른 컴퓨터에서 가져올 수 있습니다.
      </p>
      <p data-testid="current">지금 저장된 데이터: {current ? describe(current) : '…'}</p>

      <section>
        <h2>내보내기</h2>
        <button type="button" class="btn btn-primary" onClick={() => void exportBackup()}>
          파일로 내보내기
        </button>
      </section>

      <section>
        <h2>가져오기</h2>
        <label class="file">
          백업 파일
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const input = e.currentTarget as HTMLInputElement;
              const file = input.files?.[0];
              // Clear it so picking the same file again still fires a change.
              input.value = '';
              void pickFile(file);
            }}
          />
        </label>
        {pending && (
          <div class="confirm">
            <p data-testid="pending">
              {pending.exportedAt && `${new Date(pending.exportedAt).toLocaleString()} 백업: `}
              {describe(summarizeBackup(pending.items))}
              {pending.skipped > 0 && ` (읽을 수 없는 항목 ${pending.skipped}개는 건너뜀)`}
            </p>
            <fieldset>
              <legend>가져오는 방법</legend>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                />
                합치기 — 지금 데이터는 그대로 두고, 없는 것만 추가
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                덮어쓰기 — 지금 데이터를 지우고 백업으로 바꾸기
              </label>
            </fieldset>
            <button
              type="button"
              class={mode === 'replace' ? 'btn btn-danger' : 'btn btn-primary'}
              disabled={busy}
              onClick={() => void restore()}
            >
              {mode === 'replace' ? '덮어쓰기' : '합치기'}
            </button>
          </div>
        )}
      </section>

      {message && (
        <p class={message.error ? 'message error' : 'message'} role="status">
          {message.text}
        </p>
      )}
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<Options />, root);
