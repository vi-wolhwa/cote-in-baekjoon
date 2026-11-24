/**
 * Starting code and file name for the solution-function mode, per glue language
 * (glue/index.ts): an empty `solution` with the format's parameters and return type.
 */
import type { Format } from './dsl';
import { glueLanguage, type GlueId } from './glue';

export function starterCode(glue: GlueId, format: Format): string {
  return glueLanguage(glue).starter(format);
}

/** File tab name in solution-function mode. */
export function solutionFileName(glue: GlueId): string {
  return glueLanguage(glue).fileName;
}

/**
 * The code without its leading comment lines (`//`, or `#` not followed by a letter, so C's
 * `#include` stays) and the blank lines among them.
 */
function withoutHeader(code: string): string {
  return code
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*(?:\/\/|#(?![A-Za-z]))[^\n]*\n|[ \t]*\n)*/, '')
    .trimEnd();
}

/**
 * Saved code that is only an earlier version of the starting code (its header comment
 * changed, the code itself untouched) becomes the current starting code; anything else the
 * user wrote is kept as it is.
 */
export function refreshStarter(saved: string, starter: string): string {
  return saved !== starter && withoutHeader(saved) === withoutHeader(starter) ? starter : saved;
}
