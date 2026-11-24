/**
 * 'AI에게 물어볼 프롬프트 복사' (ADR-0006: no API keys in the extension). The prompt asks an
 * AI for the format JSON only; the user pastes the answer back, and it is validated like
 * any other format. Glue code never comes from AI output.
 */
import type { Problem } from '@/boj/problem';
import { REPO_URL } from '@/shared/report';
import { formatToJson, type Format } from './dsl';
import { htmlToText } from './infer-text';

export const DSL_SPEC = `형식은 아래 JSON 하나입니다.
{
  "v": 1,
  "params": [{ "name": "n", "type": "int" }, { "name": "arr", "type": "int[]", "len": "n" }],
  "lines": [["n"], ["arr"]],
  "cases": null,
  "ret": { "type": "int[]", "sep": "\\n" }
}
- params: solution 함수의 매개변수(입력 순서). name은 영어 소문자로 시작하는 식별자.
- type: int(32비트), long(64비트), double, string(공백 없는 단어), line(공백 포함 한 줄), int[], long[], string[], int[][], char[][](공백 없는 문자열 행들)
- len: 1차원 배열의 길이. 앞에서 읽은 정수 이름("n"), "n-1", "n*m", 숫자. 생략하면 그 줄의 나머지 전부.
- cols: 2차원 배열의 열 수(생략하면 줄의 값 전부).
- lines: 입력의 줄마다 읽는 매개변수 이름 배열. 여러 줄은 { "repeat": "m", "of": "edges" } (줄마다 원소 하나 또는 행 하나). 2차원 배열은 repeat로만 읽습니다.
- cases: null(케이스 하나), { "count": "T" }(첫 줄이 케이스 수), { "until": "EOF" }, { "until": "0 0" }(이 줄이 나오면 끝). 케이스마다 solution을 부르고 결과를 줄바꿈으로 잇습니다.
- ret: 반환값 출력. type은 int, long, double, string, bool, int[], long[], string[], int[][], char[][].
  배열은 sep(" " 또는 "\\n", 2차원은 열 구분 " " 또는 ""), bool은 yes/no 문구(예: "YES"/"NO"), double은 digits(소수 자리 수).`;

/** The prompt text: rules, the problem's input/output description and its samples. */
export function buildPrompt(problem: Pick<Problem, 'id' | 'sections' | 'samples'>): string {
  const samples = problem.samples
    .map(
      (s, i) =>
        `예제 입력 ${i + 1}:\n\`\`\`\n${s.input.trimEnd()}\n\`\`\`\n예제 출력 ${i + 1}:\n\`\`\`\n${s.output.trimEnd()}\n\`\`\``,
    )
    .join('\n\n');
  return [
    `백준 ${problem.id}번 문제의 입출력을 solution 함수 형식(JSON)으로 바꿔 주세요.`,
    'JSON만 답하세요. 설명이나 코드 블록 표시 없이 JSON 객체 하나만 출력합니다.',
    '',
    DSL_SPEC,
    '',
    `[입력]\n${htmlToText(problem.sections.input).trim()}`,
    '',
    `[출력]\n${htmlToText(problem.sections.output).trim()}`,
    '',
    samples,
  ].join('\n');
}

/** Pulls the JSON object out of a pasted AI answer (code fences and chatter around it). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('붙여 넣은 글에서 JSON을 찾지 못했어요.');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('JSON 문법이 맞지 않아요. 중괄호와 따옴표를 확인해 주세요.');
  }
}

/** A prefilled '입출력 형식 제안' issue: only the problem number and the format JSON. */
export function formatProposalUrl(problemId: number, format: Format): string {
  const params = new URLSearchParams({
    template: '4-format.yml',
    title: `[형식] ${problemId}번`,
    problem: String(problemId),
    format: formatToJson(format, true),
  });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
