/**
 * Formats written or checked by a reviewer (Claude in a development session, ADR-0006) for
 * problems where inference failed or guessed wrong. The file holds problem ids and formats only,
 * never problem text: `{ "v": 1, "formats": { "1000": { ...format } , "1001": null } }`.
 * `null` records that the problem does not fit the format notation (standard I/O only).
 */
import { existsSync, readFileSync } from 'node:fs';

export type Reviewed = unknown;

export function loadReviewed(path: string): Map<number, Reviewed> {
  const out = new Map<number, Reviewed>();
  if (!existsSync(path)) return out;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { v?: unknown; formats?: unknown };
  if (raw.v !== 1 || typeof raw.formats !== 'object' || raw.formats === null) {
    throw new Error(`검토 형식 파일이 올바르지 않습니다: ${path}`);
  }
  for (const [id, value] of Object.entries(raw.formats)) {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw new Error(`문제 번호가 아닙니다: ${id}`);
    out.set(n, value);
  }
  return out;
}

/**
 * Cached descriptions are plain text; the inference reads HTML. Escape so a literal `<` in
 * "0 < A < 10" is not taken for a tag.
 */
export function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
