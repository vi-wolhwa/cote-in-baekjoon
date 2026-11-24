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
