/**
 * One exam problem: statement, editor, run output and buttons, laid out like the practice
 * IDE (docs/design/ide-spec.md §8). The exam screen mounts one per problem (keyed by id), so
 * the editor, its undo history and the run output never leak between problems. Code is saved
 * under the practice keys `code:{id}:{group}`.
 *
 * 제출하기 does not submit: it saves the code as this problem's answer. The saved answers are
 * submitted to Baekjoon one after another when the exam ends (batch.ts).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Sample } from '@/boj/problem';
import { TestCaseDialog, ResetDialog } from '@/ide/dialogs';
import { createEditor, type EditorHandle } from '@/ide/editor';
import { FlagIcon } from '@/ide/icons';
import { ProblemPane, runBlockReason, runNote } from '@/ide/ProblemPane';
import { runCases } from '@/ide/run-cases';
import { RunOutput, type RunOutputProps } from '@/ide/RunOutput';
import { SplitPane } from '@/ide/SplitPane';
import * as store from '@/ide/storage';
import { Warnings } from '@/ide/submit';
import { FormatCard } from '@/ide/solution/FormatCard';
import { SolutionCaseDialog } from '@/ide/solution/SolutionCaseDialog';
import { SolutionToggle } from '@/ide/solution/SolutionToggle';
import { useSolution } from '@/ide/useSolution';
import { findBlockedPatterns } from '@/boj/waf';
import type { SandboxRunner } from '@/runner/client';
import { LanguageSelect, RunButton, SubmitOnlyNote } from '@/ide/language-controls';
import { languageInfo, type LanguageId } from '@/shared/languages';
import type { Theme } from '@/shared/theme';
import type { ExamAnswer } from './answers';
import { answerDiffers } from './batch';
import { formatClock, type ExamProblem } from './model';

export const ANSWER_SAVED = '답안을 저장했습니다. 시험이 끝나면 한꺼번에 제출합니다.';
export const ANSWER_DIFFERS = '저장한 답안과 달라요';

interface Props {
  examId: string;
  problem: ExamProblem;
  index: number;
  flagged: boolean;
  answer?: ExamAnswer;
  /** Why the statement could not be read, if it could not. */
  loadError?: string;
  startedAt: number;
  over: boolean;
  language: LanguageId;
  keymap: store.Keymap;
  theme: Theme;
  /**
   * Pane sizes, kept by the exam screen: each problem mounts its own workspace, and loading
   * them here would draw the default sizes for a frame first (a layout shift on every switch).
   */
  split: store.SplitSizes;
  onSplit: (change: (split: store.SplitSizes) => store.SplitSizes) => void;
  onSplitEnd: () => void;
  runner: SandboxRunner;
  warmEngines: Set<string>;
  onLanguage: (language: LanguageId) => void;
  onFlag: () => void;
  /** '다시 시도' after the statement could not be read. */
  onRetry: () => void;
  /** `solution`: the editor's code when it was saved in solution-function mode. */
  onSaveAnswer: (code: string, language: LanguageId, solution?: string) => void;
}

type Tab = 'run' | 'submit';
type Dialog = 'reset' | 'cases' | undefined;

export function ProblemWorkspace(props: Props) {
  const { problem, language, runner } = props;
  const body = problem.body;
  const { loadError } = props;
  const { split, onSplit: setSplit } = props;
  const [cases, setCases] = useState<Sample[]>([]);
  const [output, setOutput] = useState<RunOutputProps>({ state: 'empty' });
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>('run');
  const [dialog, setDialog] = useState<Dialog>();
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  /** The editor no longer holds the saved answer: only the saved one will be submitted. */
  const [differs, setDiffers] = useState(false);
  const [answerError, setAnswerError] = useState<string>();
  const answerRef = useRef(props.answer);
  answerRef.current = props.answer;
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorHandle | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const languageRef = useRef(language);
  const info = languageInfo(language);
  const sol = useSolution({
    problem: body,
    problemId: problem.id,
    editor,
    language: languageRef,
    flushSave: () => clearTimeout(saveTimer.current),
  });
  const [formatOpen, setFormatOpen] = useState(false);
  const differsNow = (code: string) =>
    answerDiffers(answerRef.current, code, languageRef.current, sol.fn);

  // Saved code and cases, then the editor (once: this component is keyed by problem).
  useEffect(() => {
    let disposed = false;
    void Promise.all([store.loadCases(problem.id), sol.load()]).then(async ([cs, fn]) => {
      const code = await store.loadCode(problem.id, sol.group(language, fn));
      if (disposed || !editorHost.current) return;
      setCases(cs);
      editor.current = createEditor(editorHost.current, {
        doc: code ?? sol.starter(language, fn),
        keymap: props.keymap,
        syntax: info.syntax,
        theme: props.theme,
        onChange: (text) => {
          setDiffers(differsNow(text));
          clearTimeout(saveTimer.current);
          const group = sol.group(languageRef.current);
          saveTimer.current = setTimeout(() => {
            store.saveCode(problem.id, group, text).then(
              () => setSaveError(undefined),
              (e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)),
            );
          }, 400);
        },
      });
      // Moving through the problem rail with the keyboard keeps focus there.
      const active = document.activeElement;
      if (!active?.closest('.exam-rail') || !active.matches(':focus-visible')) {
        editor.current.focus();
      }
      setReady(true);
    });
    return () => {
      disposed = true;
      // Keep what was typed in the last 0.4 s when moving to another problem.
      clearTimeout(saveTimer.current);
      const code = editor.current?.getCode();
      if (code !== undefined) {
        void store.saveCode(problem.id, sol.group(languageRef.current), code);
      }
      editor.current?.destroy();
      editor.current = undefined;
      runner.cancel();
    };
  }, [problem.id]);

  useEffect(() => editor.current?.setTheme(props.theme), [props.theme]);

  // The statement arrived after the editor: its format decides the mode now.
  useEffect(() => {
    if (body && ready) void sol.load(body, true);
  }, [body !== undefined, ready]);

  // A new answer, or another language: compare again.
  useEffect(() => {
    const code = editor.current?.getCode();
    if (code !== undefined) setDiffers(answerDiffers(props.answer, code, language, sol.fn));
  }, [props.answer, language, ready, sol.fn]);

  const changeLanguage = async (next: LanguageId) => {
    if (next === language) return;
    const current = editor.current?.getCode();
    clearTimeout(saveTimer.current);
    if (current !== undefined) await store.saveCode(problem.id, sol.group(language), current);
    const nextInfo = languageInfo(next);
    const saved = await store.loadCode(problem.id, sol.group(next));
    languageRef.current = next;
    props.onLanguage(next);
    editor.current?.setLanguage(nextInfo.syntax);
    if (sol.group(next) !== sol.group(language)) {
      editor.current?.setCode(saved ?? sol.starter(next));
    }
    setOutput({ state: 'empty' });
  };

  const run = async () => {
    setTab('run');
    if (!body) {
      setOutput({ state: 'message', text: '문제를 불러온 뒤 실행할 수 있습니다.' });
      return;
    }
    const blocked = runBlockReason(body.labels);
    if (blocked) {
      setOutput({ state: 'message', text: blocked });
      return;
    }
    setRunning(true);
    const plan = sol.runPlan(editor.current?.getCode() ?? '', language);
    const result = await runCases({
      runner,
      language,
      code: plan.code,
      ...(plan.transform ? { transform: plan.transform } : {}),
      cases: [...body.samples, ...cases],
      problemLimitMs: body.timeLimitMs,
      warmEngines: props.warmEngines,
      onProgress: setOutput,
    });
    setRunning(false);
    setOutput(result);
  };

  const reset = () => {
    editor.current?.setCode(sol.starter(language));
    void store.clearCode(problem.id, sol.group(language));
    setDialog(undefined);
    setTab('run');
    setOutput({ state: 'message', text: '코드를 초기화하였습니다.' });
  };

  const saveCases = (next: Sample[]) => {
    setCases(next);
    store
      .saveCases(problem.id, next)
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
  };

  const saveAnswer = () => {
    if (props.over) return;
    setTab('submit');
    const code = editor.current?.getCode() ?? '';
    if (code.trim() === '') {
      setAnswerError('코드를 작성한 뒤 제출해 주세요.');
      return;
    }
    setAnswerError(undefined);
    // Solution mode saves the program with glue (what is submitted) and the function itself.
    if (sol.fn) props.onSaveAnswer(sol.submission(code, language), language, code);
    else props.onSaveAnswer(code, language);
  };

  const note = body ? runNote(body.labels) : undefined;
  return (
    <div class="ide-main">
      <header class="titlebar">
        <h1 class="title">
          <span class="exam-title-index">{props.index + 1}번</span>
          {problem.title}
        </h1>
        <div class="title-tools">
          <SolutionToggle
            on={sol.fn}
            busy={running || !ready}
            {...(sol.reason ? { reason: sol.reason } : {})}
            {...(sol.canDefine && body && !runBlockReason(body.labels)
              ? { onDefine: () => setFormatOpen(true) }
              : {})}
            onChange={(on) => {
              setOutput({ state: 'empty' });
              void sol.setMode(on);
            }}
          />
          <button
            type="button"
            class={`flag-button${props.flagged ? ' is-on' : ''}`}
            aria-pressed={props.flagged}
            onClick={props.onFlag}
          >
            <FlagIcon />
            다시 볼 문제
          </button>
          <LanguageSelect
            value={language}
            disabled={running || !ready}
            onChange={(next) => void changeLanguage(next)}
          />
        </div>
      </header>

      <main class="workspace">
        <SplitPane
          direction="horizontal"
          size={split.horizontal}
          onResize={(h) => setSplit((s) => ({ ...s, horizontal: h }))}
          onResizeEnd={props.onSplitEnd}
          first={
            body ? (
              <ProblemPane problem={body} format={sol.fn ? sol.format : undefined} />
            ) : (
              <div class="problem" aria-busy={!loadError}>
                <div class="problem-label">문제 설명</div>
                {loadError ? (
                  <div class="exam-load-error" role="alert">
                    <p>{loadError}</p>
                    <button type="button" class="btn btn-dark" onClick={props.onRetry}>
                      다시 시도
                    </button>
                  </div>
                ) : (
                  <p class="exam-loading">문제를 불러오는 중입니다…</p>
                )}
              </div>
            )
          }
          second={
            <SplitPane
              direction="vertical"
              size={split.vertical}
              minPx={60}
              onResize={(v) => setSplit((s) => ({ ...s, vertical: v }))}
              onResizeEnd={props.onSplitEnd}
              first={
                <section class="code-section" aria-label="코드 편집">
                  <div class="code-header">
                    <div class="file-tab">{sol.fileName(language)}</div>
                    {saveError && (
                      <p class="save-error" role="alert">
                        코드를 자동 저장하지 못했습니다. 코드를 따로 복사해 두세요. ({saveError})
                      </p>
                    )}
                  </div>
                  {body && (sol.fn || formatOpen) && (
                    <FormatCard
                      problem={body}
                      {...(sol.format ? { format: sol.format } : {})}
                      {...(sol.resolved.source ? { source: sol.resolved.source } : {})}
                      {...(sol.resolved.savedInvalid
                        ? { savedInvalid: sol.resolved.savedInvalid }
                        : {})}
                      open={formatOpen}
                      onOpen={setFormatOpen}
                      onSave={sol.saveFormat}
                      onReset={sol.resetFormat}
                    />
                  )}
                  <div class="editor" ref={editorHost} />
                </section>
              }
              second={
                <section class="output-section" aria-label="결과">
                  <div class="output-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === 'run'}
                      onClick={() => setTab('run')}
                    >
                      실행 결과
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === 'submit'}
                      onClick={() => setTab('submit')}
                    >
                      제출
                    </button>
                  </div>
                  <div class="output" role="tabpanel">
                    {tab === 'run' ? (
                      <>
                        {note && <p class="out-note">{note}</p>}
                        <SubmitOnlyNote language={language} />
                        <RunOutput {...output} format={sol.fn ? sol.format : undefined} />
                      </>
                    ) : (
                      <AnswerPanel
                        {...(props.answer ? { answer: props.answer } : {})}
                        {...(answerError ? { error: answerError } : {})}
                        startedAt={props.startedAt}
                      />
                    )}
                  </div>
                </section>
              }
            />
          }
        />
      </main>

      <footer class="button-section">
        <div class="buttons-left">
          <button type="button" class="btn btn-dark" onClick={() => setDialog('cases')}>
            + 테스트 케이스 추가하기
            {cases.length > 0 && <span class="btn-badge">{cases.length}</span>}
          </button>
        </div>
        <div class="buttons-right">
          {differs && (
            <span class="answer-differs" role="status" data-testid="answer-differs">
              {ANSWER_DIFFERS}
            </span>
          )}
          <button
            type="button"
            class="btn btn-dark"
            onClick={() => setDialog('reset')}
            disabled={running}
          >
            초기화
          </button>
          <RunButton
            language={language}
            running={running}
            onRun={() => void run()}
            onStop={() => runner.cancel()}
          />
          <button
            type="button"
            class="btn btn-primary"
            disabled={running || props.over || !ready}
            title="지금 코드를 이 문제의 답안으로 저장합니다. 시험이 끝나면 한꺼번에 제출합니다."
            onClick={saveAnswer}
          >
            제출하기
          </button>
        </div>
      </footer>

      {dialog === 'reset' && <ResetDialog onConfirm={reset} onClose={() => setDialog(undefined)} />}
      {dialog === 'cases' && sol.fn && sol.format && (
        <SolutionCaseDialog
          format={sol.format}
          samples={body?.samples ?? []}
          cases={cases}
          onClose={() => setDialog(undefined)}
          onSave={saveCases}
        />
      )}
      {dialog === 'cases' && !sol.fn && (
        <TestCaseDialog
          samples={body?.samples ?? []}
          cases={cases}
          onClose={() => setDialog(undefined)}
          onSave={saveCases}
        />
      )}
    </div>
  );
}

/** The '제출' tab: the saved answer. Nothing goes to Baekjoon before the end (ADR-0005). */
function AnswerPanel({
  answer,
  error,
  startedAt,
}: {
  answer?: ExamAnswer;
  error?: string;
  startedAt: number;
}) {
  if (error) return <p class="out-fail">{error}</p>;
  if (!answer) {
    return (
      <p class="out-muted">
        제출하기를 누르면 지금 코드가 이 문제의 답안으로 저장됩니다. 시험이 끝나면 저장한 답안을
        백준에 한꺼번에 제출하고, 결과는 결과 화면에서 공개됩니다.
      </p>
    );
  }
  return (
    <div data-testid="exam-answer">
      <p class="out-pass">{ANSWER_SAVED}</p>
      <Warnings items={findBlockedPatterns(answer.code)} />
      <p class="out-note">
        저장한 답안: 시작 후 {formatClock(answer.savedAt - startedAt)},{' '}
        {languageInfo(answer.language).label}. 다시 누르면 지금 코드로 바뀝니다.
      </p>
    </div>
  );
}
