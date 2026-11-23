import { parseProblem } from '@/boj/problem';
import { isCloseMessage, isReadyMessage, type ProblemMessage } from '@/shared/messages';

const BUTTON_ID = 'cib-open-ide';
const OVERLAY_ID = 'cib-ide-overlay';

export default defineContentScript({
  matches: ['https://acmicpc.net/problem/*', 'https://www.acmicpc.net/problem/*'],
  runAt: 'document_idle',
  main() {
    const title = document.querySelector('#problem_title');
    if (!title || document.getElementById(BUTTON_ID)) return;
    // Place the button at the end of the title line, after Baekjoon's problem labels.
    const heading = title.closest('h1, h2, h3') ?? title.parentElement ?? title;
    heading.append(createButton());
  },
});

function createButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = '코테 화면으로 풀기';
  Object.assign(button.style, {
    marginLeft: '12px',
    padding: '6px 14px',
    border: 'none',
    borderRadius: '4px',
    background: '#0078ff',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    verticalAlign: 'middle',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  button.addEventListener('click', openIde);
  return button;
}

function openIde() {
  if (document.getElementById(OVERLAY_ID)) return;
  const problem = parseProblem(document, location.href);
  if (!problem) {
    alert('문제 정보를 읽지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    return;
  }

  const frame = document.createElement('iframe');
  frame.id = OVERLAY_ID;
  frame.src = browser.runtime.getURL('/ide.html');
  frame.title = '코딩테스트 풀이 화면';
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
