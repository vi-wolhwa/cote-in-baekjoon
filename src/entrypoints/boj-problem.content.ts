import { diagnoseProblemPage } from '@/boj/diagnosis';
import { askCapture, captureProblem } from '@/boj/exam-capture';
import { insertOpenButton } from '@/boj/open-button';
import '@/boj/open-button.css';
import { showDiagnosisNotice } from '@/boj/diagnosis-notice';
import { parseProblem, parseProblemId } from '@/boj/problem';
import { PRACTICE_HASH } from '@/exam/routes';
import { rememberHandle } from '@/shared/handle';
import {
  isCloseMessage,
  isOpenIdeMessage,
  isReadyMessage,
  type OpenExamSetupMessage,
  type ProblemMessage,
} from '@/shared/messages';

const OVERLAY_ID = 'cib-ide-overlay';

export default defineContentScript({
  matches: ['https://acmicpc.net/problem/*', 'https://www.acmicpc.net/problem/*'],
  runAt: 'document_idle',
  async main() {
    // The logged-in Baekjoon id, for the mock exam's '이미 푼 문제 빼기' (ADR-0005).
    void rememberHandle(document);
    // A background tab the mock exam opened to read this problem: read it, add nothing.
    const capture = await askCapture();
    if (capture !== undefined) {
      await captureProblem(document, location.href, capture);
      return;
    }
    // A problem page whose layout changed: say so instead of silently showing no button (#87).
    reportLayoutProblem();
    // In the problem menu between "N번" and "제출", or after the title if the menu is gone.
    if (!insertOpenButton(document, openIde, openExamSetup)) return;
    // '다시 풀기' on the mock exam's result screen opens the problem with the IDE on.
    if (location.hash === PRACTICE_HASH) {
      history.replaceState(null, '', location.pathname + location.search);
      openIde();
    }
    // The toolbar popup's "코테 화면으로 풀기" (#79). Only the extension's own pages can send it.
    browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id || !isOpenIdeMessage(message)) return;
      openIde();
      sendResponse({ ok: true });
    });
  },
});

function openIde() {
  if (document.getElementById(OVERLAY_ID)) return;
  const problem = parseProblem(document, location.href);
  if (!problem) {
    if (!reportLayoutProblem()) {
      alert('문제 정보를 읽지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    }
    return;
  }

  const frame = document.createElement('iframe');
  frame.id = OVERLAY_ID;
  frame.src = browser.runtime.getURL('/ide.html');
  frame.title = '코딩테스트 풀이 화면';
  // The built-in translator (ADR-0010) works in a cross-origin frame only when allowed.
  frame.allow = 'translator';
  Object.assign(frame.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    border: '0',
    zIndex: '2147483647',
    background: '#263747',
  } satisfies Partial<CSSStyleDeclaration>);

  const previousOverflow = document.documentElement.style.overflow;
  // The frame's origin is the extension's fixed id even when src uses a dynamic URL.
  const ideOrigin = `chrome-extension://${browser.runtime.id}`;
  const sendProblem = () => {
    const message: ProblemMessage = { type: 'cib:problem', problem };
    frame.contentWindow?.postMessage(message, ideOrigin);
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (isReadyMessage(event.data)) {
      sendProblem();
    } else if (isCloseMessage(event.data)) {
      window.removeEventListener('message', onMessage);
      frame.remove();
      document.documentElement.style.overflow = previousOverflow;
    }
  };
  window.addEventListener('message', onMessage);

  document.documentElement.style.overflow = 'hidden';
  document.body.append(frame);
}

/** '모의시험' (#102): the background opens the setup page with this problem included. */
function openExamSetup() {
  const problemId = parseProblemId(location.href);
  if (problemId === undefined) return;
  const message: OpenExamSetupMessage = { type: 'cib:open-exam-setup', problemId };
  browser.runtime.sendMessage(message).catch(() => {
    alert('확장 프로그램과 연결하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
  });
}

/** Shows the self-diagnosis notice when the problem page lacks what the IDE needs (#87). */
function reportLayoutProblem(): boolean {
  const diagnosis = diagnoseProblemPage(document, location.href);
  if (!diagnosis) return false;
  showDiagnosisNotice(document, diagnosis, {
    version: browser.runtime.getManifest().version,
    problemId: parseProblemId(location.href),
  });
  return true;
}
