/** TypeScript on the JavaScript engine (ADR-0007): types stripped by sucrase, then runJs. */
import { describe, expect, it } from 'vitest';
import { runJs } from '@/runner/js/execute';
import { stripTypes } from '@/runner/js/typescript';
import { languageInfo } from '@/shared/languages';

async function runTs(source: string, stdin = '') {
  const stripped = stripTypes(source);
  if ('compileError' in stripped) throw new Error(stripped.compileError);
  return runJs(stripped.code, stdin);
}

describe('stripTypes', () => {
  it('removes annotations, interfaces, generics, casts and non-null assertions', () => {
    const source = `interface Point { x: number; y: number }
type Pair<T> = [T, T];
const p: Point = { x: 1, y: 2 };
const pair: Pair<number> = [p.x, p.y as number];
function sum<T extends number>(xs: T[]): number { return xs.reduce((a, b) => a + b, 0); }
const maybe: number | undefined = sum(pair);
console.log(maybe!, <number>pair[0]);
`;
    const r = stripTypes(source);
    expect(r).not.toHaveProperty('compileError');
    const code = (r as { code: string }).code;
    expect(code).not.toMatch(/interface|: number|<T/);
    // Line numbers stay the same, so runtime errors point at the user's lines.
    expect(code.split('\n')).toHaveLength(source.split('\n').length);
  });

  it('turns syntax errors into compile errors at solution.ts', () => {
    expect(stripTypes('const a: number = 1;\nconst b: number = ;\n')).toEqual({
      compileError: expect.stringMatching(/^solution\.ts:2:\d+: error: Unexpected token/),
    });
  });
});

describe('TypeScript programs', () => {
  it('runs the starter-style stdin reading with type annotations', async () => {
    const source = `const input: string[] = require('fs').readFileSync('/dev/stdin').toString().trim().split('\\n');
const [a, b]: number[] = input[0].split(' ').map(Number);
class Acc { constructor(private total: number = 0) {} add(n: number): this { this.total += n; return this; } get value(): number { return this.total; } }
enum Mode { Sum = 1 }
console.log(new Acc().add(a).add(b).value * Mode.Sum);
`;
    expect(await runTs(source, '1 2\n')).toMatchObject({ stdout: '3\n', exitCode: 0 });
  });

  it('supports ES imports of Node modules', async () => {
    const source = `import * as fs from 'fs';
import { createInterface } from 'readline';
const text: string = fs.readFileSync(0, 'utf8');
console.log(text.trim().split(/\\s+/).length, typeof createInterface);
`;
    expect(await runTs(source, '1 2 3')).toMatchObject({ stdout: '3 function\n' });
  });

  it('keeps line numbers of runtime errors', async () => {
    const r = await runTs('const a: number = 1;\nconst o: any = null;\nconsole.log(o.x);\n');
    expect(r.error).toMatch(/TypeError/);
  });

  it('has a starter that runs', async () => {
    const r = await runTs(languageInfo('typescript').starter, 'hello\n');
    expect(r).toMatchObject({ exitCode: 0, error: undefined });
  });
});
