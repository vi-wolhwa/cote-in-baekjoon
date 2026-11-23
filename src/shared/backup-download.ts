/**
 * Saves a backup of `storage.local` as a JSON file. Used by the options page and the
 * toolbar popup's 백업 tab (#79).
 */
import { backupFileName, createBackup, summarizeBackup, type BackupSummary } from './backup';

/** Starts the download and returns what went into the file. */
export async function downloadBackup(): Promise<BackupSummary> {
  const backup = createBackup(await browser.storage.local.get(null));
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName();
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return summarizeBackup(backup.items);
}
