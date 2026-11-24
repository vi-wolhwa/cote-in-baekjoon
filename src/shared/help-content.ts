/**
 * Frequently asked questions (#80). The single source for the extension's help page
 * (help.html), the popup's 도움말 tab and docs/help.md (`npm run help:md` writes it).
 *
 * Text is plain with three inline marks: `code`, **bold** and [label](https://link).
 * inlineParts() splits them so pages can render them as elements, never as HTML.
 */
import { ISSUE_FORMS, REPO_URL, type IssueKind } from './report.ts';

export interface HelpSection {
  /** Anchor on the help page: help.html#{id}. */
  id: string;
  title: string;
  /** Paragraph before the list. */
  intro?: string;
  items: string[];
  /** Paragraph after the list. */
  outro?: string;
  /** Issue form for "해결되지 않았나요? 신고하기". */
  report: IssueKind;
  /**
   * Other words people search with (help page search, help-search.ts). Not shown on the
   * page and not written to docs/help.md.
   */
  keywords?: readonly string[];
}

export const HELP_TITLE = '자주 묻는 질문과 해결 방법';

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: 'no-button',
    title: '풀이 버튼이 안 보여요',
    items: [
      '백준 **문제 페이지**(`acmicpc.net/problem/번호`)에서만 문제 위 메뉴의 "N번"과 "제출" 사이에 "코딩테스트" 버튼이 나옵니다.',
      '확장을 설치하거나 업데이트한 직후에는 열려 있던 백준 탭을 새로고침해 주세요.',
      '`chrome://extensions`에서 확장이 켜져 있는지 확인해 주세요.',
    ],
    report: 'bug',
    keywords: ['버튼 없음', '풀기 버튼', '코테 화면', '안 나와요', '새로고침', '설치', '업데이트'],
  },
  {
    id: 'auto-submit',
    title: '자동 제출이 안 돼요',
    items: [
      '제출 창에 **보안 확인**(그림 고르기 등)이 나오면 자동으로 누르지 않습니다. 직접 확인하고 제출 버튼을 눌러 주세요.',
      '고른 언어가 백준 **언어 목록**에 없으면 언어 설정 페이지로 이동합니다. 언어를 추가한 뒤 다시 제출해 주세요.',
      '코드에 백준 방화벽에 막히는 문자열이 있으면 직접 제출을 안내합니다.',
      '제출 창이 열리자마자 닫았다면 다시 "제출하기"를 눌러 주세요.',
    ],
    report: 'bug',
    keywords: ['제출 안됨', '제출 버튼', '캡차', '보안 확인', '언어 설정', '방화벽', '제출 창'],
  },
  {
    id: 'judge-result',
    title: '채점 결과가 풀이 화면에 안 떠요',
    items: [
      '채점이 끝날 때까지 제출 창(채점 현황)을 닫지 말아 주세요. 결과를 읽으면 창이 저절로 닫힙니다.',
      '백준 로그인이 풀려 있으면 결과를 읽을 수 없습니다.',
    ],
    report: 'bug',
    keywords: ['채점 현황', '결과 안 나옴', '채점 중', '맞았습니다', '틀렸습니다', '로그인'],
  },
  {
    id: 'run-diff',
    title: '백준과 실행 결과가 달라요',
    intro: '브라우저 실행은 백준 채점 서버와 다릅니다. 최종 결과는 항상 백준 채점입니다.',
    items: [
      '**시간**: 브라우저가 더 느릴 수 있어 문제 시간 제한의 3배(최대 10초)까지 기다립니다.',
      '**메모리**: 메모리 제한은 검사하지 않습니다.',
      '**재귀 깊이**: C++, Java는 약 1만 단계까지 안정적입니다. 백준에서는 더 깊이 될 수 있습니다.',
      '**C++**: 예외(`throw`, `try`)를 쓸 수 없습니다. 백준 제출에서는 정상 동작합니다.',
      '**Java**: `String.format("%.2f")` 반올림이 조금 다를 수 있고, 예외가 나면 이름만 보입니다.',
      '**Python**: 표준 라이브러리만 쓸 수 있습니다.',
    ],
    outro: `차이가 이상하면 [실행 결과가 백준과 달라요](${REPO_URL}/issues/new?template=${ISSUE_FORMS['run-diff']})로 알려 주세요.`,
    report: 'run-diff',
    keywords: [
      '시간 초과',
      '메모리 초과',
      '런타임 에러',
      '스택 오버플로',
      'stack overflow',
      '반올림',
      'printf',
      'numpy',
      '라이브러리',
      '결과가 달라요',
    ],
  },
  {
    id: 'mock-exam',
    title: '모의 시험은 어떻게 보나요?',
    intro:
      '여러 문제를 제한 시간 안에 푸는 시험입니다. 팝업의 **모의 시험** 탭이나 백준 문제 메뉴의 "모의시험"에서 시작합니다.',
    items: [
      '난이도, 알고리즘, 문제 수, 제한 시간을 고르면 **solved.ac**에서 조건에 맞는 문제를 무작위로 고릅니다. 처음 한 번은 solved.ac 접근 허용을 묻습니다.',
      '**포함할 문제**에 문제 번호를 넣으면 조건과 관계없이 그 문제가 꼭 나옵니다. 넣은 문제는 문제 수보다 많을 수 없습니다. 백준 메뉴의 "모의시험"으로 열면 그 문제가 미리 들어가 있고, 뺄 수 있습니다.',
      '백준에 로그인한 채로 백준 문제 페이지를 한 번 열면 아이디를 알게 되어 **이미 푼 문제를 뺄 수** 있습니다.',
      '시험을 시작하면 문제를 하나씩 뒤쪽 탭으로 열어 읽습니다. 탭이 잠깐씩 보였다 닫혀도 정상입니다.',
      '시험 중 **제출하기**는 백준에 제출하지 않고 **답안을 저장**합니다. 다시 누르면 지금 코드로 바뀝니다.',
      '시험이 끝나면(시험 종료 또는 시간 끝) 저장한 답안을 **하나씩 차례로** 백준에 제출하고 결과 화면에 채점 결과를 보여 줍니다. 다 낼 때까지 결과 화면을 닫지 말아 주세요.',
      '제출 창에 보안 확인 등이 나오면 "직접 제출이 필요해요"가 뜹니다. **제출 창 보기**를 눌러 직접 제출해 주세요. 실패한 답안은 **다시 제출**로 다시 낼 수 있습니다.',
      '"조건에 맞는 문제가 N개뿐이에요"가 나오면 난이도나 알고리즘을 더 고르거나 문제 수를 줄여 주세요.',
    ],
    report: 'bug',
    keywords: [
      '모의시험',
      '시험',
      'solved.ac',
      '티어',
      '제한 시간',
      '결과 공개',
      '이미 푼 문제',
      '포함할 문제',
      '문제 번호',
    ],
  },
  {
    id: 'code-lost',
    title: '코드가 사라졌어요',
    items: [
      '코드는 문제·언어별로 브라우저에 자동 저장됩니다. 언어를 바꿨다면 원래 언어로 돌아가 보세요.',
      '**확장을 삭제하면 저장된 코드도 지워집니다.** 팝업의 **백업** 탭에서 파일로 내보내 두세요.',
    ],
    report: 'bug',
    keywords: ['코드 사라짐', '삭제', '내보내기', '가져오기', '복구', '저장 안 됨', '자동 저장'],
  },
  {
    id: 'slow-start',
    title: '첫 실행이 느려요',
    intro:
      'Python, C++, Java는 처음 실행할 때 실행 환경을 불러오느라 1~7초 걸립니다. 그다음부터는 빠릅니다.',
    items: [],
    report: 'bug',
    keywords: ['로딩', '느림', '오래 걸려요', '처음 실행', '실행 환경'],
  },
];

/** Suggested keywords under the help page's search box; each finds at least one section. */
export const HELP_SUGGESTIONS: readonly string[] = [
  '자동 제출',
  '버튼이 안 보여요',
  '시간 초과',
  '언어 추가',
  '채점 결과',
  '코드 백업',
  'Java',
  'C++ 예외',
  '재귀',
];

export type InlinePart =
  { kind: 'text' | 'code' | 'strong'; text: string } | { kind: 'link'; text: string; href: string };

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;

/** Splits help text into plain text, `code`, **bold** and https links. */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ kind: 'code', text: m[1] });
    else if (m[2] !== undefined) parts.push({ kind: 'strong', text: m[2] });
    else parts.push({ kind: 'link', text: m[3] ?? '', href: m[4] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** docs/help.md, generated from HELP_SECTIONS. */
export function helpMarkdown(): string {
  const lines = [
    `# ${HELP_TITLE}`,
    '',
    `확장 팝업의 **도움말** 탭과 같은 내용입니다. 해결되지 않으면 [문제 신고](${REPO_URL}/issues/new/choose)를 남겨 주세요.`,
    '',
  ];
  for (const section of HELP_SECTIONS) {
    lines.push(`## ${section.title}`, '');
    if (section.intro) lines.push(section.intro, '');
    if (section.items.length) lines.push(...section.items.map((item) => `- ${item}`), '');
    if (section.outro) lines.push(section.outro, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
