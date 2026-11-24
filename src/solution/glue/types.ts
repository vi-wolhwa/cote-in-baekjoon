/**
 * What every language's solution-mode glue provides (ADR-0006). A language is one file in
 * this folder and one entry in `GLUES` (index.ts).
 */
import type { Format, RetSpec } from '../dsl';
import type { Plan } from './plan';

/** Glue families: languages with the same glue share it (C++14/17/20, Python 3 and PyPy3). */
export type GlueId =
  | 'js'
  | 'ts'
  | 'python'
  | 'cpp'
  | 'c'
  | 'java'
  | 'kotlin'
  | 'rust'
  | 'go'
  | 'swift'
  | 'csharp'
  | 'ruby';

export interface GlueLanguage {
  /** Lines put before the user's code (includes, imports); the error line offset. */
  prefix: string;
  /** Rewrites the user's code before the glue is added (Java: `public class Solution`). */
  user?: (code: string) => string;
  /** The glue code put after the user's code. */
  glue: (plan: Plan, ret: RetSpec) => string;
  /** Starting code: an empty `solution` with the format's parameters and return type. */
  starter: (format: Format) => string;
  /** File tab name in solution mode. */
  fileName: string;
}
