import { describe, expect, it } from 'vitest';
import {
  formatDiagnostics,
  MAIN_CLASS_MESSAGE,
  MAIN_METHOD_MESSAGE,
  maskNonCode,
  needsThreadShim,
  PACKAGE_MESSAGE,
  prepareSources,
  rewriteStdin,
  RUNNER_SOURCE,
  UNCAUGHT_PREFIX,
} from '@/runner/java/preprocess';
import type { JavaDiagnostic } from '@/runner/java/teavm';

describe('maskNonCode', () => {
  it('blanks comments, strings, chars and text blocks but keeps length and lines', () => {
    const code = [
      'int a = 1; // System.in',
      '/* System.in',
      '   */ String s = "System.in \\" x";',
      'char c = \'"\'; String t = """',
      '  System.in',
      '  """;',
    ].join('\n');
    const masked = maskNonCode(code);
    expect(masked).toHaveLength(code.length);
    expect(masked.split('\n')).toHaveLength(code.split('\n').length);
    expect(masked).not.toContain('System');
    expect(masked).toContain('int a = 1;');
    expect(masked).toContain('String s = "');
  });
});

describe('rewriteStdin', () => {
  it('replaces System.in in code only', () => {
    const code = [
      'BufferedReader br = new BufferedReader(new InputStreamReader(System.in));',
      'Scanner sc = new Scanner(java.lang.System.in);',
      'String s = "System.in"; // System.in',
      'int n = System.in.read();',
      'MySystem.in(); x.System.in = 1; System.inner();',
    ].join('\n');
    expect(rewriteStdin(code).split('\n')).toEqual([
      'BufferedReader br = new BufferedReader(new InputStreamReader(__Stdin.in));',
      'Scanner sc = new Scanner(__Stdin.in);',
      'String s = "System.in"; // System.in',
      'int n = __Stdin.in.read();',
      'MySystem.in(); x.System.in = 1; System.inner();',
    ]);
  });

  it('keeps line numbers when the expression spans lines', () => {
    const code = 'new Scanner(System\n    .in);\nint x = ;';
    const rewritten = rewriteStdin(code);
    expect(rewritten.split('\n')).toHaveLength(3);
    expect(rewritten.split('\n')[2]).toBe('int x = ;');
    expect(rewritten).toContain('__Stdin.in');
  });
});

describe('needsThreadShim', () => {
  it('adds the stand-in for the big-stack thread idiom', () => {
    expect(needsThreadShim('new Thread(null, new Main(), "", 1 << 26).start();')).toBe(true);
    expect(needsThreadShim('Thread.sleep(10);')).toBe(false);
    expect(needsThreadShim('class Thread {} new Thread();')).toBe(false);
  });

  it('ignores Thread in comments and strings', () => {
    expect(needsThreadShim(maskNonCode('// new Thread(r)\nString s = "new Thread(";'))).toBe(false);
  });
});

describe('prepareSources', () => {
  const main = 'public class Main {\n    public static void main(String[] args) {}\n}\n';

  it('adds the start class and stdin holder', () => {
    const prepared = prepareSources(main, 'class Thread {}');
    expect(prepared).toEqual({
      files: {
        'Main.java': main,
        '__Runner.java': RUNNER_SOURCE,
        '__Stdin.java': expect.stringContaining('public static java.io.InputStream in;'),
      },
    });
  });

  it('adds Thread.java only when the solution creates a thread', () => {
    const code = main.replace('{}', '{ new Thread(null, () -> {}, "", 1 << 26).start(); }');
    const prepared = prepareSources(code, 'class Thread {}');
    expect('files' in prepared && prepared.files['Thread.java']).toBe('class Thread {}');
  });

  it('rejects a package declaration with its line', () => {
    expect(prepareSources(`// 풀이\n\npackage boj;\n${main}`, '')).toEqual({
      compileError: `Main.java:3: ${PACKAGE_MESSAGE}`,
    });
  });

  it('requires a class named Main', () => {
    expect(prepareSources('public class Solution {}', '')).toEqual({
      compileError: MAIN_CLASS_MESSAGE,
    });
    // "class Main" inside a comment does not count.
    expect(prepareSources('// class Main\npublic class A {}', '')).toEqual({
      compileError: MAIN_CLASS_MESSAGE,
    });
  });

  it('reports uncaught exceptions like the JVM', () => {
    expect(RUNNER_SOURCE).toContain(`"${UNCAUGHT_PREFIX.replaceAll('"', '\\"')}" + t`);
  });
});

describe('formatDiagnostics', () => {
  const diag = (d: Partial<JavaDiagnostic>): JavaDiagnostic => ({
    severity: 'error',
    type: 'javac',
    fileName: 'Main.java',
    lineNumber: 1,
    message: '',
    ...d,
  });

  it('formats javac errors with the line and skips warnings', () => {
    expect(
      formatDiagnostics([
        diag({ lineNumber: 3, message: "';' expected" }),
        diag({ severity: 'warning', message: 'unchecked' }),
      ]),
    ).toBe("Main.java:3: error: ';' expected");
  });

  it('explains a missing main method', () => {
    expect(
      formatDiagnostics([diag({ fileName: '__Runner.java', message: 'cannot find symbol' })]),
    ).toBe(MAIN_METHOD_MESSAGE);
  });

  it('explains library features TeaVM lacks', () => {
    expect(formatDiagnostics([diag({ type: 'teavm', fileName: null, message: 'x' })])).toContain(
      '브라우저 실행에서 지원하지 않는 Java 기능입니다',
    );
  });
});
