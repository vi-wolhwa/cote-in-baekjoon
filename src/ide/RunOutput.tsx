import { sampleRows } from '@/solution/cases';
import type { Format } from '@/solution/dsl';
import { parseOutput } from '@/solution/output';
import { formatLiteral, type Value } from '@/solution/values';
import { formatElapsed, type CaseReport, type RunReport } from './run-report';

export type RunOutputProps =
  | { state: 'empty' }
  | { state: 'running'; done: number; total: number; preparing?: boolean }
  | { state: 'message'; text: string }
  | { state: 'report'; report: RunReport };

/**
 * "실행 결과" panel body (design spec §6). With a solution-mode `format`, inputs, expected
 * values and wrong results show as parameters and return values (`1, 2` → `3`).
 */
export function RunOutput(props: RunOutputProps & { format?: Format | undefined }) {
  if (props.state === 'empty') return <p class="out-muted">실행 결과가 여기에 표시됩니다.</p>;
  if (props.state === 'message') return <p class="out-muted">{props.text}</p>;
  if (props.state === 'running') {
    return (
      <div aria-live="polite">
        <p class="out-muted">
          실행 중입니다… ({props.done}/{props.total})
        </p>
        {props.preparing && (
          <p class="out-note">
            처음 실행할 때는 실행 환경을 준비하느라 몇 초 걸립니다. 다음부터는 빨라집니다.
          </p>
        )}
      </div>
    );
  }

  const { report } = props;
  return (
    <div class="out-report">
      {report.cases.map((c) => (
        <CaseTable key={c.index} c={c} format={props.format} />
      ))}
      <h3 class="out-heading">테스트 결과 (~˘▾˘)~</h3>
      <p class={report.allPassed ? 'out-pass' : 'out-fail-summary'} data-testid="summary">
        {report.total}개 중 {report.passed}개 성공
      </p>
      {report.allPassed && (
        <p class="out-note">
          샘플 테스트 케이스를 통과했다는 의미로, 작성한 코드가 문제의 정답은 아닐 수 있습니다.
        </p>
      )}
      <p class="out-note">
        브라우저에서 실행한 결과입니다. 실행 시간과 메모리는 백준 채점 환경과 다를 수 있습니다.
      </p>
    </div>
  );
}

/** A case as solution-function values, when the format reads it. */
function asValues(format: Format, c: CaseReport) {
  const rows = sampleRows(format, { input: c.input, output: c.expected });
  if (!rows) return undefined;
  const input = rows
    .map((r) => format.params.map((p) => r.params[p.name]).join(', ') || '(없음)')
    .join('\n');
  const expected = rows.map((r) => r.expected).join('\n');
  let actual: string | undefined;
  if (c.actual !== undefined && rows.length === 1) {
    const out = parseOutput(format.ret, c.actual, 1);
    if (out.ok && out.values.length === 1) actual = formatLiteral(out.values[0] as Value);
  }
  return { input, expected, actual };
}

function CaseTable({ c, format }: { c: CaseReport; format?: Format | undefined }) {
  const tone = c.status === 'pass' ? 'out-pass' : 'out-fail';
  const values = format ? asValues(format, c) : undefined;
  const message =
    c.status === 'fail' && values?.actual !== undefined
      ? `실행한 결괏값 ${values.actual}이(가) 기댓값 ${values.expected}와(과) 다릅니다.`
      : c.message;
  return (
    <table class="out-case" data-testid="case">
      <caption>테스트 {c.index}</caption>
      <tbody>
        <Row label="입력값" value={values?.input ?? c.input.trimEnd()} />
        <Row label="기댓값" value={values?.expected ?? c.expected.trimEnd()} />
        <tr>
          <th scope="row">
            실행 결과 <span class="out-sep">〉</span>
          </th>
          <td class={tone}>
            {c.status === 'error' || c.status === 'compile-error' ? (
              <strong class="out-error-title">{message}</strong>
            ) : (
              message
            )}
          </td>
        </tr>
        {c.output !== undefined && c.output !== '' && (
          <Row label="출력" value={c.output.trimEnd()} />
        )}
        {c.error && <Row label="에러" value={c.error} tone="out-fail" />}
        {c.status !== 'timeout' && c.status !== 'cancelled' && c.status !== 'compile-error' && (
          <Row label="실행 시간" value={formatElapsed(c.elapsedMs)} />
        )}
        {c.warning && <Row label="주의" value={c.warning} tone="out-warn" />}
      </tbody>
    </table>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <tr>
      <th scope="row">
        {label} <span class="out-sep">〉</span>
      </th>
      <td class={tone}>
        <pre>{value}</pre>
      </td>
    </tr>
  );
}
