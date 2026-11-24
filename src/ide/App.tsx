import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Problem, Sample } from '@/boj/problem';
import { SandboxRunner } from '@/runner/client';
import { describeBrowser } from '@/shared/report';
import { isProblemMessage, type CloseMessage, type ReadyMessage } from '@/shared/messages';
import { DEFAULT_LANGUAGE, languageInfo, type LanguageId } from '@/shared/languages';
import { DEMO_PROBLEM } from './demo';
import { applyTheme, DEFAULT_THEME, type Theme } from '@/shared/theme';
import { ResetDialog, TestCaseDialog } from './dialogs';
import { createEditor, type EditorHandle } from './editor';
import { BackArrowIcon } from './icons';
import { LanguageSelect, RunButton, SubmitOnlyNote } from './language-controls';
import { useHistoryLoad } from './history/useHistoryLoad';
import { LeftPane } from './LeftPane';
import { runBlockReason, runNote } from './ProblemPane';
import { ideReportUrl } from './report-link';
import { runCases } from './run-cases';
import { RunOutput, type RunOutputProps } from './RunOutput';
import { Sidebar } from './Sidebar';
import { SplitPane } from './SplitPane';
import * as store from './storage';
import { SubmitPanel, useSubmit } from './submit';
import { FormatCard } from './solution/FormatCard';
import { SolutionCaseDialog } from './solution/SolutionCaseDialog';
import { SolutionToggle } from './solution/SolutionToggle';
import { useSolution } from './useSolution';

/** Files added by build hooks (language runtimes) are not in WXT's path types. */
const hookFileUrl = (path: string) => (browser.runtime.getURL as (path: string) => string)(path);
const runtimeUrl = () => hookFileUrl('/runtime/');

const BOJ_ORIGIN = /^https:\/\/(www\.)?acmicpc\.net$/;

type Output = RunOutputProps;
type Dialog = 'reset' | 'cases' | undefined;
type Tab = 'run' | 'judge';

export function App() {
  const embedded = window.parent !== window;
  const [problem, setProblem] = useState<Problem | undefined>(embedded ? undefined : DEMO_PROBLEM);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !BOJ_ORIGIN.test(event.origin)) return;
      if (isProblemMessage(event.data)) setProblem(event.data.problem);
    };
    window.addEventListener('message', onMessage);
    if (embedded) {
      const ready: ReadyMessage = { type: 'cib:ready' };
      window.parent.postMessage(ready, '*');
    }
    return () => window.removeEventListener('message', onMessage);
  }, [embedded]);

  if (!problem) return <div class="ide-loading">문제를 불러오는 중입니다…</div>;
  return <Workspace problem={problem} embedded={embedded} />;
}

function Workspace({ problem, embedded }: { problem: Problem; embedded: boolean }) {
  const [keymap, setKeymap] = useState<store.Keymap>('sublime');
  const [split, setSplit] = useState(store.DEFAULT_SPLIT);
  const [cases, setCases] = useState<Sample[]>([]);
  const [output, setOutput] = useState<Output>({ state: 'empty' });
  const [running, setRunning] = useState(false);
  const [dialog, setDialog] = useState<Dialog>();
  const [tab, setTab] = useState<Tab>('run');
  const [saveError, setSaveError] = useState<string>();
  const [language, setLanguage] = useState<LanguageId>(DEFAULT_LANGUAGE);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  /** Saved state is loaded and the editor exists; until then the language cannot change. */
  const [ready, setReady] = useState(false);
  /** Latest language for callbacks created once (autosave). */
  const languageRef = useRef<LanguageId>(DEFAULT_LANGUAGE);
  /** Engines that already loaded in this session; the first Python/C++ run takes seconds. */
  const warmEngines = useRef(new Set<string>(['js']));
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorHandle | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** When this problem was opened; kept in the popup's meta (#79). */
  const openedAt = useRef(Date.now());
  const runner = useMemo(
    () => new SandboxRunner(browser.runtime.getURL('/sandbox.html'), runtimeUrl()),
    [],
  );
  const flushSave = () => clearTimeout(saveTimer.current);
  const sol = useSolution({
    problem,
    problemId: problem.id,
    editor,
    language: languageRef,
    flushSave,
  });
  /** The format card is open (or opened to define a format in standard I/O mode). */
  const [formatOpen, setFormatOpen] = useState(false);
  const submit = useSubmit(
    problem.id,
    () => {
      const text = editor.current?.getCode() ?? '';
      const code = sol.submission(text, languageRef.current);
      return { code, ...(sol.fn ? { fnCode: text } : {}) };
    },
    language,
  );
  const blockReason = runBlockReason(problem.labels);
  const note = runNote(problem.labels);
  const reportUrl = ideReportUrl({
    version: browser.runtime.getManifest().version,
    browser: describeBrowser(navigator),
    problemId: problem.id,
    language,
  });

  /** Only real Baekjoon problems are listed in the popup, not the demo. */
  const saveMeta = (lang: LanguageId) => {
    if (!embedded || problem.id <= 0) return;
    store.saveMeta(problem.id, problem.title, lang, openedAt.current).catch(() => undefined);
  };

  // Load saved state, then create the editor once per problem.
  useEffect(() => {
    let disposed = false;
    void Promise.all([
      store.loadKeymap(),
      store.loadSplit(),
      store.loadCases(problem.id),
      store.loadLanguage(),
      store.loadTheme(),
    ]).then(async ([km, sp, cs, lang, th]) => {
      const fn = await sol.load();
      const code = await store.loadCode(problem.id, sol.group(lang, fn));
      if (disposed || !editorHost.current) return;
      setKeymap(km);
      setSplit(sp);
      setCases(cs);
      setLanguage(lang);
      setTheme(th);
      applyTheme(document.documentElement, th);
      languageRef.current = lang;
      saveMeta(lang);
      editor.current = createEditor(editorHost.current, {
        doc: sol.codeOr(code, lang, fn),
        keymap: km,
        syntax: languageInfo(lang).syntax,
        theme: th,
        onChange: (text) => {
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
      editor.current.focus();
      setReady(true);
    });
    return () => {
      disposed = true;
      editor.current?.destroy();
      editor.current = undefined;
    };
  }, [problem.id]);

  const changeLanguage = async (next: LanguageId) => {
    if (next === language) return;
    const current = editor.current?.getCode();
    clearTimeout(saveTimer.current);
    if (current !== undefined) await store.saveCode(problem.id, sol.group(language), current);
    const nextInfo = languageInfo(next);
    const saved = await store.loadCode(problem.id, sol.group(next));
    languageRef.current = next;
    setLanguage(next);
    void store.saveLanguage(next);
    saveMeta(next);
    editor.current?.setLanguage(nextInfo.syntax);
    // Languages that share saved code (Python 3 and PyPy3, C++14/17/20) keep the editor as it is.
    if (sol.group(next) !== sol.group(language)) {
      editor.current?.setCode(sol.codeOr(saved, next));
    }
    setOutput({ state: 'empty' });
  };

  const history = useHistoryLoad({
    problemId: problem.id,
    editor,
    sol,
    language: languageRef,
    changeLanguage,
    onLoaded: () => {
      setTab('run');
      setOutput({ state: 'message', text: '제출 기록의 코드를 불러왔습니다.' });
    },
  });

  const changeKeymap = (km: store.Keymap) => {
    setKeymap(km);
    editor.current?.setKeymap(km);
    void store.saveKeymap(km);
  };

  const changeTheme = (next: Theme) => {
    setTheme(next);
    applyTheme(document.documentElement, next);
    editor.current?.setTheme(next);
    void store.saveTheme(next);
  };

  const run = async () => {
    setTab('run');
    if (blockReason) {
      setOutput({ state: 'message', text: blockReason });
      return;
    }
    setRunning(true);
    const plan = sol.runPlan(editor.current?.getCode() ?? '', language);
    const result = await runCases({
      runner,
      language,
      code: plan.code,
      ...(plan.transform ? { transform: plan.transform } : {}),
      ...(plan.tol !== undefined ? { tol: plan.tol } : {}),
      cases: [...problem.samples, ...cases],
      problemLimitMs: problem.timeLimitMs,
      warmEngines: warmEngines.current,
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

  const close = () => {
    const message: CloseMessage = { type: 'cib:close' };
    window.parent.postMessage(message, '*');
  };

  const saveCases = (next: Sample[]) => {
    setCases(next);
    store
      .saveCases(problem.id, next)
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
  };

  const saveSplit = () => setSplit((s) => (void store.saveSplit(s), s));

  return (
    <div class="ide">
      <nav class="topbar" aria-label="경로">
        <ol class="crumbs">
          <li>백준</li>
          <li aria-current="page">{problem.id ? `${problem.id}번` : '예시 문제'}</li>
        </ol>
        <div class="topbar-links">
          <a
            class="link-button"
            href={browser.runtime.getURL('/help.html')}
            target="_blank"
            rel="noopener noreferrer"
          >
            도움말
          </a>
          <a class="link-button" href={reportUrl} target="_blank" rel="noopener noreferrer">
            문제 신고
          </a>
          <button
            type="button"
            class="link-button"
            onClick={() => void browser.runtime.openOptionsPage()}
          >
            백업과 복원
          </button>
          {embedded && (
            <button
              type="button"
              class="back-button"
              title="백준 문제 페이지로 돌아갑니다"
              onClick={close}
            >
              <BackArrowIcon />
              돌아가기
            </button>
          )}
        </div>
      </nav>

      <div class="ide-body">
        <div class="ide-main">
          <header class="titlebar">
            <h1 class="title">{problem.title}</h1>
            <div class="title-tools">
              <SolutionToggle
                on={sol.fn}
                busy={running || !ready}
                {...(sol.reason ? { reason: sol.reason } : {})}
                {...(sol.canDefine && !blockReason ? { onDefine: () => setFormatOpen(true) } : {})}
                onChange={(on) => {
                  setOutput({ state: 'empty' });
                  void sol.setMode(on);
                }}
              />
              <div class="keymaps" role="radiogroup" aria-label="에디터 키맵">
                {store.KEYMAPS.map((km) => (
                  <button
                    key={km}
                    type="button"
                    role="radio"
                    aria-checked={keymap === km}
                    class={keymap === km ? 'active' : ''}
                    onClick={() => changeKeymap(km)}
                  >
                    {km}
                  </button>
                ))}
              </div>
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
              onResizeEnd={saveSplit}
              first={
                <LeftPane
                  problem={problem}
                  format={sol.fn ? sol.format : undefined}
                  onLoad={history.load}
                />
              }
              second={
                <SplitPane
                  direction="vertical"
                  size={split.vertical}
                  minPx={60}
                  onResize={(v) => setSplit((s) => ({ ...s, vertical: v }))}
                  onResizeEnd={saveSplit}
                  first={
                    <section class="code-section" aria-label="코드 편집">
                      <div class="code-header">
                        <div class="file-tab">{sol.fileName(language)}</div>
                        {saveError && (
                          <p class="save-error" role="alert">
                            코드를 자동 저장하지 못했습니다. 코드를 따로 복사해 두세요. ({saveError}
                            )
                          </p>
                        )}
                      </div>
                      {(sol.fn || formatOpen) && !blockReason && (
                        <FormatCard
                          problem={problem}
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
                          aria-selected={tab === 'judge'}
                          onClick={() => setTab('judge')}
                        >
                          채점 결과
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
                          <SubmitPanel
                            info={submit.info}
                            onFocus={() => void submit.focus()}
                            onRecheck={() => void submit.recheck()}
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
              {problem.id > 0 && (
                <a
                  class="btn btn-dark"
                  href={`https://www.acmicpc.net/board/search/all/problem/${problem.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  질문하기
                </a>
              )}
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
              <RunButton
                language={language}
                running={running}
                onRun={() => void run()}
                onStop={() => runner.cancel()}
              />
              <button
                type="button"
                class="btn btn-primary"
                disabled={running || !problem.id}
                onClick={() => {
                  setTab('judge');
                  void submit.start();
                }}
              >
                제출하기
              </button>
            </div>
          </footer>
        </div>
        <Sidebar problemId={problem.id} theme={theme} onTheme={changeTheme} />
      </div>

      {dialog === 'reset' && <ResetDialog onConfirm={reset} onClose={() => setDialog(undefined)} />}
      {history.dialog}
      {dialog === 'cases' && sol.fn && sol.format && (
        <SolutionCaseDialog
          format={sol.format}
          samples={problem.samples}
          cases={cases}
          onClose={() => setDialog(undefined)}
          onSave={saveCases}
        />
      )}
      {dialog === 'cases' && !sol.fn && (
        <TestCaseDialog
          samples={problem.samples}
          cases={cases}
          onClose={() => setDialog(undefined)}
          onSave={saveCases}
        />
      )}
    </div>
  );
}
