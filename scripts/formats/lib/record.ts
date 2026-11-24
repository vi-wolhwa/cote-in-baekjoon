/**
 * Cache record for one problem (`data/boj-cache/problems/{id}.json`) and how
 * partial records from several sources are merged into it.
 */
import type { Sample } from './readme.ts';

export type SourceKind = 'github' | 'velog' | 'blog' | 'boj';

export interface SourceRef {
  kind: SourceKind;
  url: string;
  /** `owner/name` for GitHub sources. */
  repo?: string;
}

export interface ProblemRecord {
  id: number;
  title: string;
  /** Where `input` / `output` came from. */
  source: SourceRef | null;
  /** Where `samples` came from, when it differs from `source`. */
  sampleSource?: SourceRef;
  input: string | null;
  output: string | null;
  samples: Sample[];
  constraints?: string;
  /** Baekjoon problem labels (spj, interactive, func, ...), Baekjoon source only. */
  labels?: string[];
  fetchedAt: string;
}

export interface PartialRecord {
  input: string | null;
  output: string | null;
  constraints?: string | null;
  samples: Sample[];
  labels?: string[];
}

export function emptyRecord(id: number, title: string, now: string): ProblemRecord {
  return { id, title, source: null, input: null, output: null, samples: [], fetchedAt: now };
}

export function hasIo(record: ProblemRecord): boolean {
  return record.input !== null && record.output !== null;
}

export function hasSamples(record: ProblemRecord): boolean {
  return record.samples.length > 0;
}

export function isComplete(record: ProblemRecord): boolean {
  return hasIo(record) && hasSamples(record);
}

/**
 * Fills what `record` still lacks from `part`. Input and output are taken
 * together from one source so the two descriptions stay consistent; samples are
 * taken as a whole set from one source. Returns whether anything was added.
 */
export function mergePartial(
  record: ProblemRecord,
  part: PartialRecord,
  ref: SourceRef,
  now: string,
): boolean {
  let changed = false;
  if (!hasIo(record) && part.input !== null && part.output !== null) {
    record.input = part.input;
    record.output = part.output;
    record.source = ref;
    if (part.constraints) record.constraints = part.constraints;
    changed = true;
  }
  if (!hasSamples(record) && part.samples.length > 0) {
    record.samples = part.samples.map((s) => ({ input: s.input, output: s.output }));
    if (record.source?.url !== ref.url) record.sampleSource = ref;
    changed = true;
  }
  if (part.labels && part.labels.length > 0 && !record.labels) {
    record.labels = part.labels;
    changed = true;
  }
  if (changed) record.fetchedAt = now;
  return changed;
}

/** Source of the samples: `sampleSource` when set, else `source`. */
export function samplesFrom(record: ProblemRecord): SourceRef | null {
  if (!hasSamples(record)) return null;
  return record.sampleSource ?? record.source;
}
