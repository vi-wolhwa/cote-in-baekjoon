/**
 * The bundled format data (ADR-0006 source 2, ADR-0011): problem formats split by number range
 * into `formats/{shard}.json` in the extension package. Only the file holding the problem is
 * read, when the problem opens, and only that problem's entry is checked, so opening the IDE
 * costs the same however many problems the data covers.
 */
import { checkFormat, type Format } from './dsl';

/** Problems per file: ids 0–999 in `0.json`, 1000–1999 in `1.json`, ... */
export const SHARD_SIZE = 1000;

export function shardOf(id: number): number {
  return Math.floor(id / SHARD_SIZE);
}

/** Package path of a shard, relative to the extension root. */
export function shardPath(shard: number): string {
  return `formats/${shard}.json`;
}

/** The entry for `id` in a shard file's content, if it passes the DSL checks. */
export function pickBundled(raw: unknown, id: number): Format | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { v, formats } = raw as { v?: unknown; formats?: unknown };
  if (v !== 1 || typeof formats !== 'object' || formats === null) return undefined;
  if (!Object.hasOwn(formats, String(id))) return undefined;
  const r = checkFormat((formats as Record<string, unknown>)[String(id)]);
  return r.ok ? r.format : undefined;
}

/** Reads a shard's JSON; undefined when there is no such file. */
export type ShardReader = (path: string) => Promise<unknown>;

const fetchShard: ShardReader = async (path) => {
  const url = (browser.runtime.getURL as (p: string) => string)(`/${path}`);
  const res = await fetch(url);
  return res.ok ? ((await res.json()) as unknown) : undefined;
};

/** Shard contents already read in this page, by shard number. */
const cache = new Map<number, Promise<unknown>>();

/** The bundled format of a problem, or undefined when the data has none (or cannot be read). */
export async function loadBundledFormat(
  id: number,
  read: ShardReader = fetchShard,
): Promise<Format | undefined> {
  if (!Number.isInteger(id) || id < 1 || id > 9_999_999) return undefined;
  const shard = shardOf(id);
  let pending = cache.get(shard);
  if (!pending) {
    pending = read(shardPath(shard)).catch(() => undefined);
    cache.set(shard, pending);
  }
  return pickBundled(await pending, id);
}

/** Forgets shards read so far (tests). */
export function clearBundledCache(): void {
  cache.clear();
}
