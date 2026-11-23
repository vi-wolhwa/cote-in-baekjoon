/**
 * Compiles and runs Java with the vendored teavm-javac under Node. A fresh Compiler per
 * compile: reusing one crashed for some program sequences under Node (ADR-0004).
 * `System.exit` is not tested here: under Node, TeaVM's runtime calls process.exit.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createJavaToolchain, type JavaToolchain } from '@/runner/java/compile';
import { describeJavaFailure, runJava, uncaughtException } from '@/runner/java/run';
import type { TeaVMRuntime } from '@/runner/java/teavm';

const VENDOR = path.resolve('vendor/teavm-javac');
const bytes = (name: string) => readFileSync(path.join(VENDOR, name));
const int8 = (b: Buffer) => new Int8Array(b.buffer, b.byteOffset, b.byteLength);

let runtime: TeaVMRuntime;
let toolchain: JavaToolchain;

beforeAll(async () => {
  runtime = (await import(
    pathToFileURL(path.join(VENDOR, 'compiler.wasm-runtime.js')).href
  )) as TeaVMRuntime;
  toolchain = await createJavaToolchain({
    runtime,
    compilerWasm: bytes('compiler.wasm'),
    sdk: int8(bytes('compile-classlib-teavm.bin')),
    classlib: int8(bytes('runtime-classlib-teavm.bin')),
    threadShim: readFileSync('src/runner/java/Thread.java', 'utf8'),
    freshPerCompile: true,
  });
}, 30_000);

async function run(code: string, stdin = '', outputLimit?: number) {
  const compiled = await toolchain.compile(code);
  if ('compileError' in compiled) return { compileError: compiled.compileError };
  return runJava(runtime.load, compiled.wasm, stdin, { outputLimit });
}

const main = (body: string) =>
  `import java.io.*;\nimport java.util.*;\n\npublic class Main {\n${body}\n}\n`;

describe('Java under Node', { timeout: 30_000 }, () => {
  it('runs A+B with Scanner', async () => {
    const r = await run(
      main(`    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println(sc.nextInt() + sc.nextInt());
    }`),
      '1 2\n',
    );
    expect(r).toMatchObject({ stdout: '3\n', exitCode: 0, outputLimitExceeded: false });
  });

  it('reads with BufferedReader and StringTokenizer and writes Korean', async () => {
    const r = await run(
      main(`    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        long a = Long.parseLong(st.nextToken()), b = Long.parseLong(st.nextToken());
        StringBuilder sb = new StringBuilder();
        sb.append(a + b).append("\\n").append("합계").append('\\n');
        System.out.print(sb);
    }`),
      '3000000000 4000000000\n',
    );
    expect(r).toMatchObject({ stdout: '7000000000\n합계\n', exitCode: 0 });
  });

  it('reports a compile error with its line', async () => {
    const r = await run(
      main('    public static void main(String[] args) {\n        int x = "s";\n    }'),
    );
    expect(r.compileError).toMatch(/^Main\.java:6: error: incompatible types/);
  });

  it('reports an uncaught exception after the output so far', async () => {
    const r = await run(
      main(`    public static void main(String[] args) {
        System.out.println("before");
        int[] a = new int[3];
        a[5] = 1;
    }`),
    );
    expect(r).toMatchObject({
      stdout: 'before\n',
      exitCode: 1,
      error: 'java.lang.ArrayIndexOutOfBoundsException',
    });
  });

  it('runs the big-stack thread idiom synchronously', async () => {
    const r = await run(
      main(`    static int depth(int n) { return n == 0 ? 0 : 1 + depth(n - 1); }
    public static void main(String[] args) throws Exception {
        Thread t = new Thread(null, () -> System.out.println(depth(5000)), "main", 1 << 26);
        t.start();
        t.join();
    }`),
    );
    expect(r).toMatchObject({ stdout: '5000\n', exitCode: 0 });
  });

  it('stops at the output limit', async () => {
    const r = await run(
      main(`    public static void main(String[] args) {
        for (int i = 0; i < 1000; i++) System.out.println(i);
    }`),
      '',
      100,
    );
    expect(r).toMatchObject({ exitCode: 1, outputLimitExceeded: true });
  });
});

describe('Java result mapping', () => {
  it('finds the exception in the start class output', () => {
    expect(uncaughtException('x\nException in thread "main" java.lang.ArithmeticException\n')).toBe(
      'java.lang.ArithmeticException',
    );
    expect(uncaughtException('just stderr\n')).toBeUndefined();
  });

  it('explains stack overflow and huge arrays', () => {
    expect(describeJavaFailure(new RangeError('Maximum call stack size exceeded'))).toMatch(
      /^java\.lang\.StackOverflowError: 재귀가 너무 깊어/,
    );
    expect(describeJavaFailure(new Error('requested new array is too large'))).toMatch(
      /^java\.lang\.OutOfMemoryError/,
    );
    expect(describeJavaFailure(new Error('unreachable'))).toBe('런타임 에러 — unreachable');
  });
});
