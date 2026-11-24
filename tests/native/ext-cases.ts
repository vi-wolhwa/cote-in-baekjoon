/**
 * Cases for the DSL extensions (count expressions, blocks, flow arrays, end conditions, raw
 * lines), shared by the native harness (harness.ts) and the browser engines
 * (tests/solution-run-ext-*.test.ts). Keep the outputs exact (one trailing newline).
 */
import { checkFormat, type Format } from '@/solution/dsl';

const f = (x: unknown): Format => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};

export const EXT_CASES = {
  exprFlow: {
    task: 'return sum(arr) * 100 + (rows of g) * 10 + (columns of g[0]) as a long',
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'arr', type: 'int[]', len: '2*n-1', flow: true },
        { name: 'g', type: 'int[][]', cols: 'n+1' },
      ],
      lines: [['n'], ['arr'], { repeat: '2*(n-1)', of: 'g' }],
      cases: null,
      ret: { type: 'long' },
    }),
    // arr wraps over two lines.
    input: '2\n1 2\n3\n1 1 1\n2 2 2\n',
    output: '623\n',
  },
  blockCount: {
    task: 'return name[i] + ":" + (sum of items[i]) per block (k: int[], name: string[], items: int[][])',
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'k', type: 'int' },
        { name: 'name', type: 'string' },
        { name: 'items', type: 'int[]', len: 'k' },
      ],
      lines: [['n'], { repeat: 'n', of: [['k', 'name'], ['items']] }],
      cases: null,
      ret: { type: 'line[]' },
    }),
    // The second block has no items, and no line for them.
    input: '2\n3 ab\n1 2 3\n0 cd\n',
    output: 'ab:6\ncd:0\n',
  },
  blockUntil: {
    task: 'return the max of each row of vals, then x[i] * y[i] for each i (m, x, y: int[]; vals: int[][])',
    format: f({
      v: 1,
      params: [
        { name: 'm', type: 'int' },
        { name: 'vals', type: 'int[]' },
        { name: 'x', type: 'int' },
        { name: 'y', type: 'int' },
      ],
      lines: [
        { until: '0', of: [['m'], { repeat: 'm', of: 'vals' }] },
        { until: 'EOF', of: [['x', 'y']] },
      ],
      cases: null,
      ret: { type: 'int[]' },
    }),
    input: '2\n5\n9\n1\n4\n0\n2 3\n4 5\n',
    output: '9 4 6 20\n',
  },
  endConds: {
    task: 'return n + (number of words) * 10 + (sum of p) * 100 as a long (p: int[]); cases until a negative line',
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'words', type: 'line[]' },
        { name: 'p', type: 'int' },
      ],
      lines: [['n'], { until: '#*', of: 'words' }, { until: '<=0', of: [['p']] }],
      cases: { until: '<0' },
      ret: { type: 'long' },
    }),
    input: '2\nab c\nd\n# end\n3\n4\n0\n5\n#\n-3\n-1 0\n',
    output: '722\n5\n',
  },
  rawLines: {
    task: 'return "[" + s + "]" for t, then for each line of ls, mid and rest',
    format: f({
      v: 1,
      params: [
        { name: 't', type: 'line', raw: true },
        { name: 'n', type: 'int' },
        { name: 'ls', type: 'line[]', raw: true },
        { name: 'mid', type: 'line[]', raw: true },
        { name: 'rest', type: 'line[]', raw: true },
      ],
      lines: [
        ['t'],
        ['n'],
        { repeat: 'n', of: 'ls' },
        { until: 'END', of: 'mid' },
        { until: 'EOF', of: 'rest' },
      ],
      cases: null,
      ret: { type: 'line[]' },
    }),
    input: '  two  spaces  \n2\n\n x \na\nEND\ntail\n',
    output: '[  two  spaces  ]\n[]\n[ x ]\n[a]\n[tail]\n',
  },
};
