/**
 * Merges problem records from a side cache (a copy where blog/Velog collection ran while
 * another collector used the main cache) into the main cache, filling only what is missing.
 *
 *   node scripts/formats/run-ts.mjs scripts/formats/merge-cache.ts --from data/boj-cache-side
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Cache } from './lib/cache.ts';
import { mergePartial, type ProblemRecord } from './lib/record.ts';

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    cache: { type: 'string', default: 'data/boj-cache' },
  },
});
if (!values.from) throw new Error('--from이 필요합니다');
const side = new Cache(values.from);
const main = new Cache(values.cache);
const dir = join(values.from, 'problems');
let changed = 0;
for (const file of existsSync(dir) ? readdirSync(dir) : []) {
  const from = side.readJson<ProblemRecord | null>(['problems', file], null);
  if (!from) continue;
  const into = main.readJson<ProblemRecord | null>(['problems', file], null);
  if (!into) {
    main.writeJson(['problems', file], from);
    changed++;
    continue;
  }
  const now = new Date().toISOString();
  let added = false;
  if (from.source && from.input !== null && from.output !== null) {
    const part = {
      input: from.input,
      output: from.output,
      constraints: from.constraints ?? null,
      samples: [],
    };
    added = mergePartial(into, part, from.source, now) || added;
  }
  const sampleRef = from.sampleSource ?? from.source;
  if (sampleRef && from.samples.length > 0) {
    const part = { input: null, output: null, samples: from.samples };
    added = mergePartial(into, part, sampleRef, now) || added;
  }
  if (added) {
    main.writeJson(['problems', file], into);
    changed++;
  }
}
console.log(`${changed}문제를 합쳤습니다`);
