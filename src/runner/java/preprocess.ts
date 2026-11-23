/**
 * Source preparation for the Java engine (#63, ADR-0004).
 *
 * TeaVM's `System.in` always reports end of input and has no `setIn`, so `System.in` in the
 * solution is replaced with `__Stdin.in`, which the `__Runner` start class fills with the
 * sample input. Line numbers are kept so javac's diagnostics still point at the user's code.
 */
import type { JavaDiagnostic } from './teavm';

/** Source file name; matches the IDE's file tab and Baekjoon's `Main.java`. */
export const SOURCE_FILE = 'Main.java';
export const MAIN_CLASS = '__Runner';

/** Marks the uncaught-exception line the start class prints, like the JVM does. */
export const UNCAUGHT_PREFIX = 'Exception in thread "main" ';

/**
 * Start class: puts stdin (passed as the only argument) into `__Stdin.in`, runs `Main.main`
 * and reports an uncaught exception like the JVM, then rethrows it so the run ends with code 1.
 */
export const RUNNER_SOURCE = `public final class __Runner {
    public static void main(String[] args) throws Throwable {
        __Stdin.in = new java.io.ByteArrayInputStream(
            args[0].getBytes(java.nio.charset.StandardCharsets.UTF_8));
        try {
            Main.main(new String[0]);
        } catch (Throwable t) {
            System.out.flush();
            System.err.println("${UNCAUGHT_PREFIX.replaceAll('"', '\\"')}" + t);
            throw t;
        }
        System.out.flush();
    }
}
`;

export const STDIN_SOURCE = `public final class __Stdin {
    public static java.io.InputStream in;
}
`;

/**
 * The code with comments, string, text block and char literal contents blanked out (same
 * length, newlines kept), so searches only see Java tokens.
 */
export function maskNonCode(code: string): string {
  const out = code.split('');
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      blank(i, stop);
      i = stop;
    } else if (code.startsWith('"""', i)) {
      let j = i + 3;
      while (j < n && !code.startsWith('"""', j)) j += code[j] === '\\' ? 2 : 1;
      const stop = Math.min(n, j + 3);
      blank(i + 1, stop - 1);
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && code[j] !== c && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join('');
}

const SYSTEM_IN = /(?<![\w$.])(?:java\s*\.\s*lang\s*\.\s*)?System\s*\.\s*in(?![\w$])/g;

/** Replaces `System.in` (outside comments and strings) with `__Stdin.in`, keeping lines. */
export function rewriteStdin(code: string, masked = maskNonCode(code)): string {
  let result = '';
  let last = 0;
  for (const match of masked.matchAll(SYSTEM_IN)) {
    const start = match.index;
    const text = code.slice(start, start + match[0].length);
    result += code.slice(last, start) + '__Stdin.in' + '\n'.repeat(text.split('\n').length - 1);
    last = start + match[0].length;
  }
  return result + code.slice(last);
}

/**
 * True when the solution creates a Thread (the "big stack" idiom) and does not declare its
 * own `Thread` type: then the synchronous stand-in (Thread.java) is added.
 */
export function needsThreadShim(masked: string): boolean {
  return (
    /\bnew\s+Thread\s*\(/.test(masked) &&
    !/\b(?:class|interface|enum|record)\s+Thread\b/.test(masked)
  );
}

export const PACKAGE_MESSAGE =
  'package 선언을 지워 주세요. 백준은 패키지 없이 Main 클래스를 실행합니다.';
export const MAIN_CLASS_MESSAGE =
  'Main 클래스가 없습니다. 백준 Java 제출은 클래스 이름이 Main이어야 합니다. (public class Main)';
export const MAIN_METHOD_MESSAGE =
  'Main 클래스에 public static void main(String[] args) 메서드가 필요합니다.';

export type PreparedSources = { files: Record<string, string> } | { compileError: string };

/** Checks what Baekjoon requires of a Java solution and builds the files to compile. */
export function prepareSources(code: string, threadShim: string): PreparedSources {
  const masked = maskNonCode(code);
  const pkg = /^\s*package\s+[\w.\s]+;/m.exec(masked);
  if (pkg) {
    const line = masked.slice(0, pkg.index + pkg[0].search(/\S/)).split('\n').length;
    return { compileError: `${SOURCE_FILE}:${line}: ${PACKAGE_MESSAGE}` };
  }
  if (!/\bclass\s+Main\b/.test(masked)) return { compileError: MAIN_CLASS_MESSAGE };
  const files: Record<string, string> = {
    [SOURCE_FILE]: rewriteStdin(code, masked),
    '__Runner.java': RUNNER_SOURCE,
    '__Stdin.java': STDIN_SOURCE,
  };
  if (needsThreadShim(masked)) files['Thread.java'] = threadShim;
  return { files };
}

/** Longer compiler output is cut. */
const MAX_DIAGNOSTICS = 20_000;

const isError = (d: JavaDiagnostic) => d.severity.toLowerCase() === 'error';

/**
 * javac/TeaVM errors as "Main.java:3: error: …". Errors in the generated start class mean
 * `Main.main` is missing; TeaVM errors mean a library feature the browser build lacks.
 */
export function formatDiagnostics(diagnostics: JavaDiagnostic[]): string {
  const errors = diagnostics.filter(isError);
  const lines: string[] = [];
  for (const d of errors) {
    if (d.type === 'javac' && d.fileName && d.fileName !== SOURCE_FILE) {
      if (d.fileName === '__Runner.java') lines.push(MAIN_METHOD_MESSAGE);
      else lines.push(`${d.fileName}:${d.lineNumber}: error: ${d.message}`);
    } else if (d.type === 'javac') {
      lines.push(`${SOURCE_FILE}:${d.lineNumber}: error: ${d.message}`);
    } else {
      lines.push(`브라우저 실행에서 지원하지 않는 Java 기능입니다: ${d.message}`);
    }
  }
  const text = [...new Set(lines)].join('\n');
  if (!text) return '컴파일에 실패했습니다.';
  return text.length > MAX_DIAGNOSTICS ? `${text.slice(0, MAX_DIAGNOSTICS)}\n…` : text;
}
