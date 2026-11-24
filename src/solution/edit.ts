/**
 * Small helpers for the format editor (#114): the format '형식 만들기' starts from and the
 * one-line signature. The table model is in table.ts.
 */
import { solutionParams, type Format } from './dsl';

/** What '형식 만들기' starts from: one int in, one int out. */
export const TEMPLATE: Format = {
  v: 1,
  params: [{ name: 'n', type: 'int' }],
  lines: [['n']],
  cases: null,
  ret: { type: 'int' },
};

/** "solution(n: int, arr: int[]) → int[]". */
export function signature(format: Format): string {
  const params = solutionParams(format)
    .map((p) => `${p.name}: ${p.type}`)
    .join(', ');
  return `solution(${params}) → ${format.ret.type}`;
}
