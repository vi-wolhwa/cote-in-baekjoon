import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Problem } from '@/boj/problem';
import { SandboxRunner } from '@/runner/client';
import { outputsMatch } from '@/runner/compare';
import { isProblemMessage, type CloseMessage, type RunResponse } from '@/shared/messages';
import { createEditor } from './editor';

const BOJ_ORIGIN = /^https:\/\/(www\.)?acmicpc\.net$/;

/** Used when ide.html is opened on its own (development and E2E tests). */
const DEMO_PROBLEM: Problem = {
  id: 0,
  title: '예시 문제: 두 수의 합',
  timeLimitText: '1 초',
  memoryLimitText: '128 MB',
  timeLimitMs: 1000,
  sections: {
    description: '<p>두 정수 A와 B가 주어진다. A+B를 출력하라.</p>',
    input: '<p>첫째 줄에 A와 B가 공백으로 구분되어 주어진다.</p>',
    output: '<p>A+B를 출력한다.</p>',
  },
  samples: [
    { input: '1 2\n', output: '3\n' },
    { input: '5 4\n', output: '9\n' },
  ],
  labels: [],
};

const STARTER = `const input = require('fs').readFileSync('/dev/stdin').toString().trim().split(' ');
const [a, b] = input.map(Number);
console.log(a + b);
`;

interface CaseResult {
  index: number;
  input: string;
  expected: string;
  response: RunResponse;
  passed: boolean;
}

export function App() {
  const embedded = window.parent !== window;
  const [problem, setProblem] = useState<Problem | undefined>(embedded ? undefined : DEMO_PROBLEM);
  const [results, setResults] = useState<CaseResult[]>();
  const [running, setRunning] = useState(false);
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<ReturnType<typeof createEditor> | undefined>(undefined);
  const runner = useMemo(() => new SandboxRunner(browser.runtime.getURL('/sandbox.html')), []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !BOJ_ORIGIN.test(event.origin)) return;
      if (isProblemMessage(event.data)) setProblem(event.data.problem);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!editorHost.current || editor.current) return;
    editor.current = createEditor(editorHost.current, STARTER);
  }, [problem]);

  if (!problem) return <div class="ide-loading">문제를 불러오는 중입니다…</div>;

  const runSamples = async () => {
    const code = editor.current?.getCode() ?? '';
    const limit = Math.min((problem.timeLimitMs ?? 2000) * 3, 10_000);
    setRunning(true);
    const out: CaseResult[] = [];
    for (const [i, s] of problem.samples.entries()) {
      const response = await runner.run(code, s.input, limit);
      const passed =
        response.status === 'ok' && outputsMatch(response.result?.stdout ?? '', s.output);
      out.push({ index: i + 1, input: s.input, expected: s.output, response, passed });
    }
    setResults(out);
    setRunning(false);
  };

  const close = () => {
    const message: CloseMessage = { type: 'cib:close' };
    window.parent.postMessage(message, '*');
  };

  return (
    <div class="ide">
      <header class="ide-header">
        <span>
          {problem.id ? `${problem.id}번 · ` : ''}
          {problem.title}
        </span>
        {embedded && <button onClick={close}>닫기</button>}
      </header>
      <div class="ide-main">
        <section class="ide-problem" aria-label="문제">
          <h2>문제 설명</h2>
          <Html html={problem.sections.description} />
          <h2>입력</h2>
          <Html html={problem.sections.input} />
          <h2>출력</h2>
          <Html html={problem.sections.output} />
          {problem.samples.map((s, i) => (
            <div key={i}>
              <h2>예제 입력 {i + 1}</h2>
              <pre>{s.input}</pre>
              <h2>예제 출력 {i + 1}</h2>
              <pre>{s.output}</pre>
            </div>
          ))}
        </section>
        <div class="ide-run">
          <div class="ide-editor" ref={editorHost} />
          <div class="ide-output" role="log" aria-label="실행 결과">
            {!results && !running && '실행 결과가 여기에 표시됩니다.'}
            {running && '실행 중…'}
            {results && !running && <Results results={results} />}
          </div>
        </div>
      </div>
      <footer class="ide-footer">
        <button onClick={runSamples} disabled={running}>
          코드 실행
        </button>
      </footer>
    </div>
  );
}

function Results({ results }: { results: CaseResult[] }) {
  const passed = results.filter((r) => r.passed).length;
  return (
    <div>
      {results.map((r) => (
        <div key={r.index} data-testid="case">
          {`테스트 ${r.index}\n  입력값 〉 ${r.input.trimEnd()}\n  기댓값 〉 ${r.expected.trimEnd()}\n실행 결과 〉 `}
          <span class={r.passed ? 'pass' : 'fail'}>{describe(r)}</span>
          {'\n\n'}
        </div>
      ))}
      <div class={passed === results.length ? 'pass' : 'fail'} data-testid="summary">
        {`${results.length}개 중 ${passed}개 성공`}
      </div>
    </div>
  );
}

function describe(r: CaseResult): string {
  const res = r.response;
  if (res.status === 'timeout') return '시간 초과';
  if (res.status === 'output-limit') return '출력 크기 초과';
  if (res.status === 'error') return `런타임 에러\n${res.result?.error ?? ''}`;
  if (r.passed) return '테스트를 통과하였습니다.';
  return `실행한 결괏값 ${res.result?.stdout.trimEnd() ?? ''}이(가) 기댓값 ${r.expected.trimEnd()}와(과) 다릅니다.`;
}

function Html({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html), [html]);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
