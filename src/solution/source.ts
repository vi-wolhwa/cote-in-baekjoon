/**
 * Which format a problem uses (ADR-0006): the user's saved format, then the bundled
 * verified data, then inference from the samples. A source is used only if it passes
 * sample validation; interactive and function-implementation problems never use one.
 */
import type { Problem } from '@/boj/problem';
import bundledData from '@/data/formats.json';
import { checkFormat, type Format } from './dsl';
import { inferFormat } from './infer';
import { validateFormat } from './validate';

export type FormatSource = 'user' | 'bundled' | 'inferred';

export const SOURCE_LABELS: Record<FormatSource, string> = {
  user: '직접 정의함',
  bundled: '형식 데이터',
  inferred: '예제로 추론함',
};

export const UNKNOWN_REASON = '입출력 형식을 알 수 없어 표준 입출력으로 풀어요';
export const EXCLUDED_REASON = '인터랙티브·함수 구현 문제는 표준 입출력으로만 풀 수 있어요';

/** Labels whose problems always open in standard input/output. */
export const EXCLUDED_LABELS = ['interactive', 'func'];

export interface Resolved {
  format?: Format;
  source?: FormatSource;
  /** Why there is no format (shown on the disabled toggle). */
  reason?: string;
  /** A saved format that no longer passes the samples, with the reasons. */
  savedInvalid?: string[];
}

/** Bundled formats by problem id; entries that fail the DSL checks are dropped. */
export function parseBundled(raw: unknown): Map<number, Format> {
  const out = new Map<number, Format>();
  if (typeof raw !== 'object' || raw === null) return out;
  const { v, formats } = raw as { v?: unknown; formats?: unknown };
  if (v !== 1 || typeof formats !== 'object' || formats === null) return out;
  for (const [id, value] of Object.entries(formats)) {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1 || n > 9_999_999) continue;
    const r = checkFormat(value);
    if (r.ok) out.set(n, r.format);
  }
  return out;
}

let bundled: Map<number, Format> | undefined;

export function bundledFormat(problemId: number): Format | undefined {
  bundled ??= parseBundled(bundledData);
  return bundled.get(problemId);
}

export function isExcluded(labels: readonly string[]): boolean {
  return labels.some((l) => EXCLUDED_LABELS.includes(l));
}

/**
 * Picks the format for a problem. `saved` is the raw stored value (untrusted). Inference
 * runs only when the first two sources give nothing usable.
 */
export function resolveFormat(
  problem: Pick<Problem, 'id' | 'samples' | 'labels' | 'sections'>,
  saved: unknown,
  bundledOverride?: Format,
): Resolved {
  if (isExcluded(problem.labels)) return { reason: EXCLUDED_REASON };
  const out: Resolved = {};
  if (saved !== undefined) {
    const v = validateFormat(saved, problem.samples);
    if (v.ok) return { format: v.format, source: 'user' };
    out.savedInvalid = v.reasons;
  }
  const fromData = bundledOverride ?? bundledFormat(problem.id);
  if (fromData && validateFormat(fromData, problem.samples).ok) {
    return { ...out, format: fromData, source: 'bundled' };
  }
  const inferred = inferFormat({
    samples: problem.samples,
    inputHtml: problem.sections.input,
    outputHtml: problem.sections.output,
  });
  if (inferred) return { ...out, format: inferred, source: 'inferred' };
  return { ...out, reason: UNKNOWN_REASON };
}
