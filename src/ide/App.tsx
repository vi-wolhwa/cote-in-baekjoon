import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Problem, Sample } from '@/boj/problem';
import { SandboxRunner } from '@/runner/client';
import { isProblemMessage, type CloseMessage, type ReadyMessage } from '@/shared/messages';
import { DEFAULT_LANGUAGE, LANGUAGES, languageInfo, type LanguageId } from '@/shared/languages';
import { DEMO_PROBLEM } from './demo';
import { ResetDialog, TestCaseDialog } from './dialogs';
import { createEditor, type EditorHandle } from './editor';
import { ProblemPane, runBlockReason, runNote } from './ProblemPane';
import { buildCaseReport, runTimeLimit, summarize, type CaseReport } from './run-report';
import { RunOutput } from './RunOutput';
import { SplitPane } from './SplitPane';
import * as store from './storage';
import { SubmitPanel, useSubmit } from './submit';

/**
 * Files added by build hooks (language runtimes, license notices) are not in WXT's path
 * types.
 */
const hookFileUrl = (path: string) => (browser.runtime.getURL as (path: string) => string)(path);
const runtimeUrl = () => hookFileUrl('/runtime/');

const BOJ_ORIGIN = /^https:\/\/(www\.)?acmicpc\.net$/;

type Output = Parameters<typeof RunOutput>[0];
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
  /** Saved state is loaded and the editor exists; until then the language cannot change. */
  const [ready, setReady] = useState(false);
  /** Latest language for callbacks created once (autosave). */
  const languageRef = useRef<LanguageId>(DEFAULT_LANGUAGE);
  /** Engines that already loaded in this session; the first Python/C++ run takes seconds. */
  const warmEngines = useRef(new Set<string>(['js']));
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorHandle | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const runner = useMemo(
    () => new SandboxRunner(browser.runtime.getURL('/sandbox.html'), runtimeUrl()),
    [],
  );
  const submit = useSubmit(problem.id, () => editor.current?.getCode() ?? '', language);
  const info = languageInfo(language);
  const blockReason = runBlockReason(problem.labels);
  const note = runNote(problem.labels);

  useEffect(() => {}, []);

  // Load saved state, then create the editor once per problem.
  useEffect(() => {
    let disposed = false;
    void Promise.all([
      store.loadKeymap(),
      store.loadSplit(),
      store.loadCases(problem.id),
      store.loadLanguage(),
    ]).then(async ([km, sp, cs, lang]) => {
      const code = await store.loadCode(problem.id, languageInfo(lang).codeGroup);
      if (disposed || !editorHost.current) return;
      setKeymap(km);
      setSplit(sp);
      setCases(cs);
      setLanguage(lang);
      languageRef.current = lang;
      editor.current = createEditor(editorHost.current, {
        doc: code ?? languageInfo(lang).starter,
        keymap: km,
        engine: languageInfo(lang).engine,
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
      editor.current?.destroy();
      editor.current = undefined;
    };
  }, [problem.id]);

  const changeLanguage = async (next: LanguageId) => {
    if (next === language) return;
    const current = editor.current?.getCode();
    clearTimeout(saveTimer.current);
    if (current !== undefined) await store.saveCode(problem.id, info.codeGroup, current);
    const nextInfo = languageInfo(next);
    const saved = await store.loadCode(problem.id, nextInfo.codeGroup);
    languageRef.current = next;
    setLanguage(next);
    void store.saveLanguage(next);
    editor.current?.setLanguage(nextInfo.engine);
    // Python 3 and PyPy3 share code; switching between them keeps the editor as it is.
    if (nextInfo.codeGroup !== info.codeGroup) editor.current?.setCode(saved ?? nextInfo.starter);
    setOutput({ state: 'empty' });
  };

  const changeKeymap = (km: store.Keymap) => {
    setKeymap(km);
    editor.current?.setKeymap(km);
    void store.saveKeymap(km);
  };

  const run = async () => {
    setTab('run');
    if (blockReason) {
      setOutput({ state: 'message', text: blockReason });
      return;
    }
    const code = editor.current?.getCode() ?? '';
    const all = [...problem.samples, ...cases];
    if (all.length === 0) {
      setOutput({
        state: 'message',
        text: '실행할 테스트 케이스가 없습니다. 테스트 케이스를 추가해 주세요.',
      });
      return;
    }
    const limit = runTimeLimit(problem.timeLimitMs);
    const firstLoad = !warmEngines.current.has(info.engine);
    setRunning(true);
    const reports: CaseReport[] = [];
    for (const [i, sample] of all.entries()) {
      setOutput({ state: 'running', done: i, total: all.length, preparing: firstLoad && i === 0 });
      const response = await runner.run(language, code, sample.input, limit);
      reports.push(buildCaseReport(i + 1, sample, response, limit, problem.timeLimitMs));
      if (response.status !== 'cancelled' && response.status !== 'timeout') {
        warmEngines.current.add(info.engine);
      }
      // A compile error is the same for every case: show it once.
      if (response.status === 'cancelled' || response.status === 'compile-error') break;
    }
    setRunning(false);
    setOutput({ state: 'report', report: summarize(reports) });
  };

  const reset = () => {
    editor.current?.setCode(info.starter);
    void store.clearCode(problem.id, info.codeGroup);
    setDialog(undefined);
    setTab('run');
    setOutput({ state: 'message', text: '코드를 초기화하였습니다.' });
  };

  const close = () => {
    const message: CloseMessage = { type: 'cib:close' };
    window.parent.postMessage(message, '*');
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
          <button
            type="button"
            class="link-button"
            onClick={() => void browser.runtime.openOptionsPage()}
          >
            백업과 복원
          </button>
          <a
            class="link-button"
            href={hookFileUrl('/THIRD_PARTY_NOTICES.txt')}
            target="_blank"
            rel="noopener noreferrer"
          >
            오픈소스 라이선스
          </a>
          {embedded && (
            <button type="button" class="link-button" onClick={close}>
              백준 문제로 돌아가기
            </button>
          )}
        </div>
      </nav>

      <header class="titlebar">
        <h1 class="title">{problem.title}</h1>
        <div class="title-tools">
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
          onResizeEnd={saveSplit}
          first={<ProblemPane problem={problem} />}
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
                        <RunOutput {...output} />
                      </>
                    ) : (
                      <SubmitPanel state={submit.state} />
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
              class="btn btn-outline"
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

      {dialog === 'reset' && <ResetDialog onConfirm={reset} onClose={() => setDialog(undefined)} />}
      {dialog === 'cases' && (
        <TestCaseDialog
          samples={problem.samples}
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
