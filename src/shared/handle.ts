/**
 * The Baekjoon id of the logged-in user (ADR-0005), read by content scripts from the page's
 * header link and kept under `boj:handle` in `storage.local`. The mock exam uses it to leave
 * out problems the user already solved. It is not backed up: the next Baekjoon visit reads it
 * again.
 *
 * The page is untrusted: only text that looks like a Baekjoon id is kept.
 */
import { findLoggedInUser } from '@/boj/status';

export const HANDLE_KEY = 'boj:handle';

/** Baekjoon ids: lowercase letters, digits and underscores, at most 20. */
export const HANDLE_RE = /^[a-z0-9_]{1,20}$/;

export function isHandle(v: unknown): v is string {
  return typeof v === 'string' && HANDLE_RE.test(v);
}

/** Page text as a handle (trimmed and lowercased), or undefined when it is not one. */
export function toHandle(text: string | undefined): string | undefined {
  const value = text?.trim().toLowerCase();
  return isHandle(value) ? value : undefined;
}

/** The logged-in user on a Baekjoon page, from its header link only. */
export function readHandle(doc: Document): string | undefined {
  // Only the header: a status URL's user_id can name someone else.
  return toHandle(findLoggedInUser(doc, 'about:blank'));
}

/** Stores the logged-in user's id when it changed. Errors are ignored: it is best effort. */
export async function rememberHandle(doc: Document): Promise<void> {
  const handle = readHandle(doc);
  if (!handle) return;
  try {
    const stored = (await browser.storage.local.get(HANDLE_KEY))[HANDLE_KEY];
    if (stored !== handle) await browser.storage.local.set({ [HANDLE_KEY]: handle });
  } catch {
    // Storage unavailable (extension updated while the page was open).
  }
}
