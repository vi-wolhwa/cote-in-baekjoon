/**
 * Writes docs/help.md from src/shared/help-content.ts (#80): `npm run help:md`.
 * tests/help-content.test.ts fails when the file is out of date.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { helpMarkdown } from '../src/shared/help-content.ts';

const HELP_MD_PATH = path.resolve(import.meta.dirname, '..', 'docs', 'help.md');

writeFileSync(HELP_MD_PATH, helpMarkdown());
console.log('docs/help.md를 만들었습니다.');
