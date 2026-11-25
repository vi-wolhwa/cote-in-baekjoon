/**
 * Content scripts outlive an extension update (ADR-0014): the browser installs the new version,
 * and the scripts already in open Baekjoon tabs lose their connection to it ("Extension context
 * invalidated"). `runtime.id` turns undefined then, so the page can tell the user to reload
 * instead of failing silently.
 */

export const RELOAD_PROMPT =
  '확장 프로그램이 업데이트되었습니다. 페이지를 새로고침할까요?\n작성한 코드는 자동 저장되어 있습니다.';

/** False once the extension that injected this script was updated, reloaded or removed. */
export function extensionAlive(): boolean {
  try {
    return Boolean(browser.runtime?.id);
  } catch {
    return false;
  }
}

/** Asks to reload the page when the extension is gone; true when the caller may go on. */
export function ensureExtension(win: Pick<Window, 'confirm' | 'location'> = window): boolean {
  if (extensionAlive()) return true;
  if (win.confirm(RELOAD_PROMPT)) win.location.reload();
  return false;
}

/**
 * Calls `onLost` once when the extension goes away while something depends on it (the IDE
 * overlay). A local property check every `intervalMs`; no requests. Returns a stop function.
 */
export function watchExtension(onLost: () => void, intervalMs = 2000): () => void {
  const timer = setInterval(() => {
    if (extensionAlive()) return;
    clearInterval(timer);
    onLost();
  }, intervalMs);
  return () => clearInterval(timer);
}
