/**
 * Builds `src/data/formats.json` (ADR-0006 source 2) from the local problem cache (#116).
 *
 * For each cached problem with samples: a reviewed format from `formats-reviewed.json` wins, else
 * the extension's own inference. Either is shipped only when it passes the extension's sample
 * validation. Problem text is read from the local cache and never written out; the output holds
 * problem ids and formats only.
 *
 *   npm run formats:build                    # writes src/data/formats.json + cache/build-report.json
 *   npm run formats:build -- --review out/   # also writes review sheets (local, gitignored cache)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkFormat, formatToJson, sameFormat, type Format } from '@/solution/dsl';
import { inferCandidates, MIN_SCORE } from '@/solution/infer';
import { isExcluded } from '@/solution/source';
import { validateFormat } from '@/solution/validate';
import { escapeText, loadReviewed, type Reviewed } from './lib/reviewed.ts';
import type { ProblemRecord } from './lib/record.ts';

const { values: args } = parseArgs({
  options: {
    cache: { type: 'string', default: 'data/boj-cache' },
    out: { type: 'string', default: 'src/data/formats.json' },
    reviewed: { type: 'string', default: 'scripts/formats/formats-reviewed.json' },
    review: { type: 'string' },
  },
});

const cacheDir = resolve(args.cache);
const problemsDir = join(cacheDir, 'problems');
if (!existsSync(problemsDir)) throw new Error(`캐시가 없습니다: ${problemsDir}`);
const reviewed = loadReviewed(args.reviewed);

type Outcome =
  | 'reviewed'
  | 'reviewed-none'
  | 'reviewed-invalid'
  | 'inferred'
  | 'unsure'
  | 'no-candidate'
  | 'no-samples'
  | 'excluded';

const counts: Record<Outcome, number> = {
  reviewed: 0,
  'reviewed-none': 0,
  'reviewed-invalid': 0,
  inferred: 0,
  unsure: 0,
  'no-candidate': 0,
  'no-samples': 0,
  excluded: 0,
};
/** Reviewed problems whose inference agreed with the review (inference accuracy). */
let agreed = 0;
let compared = 0;
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
  if (rec.samples.length === 0) {
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
        note('reviewed');
        compared++;
        if (inferred && sameFormat(inferred, v.format)) agreed++;
      } else {
        note('reviewed-invalid', v.reasons);
      }
    }
  } else if (inferred) {
    formats[id] = inferred;
    note('inferred');
  } else {
    note(best ? 'unsure' : 'no-candidate');
  }

  if (args.review) {
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
writeFileSync(args.out, JSON.stringify({ v: 1, formats: sorted }) + '\n');

const report = {
  generatedAt: new Date().toISOString(),
  total: ids.length,
  shipped: Object.keys(sorted).length,
  counts,
  inferenceAgreement: compared ? { agreed, compared, rate: +(agreed / compared).toFixed(3) } : null,
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
