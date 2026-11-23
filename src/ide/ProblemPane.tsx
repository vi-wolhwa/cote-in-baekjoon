import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Problem } from '@/boj/problem';

const MATH_PATTERN = /\$|\\\(|\\\[/;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Left pane: the Baekjoon statement in the coding-test layout (design spec §7). */
export function ProblemPane({ problem }: { problem: Problem }) {
  const root = useRef<HTMLDivElement>(null);
  const { sections } = problem;

  useEffect(() => {
    const el = root.current;
    if (!el || !MATH_PATTERN.test(el.textContent ?? '')) return;
    let cancelled = false;
    void import('./math').then(({ typeset }) => {
      if (!cancelled) typeset(el);
    });
    return () => {
      cancelled = true;
    };
  }, [problem]);

  return (
    <div class="problem" ref={root}>
      <div class="problem-label">문제 설명</div>
      <p class="problem-limits">
        시간 제한 <b>{problem.timeLimitText || '-'}</b>
        <span aria-hidden="true"> · </span>
        메모리 제한 <b>{problem.memoryLimitText || '-'}</b>
      </p>
      <Section title="문제" html={sections.description} />
      <Section title="입력" html={sections.input} />
      <Section title="출력" html={sections.output} />
      {sections.limit && <Section title="제한" html={sections.limit} />}
      {problem.samples.map((s, i) => (
        <section key={i} class="problem-section problem-samples">
          <div>
            <h4>예제 입력 {i + 1}</h4>
            <pre class="no-mathjax">{s.input}</pre>
          </div>
          <div>
            <h4>예제 출력 {i + 1}</h4>
            <pre class="no-mathjax">{s.output}</pre>
          </div>
        </section>
      ))}
      {sections.hint && <Section title="힌트" html={sections.hint} />}
    </div>
  );
}

function Section({ title, html }: { title: string; html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html), [html]);
  return (
    <section class="problem-section">
      <h4>{title}</h4>
      <div class="problem-html" dangerouslySetInnerHTML={{ __html: clean }} />
    </section>
  );
}

/** Explains problem types the browser runner cannot check (ADR-0001). */
export function runBlockReason(labels: string[]): string | undefined {
  if (labels.includes('interactive')) {
    return '인터랙티브 문제는 채점 프로그램과 주고받으며 실행되어 브라우저에서 실행할 수 없습니다. 백준에 제출해 확인해 주세요.';
  }
  if (labels.includes('func')) {
    return '함수 구현 문제는 백준이 제공하는 코드와 함께 실행되어 브라우저에서 실행할 수 없습니다. 백준에 제출해 확인해 주세요.';
  }
  return undefined;
}

export function runNote(labels: string[]): string | undefined {
  if (labels.includes('spj')) {
    return '스페셜 저지 문제입니다. 예제 출력과 달라도 정답일 수 있습니다.';
  }
  return undefined;
}
