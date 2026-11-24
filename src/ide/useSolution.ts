/**
 * Solution-function mode for an editor (ADR-0006), shared by the practice IDE and the mock
 * exam: the on/off choice, the problem's format and where it came from, code kept per mode
 * (`code:{id}:{group}` and `code:{id}:{group}:fn`), starters, and the program that runs and
 * is submitted (the user's code plus glue).
 */
import { useRef, useState } from 'preact/hooks';
import type { Problem } from '@/boj/problem';
import type { RunResponse } from '@/shared/messages';
import { languageInfo, solutionLanguageReason, type LanguageId } from '@/shared/languages';
import { sameFormat, type Format } from '@/solution/dsl';
import { buildProgram, mapRunMessages } from '@/solution/program';
import { resolveFormat, type Resolved } from '@/solution/source';
import { refreshStarter, solutionFileName, starterCode } from '@/solution/starter';
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
  /** The mode is on for the problem; a language without glue still uses standard I/O. */
  const fnRef = useRef(false);
  const formatRef = useRef<Format | undefined>(undefined);
  const modeOn = pref && resolved.format !== undefined;
  fnRef.current = modeOn;
  formatRef.current = resolved.format;
  const languageReason = solutionLanguageReason(deps.language.current);

  /** The glue family when solution mode applies to this language. */
  const glueFor = (lang: LanguageId, mode: boolean) => (mode ? languageInfo(lang).glue : undefined);
  const group = (lang: LanguageId, mode = fnRef.current) =>
    store.codeGroupFor(languageInfo(lang).codeGroup, glueFor(lang, mode) !== undefined);
  const starter = (lang: LanguageId, mode = fnRef.current, format = formatRef.current) => {
    const glue = glueFor(lang, mode);
    return glue && format ? starterCode(glue, format) : languageInfo(lang).starter;
  };

  /** Saved code, an outdated starter refreshed, or the starting code when nothing is saved. */
  const codeOr = (
    saved: string | undefined,
    lang: LanguageId,
    mode = fnRef.current,
    format = formatRef.current,
  ) => {
    const fresh = starter(lang, mode, format);
    return saved === undefined ? fresh : refreshStarter(saved, fresh);
  };

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
    deps.editor.current?.setCode(codeOr(saved, lang, on, format));
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
    const glue = glueFor(lang, fnRef.current);
    const engine = languageInfo(lang).engine;
    if (!glue || !format) return { code };
    const program = buildProgram(glue, format, code);
    return {
      code: program.source,
      transform: (r) => {
        if (!r.result || !engine) return r;
        const mapped = mapRunMessages(engine, program, r.result);
        const result = { ...r.result, stderr: mapped.stderr };
        if (mapped.error !== undefined) result.error = mapped.error;
        if (mapped.compileError !== undefined) result.compileError = mapped.compileError;
        return { ...r, result };
      },
    };
  };

  return {
    /** Solution mode is in effect for the current language. */
    fn: modeOn && !languageReason,
    resolved,
    /** Why the switch is off: the language, else the problem's format. */
    reason: languageReason ?? resolved.reason,
    /** '형식 만들기' applies: the problem has no format and the language has glue. */
    canDefine: !languageReason && resolved.reason !== undefined,
    format: resolved.format,
    load,
    group,
    starter,
    codeOr,
    setMode,
    saveFormat,
    resetFormat,
    runPlan,
    /** The source to submit: the code, with glue in solution mode. */
    submission: (code: string, lang: LanguageId) => runPlan(code, lang).code,
    fileName: (lang: LanguageId) => {
      const glue = glueFor(lang, fnRef.current);
      return glue ? solutionFileName(glue) : languageInfo(lang).fileName;
    },
  };
}

export type Solution = ReturnType<typeof useSolution>;
