// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BANNER_HOST_ID,
  JUDGED_MESSAGE,
  JUDGING_MESSAGE,
  JUDGING_NOTICE_ID,
  LANGUAGE_NOTICE_ID,
  bannerContent,
  showLanguageMissingNotice,
  showJudgingNotice,
  showAutoSubmitCountdown,
  showSubmitBanner,
} from '@/boj/submit-banner';
import {
  fillCode,
  findLanguageSettingsUrl,
  findSubmitButton,
  hasInteractiveChallenge,
  LANGUAGE_SETTINGS_URL,
  waitForSubmitButton,
  fillSubmitForm,
  findCodeMirror,
  isEditorReady,
  isFillRequest,
  isFillResult,
  parseDetail,
  parseSubmitProblemId,
  selectLanguage,
} from '@/boj/submit-fill';

const html = readFileSync('tests/fixtures/submit-sample.html', 'utf8');

function load(): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Stands in for the CodeMirror 5 instance Baekjoon's script attaches to `.CodeMirror`. */
function attachFakeCodeMirror(doc: Document) {
  let value = '';
  const cm = {
    getValue: () => value,
    setValue: vi.fn((v: string) => {
      value = v.replace(/\r\n?/g, '\n');
    }),
  };
  const el = doc.querySelector('.CodeMirror') as Element & { CodeMirror?: unknown };
  el.CodeMirror = cm;
  return cm;
}

describe('parseSubmitProblemId', () => {
  it('accepts plain submit page URLs', () => {
    expect(parseSubmitProblemId('https://www.acmicpc.net/submit/1000')).toBe(1000);
    expect(parseSubmitProblemId('https://acmicpc.net/submit/1000/')).toBe(1000);
    expect(parseSubmitProblemId('https://acmicpc.net/submit/1000?x=1')).toBe(1000);
  });

  it('rejects resubmit URLs and other sites', () => {
    expect(parseSubmitProblemId('https://www.acmicpc.net/submit/1000/123456')).toBeUndefined();
    expect(parseSubmitProblemId('https://evil.example/submit/1000')).toBeUndefined();
    expect(parseSubmitProblemId('https://www.acmicpc.net/problem/1000')).toBeUndefined();
  });
});

describe('selectLanguage', () => {
  it('selects the option and notifies change and chosen.js listeners', () => {
    const doc = load();
    const select = doc.querySelector('select#language') as HTMLSelectElement;
    const events: string[] = [];
    doc.addEventListener('change', () => events.push('change'));
    select.addEventListener('chosen:updated', () => events.push('chosen:updated'));

    expect(selectLanguage(doc, 17)).toBe('ok');
    expect(select.value).toBe('17');
    expect(events).toEqual(['change', 'chosen:updated']);
  });

  it('reports a missing select or option', () => {
    const doc = load();
    expect(selectLanguage(doc, 999)).toBe('unavailable');
    doc.querySelector('select#language')?.remove();
    expect(selectLanguage(doc, 17)).toBe('select-missing');
  });
});

describe('fillCode', () => {
  it('sets the CodeMirror value', () => {
    const doc = load();
    const cm = attachFakeCodeMirror(doc);
    expect(isEditorReady(doc)).toBe(true);
    expect(fillCode(doc, 'console.log(1);\r\nconsole.log(2);')).toBe('ok');
    expect(cm.getValue()).toBe('console.log(1);\nconsole.log(2);');
  });

  it('does not write the hidden textarea while CodeMirror is present but not ready', () => {
    const doc = load();
    expect(findCodeMirror(doc)).toBeUndefined();
    expect(isEditorReady(doc)).toBe(false);
    expect(fillCode(doc, 'x')).toBe('editor-missing');
    expect((doc.querySelector('textarea#source') as HTMLTextAreaElement).value).toBe('');
  });

  it('falls back to the textarea when there is no CodeMirror', () => {
    const doc = load();
    doc.querySelector('.CodeMirror')?.remove();
    expect(isEditorReady(doc)).toBe(true);
    expect(fillCode(doc, 'console.log(3);')).toBe('ok');
    expect((doc.querySelector('textarea#source') as HTMLTextAreaElement).value).toBe(
      'console.log(3);',
    );
  });

  it('reports a mismatch when the editor does not keep the code', () => {
    const doc = load();
    const el = doc.querySelector('.CodeMirror') as Element & { CodeMirror?: unknown };
    el.CodeMirror = { getValue: () => '', setValue: () => undefined };
    expect(fillCode(doc, 'x')).toBe('mismatch');
  });
});

describe('fillSubmitForm', () => {
  it('fills language then code and never submits', () => {
    const doc = load();
    attachFakeCodeMirror(doc);
    const form = doc.querySelector('#submit_form') as HTMLFormElement;
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);
    const onClick = vi.fn();
    doc.querySelector('#submit_button')?.addEventListener('click', onClick);

    expect(fillSubmitForm(doc, { nonce: 'n1', languageId: 17, code: 'a' })).toEqual({
      nonce: 'n1',
      language: 'ok',
      code: 'ok',
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('bridge guards', () => {
  it('validates fill requests', () => {
    expect(isFillRequest({ nonce: 'n', languageId: 17, code: '' })).toBe(true);
    expect(isFillRequest({ nonce: 'n', languageId: 12345, code: 'x' })).toBe(false);
    expect(isFillRequest({ nonce: '', languageId: 17, code: 'x' })).toBe(false);
    expect(isFillRequest({ nonce: 'n', languageId: 17, code: 1 })).toBe(false);
    expect(isFillRequest(null)).toBe(false);
  });

  it('validates fill results', () => {
    expect(isFillResult({ nonce: 'n', language: 'ok', code: 'editor-missing' })).toBe(true);
    expect(isFillResult({ nonce: 'n', language: 'yes', code: 'ok' })).toBe(false);
  });

  it('parses only JSON string details', () => {
    expect(parseDetail('{"a":1}')).toEqual({ a: 1 });
    expect(parseDetail('{')).toBeUndefined();
    expect(parseDetail({ a: 1 })).toBeUndefined();
  });
});

describe('submit banner', () => {
  const base = { languageName: 'node.js', blockedPatterns: [], code: 'x', copied: false };

  it('asks the user to press the submit button after a full fill', () => {
    const c = bannerContent({ ...base, result: { nonce: 'n', language: 'ok', code: 'ok' } });
    expect(c.message).toBe(
      '언어와 코드를 채웠습니다. 내용을 확인하고 백준의 제출 버튼을 직접 눌러 주세요.',
    );
    expect(c.tone).toBe('info');
    expect(c.showCopyButton).toBe(false);
  });

  it('warns about firewall patterns', () => {
    const c = bannerContent({
      ...base,
      blockedPatterns: ['-->'],
      result: { nonce: 'n', language: 'ok', code: 'ok' },
    });
    expect(c.tone).toBe('warning');
    expect(c.wafWarning).toContain('-->');
  });

  it('offers copying when the code could not be filled', () => {
    const c = bannerContent({ ...base, result: undefined });
    expect(c.showCopyButton).toBe(true);
    expect(c.message).toContain('코드를 자동으로 채우지 못했습니다.');
    expect(c.message).toContain('node.js');
    expect(c.message).toContain('제출 버튼을 직접 눌러 주세요.');
    expect(bannerContent({ ...base, copied: true, result: undefined }).message).toContain(
      '클립보드에 복사했습니다',
    );
  });

  it('asks to pick the language when only the code was filled', () => {
    const c = bannerContent({
      ...base,
      result: { nonce: 'n', language: 'unavailable', code: 'ok' },
    });
    expect(c.message).toContain('지원하지 않을 수 있습니다');
    expect(c.showCopyButton).toBe(false);
  });

  it('renders as text in a shadow root and can be closed', () => {
    const doc = load();
    const host = showSubmitBanner(doc, {
      ...base,
      code: '<img src=x onerror=alert(1)>',
      result: undefined,
    });
    expect(doc.getElementById(BANNER_HOST_ID)).toBe(host);
    const root = host.shadowRoot;
    expect(root?.querySelector('.cib-message')?.textContent).toContain('채우지 못했습니다');
    expect(root?.querySelector('img')).toBeNull();
    expect(root?.querySelector('.cib-copy')).not.toBeNull();
    (root?.querySelector('.cib-close') as HTMLButtonElement).click();
    expect(doc.getElementById(BANNER_HOST_ID)).toBeNull();
  });
});

describe('auto-submit helpers (#41)', () => {
  it('finds the submit button', () => {
    expect(findSubmitButton(load())?.id).toBe('submit_button');
  });

  it('treats reCAPTCHA v3 as the normal submit path, not a check to stop at', () => {
    const doc = load();
    expect(hasInteractiveChallenge(doc)).toBe(false);
    doc.body.insertAdjacentHTML(
      'beforeend',
      '<div class="grecaptcha-badge"><iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/api2/anchor?ar=1&k=key&size=invisible"></iframe></div>',
    );
    expect(hasInteractiveChallenge(doc)).toBe(false);
  });

  it('stops at checks a person has to solve', () => {
    const cases = [
      '<div class="g-recaptcha" data-sitekey="x"></div>',
      '<iframe src="https://www.google.com/recaptcha/api2/anchor?ar=1&k=key&size=normal"></iframe>',
      '<iframe src="https://www.google.com/recaptcha/api2/bframe?k=key"></iframe>',
      '<div class="cf-turnstile"></div>',
      '<div class="h-captcha"></div>',
    ];
    for (const html of cases) {
      const doc = load();
      doc.body.insertAdjacentHTML('beforeend', html);
      expect(hasInteractiveChallenge(doc), html).toBe(true);
    }
  });

  it('waits until Baekjoon shows the submit button', async () => {
    const doc = load();
    const button = findSubmitButton(doc);
    if (!button) throw new Error('fixture has no submit button');
    button.style.display = 'none';
    setTimeout(() => (button.style.display = ''), 50);
    await expect(waitForSubmitButton(doc, 1000, 10)).resolves.toBe(button);
  });

  it('gives up when the button never appears', async () => {
    const doc = load();
    const button = findSubmitButton(doc);
    if (button) button.style.display = 'none';
    await expect(waitForSubmitButton(doc, 50, 10)).resolves.toBeNull();
  });

  it('lets the user cancel the countdown', async () => {
    const pending = showAutoSubmitCountdown(document, 10_000);
    const host = document.getElementById(BANNER_HOST_ID);
    const cancel = host?.shadowRoot?.querySelector<HTMLButtonElement>('.cib-cancel');
    cancel?.click();
    await expect(pending).resolves.toBe(false);
    expect(document.getElementById(BANNER_HOST_ID)).toBeNull();
  });

  it('goes ahead when the countdown ends', async () => {
    await expect(showAutoSubmitCountdown(document, 10)).resolves.toBe(true);
    document.getElementById(BANNER_HOST_ID)?.remove();
  });

  it('asks to keep the popup open while judging, then says it will close', () => {
    const notice = showJudgingNotice(document);
    const text = () =>
      document.getElementById(JUDGING_NOTICE_ID)?.shadowRoot?.querySelector('.cib-message')
        ?.textContent;
    expect(text()).toBe(JUDGING_MESSAGE);
    notice.finish();
    expect(text()).toBe(JUDGED_MESSAGE);
    document.getElementById(JUDGING_NOTICE_ID)?.remove();
  });

  it('finds the language settings link on the submit page, or falls back', () => {
    const doc = load();
    expect(findLanguageSettingsUrl(doc)).toBe(LANGUAGE_SETTINGS_URL);
    doc.body.insertAdjacentHTML('beforeend', '<a href="/setting/language?x=1">언어 설정</a>');
    expect(findLanguageSettingsUrl(doc)).toBe('https://acmicpc.net/setting/language?x=1');
    const foreign = load();
    foreign.body.insertAdjacentHTML(
      'beforeend',
      '<a href="https://evil.example/setting/language">x</a>',
    );
    expect(findLanguageSettingsUrl(foreign)).toBe(LANGUAGE_SETTINGS_URL);
  });

  it('explains the detour to the language settings and links back', () => {
    showLanguageMissingNotice(document, {
      languageName: 'C++17',
      submitUrl: 'https://acmicpc.net/submit/1000',
    });
    const root = document.getElementById(LANGUAGE_NOTICE_ID)?.shadowRoot;
    expect(root?.querySelector('.cib-message')?.textContent).toContain(
      "제출하려던 언어(C++17)가 백준의 '사용할 언어' 목록에 없어서",
    );
    expect(root?.querySelector<HTMLAnchorElement>('.cib-back')?.href).toBe(
      'https://acmicpc.net/submit/1000',
    );
    document.getElementById(LANGUAGE_NOTICE_ID)?.remove();
  });
});
