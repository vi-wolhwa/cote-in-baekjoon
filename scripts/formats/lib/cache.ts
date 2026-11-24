/**
 * Local cache layout under `data/boj-cache/` (gitignored, never committed):
 *
 *   top.json                 solved.ac list (ids, titles, levels, tags, counts)
 *   github/candidates.json   repositories found by search
 *   github/trees/*.json      README paths per problem id for one repo commit
 *   github/state.json        README files already tried per problem, repo hit rates
 *   problems/{id}.json       merged ProblemRecord
 *   access-log.jsonl         every acmicpc.net page opened (time, id, result)
 *   stats.json               coverage report from the last run
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export class Cache {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  file(...parts: string[]): string {
    return path.join(this.root, ...parts);
  }

  readJson<T>(rel: string[], fallback: T): T {
    const file = this.file(...rel);
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  }

  writeJson(rel: string[], value: unknown): void {
    const file = this.file(...rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  exists(rel: string[]): boolean {
    return existsSync(this.file(...rel));
  }

  appendLine(rel: string[], value: unknown): void {
    const file = this.file(...rel);
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(value)}\n`);
  }

  readLines<T>(rel: string[]): T[] {
    const file = this.file(...rel);
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as T);
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Keeps at least `minMs` between the starts of consecutive calls to `wait()`. */
export function createPacer(minMs: number, now: () => number = Date.now) {
  let last = Number.NEGATIVE_INFINITY;
  return {
    async wait(): Promise<void> {
      const delay = last + minMs - now();
      if (delay > 0) await sleep(delay);
      last = now();
    },
  };
}

/** Request counters shown in the final report. */
export const counters = {
  solvedac: 0,
  githubApi: 0,
  githubSearch: 0,
  githubRaw: 0,
  boj: 0,
};
