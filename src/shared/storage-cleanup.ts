/**
 * Removes data the extension no longer keeps (ADR-0012 개정 3): the old submission history
 * (`history:{id}`, read from Baekjoon now) and editor drafts (`code:…`) older than
 * DRAFT_KEEP_MS. The practice IDE restores a draft for a few hours only; the mock exam reads
 * its drafts for the length of an exam, so they are kept well past that. Drafts older
 * versions saved as plain strings have no time and go too.
 */

/** Drafts last saved longer ago than this are removed. */
export const DRAFT_KEEP_MS = 2 * 24 * 60 * 60 * 1000;

export function staleKeys(all: Record<string, unknown>, now: number): string[] {
  return Object.entries(all)
    .filter(([key, value]) => {
      if (/^history:\d+$/.test(key)) return true;
      if (!/^code:\d+:/.test(key)) return false;
      if (typeof value !== 'object' || value === null) return true;
      const savedAt = (value as { savedAt?: unknown }).savedAt;
      return typeof savedAt !== 'number' || now - savedAt > DRAFT_KEEP_MS;
    })
    .map(([key]) => key);
}

export async function cleanupStorage(now = Date.now()): Promise<void> {
  const all = await browser.storage.local.get(null);
  const keys = staleKeys(all, now);
  if (keys.length > 0) await browser.storage.local.remove(keys);
}
