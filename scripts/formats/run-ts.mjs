// Runs a development script that imports extension code through the `@/` alias (scripts/formats/build.ts).
import { createJiti } from 'jiti';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [, , entry, ...rest] = process.argv;
if (!entry) throw new Error('usage: node scripts/formats/run-ts.mjs <file.ts> [args]');
process.argv = [process.argv[0], resolve(entry), ...rest];
const src = fileURLToPath(new URL('../../src', import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { '@': src } });
await jiti.import(pathToFileURL(resolve(entry)).href);
