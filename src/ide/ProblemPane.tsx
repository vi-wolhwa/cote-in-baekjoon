import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Problem, Sample } from '@/boj/problem';
import { sampleRows, type CaseRow } from '@/solution/cases';
import type { Format } from '@/solution/dsl';
import { useTranslation, type TranslationStatus } from './translate/useTranslation';

const MATH_PATTERN = /\$|\\\(|\\\[/;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Left pane: the Baekjoon statement in the coding-test layout (design spec §7). With a
 * solution-mode `format`, the samples show as an '입출력 예' table: a column per parameter
 * and `result`, a row per case. Samples the format cannot split stay as input/output blocks.
 */
export function ProblemPane({
  problem,
  format,
}: {
  problem: Problem;
  format?: Format | undefined;
}) {
  const root = useRef<HTMLDivElement>(null);
  const translation = useTranslation(problem.id, problem.sections);
  const sections = translation.shown;
  const io = useMemo(
    () => (format ? problem.samples.map((s) => sampleRows(format, s)) : undefined),
    [problem, format],
  );
  const rows = io?.flatMap((r) => r ?? []) ?? [];

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
  }, [problem, sections]);

  return (
    <div class="problem" ref={root}>
      <div class="problem-label">문제 설명</div>
      <TranslationBar
        status={translation.status}
        showOriginal={translation.showOriginal}
        onTranslate={translation.translate}
        onChoose={translation.choose}
      />
      <p class="problem-limits">
        시간 제한 <b>{problem.timeLimitText || '-'}</b>
        <span aria-hidden="true"> · </span>
        메모리 제한 <b>{problem.memoryLimitText || '-'}</b>
      </p>
      <Section title="문제" html={sections.description} />
      <Section title="입력" html={sections.input} />
      <Section title="출력" html={sections.output} />
      {sections.limit && <Section title="제한" html={sections.limit} />}
      {format && rows.length > 0 && <IoTable format={format} rows={rows} />}
      {problem.samples.map((s, i) => (io?.[i] ? null : <RawSample key={i} sample={s} n={i + 1} />))}
      {sections.hint && <Section title="힌트" html={sections.hint} />}
    </div>
  );
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: '영어',
  ja: '일본어',
  zh: '중국어',
  ru: '러시아어',
  pl: '폴란드어',
  de: '독일어',
  fr: '프랑스어',
  es: '스페인어',
  vi: '베트남어',
};

const languageName = (code: string) => LANGUAGE_NAMES[code.split('-')[0] ?? code] ?? '외국어';

/** Above a foreign-language statement: translating, and switching to the original. */
function TranslationBar(props: {
  status: TranslationStatus;
  showOriginal: boolean;
  onTranslate: () => void;
  onChoose: (original: boolean) => void;
}) {
  const { status } = props;
  if (status.kind === 'native') return null;
  const name = languageName(status.source);
  return (
    <div class="translate-bar" data-testid="translate-bar">
      {status.kind === 'unsupported' && (
        <span class="translate-note">
          {name} 문제예요. 이 브라우저는 내장 번역을 지원하지 않아 원문으로 보여요.
        </span>
      )}
      {status.kind === 'ready' && (
        <>
          <button type="button" class="translate-button" onClick={props.onTranslate}>
            한국어로 번역
          </button>
          <span class="translate-note">{name} 문제예요. 처음에는 번역 모델을 내려받아요.</span>
        </>
      )}
      {status.kind === 'working' && (
        <span class="translate-note" role="status">
          번역하는 중…
          {status.progress !== undefined &&
            status.progress < 1 &&
            ` (모델 ${Math.round(status.progress * 100)}%)`}
        </span>
      )}
      {status.kind === 'error' && (
        <>
          <span class="translate-note">번역하지 못해 원문으로 보여요.</span>
          <button type="button" class="translate-button" onClick={props.onTranslate}>
            다시 시도
          </button>
        </>
      )}
      {status.kind === 'done' && (
        <>
          <span class="translate-toggle" role="group" aria-label="문제 언어">
            <button
              type="button"
              aria-pressed={!props.showOriginal}
              onClick={() => props.onChoose(false)}
            >
              번역
            </button>
            <button
              type="button"
              aria-pressed={props.showOriginal}
              onClick={() => props.onChoose(true)}
            >
              원문
            </button>
          </span>
          <span class="translate-note">
            {props.showOriginal ? `${name} 원문` : `${name}에서 기계 번역했어요`}
          </span>
        </>
      )}
    </div>
  );
}

function RawSample({ sample, n }: { sample: Sample; n: number }) {
  return (
    <section class="problem-section problem-samples">
      <div>
        <h4>예제 입력 {n}</h4>
        <pre class="no-mathjax">{sample.input}</pre>
      </div>
      <div>
        <h4>예제 출력 {n}</h4>
        <pre class="no-mathjax">{sample.output}</pre>
      </div>
    </section>
  );
}

/** '입출력 예': a column per parameter and `result`, values written as literals. */
function IoTable({ format, rows }: { format: Format; rows: CaseRow[] }) {
  return (
    <section class="problem-section problem-io" data-testid="io-table">
      <h4>입출력 예</h4>
      <div class="problem-io-scroll">
        <table class="no-mathjax">
          <thead>
            <tr>
              {format.params.map((p) => (
                <th key={p.name} scope="col">
                  {p.name}
                </th>
              ))}
              <th scope="col">result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {format.params.map((p) => (
                  <td key={p.name}>{r.params[p.name]}</td>
                ))}
                <td>{r.expected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
