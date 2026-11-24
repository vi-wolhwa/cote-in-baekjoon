/**
 * Builds the format data `public/formats/{shard}.json` (ADR-0006 source 2, ADR-0011) from the
 * local problem cache (#116).
 *
 * Only formats reviewed in `formats-reviewed.json` are shipped, and only when they pass the
 * extension's sample validation: unreviewed inference agreed with review on only about a third of
 * the pilot problems (names included), so it stays a suggestion in the extension (source 3).
 * The inference still runs for every problem, to measure it and to prefill review sheets.
 * Problem text is read from the local cache and never written out; the output holds problem ids
 * and formats only.
 *
 *   npm run formats:build                          # public/formats/*.json + cache/build-report.json
 *   npm run formats:build -- --review out/         # review sheets for unreviewed problems (local)
 *   npm run formats:build -- --review out/ --all   # review sheets for every problem
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { shardOf } from '@/solution/bundled';
import {
  checkFormat,
  formatToJson,
  isBlock,
  mapLine,
  sameFormat,
  type Format,
} from '@/solution/dsl';
import { inferCandidates, MIN_SCORE } from '@/solution/infer';
import { isExcluded } from '@/solution/source';
import { validateFormat } from '@/solution/validate';
import { formatsFile } from './lib/json-lines.ts';
import { escapeText, loadReviewed, type Reviewed } from './lib/reviewed.ts';
import { hasDescription, type ProblemRecord } from './lib/record.ts';

const { values: args } = parseArgs({
  options: {
    cache: { type: 'string', default: 'data/boj-cache' },
    out: { type: 'string', default: 'public/formats' },
    reviewed: { type: 'string', default: 'scripts/formats/formats-reviewed.json' },
    review: { type: 'string' },
    all: { type: 'boolean', default: false },
  },
});

const cacheDir = resolve(args.cache);
const problemsDir = join(cacheDir, 'problems');
if (!existsSync(problemsDir)) throw new Error(`캐시가 없습니다: ${problemsDir}`);
const reviewed = loadReviewed(args.reviewed);

type Outcome =
  | 'reviewed'
  | 'reviewed-no-samples'
  | 'reviewed-none'
  | 'reviewed-invalid'
  | 'unreviewed'
  | 'unsure'
  | 'no-candidate'
  | 'no-samples'
  | 'excluded';

const counts: Record<Outcome, number> = {
  reviewed: 0,
  'reviewed-no-samples': 0,
  'reviewed-none': 0,
  'reviewed-invalid': 0,
  unreviewed: 0,
  unsure: 0,
  'no-candidate': 0,
  'no-samples': 0,
  excluded: 0,
};
/** Reviewed problems whose inference agreed with the review (inference accuracy). */
let agreed = 0;
let compared = 0;
/** Same layout and types, names aside. */
let shapeAgreed = 0;
const formats: Record<string, Format> = {};
const details: { id: number; outcome: Outcome; reasons?: string[] }[] = [];
const sheets: unknown[] = [];

const ids = readdirSync(problemsDir)
  .map((f) => Number(f.replace(/\.json$/, '')))
  .filter((n) => Number.isInteger(n) && n > 0)
  .sort((a, b) => a - b);

for (const id of ids) {
  const rec = JSON.parse(readFileSync(join(problemsDir, `${id}.json`), 'utf8')) as ProblemRecord;
  const note = (outcome: Outcome, reasons?: string[]) => {
    counts[outcome]++;
    details.push({ id, outcome, ...(reasons ? { reasons } : {}) });
  };
  if (isExcluded(rec.labels ?? [])) {
    note('excluded');
    continue;
  }
  // Without samples, a format can still be reviewed from the description alone. It passes only
  // the DSL checks here; the extension validates it against the real samples when the problem
  // opens and falls back to inference otherwise (ADR-0006).
  if (rec.samples.length === 0 && !hasDescription(rec)) {
    note('no-samples');
    continue;
  }
  const candidates = inferCandidates({
    samples: rec.samples,
    inputHtml: escapeText(rec.input ?? ''),
    outputHtml: escapeText(rec.output ?? ''),
  });
  const best = candidates[0];
  const inferred = best && best.score >= MIN_SCORE ? best.format : undefined;
  const review: Reviewed | undefined = reviewed.get(id);

  if (review !== undefined) {
    if (review === null) {
      note('reviewed-none');
    } else {
      const v = validateFormat(review, rec.samples);
      if (v.ok) {
        formats[id] = v.format;
        if (rec.samples.length === 0) {
          note('reviewed-no-samples');
          continue;
        }
        note('reviewed');
        compared++;
        if (inferred && sameFormat(inferred, v.format)) agreed++;
        if (inferred && shapeKey(inferred) === shapeKey(v.format)) shapeAgreed++;
      } else {
        note('reviewed-invalid', v.reasons);
      }
    }
  } else if (inferred) {
    note('unreviewed');
  } else {
    note(best ? 'unsure' : 'no-candidate');
  }

  if (args.review && (args.all || review === undefined)) {
    sheets.push({
      id,
      title: rec.title,
      input: rec.input,
      output: rec.output,
      samples: rec.samples.slice(0, 2),
      inferred: inferred ?? null,
      candidates: candidates.slice(0, 3).map((c) => ({ score: c.score, format: c.format })),
    });
  }
}

const sorted = Object.fromEntries(
  Object.keys(formats)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => [k, JSON.parse(formatToJson(formats[k] as Format)) as unknown]),
);
// Re-check what is written: the extension drops entries that fail the DSL checks.
for (const [k, f] of Object.entries(sorted)) {
  if (!checkFormat(f).ok) throw new Error(`형식 검사 실패: ${k}`);
}
// One file per shard; files of shards that no longer have problems are removed.
const shards = new Map<number, Record<string, unknown>>();
for (const [k, f] of Object.entries(sorted)) {
  const n = shardOf(Number(k));
  const shard = shards.get(n) ?? {};
  shard[k] = f;
  shards.set(n, shard);
}
mkdirSync(args.out, { recursive: true });
for (const file of readdirSync(args.out)) {
  if (/^\d+\.json$/.test(file)) rmSync(join(args.out, file));
}
for (const [n, shard] of shards) writeFileSync(join(args.out, `${n}.json`), formatsFile(shard));

const report = {
  generatedAt: new Date().toISOString(),
  total: ids.length,
  shipped: Object.keys(sorted).length,
  shards: shards.size,
  counts,
  inferenceAgreement: compared
    ? {
        compared,
        exact: agreed,
        exactRate: +(agreed / compared).toFixed(3),
        shape: shapeAgreed,
        shapeRate: +(shapeAgreed / compared).toFixed(3),
      }
    : null,
};
writeFileSync(join(cacheDir, 'build-report.json'), JSON.stringify({ ...report, details }, null, 1));
console.log(JSON.stringify(report, null, 2));

if (args.review) {
  mkdirSync(args.review, { recursive: true });
  const size = 100;
  for (let i = 0; i < sheets.length; i += size) {
    const name = `sheet-${String(i / size + 1).padStart(2, '0')}.json`;
    writeFileSync(join(args.review, name), JSON.stringify(sheets.slice(i, i + size), null, 1));
  }
  console.log(`검토용 시트 ${Math.ceil(sheets.length / size)}개: ${args.review}`);
}

/** A format with its parameters renamed by position, to compare layouts and types only. */
function shapeKey(format: Format): string {
  const names = new Map(format.params.map((p, i) => [p.name, `p${i}`]));
  const ref = (c: string | number | undefined) =>
    typeof c === 'string' ? c.replace(/^[a-z_]\w*/i, (m) => names.get(m) ?? m) : c;
  return JSON.stringify({
    params: format.params.map((p) => [p.type, ref(p.len), ref(p.cols), p.flow, p.raw]),
    lines: format.lines.map((l) =>
      Array.isArray(l)
        ? l.map((n) => names.get(n))
        : isBlock(l)
          ? mapLine(
              l,
              (n) => names.get(n) ?? n,
              (c) => ref(c) ?? c,
            )
          : ['repeat' in l ? ref(l.repeat) : { until: l.until }, names.get(l.of as string)],
    ),
    cases: format.cases,
    ret: format.ret,
  });
}
