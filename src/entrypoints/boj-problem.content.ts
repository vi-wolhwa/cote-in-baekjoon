import { parseProblem } from '@/boj/problem';
import { isCloseMessage, type ProblemMessage } from '@/shared/messages';

const BUTTON_ID = 'cib-open-ide';
const OVERLAY_ID = 'cib-ide-overlay';

export default defineContentScript({
  matches: ['https://acmicpc.net/problem/*', 'https://www.acmicpc.net/problem/*'],
  runAt: 'document_idle',
  main() {
    const title = document.querySelector('#problem_title');
    if (!title || document.getElementById(BUTTON_ID)) return;
    title.insertAdjacentElement('afterend', createButton());
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
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || !isCloseMessage(event.data)) return;
    window.removeEventListener('message', onMessage);
    frame.remove();
    document.documentElement.style.overflow = previousOverflow;
  };
  window.addEventListener('message', onMessage);

  frame.addEventListener('load', () => {
    const message: ProblemMessage = { type: 'cib:problem', problem };
    // The frame's origin is the extension's fixed id even when src uses a dynamic URL.
    frame.contentWindow?.postMessage(message, `chrome-extension://${browser.runtime.id}`);
  });

  document.documentElement.style.overflow = 'hidden';
  document.body.append(frame);
}
