/**
 * C++ glue on g++, as Baekjoon compiles C++17 (`g++ -O2 -std=gnu++17 -DONLINE_JUDGE -DBOJ`):
 * every shared solution-mode case (tests/helpers/solution-run-shared.ts) and DSL extension
 * case (ext-cases.ts), with the same C++ solutions the browser engine uses. The browser's
 * clang/wasm32 runs only the cases where it differs (tests/solution-run-cpp.test.ts).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Format } from '@/solution/dsl';
import { buildProgram } from '@/solution/program';
import { EXT_CODE } from '../helpers/solution-run-ext';
import { CASES } from '../helpers/solution-run-shared';
import { EXT_CASES } from './ext-cases';
import { NATIVE } from './harness';

interface NativeCase {
  format: Format;
  input: string;
  output: string;
  code: string;
}

const cases: [string, NativeCase][] = [
  ...Object.entries(CASES).flatMap(([name, c]) =>
    c.code.cpp === undefined ? [] : [[name, { ...c, code: c.code.cpp }] as [string, NativeCase]],
  ),
  ...Object.entries(EXT_CASES).flatMap(([name, c]) => {
    const code = EXT_CODE[name as keyof typeof EXT_CASES].cpp;
    return code === undefined ? [] : [[name, { ...c, code }] as [string, NativeCase]];
  }),
];

describe.skipIf(!NATIVE)('cpp glue on g++', { timeout: 600_000 }, () => {
  for (const [name, c] of cases) {
    it(name, () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'cib-cpp-'));
      try {
        const program = buildProgram('cpp', c.format, c.code);
        writeFileSync(path.join(dir, 'solution.cpp'), program.source);
        const args = ['-O2', '-std=gnu++17', '-DONLINE_JUDGE', '-DBOJ', '-o', 'main'];
        const build = spawnSync('g++', [...args, 'solution.cpp'], { cwd: dir, encoding: 'utf8' });
        expect(build.status, `${build.stderr}\n${program.source}`).toBe(0);
        const r = spawnSync('./main', [], { cwd: dir, input: c.input, encoding: 'utf8' });
        expect(r.status, `${r.stderr}\n${program.source}`).toBe(0);
        expect(r.stdout).toBe(c.output);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
