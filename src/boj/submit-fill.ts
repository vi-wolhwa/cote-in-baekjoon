/**
 * Fills Baekjoon's official submit page (`/submit/{id}`) with a language and source code.
 * It never presses the submit button and never submits the form (PRD 8.1, ADR-0002).
 *
 * Known page structure (from public sources; the logged-in page could not be inspected):
 * - Language: `<select id="language" name="language">` with Baekjoon language ids as option
 *   values, enhanced by chosen.js (`#language_chosen`), which listens for `chosen:updated`.
 * - Editor: CodeMirror 5. The instance hangs off the wrapper as `.CodeMirror` → `el.CodeMirror`
 *   (used the same way by BaekjoonHub's submitfilter.js and many userscripts). That property
 *   only exists in the page's JavaScript world, so filling runs in a MAIN-world script.
 *
 * Everything that depends on the page's DOM lives here so it is easy to fix when it changes.
 */
import { isKnownLanguageId } from '@/boj/languages';

/** Sanity bound on code passed through messages and events; not Baekjoon's own limit. */
export const MAX_CODE_LENGTH = 512 * 1024;

/** Isolated content script → MAIN-world script (detail: JSON string of FillRequest). */
export const FILL_REQUEST_EVENT = 'cib:submit-fill-request';
/** MAIN-world script → isolated content script (detail: JSON string of FillResult). */
export const FILL_RESULT_EVENT = 'cib:submit-fill-result';
/** MAIN-world script → isolated content script, once its listener is ready. */
export const MAIN_READY_EVENT = 'cib:submit-main-ready';

export interface FillRequest {
  nonce: string;
  languageId: number;
  code: string;
}

export type LanguageOutcome = 'ok' | 'select-missing' | 'unavailable';
export type CodeOutcome = 'ok' | 'editor-missing' | 'mismatch';

export interface FillResult {
  nonce: string;
  language: LanguageOutcome;
  code: CodeOutcome;
}

export interface CodeMirrorLike {
  getValue(): string;
  setValue(value: string): void;
}

export function isFillRequest(v: unknown): v is FillRequest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.nonce === 'string' &&
    r.nonce.length > 0 &&
    r.nonce.length <= 64 &&
    isKnownLanguageId(r.languageId) &&
    typeof r.code === 'string' &&
    r.code.length <= MAX_CODE_LENGTH
  );
}

export function isFillResult(v: unknown): v is FillResult {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.nonce === 'string' &&
    (r.language === 'ok' || r.language === 'select-missing' || r.language === 'unavailable') &&
    (r.code === 'ok' || r.code === 'editor-missing' || r.code === 'mismatch')
  );
}

/** Parses an event `detail` that carries JSON; returns undefined for anything else. */
export function parseDetail(detail: unknown): unknown {
  if (typeof detail !== 'string' || detail.length > MAX_CODE_LENGTH * 2) return undefined;
  try {
    return JSON.parse(detail) as unknown;
  } catch {
    return undefined;
  }
}

export function findLanguageSelect(doc: Document): HTMLSelectElement | null {
  return doc.querySelector<HTMLSelectElement>('select#language, select[name="language"]');
}

/**
 * Selects the language option and tells listeners about it: a bubbling `change` (Baekjoon's
 * jQuery handlers, bound with addEventListener, see native events) and `chosen:updated` so the
 * chosen.js widget shows the new value.
 */
export function selectLanguage(doc: Document, languageId: number): LanguageOutcome {
  const select = findLanguageSelect(doc);
  if (!select) return 'select-missing';
  const value = String(languageId);
  if (![...select.options].some((o) => o.value === value && !o.disabled)) return 'unavailable';

  if (select.value !== value) {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  select.dispatchEvent(new Event('chosen:updated'));
  return select.value === value ? 'ok' : 'unavailable';
}

/** The CodeMirror 5 instance of the submit page, if the page's script created one. */
export function findCodeMirror(doc: Document): CodeMirrorLike | undefined {
  for (const el of doc.querySelectorAll('.CodeMirror')) {
    const cm = (el as Element & { CodeMirror?: unknown }).CodeMirror;
    if (isCodeMirrorLike(cm)) return cm;
  }
  return undefined;
}

export function isCodeMirrorLike(v: unknown): v is CodeMirrorLike {
  if (typeof v !== 'object' || v === null) return false;
  const cm = v as Record<string, unknown>;
  return typeof cm.getValue === 'function' && typeof cm.setValue === 'function';
}

/**
 * Plain textarea fallback, used only when there is no CodeMirror wrapper at all: when
 * CodeMirror exists it copies its own content into the textarea on submit, so writing the
 * textarea directly would be lost.
 */
export function findSourceTextarea(doc: Document): HTMLTextAreaElement | null {
  return doc.querySelector<HTMLTextAreaElement>(
    '#submit_form textarea[name="source"], textarea#source',
  );
}

/** True once the page has a usable editor (or a plain textarea and no CodeMirror at all). */
export function isEditorReady(doc: Document): boolean {
  if (findCodeMirror(doc)) return true;
  return !doc.querySelector('.CodeMirror') && findSourceTextarea(doc) !== null;
}

export function fillCode(doc: Document, code: string): CodeOutcome {
  const cm = findCodeMirror(doc);
  if (cm) {
    cm.setValue(code);
    return normalizeNewlines(cm.getValue()) === normalizeNewlines(code) ? 'ok' : 'mismatch';
  }
  if (doc.querySelector('.CodeMirror')) return 'editor-missing';

  const textarea = findSourceTextarea(doc);
  if (!textarea) return 'editor-missing';
  textarea.value = code;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  return normalizeNewlines(textarea.value) === normalizeNewlines(code) ? 'ok' : 'mismatch';
}

/** Language first: a language change may switch the editor mode before the code goes in. */
export function fillSubmitForm(doc: Document, request: FillRequest): FillResult {
  const language = selectLanguage(doc, request.languageId);
  const code = fillCode(doc, request.code);
  return { nonce: request.nonce, language, code };
}

/** CodeMirror 5 returns "\n" line endings whatever it was given. */
export function normalizeNewlines(code: string): string {
  return code.replace(/\r\n?/g, '\n');
}

/** Problem id of a plain submit page URL; `/submit/{id}/{solutionId}` (resubmit) is excluded. */
export function parseSubmitProblemId(url: string): number | undefined {
  const m = /^https:\/\/(?:www\.)?acmicpc\.net\/submit\/(\d+)\/?(?:[?#]|$)/.exec(url);
  return m ? Number(m[1]) : undefined;
}

/**
 * Baekjoon's own submit button (#41). Clicking it runs the page's normal submit path, so
 * CodeMirror copies the code into the form and Baekjoon's CSRF and reCAPTCHA v3 fields go
 * along as usual. While Baekjoon is still getting its reCAPTCHA v3 token the page shows a
 * placeholder (`#submit_preview`) and keeps `#submit_button` hidden (#45).
 */
export function findSubmitButton(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(
    '#submit_button, #submit_form button[type="submit"], #submit_form input[type="submit"]',
  );
}

/** True when the element is shown and not disabled. */
export function isClickable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (node.hidden || style?.display === 'none' || style?.visibility === 'hidden') return false;
  }
  return true;
}

/**
 * Waits (reading the DOM only) until the submit button is shown and enabled, which is when
 * Baekjoon has its reCAPTCHA v3 token. Resolves null after `timeoutMs`.
 */
export function waitForSubmitButton(
  doc: Document,
  timeoutMs: number,
  intervalMs = 200,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      const button = findSubmitButton(doc);
      if (button && isClickable(button)) return resolve(button);
      if (Date.now() - started >= timeoutMs) return resolve(null);
      setTimeout(check, intervalMs);
    };
    check();
  });
}

/**
 * True when the page asks a person to solve a check: a reCAPTCHA v2 checkbox or image
 * challenge, hCaptcha, or Cloudflare Turnstile. Auto-submit then stops and leaves it to the
 * user; it never solves or skips a check.
 *
 * reCAPTCHA v3 does not count: it has nothing to solve (only the corner badge, whose frame
 * URL carries `size=invisible`) and the page attaches its token on the normal submit path.
 */
export function hasInteractiveChallenge(doc: Document): boolean {
  const interactive = doc.querySelector(
    [
      '.cf-turnstile',
      '.h-captcha',
      'iframe[src*="hcaptcha"]',
      'iframe[src*="challenges.cloudflare.com"]',
      'iframe[src*="recaptcha/api2/bframe"]',
      'iframe[src*="recaptcha/enterprise/bframe"]',
    ].join(', '),
  );
  if (interactive) return true;
  for (const frame of doc.querySelectorAll<HTMLIFrameElement>('iframe[src*="recaptcha"]')) {
    const src = frame.getAttribute('src') ?? '';
    if (/\/anchor\b/.test(src) && !/[?&]size=invisible\b/.test(src)) return true;
  }
  // A visible v2 checkbox container (v3 never renders .g-recaptcha).
  return doc.querySelector('.g-recaptcha:not([data-size="invisible"])') !== null;
}
