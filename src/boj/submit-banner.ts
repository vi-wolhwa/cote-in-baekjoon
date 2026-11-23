/**
 * Banner shown on Baekjoon's submit page after the extension filled it. It always reminds the
 * user to press Baekjoon's own submit button (PRD 8.1). Built with DOM APIs in a shadow root
 * so page styles do not leak in and no HTML strings are parsed.
 */
import type { FillResult } from '@/boj/submit-fill';

export const BANNER_HOST_ID = 'cib-submit-banner';

export interface BannerInput {
  /** Undefined when the page never answered the fill request. */
  result: FillResult | undefined;
  languageName: string;
  blockedPatterns: string[];
  code: string;
  /** Whether the code was already copied to the clipboard automatically. */
  copied: boolean;
}

export interface BannerContent {
  tone: 'info' | 'warning';
  message: string;
  /** Shown as a second line when the code contains strings the firewall may reject. */
  wafWarning?: string;
  showCopyButton: boolean;
}

export function bannerContent(input: BannerInput): BannerContent {
  const { result, languageName, blockedPatterns, copied } = input;
  const wafWarning =
    blockedPatterns.length > 0
      ? `백준 방화벽이 막을 수 있는 문자열이 있습니다: ${blockedPatterns.join(', ')}. ` +
        '제출이 거부되면(403) 이 부분을 바꿔 주세요. 예: n --> 0 은 n-- > 0 처럼 띄어 씁니다.'
      : undefined;
  const pickLanguage =
    result?.language === 'unavailable'
      ? `이 문제는 ${languageName} 제출을 지원하지 않을 수 있습니다. 언어 목록을 확인해 주세요.`
      : `언어를 ${languageName}(으)로 직접 골라 주세요.`;

  if (result?.code === 'ok' && result.language === 'ok') {
    return {
      tone: wafWarning ? 'warning' : 'info',
      message: '언어와 코드를 채웠습니다. 내용을 확인하고 백준의 제출 버튼을 직접 눌러 주세요.',
      wafWarning,
      showCopyButton: false,
    };
  }
  if (result?.code === 'ok') {
    return {
      tone: 'warning',
      message: `코드를 채웠지만 언어를 고르지 못했습니다. ${pickLanguage} 그다음 백준의 제출 버튼을 직접 눌러 주세요.`,
      wafWarning,
      showCopyButton: false,
    };
  }
  const message = [
    '코드를 자동으로 채우지 못했습니다.',
    copied ? '코드를 클립보드에 복사했습니다.' : "'코드 복사' 버튼을 눌러 코드를 복사해 주세요.",
    '백준 에디터에 코드를 붙여 넣어 주세요.',
    result?.language === 'ok' ? '' : pickLanguage,
    '내용을 확인하고 백준의 제출 버튼을 직접 눌러 주세요.',
  ];
  return {
    tone: 'warning',
    message: message.filter(Boolean).join(' '),
    wafWarning,
    showCopyButton: true,
  };
}

const COLORS = {
  info: { background: '#e8f4fd', border: '#0076c0', text: '#0b3c5d' },
  warning: { background: '#fff4e5', border: '#e67e22', text: '#5c3200' },
} as const;

/** Renders (or replaces) the banner at the top of the page. */
export function showSubmitBanner(doc: Document, input: BannerInput): HTMLElement {
  doc.getElementById(BANNER_HOST_ID)?.remove();
  const content = bannerContent(input);
  const colors = COLORS[content.tone];

  const host = doc.createElement('div');
  host.id = BANNER_HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    width: 'min(720px, calc(100vw - 32px))',
  } satisfies Partial<CSSStyleDeclaration>);
  const root = host.attachShadow({ mode: 'open' });

  const box = doc.createElement('div');
  box.setAttribute('role', content.tone === 'warning' ? 'alert' : 'status');
  Object.assign(box.style, {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    padding: '12px 16px',
    border: `1px solid ${colors.border}`,
    borderLeftWidth: '6px',
    borderRadius: '6px',
    background: colors.background,
    color: colors.text,
    font: '14px/1.6 "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  } satisfies Partial<CSSStyleDeclaration>);

  const body = doc.createElement('div');
  body.style.flex = '1';
  const title = doc.createElement('strong');
  title.textContent = '코딩테스트 in 백준';
  title.style.display = 'block';
  const message = doc.createElement('p');
  message.className = 'cib-message';
  message.textContent = content.message;
  message.style.margin = '4px 0 0';
  body.append(title, message);

  if (content.wafWarning) {
    const waf = doc.createElement('p');
    waf.className = 'cib-waf';
    waf.textContent = content.wafWarning;
    waf.style.margin = '6px 0 0';
    body.append(waf);
  }

  if (content.showCopyButton) {
    const copy = button(doc, '코드 복사', colors.border);
    copy.className = 'cib-copy';
    copy.style.marginTop = '8px';
    copy.addEventListener('click', () => {
      void copyText(input.code).then((ok) => {
        copy.textContent = ok ? '복사했습니다' : '복사하지 못했습니다';
      });
    });
    body.append(copy);
  }

  const close = button(doc, '닫기', colors.border);
  close.className = 'cib-close';
  close.addEventListener('click', () => host.remove());

  box.append(body, close);
  root.append(box);
  doc.body.append(host);
  return host;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function button(doc: Document, label: string, color: string): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.textContent = label;
  Object.assign(b.style, {
    padding: '4px 12px',
    border: `1px solid ${color}`,
    borderRadius: '4px',
    background: '#ffffff',
    color,
    font: 'inherit',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
  return b;
}

/**
 * Countdown before auto-submit (#41): tells the user what is about to happen and lets them
 * cancel. Resolves true to go ahead, false when the user cancelled.
 */
export function showAutoSubmitCountdown(doc: Document, delayMs: number): Promise<boolean> {
  doc.getElementById(BANNER_HOST_ID)?.remove();
  const colors = COLORS.info;
  const host = doc.createElement('div');
  host.id = BANNER_HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    width: 'min(720px, calc(100vw - 32px))',
  } satisfies Partial<CSSStyleDeclaration>);
  const root = host.attachShadow({ mode: 'open' });
  const box = doc.createElement('div');
  box.setAttribute('role', 'status');
  Object.assign(box.style, {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    padding: '12px 16px',
    border: `1px solid ${colors.border}`,
    borderLeftWidth: '6px',
    borderRadius: '6px',
    background: colors.background,
    color: colors.text,
    font: '14px/1.6 "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  } satisfies Partial<CSSStyleDeclaration>);
  const message = doc.createElement('p');
  message.className = 'cib-message';
  message.style.margin = '0';
  message.style.flex = '1';
  message.textContent = '언어와 코드를 채웠습니다. 잠시 뒤 자동으로 제출합니다.';
  const cancel = button(doc, '취소', colors.border);
  cancel.className = 'cib-cancel';
  box.append(message, cancel);
  root.append(box);
  doc.body.append(host);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      message.textContent = '자동으로 제출합니다.';
      cancel.remove();
      resolve(true);
    }, delayMs);
    cancel.addEventListener('click', () => {
      clearTimeout(timer);
      host.remove();
      resolve(false);
    });
  });
}
