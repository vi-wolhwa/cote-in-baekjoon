import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Problem, Sample } from '@/boj/problem';
import { SandboxRunner } from '@/runner/client';
import { isProblemMessage, type CloseMessage, type ReadyMessage } from '@/shared/messages';
import { DEMO_PROBLEM, STARTER_CODE } from './demo';
import { ResetDialog, TestCaseDialog } from './dialogs';
import { createEditor, type EditorHandle } from './editor';
import { ProblemPane, runBlockReason, runNote } from './ProblemPane';
import { buildCaseReport, runTimeLimit, summarize, type CaseReport } from './run-report';
import { RunOutput } from './RunOutput';
import { SplitPane } from './SplitPane';
import * as store from './storage';
import { SubmitPanel, useSubmit } from './submit';

const BOJ_ORIGIN = /^https:\/\/(www\.)?acmicpc\.net$/;
const LANGUAGE = 'javascript';

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
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorHandle | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const runner = useMemo(() => new SandboxRunner(browser.runtime.getURL('/sandbox.html')), []);
  const submit = useSubmit(problem.id, () => editor.current?.getCode() ?? '', LANGUAGE);
  const blockReason = runBlockReason(problem.labels);
  const note = runNote(problem.labels);

  // Load saved state, then create the editor once per problem.
  useEffect(() => {
    let disposed = false;
    void Promise.all([
      store.loadKeymap(),
      store.loadSplit(),
      store.loadCases(problem.id),
      store.loadCode(problem.id, LANGUAGE),
    ]).then(([km, sp, cs, code]) => {
      if (disposed || !editorHost.current) return;
      setKeymap(km);
      setSplit(sp);
      setCases(cs);
      editor.current = createEditor(editorHost.current, {
        doc: code ?? STARTER_CODE,
        keymap: km,
        onChange: (text) => {
          clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(
            () => void store.saveCode(problem.id, LANGUAGE, text),
            400,
          );
        },
      });
      editor.current.focus();
    });
    return () => {
      disposed = true;
      editor.current?.destroy();
      editor.current = undefined;
    };
  }, [problem.id]);

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
    setRunning(true);
    const reports: CaseReport[] = [];
    for (const [i, sample] of all.entries()) {
      setOutput({ state: 'running', done: i, total: all.length });
      const response = await runner.run(code, sample.input, limit);
      reports.push(buildCaseReport(i + 1, sample, response, limit));
      if (response.status === 'cancelled') break;
    }
    setRunning(false);
    setOutput({ state: 'report', report: summarize(reports) });
  };

  const reset = () => {
    editor.current?.setCode(STARTER_CODE);
    void store.clearCode(problem.id, LANGUAGE);
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
          {problem.id > 0 && (
            <a
              href={`https://www.acmicpc.net/board/search/all/problem/${problem.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              질문 게시판
            </a>
          )}
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
          <select class="language" value={LANGUAGE} aria-label="언어">
            <option value="javascript">JavaScript</option>
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
                  <div class="file-tab">solution.js</div>
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
          <button type="button" class="btn btn-outline" onClick={() => setDialog('cases')}>
            테스트 케이스 추가하기
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
            void store.saveCases(problem.id, next);
          }}
        />
      )}
    </div>
  );
}
