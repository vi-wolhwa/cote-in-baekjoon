/**
 * Solution-function mode for an editor (ADR-0006), shared by the practice IDE and the mock
 * exam: the on/off choice, the problem's format and where it came from, code kept per mode
 * (`code:{id}:{group}` and `code:{id}:{group}:fn`), starters, and the program that runs and
 * is submitted (the user's code plus glue).
 */
import { useRef, useState } from 'preact/hooks';
import type { Problem } from '@/boj/problem';
import type { RunResponse } from '@/shared/messages';
import { languageInfo, type LanguageId } from '@/shared/languages';
import { sameFormat, type Format } from '@/solution/dsl';
import { buildProgram, mapRunMessages } from '@/solution/program';
import { resolveFormat, type Resolved } from '@/solution/source';
import { solutionFileName, starterCode } from '@/solution/starter';
import type { EditorHandle } from './editor';
import * as store from './storage';

type SolutionProblem = Pick<Problem, 'id' | 'samples' | 'labels' | 'sections'>;

export interface SolutionDeps {
  /** The problem; undefined while the exam has not loaded it. */
  problem: SolutionProblem | undefined;
  problemId: number;
  editor: { current: EditorHandle | undefined };
  language: { current: LanguageId };
  /** Called before code is swapped, so a pending autosave does not write to the wrong key. */
  flushSave: () => void;
}

export interface RunPlan {
  code: string;
  transform?: (r: RunResponse) => RunResponse;
}

export function useSolution(deps: SolutionDeps) {
  const [pref, setPref] = useState(true);
  const [resolved, setResolved] = useState<Resolved>({});
  const fnRef = useRef(false);
  const formatRef = useRef<Format | undefined>(undefined);
  const fn = pref && resolved.format !== undefined;
  fnRef.current = fn;
  formatRef.current = resolved.format;

  const group = (lang: LanguageId, on = fnRef.current) =>
    store.codeGroupFor(languageInfo(lang).codeGroup, on);
  const starter = (lang: LanguageId, on = fnRef.current, format = formatRef.current) =>
    on && format ? starterCode(languageInfo(lang).engine, format) : languageInfo(lang).starter;

  /**
   * Loads the choice and the format; returns whether solution mode is on. With an editor
   * already showing code (the exam loads the statement later), its code follows the mode.
   */
  const load = async (problem = deps.problem, editorShown = false): Promise<boolean> => {
    const [on, saved] = await Promise.all([
      store.loadSolutionMode(),
      store.loadUserFormat(deps.problemId),
    ]);
    const res = problem ? resolveFormat(problem, saved) : {};
    const next = on && res.format !== undefined;
    if (editorShown && next !== fnRef.current) await swap(next, res.format);
    setPref(on);
    setResolved(res);
    fnRef.current = next;
    formatRef.current = res.format;
    return next;
  };

  /** Saves the editor's code under the current mode and shows the code of `on`. */
  const swap = async (on: boolean, format = formatRef.current) => {
    const lang = deps.language.current;
    const current = deps.editor.current?.getCode();
    deps.flushSave();
    if (current !== undefined) await store.saveCode(deps.problemId, group(lang), current);
    const saved = await store.loadCode(deps.problemId, group(lang, on));
    fnRef.current = on;
    formatRef.current = format;
    deps.editor.current?.setCode(saved ?? starter(lang, on, format));
  };

  const setMode = async (on: boolean) => {
    if (on === fnRef.current || (on && !formatRef.current)) return;
    await swap(on);
    setPref(on);
    void store.saveSolutionMode(on);
  };

  /** The user saved a format: it becomes this problem's format, and the mode turns on. */
  const saveFormat = async (format: Format) => {
    const old = formatRef.current;
    await store.saveUserFormat(deps.problemId, format);
    const lang = deps.language.current;
    if (!fnRef.current) {
      await swap(true, format);
      setPref(true);
      void store.saveSolutionMode(true);
    } else if (old && !sameFormat(old, format)) {
      // Untouched starting code follows the new signature.
      if (deps.editor.current?.getCode() === starter(lang, true, old)) {
        deps.editor.current.setCode(starter(lang, true, format));
      }
    }
    formatRef.current = format;
    setResolved({ format, source: 'user' });
  };

  /** Drops the user's format; the bundled or inferred one (if any) takes over. */
  const resetFormat = async () => {
    await store.clearUserFormat(deps.problemId);
    const res = deps.problem ? resolveFormat(deps.problem, undefined) : {};
    if (fnRef.current && !res.format) await swap(false, undefined);
    formatRef.current = res.format;
    setResolved(res);
  };

  /** What runs: the code itself, or the code with glue and messages mapped back to it. */
  const runPlan = (code: string, lang: LanguageId): RunPlan => {
    const format = formatRef.current;
    if (!fnRef.current || !format) return { code };
    const engine = languageInfo(lang).engine;
    const program = buildProgram(engine, format, code);
    return {
      code: program.source,
      transform: (r) => {
        if (!r.result) return r;
        const mapped = mapRunMessages(engine, program, r.result);
        const result = { ...r.result, stderr: mapped.stderr };
        if (mapped.error !== undefined) result.error = mapped.error;
        if (mapped.compileError !== undefined) result.compileError = mapped.compileError;
        return { ...r, result };
      },
    };
  };

  return {
    fn,
    resolved,
    format: resolved.format,
    load,
    group,
    starter,
    setMode,
    saveFormat,
    resetFormat,
    runPlan,
    /** The source to submit: the code, with glue in solution mode. */
    submission: (code: string, lang: LanguageId) => runPlan(code, lang).code,
    fileName: (lang: LanguageId) =>
      fnRef.current ? solutionFileName(languageInfo(lang).engine) : languageInfo(lang).fileName,
  };
}

export type Solution = ReturnType<typeof useSolution>;
