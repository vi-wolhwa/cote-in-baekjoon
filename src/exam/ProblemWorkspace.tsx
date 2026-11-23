/**
 * One exam problem: statement, editor, run output and buttons, laid out like the practice
 * IDE (docs/design/ide-spec.md §8). The exam screen mounts one per problem (keyed by id), so
 * the editor, its undo history and the run output never leak between problems. Code is saved
 * under the practice keys `code:{id}:{group}`.
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
import { useSubmit, Warnings, type SubmitState } from '@/ide/submit';
import type { SandboxRunner } from '@/runner/client';
import { LANGUAGES, languageInfo, type LanguageId } from '@/shared/languages';
import type { Theme } from '@/shared/theme';
import { CAPTURE_TIMEOUT_MS, describeCaptureError } from './capture-contract';
import { cancelCapture, requestCapture, watchCapture } from './capture-client';
import { formatClock, type ExamProblem, type ExamSubmission } from './model';

export const HIDDEN_RESULT = '제출했습니다. 결과는 시험이 끝나면 공개됩니다.';

interface Props {
  examId: string;
  problem: ExamProblem;
  index: number;
  flagged: boolean;
  submission?: ExamSubmission;
  startedAt: number;
  over: boolean;
  language: LanguageId;
  keymap: store.Keymap;
  theme: Theme;
  runner: SandboxRunner;
  warmEngines: Set<string>;
  onLanguage: (language: LanguageId) => void;
  onFlag: () => void;
  onSubmitted: (language: LanguageId, at: number) => void;
}

type Tab = 'run' | 'submit';
type Dialog = 'reset' | 'cases' | undefined;

export function ProblemWorkspace(props: Props) {
  const { problem, language, runner } = props;
  const body = problem.body;
  const [loadError, setLoadError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [split, setSplit] = useState(store.DEFAULT_SPLIT);
  const [cases, setCases] = useState<Sample[]>([]);
  const [output, setOutput] = useState<RunOutputProps>({ state: 'empty' });
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>('run');
  const [dialog, setDialog] = useState<Dialog>();
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorHandle | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const languageRef = useRef(language);
  const submit = useSubmit(problem.id, () => editor.current?.getCode() ?? '', language, {
    hideResult: true,
  });
  const info = languageInfo(language);

  // The statement: read the first time this problem is opened (the user opened it), by a
  // background tab the extension opens and closes (ADR-0005). It then stays in the exam.
  useEffect(() => {
    if (body) return;
    let live = true;
    let stopWatch = () => {};
    setLoadError(undefined);
    void requestCapture(props.examId, problem.id).then((response) => {
      if (!live) return;
      if (!response.ok) {
        setLoadError(response.reason);
        return;
      }
      stopWatch = watchCapture(props.examId, problem.id, (record) => {
        if (record?.state === 'error') setLoadError(describeCaptureError(record.error));
      });
    });
    // The background gives up after the timeout too; this covers a stopped service worker.
    const timer = setTimeout(
      () => void cancelCapture(props.examId, problem.id),
      CAPTURE_TIMEOUT_MS + 1000,
    );
    return () => {
      live = false;
      stopWatch();
      clearTimeout(timer);
    };
  }, [problem.id, attempt, body === undefined]);

  // Saved code and cases, then the editor (once: this component is keyed by problem).
  useEffect(() => {
    let disposed = false;
    void Promise.all([
      store.loadSplit(),
      store.loadCases(problem.id),
      store.loadCode(problem.id, info.codeGroup),
    ]).then(([sp, cs, code]) => {
      if (disposed || !editorHost.current) return;
      setSplit(sp);
      setCases(cs);
      editor.current = createEditor(editorHost.current, {
        doc: code ?? info.starter,
        keymap: props.keymap,
        engine: info.engine,
        theme: props.theme,
        onChange: (text) => {
          clearTimeout(saveTimer.current);
          const group = languageInfo(languageRef.current).codeGroup;
          saveTimer.current = setTimeout(() => {
            store.saveCode(problem.id, group, text).then(
              () => setSaveError(undefined),
              (e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)),
            );
          }, 400);
        },
      });
      editor.current.focus();
      setReady(true);
    });
    return () => {
      disposed = true;
      // Keep what was typed in the last 0.4 s when moving to another problem.
      clearTimeout(saveTimer.current);
      const code = editor.current?.getCode();
      if (code !== undefined) {
        void store.saveCode(problem.id, languageInfo(languageRef.current).codeGroup, code);
      }
      editor.current?.destroy();
      editor.current = undefined;
      runner.cancel();
    };
  }, [problem.id]);

  useEffect(() => editor.current?.setTheme(props.theme), [props.theme]);

  const changeLanguage = async (next: LanguageId) => {
    if (next === language) return;
    const current = editor.current?.getCode();
    clearTimeout(saveTimer.current);
    if (current !== undefined) await store.saveCode(problem.id, info.codeGroup, current);
    const nextInfo = languageInfo(next);
    const saved = await store.loadCode(problem.id, nextInfo.codeGroup);
    languageRef.current = next;
    props.onLanguage(next);
    editor.current?.setLanguage(nextInfo.engine);
    if (nextInfo.codeGroup !== info.codeGroup) editor.current?.setCode(saved ?? nextInfo.starter);
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
    const result = await runCases({
      runner,
      language,
      code: editor.current?.getCode() ?? '',
      cases: [...body.samples, ...cases],
      problemLimitMs: body.timeLimitMs,
      warmEngines: props.warmEngines,
      onProgress: setOutput,
    });
    setRunning(false);
    setOutput(result);
  };

  const reset = () => {
    editor.current?.setCode(info.starter);
    void store.clearCode(problem.id, info.codeGroup);
    setDialog(undefined);
    setTab('run');
    setOutput({ state: 'message', text: '코드를 초기화하였습니다.' });
  };

  const startSubmit = async () => {
    if (props.over) return;
    setTab('submit');
    const at = Date.now();
    if (await submit.start()) props.onSubmitted(language, at);
  };

  const note = body ? runNote(body.labels) : undefined;
  const busy = submit.state.phase === 'opening';
  return (
    <div class="ide-main">
      <header class="titlebar">
        <h1 class="title">
          <span class="exam-title-index">{props.index + 1}번</span>
          {problem.title}
        </h1>
        <div class="title-tools">
          <button
            type="button"
            class={`flag-button${props.flagged ? ' is-on' : ''}`}
            aria-pressed={props.flagged}
            onClick={props.onFlag}
          >
            <FlagIcon />
            다시 볼 문제
          </button>
          <select
            class="language"
            value={language}
            aria-label="언어"
            disabled={running || !ready}
            onChange={(e) => void changeLanguage(e.currentTarget.value as LanguageId)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main class="workspace">
        <SplitPane
          direction="horizontal"
          size={split.horizontal}
          onResize={(h) => setSplit((s) => ({ ...s, horizontal: h }))}
          onResizeEnd={() => setSplit((s) => (void store.saveSplit(s), s))}
          first={
            body ? (
              <ProblemPane problem={body} />
            ) : (
              <div class="problem" aria-busy={!loadError}>
                <div class="problem-label">문제 설명</div>
                {loadError ? (
                  <div class="exam-load-error" role="alert">
                    <p>{loadError}</p>
                    <button
                      type="button"
                      class="btn btn-dark"
                      onClick={() => setAttempt((n) => n + 1)}
                    >
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
              onResizeEnd={() => setSplit((s) => (void store.saveSplit(s), s))}
              first={
                <section class="code-section" aria-label="코드 편집">
                  <div class="code-header">
                    <div class="file-tab">{info.fileName}</div>
                    {saveError && (
                      <p class="save-error" role="alert">
                        코드를 자동 저장하지 못했습니다. 코드를 따로 복사해 두세요. ({saveError})
                      </p>
                    )}
                  </div>
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
                        <RunOutput {...output} />
                      </>
                    ) : (
                      <ExamSubmitPanel
                        state={submit.state}
                        {...(props.submission ? { submission: props.submission } : {})}
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
          <button
            type="button"
            class="btn btn-dark"
            onClick={() => setDialog('reset')}
            disabled={running}
          >
            초기화
          </button>
          {running ? (
            <button type="button" class="btn btn-dark" onClick={() => runner.cancel()}>
              실행 중지
            </button>
          ) : (
            <button type="button" class="btn btn-dark" onClick={() => void run()}>
              코드 실행
            </button>
          )}
          <button
            type="button"
            class="btn btn-primary"
            disabled={running || busy || props.over || !ready}
            onClick={() => void startSubmit()}
          >
            제출하기
          </button>
        </div>
      </footer>

      {dialog === 'reset' && <ResetDialog onConfirm={reset} onClose={() => setDialog(undefined)} />}
      {dialog === 'cases' && (
        <TestCaseDialog
          samples={body?.samples ?? []}
          cases={cases}
          onClose={() => setDialog(undefined)}
          onSave={(next) => {
            setCases(next);
            store
              .saveCases(problem.id, next)
              .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
          }}
        />
      )}
    </div>
  );
}

/** The '제출' tab: never the judge result while the exam runs (ADR-0005). */
function ExamSubmitPanel({
  state,
  submission,
  startedAt,
}: {
  state: SubmitState;
  submission?: ExamSubmission;
  startedAt: number;
}) {
  if (state.phase === 'opening') {
    return (
      <>
        <Warnings items={state.warnings} />
        <p class="out-muted">백준 제출 페이지를 여는 중입니다…</p>
      </>
    );
  }
  if (state.phase === 'error') return <p class="out-fail">{state.reason}</p>;
  if (state.phase === 'closed') {
    return (
      <p class="out-muted">제출 창이 닫혔습니다. 제출되지 않았다면 제출하기를 다시 눌러 주세요.</p>
    );
  }
  if (state.phase === 'waiting' || state.phase === 'result' || submission) {
    return (
      <div data-testid="exam-submitted">
        {state.phase === 'waiting' && <Warnings items={state.warnings} />}
        <p class="out-pass">{HIDDEN_RESULT}</p>
        {submission && (
          <p class="out-note">
            마지막 제출: 시작 후 {formatClock(submission.at - startedAt)},{' '}
            {languageInfo(submission.language).label}. 다시 제출하면 마지막 제출로 채점합니다.
          </p>
        )}
      </div>
    );
  }
  return (
    <p class="out-muted">
      제출하기를 누르면 백준 제출 창이 열리고 자동으로 제출됩니다. 채점 결과는 시험이 끝나면 결과
      화면에서 공개됩니다. 여러 번 제출하면 마지막 제출로 채점합니다.
    </p>
  );
}
