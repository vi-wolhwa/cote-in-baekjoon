/**
 * On-page notice for a self-diagnosis (#87). Sits in the bottom-right corner so it does not
 * cover the submit banners at the top, and lives in a shadow root so Baekjoon's styles do
 * not touch it. All text is set as text, never as HTML.
 */
import { describeBrowser, issueUrl } from '@/shared/report';
import { describeDiagnosis, PAGE_LABEL, type Diagnosis } from './diagnosis';

const HOST_ID = 'cib-diagnosis-notice';

export interface NoticeContext {
  version: string;
  problemId?: number;
  /** For tests; defaults to the page's navigator. */
  browser?: string;
}

export function diagnosisMessage(d: Diagnosis): string {
  return `백준 ${PAGE_LABEL[d.page]}의 구조가 바뀐 것 같아요. 일부 기능이 동작하지 않을 수 있어요. (찾지 못함: ${d.missing.join(', ')})`;
}

export function diagnosisReportUrl(d: Diagnosis, context: NoticeContext): string {
  return issueUrl('bug', {
    version: context.version,
    browser: context.browser ?? describeBrowser(navigator),
    problemId: context.problemId,
    details: describeDiagnosis(d),
  });
}

/** Shows the notice once per page; a second diagnosis on the same page replaces it. */
export function showDiagnosisNotice(
  doc: Document,
  d: Diagnosis,
  context: NoticeContext,
): HTMLElement {
  doc.getElementById(HOST_ID)?.remove();
  const host = doc.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    width: 'min(380px, calc(100vw - 32px))',
  } satisfies Partial<CSSStyleDeclaration>);
  const root = host.attachShadow({ mode: 'open' });

  const box = doc.createElement('div');
  box.setAttribute('role', 'alert');
  Object.assign(box.style, {
    padding: '12px 14px',
    borderRadius: '10px',
    background: '#1A2632',
    color: '#C9D4DE',
    border: '1px solid #3A311B',
    borderLeft: '5px solid #FFC857',
    font: '13px/1.55 "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
  } satisfies Partial<CSSStyleDeclaration>);

  const title = doc.createElement('strong');
  title.textContent = '코딩테스트 in 백준';
  Object.assign(title.style, { display: 'block', color: '#FFFFFF', marginBottom: '2px' });

  const message = doc.createElement('p');
  message.className = 'cib-diagnosis-message';
  message.textContent = diagnosisMessage(d);
  message.style.margin = '0 0 10px';

  const actions = doc.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });

  const report = doc.createElement('a');
  report.className = 'cib-diagnosis-report';
  report.textContent = '문제 신고하기';
  report.href = diagnosisReportUrl(d, context);
  report.target = '_blank';
  report.rel = 'noopener noreferrer';
  Object.assign(report.style, {
    padding: '6px 12px',
    borderRadius: '6px',
    background: '#8E6CFF',
    color: '#FFFFFF',
    textDecoration: 'none',
    fontWeight: '600',
  } satisfies Partial<CSSStyleDeclaration>);

  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = '닫기';
  Object.assign(close.style, {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #2E3E4E',
    background: 'transparent',
    color: '#C9D4DE',
    font: 'inherit',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  close.addEventListener('click', () => host.remove());

  actions.append(close, report);
  box.append(title, message, actions);
  root.append(box);
  (doc.body ?? doc.documentElement).append(host);
  return host;
}
