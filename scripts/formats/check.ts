/**
 * Checks reviewed formats against the cached samples without writing anything (#116).
 *
 *   node scripts/formats/run-ts.mjs scripts/formats/check.ts --cache data/boj-cache file.json
 *
 * The file is `{ "v": 1, "formats": { "<id>": format | null } }`. Prints one line per failing
 * problem with the extension's own reasons, then a summary. Exit code 1 when any fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateFormat } from '@/solution/validate';
import { loadReviewed } from './lib/reviewed.ts';
import type { ProblemRecord } from './lib/record.ts';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { cache: { type: 'string', default: 'data/boj-cache' } },
});
const file = positionals[0];
if (!file) throw new Error('검사할 파일을 주세요');
const problemsDir = join(resolve(args.cache), 'problems');

let ok = 0;
let none = 0;
let failed = 0;
for (const [id, format] of loadReviewed(file)) {
  if (format === null) {
    none++;
    continue;
  }
  const path = join(problemsDir, `${id}.json`);
  if (!existsSync(path)) {
    console.log(`${id}\t캐시에 문제가 없음`);
    failed++;
    continue;
  }
  const rec = JSON.parse(readFileSync(path, 'utf8')) as ProblemRecord;
  if (rec.samples.length === 0) {
    console.log(`${id}\t예제가 없어 검증할 수 없음`);
    failed++;
    continue;
  }
  const v = validateFormat(format, rec.samples);
  if (v.ok) ok++;
  else {
    failed++;
    console.log(`${id}\t${v.reasons.join(' / ')}`);
  }
}
console.log(`통과 ${ok}, 형식 없음(null) ${none}, 실패 ${failed}`);
process.exitCode = failed > 0 ? 1 : 0;
