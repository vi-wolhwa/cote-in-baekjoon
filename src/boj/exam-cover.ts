/**
 * Mock exam (ADR-0005): inside the submit window, the status page is covered so the judge
 * result stays hidden until the exam ends. The page underneath keeps working: the status
 * content script still reads the result and the window still closes by itself.
 *
 * Built with DOM APIs in a shadow root (no HTML strings), attached to <html> so it can go
 * up before <body> exists.
 */
export const EXAM_COVER_ID = 'cib-exam-cover';
export const EXAM_COVER_MESSAGE = '제출했습니다. 결과는 시험이 끝나면 공개됩니다.';
export const EXAM_COVER_NOTE = '채점이 끝나면 이 창은 저절로 닫히고 시험 화면으로 돌아갑니다.';

export function showExamCover(doc: Document): HTMLElement {
  const existing = doc.getElementById(EXAM_COVER_ID);
  if (existing) return existing;
  const host = doc.createElement('div');
  host.id = EXAM_COVER_ID;
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    background: '#263747',
  } satisfies Partial<CSSStyleDeclaration>);
  const root = host.attachShadow({ mode: 'open' });

  const box = doc.createElement('div');
  box.setAttribute('role', 'status');
  Object.assign(box.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    height: '100%',
    padding: '24px',
    boxSizing: 'border-box',
    color: '#ffffff',
    textAlign: 'center',
    font: '16px/1.6 "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  } satisfies Partial<CSSStyleDeclaration>);

  const title = doc.createElement('strong');
  title.textContent = '코딩테스트 in 백준 · 모의 시험';
  Object.assign(title.style, { color: '#98a8b9', fontSize: '13px', fontWeight: '600' });
  const message = doc.createElement('p');
  message.className = 'cib-message';
  message.textContent = EXAM_COVER_MESSAGE;
  Object.assign(message.style, { margin: '0', fontSize: '18px', fontWeight: '600' });
  const note = doc.createElement('p');
  note.textContent = EXAM_COVER_NOTE;
  Object.assign(note.style, { margin: '0', color: '#b2c0cc', fontSize: '14px' });

  box.append(title, message, note);
  root.append(box);
  doc.documentElement.append(host);
  return host;
}
