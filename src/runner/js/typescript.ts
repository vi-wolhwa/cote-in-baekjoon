/**
 * TypeScript on the JavaScript engine (ADR-0007): sucrase strips the types and leaves the rest
 * of the program as written, line for line, so runtime errors keep their line numbers. There
 * is no type checking. `import`/`export` become `require`, which the engine provides.
 */
import { transform } from 'sucrase';

export const TS_FILE = 'solution.ts';

export type StripResult = { code: string } | { compileError: string };

/** Top-level ES module syntax (`import fs from 'fs'`, `export {}`), not `import(` calls. */
const MODULE_SYNTAX = /^\s*(import\s*[\w*{'"]|export\s)/m;

export function stripTypes(source: string): StripResult {
  try {
    const { code } = transform(source, {
      transforms: MODULE_SYNTAX.test(source) ? ['typescript', 'imports'] : ['typescript'],
      disableESTransforms: true,
      filePath: TS_FILE,
    });
    return { code };
  } catch (error) {
    return { compileError: describeError(error) };
  }
}

/** `solution.ts:3:5: error: Unexpected token`, like the compilers' messages. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const loc = (error as { loc?: { line?: unknown; column?: unknown } }).loc;
  const message = error.message
    .replace(/^Error transforming \S+: /, '')
    .replace(/\s*\(\d+:\d+\)$/, '');
  if (typeof loc?.line === 'number' && typeof loc.column === 'number') {
    return `${TS_FILE}:${loc.line}:${loc.column}: error: ${message}`;
  }
  return `${TS_FILE}: error: ${message}`;
}
