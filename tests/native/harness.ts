/**
 * Runs solution-mode programs on real toolchains (compilers and interpreters Baekjoon uses),
 * for languages the browser cannot run. Every language solves the same cases below with its
 * own `solution`; the glue must read the input and print the expected output exactly.
 *
 * Only runs with NATIVE_GLUE=1 (the "native glue" CI job installs the toolchains).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFormat, type Format } from '@/solution/dsl';
import type { GlueId } from '@/solution/glue';
import { buildProgram } from '@/solution/program';

export const NATIVE = process.env.NATIVE_GLUE === '1';

export interface Toolchain {
  /** The program's file name. */
  file: string;
  /** Commands run in the work directory before the program (compiling), as [cmd, ...args]. */
  build?: string[][];
  /** The command that runs the program with the case input on stdin. */
  run: string[];
}

const f = (x: unknown): Format => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};

interface Case {
  format: Format;
  input: string;
  output: string;
  /** What `solution` must do (each language implements it). */
  task: string;
}

/** The cases every language implements. Keep the outputs exact (one trailing newline). */
export const CASES = {
  ab: {
    task: 'return a + b',
    format: f({
      v: 1,
      params: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' },
      ],
      lines: [['a', 'b']],
      cases: null,
      ret: { type: 'int' },
    }),
    input: '1 2\n',
    output: '3\n',
  },
  sort: {
    task: 'return arr sorted ascending (long values past 2^53)',
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'arr', type: 'long[]', len: 'n' },
      ],
      lines: [['n'], ['arr']],
      cases: null,
      ret: { type: 'long[]', sep: '\n' },
    }),
    input: '3\n9000000000000000001 -5\n7\n',
    output: '-5\n7\n9000000000000000001\n',
  },
  grid: {
    task: "return whether any row of board contains '#' (several cases)",
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'm', type: 'int' },
        { name: 'board', type: 'char[][]', cols: 'm' },
      ],
      lines: [['n', 'm'], { repeat: 'n', of: 'board' }],
      cases: { count: 'T' },
      ret: { type: 'bool', yes: 'YES', no: 'NO' },
    }),
    input: '2\n2 2\n..\n.#\n1 3\n...\n',
    output: 'YES\nNO\n',
  },
  lines: {
    task: 'return (sum of nums + sum of every value in rows) / length of title, cases until "0 0"',
    format: f({
      v: 1,
      params: [
        { name: 'title', type: 'line' },
        { name: 'nums', type: 'long[]' },
        { name: 'k', type: 'int' },
        { name: 'rows', type: 'int[][]' },
      ],
      lines: [['title'], ['nums'], ['k'], { repeat: 'k', of: 'rows' }],
      cases: { until: '0 0' },
      ret: { type: 'double', digits: 2 },
    }),
    input: 'hello world\n10000000000 2\n2\n1 2 3\n4\n\nab\n1\n0\n0 0\n',
    output: '909090910.18\n0.50\n',
  },
  words: {
    task: 'return name + ":" + (a + b) for each line until the end of input (a + b fits in long)',
    format: f({
      v: 1,
      params: [
        { name: 'name', type: 'string' },
        { name: 'a', type: 'long' },
        { name: 'b', type: 'long' },
      ],
      lines: [['name', 'a', 'b']],
      cases: { until: 'EOF' },
      ret: { type: 'string' },
    }),
    input: 'x 9000000000000000000 1\ny -5 5\n',
    output: 'x:9000000000000000001\ny:0\n',
  },
  transpose: {
    task: 'return the transpose of g (m rows of n values)',
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'm', type: 'int' },
        { name: 'g', type: 'int[][]', cols: 'm' },
      ],
      lines: [['n', 'm'], { repeat: 'n', of: 'g' }],
      cases: null,
      ret: { type: 'int[][]' },
    }),
    input: '2 3\n1 2 3\n4 5 6\n',
    output: '1 4\n2 5\n3 6\n',
  },
  blocks: {
    task: 'return names reversed, then the sum of each row of rows (as strings)',
    format: f({
      v: 1,
      params: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' },
        { name: 'names', type: 'line[]' },
        { name: 'rows', type: 'long[][]' },
      ],
      lines: [['a', 'b'], { repeat: 'a', of: 'names' }, { repeat: 'b', of: 'rows' }],
      cases: null,
      ret: { type: 'line[]' },
    }),
    input: '2 2\nAlice Kim\n  Bob\n1 2\n3 4000000000\n',
    output: 'Bob\nAlice Kim\n3\n4000000003\n',
  },
  commands: {
    task: 'return (number of rows of cmds whose first word is "push") * 10 + (int)(w[0] + w[1])',
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'm', type: 'int' },
        { name: 'cmds', type: 'string[][]' },
        { name: 'w', type: 'double[]' },
      ],
      lines: [['n', 'm'], { repeat: 'n+m', of: 'cmds' }, ['w']],
      cases: null,
      ret: { type: 'int' },
    }),
    input: '1 2\npush 3\npop\npush 5\n0.5 1.75\n',
    output: '22\n',
  },
  noInput: {
    task: 'return the two lines " *" and "***" (no parameters)',
    format: f({ v: 1, params: [], lines: [], cases: null, ret: { type: 'line[]' } }),
    input: '',
    output: ' *\n***\n',
  },
  untilEof: {
    task: 'return the sum of each pair (as strings), then the names',
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'pairs', type: 'int[][]', cols: 2 },
        { name: 'names', type: 'line[]' },
      ],
      lines: [['n'], { until: '-1 -1', of: 'pairs' }, { until: 'EOF', of: 'names' }],
      cases: null,
      ret: { type: 'line[]' },
    }),
    input: '2\n1 2\n3 4\n-1 -1\n  Alice Kim\nBob\n',
    output: '3\n7\nAlice Kim\nBob\n',
  },
  untilDot: {
    task: 'return (nums[0] + nums[1]) * 10 + number of texts',
    format: f({
      v: 1,
      params: [
        { name: 'nums', type: 'int[]' },
        { name: 'texts', type: 'line[]' },
      ],
      lines: [
        { until: '0', of: 'nums' },
        { until: '.', of: 'texts' },
      ],
      cases: null,
      ret: { type: 'int' },
    }),
    input: '5\n7\n0\nhello world\n .\n.\n',
    output: '122\n',
  },
  emptyThenEof: {
    task: 'return the sum of rest (arr is empty here)',
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'arr', type: 'int[]', len: 'n' },
        { name: 'rest', type: 'long[]' },
      ],
      lines: [['n'], ['arr'], { until: 'EOF', of: 'rest' }],
      cases: null,
      ret: { type: 'long' },
    }),
    input: '0\n50\n30\n9000000000\n',
    output: '9000000080\n',
  },
  caseLabel: {
    task: 'return a + b (each case printed after "Case #i: ")',
    format: f({
      v: 1,
      params: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' },
      ],
      lines: [['a', 'b']],
      cases: { count: 'T' },
      ret: { type: 'int', label: 'Case #{i}: ' },
    }),
    input: '2\n1 2\n3 4\n',
    output: 'Case #1: 3\nCase #2: 7\n',
  },
  scenario: {
    task: 'return arr unchanged (a label line before each case and a blank line after it)',
    format: f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'arr', type: 'int[]', len: 'n' },
      ],
      lines: [['n', 'arr']],
      cases: { until: '0' },
      ret: { type: 'int[]', sep: '\n', label: 'Scenario #{i}:\n', blank: true },
    }),
    input: '2 5 1\n1 9\n0\n',
    // The blank line after the last case stays; judges ignore it.
    output: 'Scenario #1:\n5\n1\n\nScenario #2:\n9\n\n',
  },
} satisfies Record<string, Case>;

export type CaseName = keyof typeof CASES;

/** Compiles and runs each case's program; `code` is the user's solution per case. */
export function nativeSuite(glue: GlueId, tool: Toolchain, code: Record<CaseName, string>): void {
  describe.skipIf(!NATIVE)(`${glue} glue on a real toolchain`, { timeout: 600_000 }, () => {
    for (const [name, c] of Object.entries(CASES) as [CaseName, Case][]) {
      it(name, () => {
        const dir = mkdtempSync(path.join(tmpdir(), `cib-${glue}-`));
        try {
          const program = buildProgram(glue, c.format, code[name]);
          writeFileSync(path.join(dir, tool.file), program.source);
          for (const [cmd, ...args] of tool.build ?? []) {
            const r = spawnSync(cmd as string, args, { cwd: dir, encoding: 'utf8' });
            expect(
              r.status,
              `${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}\n${program.source}`,
            ).toBe(0);
          }
          const [cmd, ...args] = tool.run;
          const r = spawnSync(cmd as string, args, { cwd: dir, input: c.input, encoding: 'utf8' });
          expect(r.status, `${r.stderr}\n${program.source}`).toBe(0);
          expect(r.stdout).toBe(c.output);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    }
  });
}
