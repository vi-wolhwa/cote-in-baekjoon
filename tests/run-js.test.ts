import { describe, expect, it } from 'vitest';
import { inspect, runJs, splitLines } from '@/runner/js/execute';

describe('runJs: stdin styles used on Baekjoon', () => {
  it('reads /dev/stdin with fs.readFileSync().toString()', async () => {
    const code = `const [a, b] = require('fs').readFileSync('/dev/stdin').toString().trim().split(' ').map(Number);
console.log(a + b);`;
    const r = await runJs(code, '1 2\n');
    expect(r).toMatchObject({ stdout: '3\n', exitCode: 0, error: undefined });
  });

  it('reads fd 0 with an encoding argument', async () => {
    const r = await runJs(
      `const s = require('fs').readFileSync(0, 'utf8'); console.log(s.length);`,
      'abc',
    );
    expect(r.stdout).toBe('3\n');
  });

  it('emits readline line and close events in order', async () => {
    const code = `const rl = require('readline').createInterface({ input: process.stdin });
const lines = [];
rl.on('line', (l) => lines.push(l)).on('close', () => { console.log(lines.join('|')); process.exit(0); });`;
    const r = await runJs(code, 'x\ny\nz\n');
    expect(r.stdout).toBe('x|y|z\n');
    expect(r.exitCode).toBe(0);
  });

  it('supports for await over readline', async () => {
    const code = `const rl = require('readline').createInterface({ input: process.stdin });
(async () => { let sum = 0; for await (const line of rl) sum += Number(line); console.log(sum); })();`;
    const r = await runJs(code, '1\n2\n3');
    expect(r.stdout).toBe('6\n');
  });

  it('supports process.stdin data and end events', async () => {
    const code = `let buf = ''; process.stdin.on('data', (c) => (buf += c)); process.stdin.on('end', () => console.log(buf.trim().toUpperCase()));`;
    const r = await runJs(code, 'hello\n');
    expect(r.stdout).toBe('HELLO\n');
  });

  it('writes with process.stdout.write without adding newlines', async () => {
    const r = await runJs(`process.stdout.write('a'); process.stdout.write('b\\n');`, '');
    expect(r.stdout).toBe('ab\n');
  });
});

describe('runJs: errors and limits', () => {
  it('reports an uncaught runtime error', async () => {
    const r = await runJs(`null.x;`, '');
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/^TypeError: /);
  });

  it('reports a syntax error', async () => {
    const r = await runJs(`const = ;`, '');
    expect(r.error).toMatch(/^SyntaxError: /);
  });

  it('reports an error thrown inside a readline handler', async () => {
    const code = `require('readline').createInterface({}).on('line', () => { throw new RangeError('bad'); });`;
    const r = await runJs(code, '1\n');
    expect(r.error).toBe('RangeError: bad');
  });

  it('stops at process.exit and keeps the exit code', async () => {
    const r = await runJs(`console.log('a'); process.exit(3); console.log('b');`, '');
    expect(r).toMatchObject({ stdout: 'a\n', exitCode: 3, error: undefined });
  });

  it('stops when output exceeds the limit', async () => {
    const r = await runJs(`for (let i = 0; i < 1e6; i++) console.log(i);`, '', {
      outputLimit: 1000,
    });
    expect(r.outputLimitExceeded).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(1000);
  });

  it('rejects unknown modules', async () => {
    const r = await runJs(`require('child_process');`, '');
    expect(r.error).toBe("Error: Cannot find module 'child_process'");
  });

  it('waits for timers before finishing', async () => {
    const r = await runJs(`setTimeout(() => console.log('late'), 5); console.log('early');`, '');
    expect(r.stdout).toBe('early\nlate\n');
  });
});

describe('helpers', () => {
  it('splits lines like Node readline', () => {
    expect(splitLines('')).toEqual([]);
    expect(splitLines('a\r\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
  });

  it('inspects values like Node for common cases', () => {
    expect(inspect([1, 'a', [2]])).toBe("[ 1, 'a', [ 2 ] ]");
    expect(inspect({ a: 1 })).toBe('{ a: 1 }');
    expect(inspect(new Set([1]))).toBe('Set(1) { 1 }');
  });
});
