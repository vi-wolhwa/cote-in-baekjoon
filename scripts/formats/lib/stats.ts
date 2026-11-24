/** Coverage statistics over cached problem records. */
import { hasIo, hasSamples, isComplete, samplesFrom, type ProblemRecord } from './record.ts';

export interface Coverage {
  total: number;
  withIo: number;
  withSamples: number;
  complete: number;
  /** Neither input/output text nor samples. */
  missing: number;
  /** Lacks input/output text or samples: would need Baekjoon direct access. */
  needBoj: number;
  needBojIoOnly: number;
  needBojSamplesOnly: number;
  ioBySource: Record<string, number>;
  samplesBySource: Record<string, number>;
  ioByRepo: Record<string, number>;
  samplesByRepo: Record<string, number>;
  sampleCount: Record<string, number>;
}

const bump = (map: Record<string, number>, key: string) => {
  map[key] = (map[key] ?? 0) + 1;
};

export function coverage(ids: number[], records: Map<number, ProblemRecord>): Coverage {
  const c: Coverage = {
    total: ids.length,
    withIo: 0,
    withSamples: 0,
    complete: 0,
    missing: 0,
    needBoj: 0,
    needBojIoOnly: 0,
    needBojSamplesOnly: 0,
    ioBySource: {},
    samplesBySource: {},
    ioByRepo: {},
    samplesByRepo: {},
    sampleCount: {},
  };
  for (const id of ids) {
    const r = records.get(id);
    const io = r ? hasIo(r) : false;
    const samples = r ? hasSamples(r) : false;
    if (r && io) {
      c.withIo++;
      bump(c.ioBySource, r.source?.kind ?? '?');
      if (r.source?.repo) bump(c.ioByRepo, r.source.repo);
    }
    if (r && samples) {
      c.withSamples++;
      const from = samplesFrom(r);
      bump(c.samplesBySource, from?.kind ?? '?');
      if (from?.repo) bump(c.samplesByRepo, from.repo);
      bump(c.sampleCount, String(Math.min(r.samples.length, 5)));
    }
    if (r && isComplete(r)) c.complete++;
    if (!io && !samples) c.missing++;
    if (!io || !samples) c.needBoj++;
    if (!io && samples) c.needBojIoOnly++;
    if (io && !samples) c.needBojSamplesOnly++;
  }
  return c;
}

/** Map entries sorted by count, largest first, at most `n`. */
export function topEntries(map: Record<string, number>, n: number): [string, number][] {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);
}
