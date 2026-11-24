/**
 * Builds the program that runs and is submitted in solution-function mode: the user's code
 * with the glue code after it (and, for C++/Java, a few lines before it). Glue comes only
 * from these fixed templates, never from AI output (ADR-0006).
 */
import { maskNonCode } from '@/runner/java/preprocess';
import type { EngineId } from '@/shared/languages';
import type { Format } from './dsl';
import { CPP_PREFIX, cppGlue } from './glue/cpp';
import { JAVA_PREFIX, javaGlue, unpublicSolution } from './glue/java';
import { jsGlue } from './glue/js';
import { makePlan } from './glue/plan';
import { pythonGlue } from './glue/python';

export interface Program {
  /** The whole source to run or submit. */
  source: string;
  /** Lines added before the user's code. */
  prefixLines: number;
  /** Lines of the user's code. */
  userLines: number;
}

const PREFIX: Record<EngineId, string> = { js: '', python: '', cpp: CPP_PREFIX, java: JAVA_PREFIX };

export function buildProgram(engine: EngineId, format: Format, code: string): Program {
  const plan = makePlan(format);
  const prefix = PREFIX[engine];
  let user = code.replace(/\r\n?/g, '\n');
  if (!user.endsWith('\n')) user += '\n';
  if (engine === 'java') user = unpublicSolution(user, maskNonCode(user));
  const glue =
    engine === 'js'
      ? jsGlue(plan, format.ret)
      : engine === 'python'
        ? pythonGlue(plan, format.ret)
        : engine === 'cpp'
          ? cppGlue(plan, format.ret)
          : javaGlue(plan, format.ret);
  return {
    source: `${prefix}${user}\n${glue}`,
    prefixLines: prefix.split('\n').length - 1,
    userLines: user.split('\n').length - 1,
  };
}

export const GLUE_INPUT_MESSAGE =
  '입출력 코드에서 오류: 형식이 예제와 맞지 않을 수 있어요. 입출력 형식을 확인해 주세요.';
export const NO_SOLUTION_MESSAGE =
  'solution 함수가 없어요. 시작 코드처럼 solution 함수를 만들어 주세요.';
export const GLUE_COMPILE_NOTE =
  '입출력 코드에서 오류가 났어요. solution 함수의 이름, 매개변수, 반환 타입이 입출력 형식과 맞는지 확인해 주세요.';

/** Where a line of the program came from. */
function locate(program: Program, line: number): { user: number } | 'glue' {
  const user = line - program.prefixLines;
  if (user >= 1 && user <= program.userLines) return { user };
  return 'glue';
}

/**
 * Rewrites compiler and runtime messages so line numbers point at the user's code. Lines in
 * the glue lose their number and add a Korean note. Returns the text and whether glue was hit.
 */
export function mapLines(
  engine: EngineId,
  program: Program,
  text: string,
): { text: string; glue: boolean } {
  let glue = false;
  const fix = (n: string, user: (k: number) => string, inGlue: string) => {
    const at = locate(program, Number(n));
    if (at === 'glue') {
      glue = true;
      return inGlue;
    }
    return user(at.user);
  };
  let out = text;
  if (engine === 'cpp') {
    out = out
      .replace(/solution\.cpp:(\d+):(\d+):/g, (_, n: string, col: string) =>
        fix(n, (k) => `solution.cpp:${k}:${col}:`, 'solution.cpp(입출력 코드):'),
      )
      .replace(/^(\s*)(\d+)( \| )/gm, (_, sp: string, n: string, bar: string) =>
        fix(
          n,
          (k) => `${sp}${String(k).padStart(n.length)}${bar}`,
          `${sp}${' '.repeat(n.length)}${bar}`,
        ),
      );
  } else if (engine === 'java') {
    out = out.replace(/Main\.java:(\d+):/g, (_, n: string) =>
      fix(n, (k) => `Solution.java:${k}:`, 'Solution.java(입출력 코드):'),
    );
  } else if (engine === 'python') {
    let last: 'user' | 'glue' | undefined;
    out = out.replace(/File "solution\.py", line (\d+)/g, (_, n: string) => {
      const at = locate(program, Number(n));
      last = at === 'glue' ? 'glue' : 'user';
      return at === 'glue'
        ? 'File "solution.py" (입출력 코드)'
        : `File "solution.py", line ${at.user}`;
    });
    // Only the innermost frame says where the error happened.
    glue = last === 'glue';
  }
  return { text: out, glue };
}

export interface RunText {
  compileError?: string;
  error?: string;
  stderr: string;
}

/** Applies mapLines and the glue's own error markers to one run's messages. */
export function mapRunMessages(engine: EngineId, program: Program, run: RunText): RunText {
  const all = `${run.compileError ?? ''}\n${run.error ?? ''}\n${run.stderr}`;
  if (all.includes('__cib_nosolution')) return { error: NO_SOLUTION_MESSAGE, stderr: '' };
  if (all.includes('__cib_input')) return { error: GLUE_INPUT_MESSAGE, stderr: '' };
  const out: RunText = { stderr: run.stderr };
  if (run.compileError !== undefined) {
    const m = mapLines(engine, program, run.compileError);
    out.compileError = m.glue ? `${m.text}\n\n${GLUE_COMPILE_NOTE}` : m.text;
  }
  if (run.error !== undefined) out.error = mapLines(engine, program, run.error).text;
  const s = mapLines(engine, program, run.stderr);
  out.stderr = s.glue && engine === 'python' ? `${s.text}\n${GLUE_COMPILE_NOTE}` : s.text;
  return out;
}
