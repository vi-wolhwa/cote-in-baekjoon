// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  EXAM_BUTTON_ID,
  EXAM_ITEM_ID,
  EXAM_LABEL,
  insertOpenButton,
  OPEN_LABEL,
} from '@/boj/open-button';
import { handleOpenExamSetup } from '@/exam/open-setup';
import { HANDLE_KEY, isHandle, readHandle, rememberHandle, toHandle } from '@/shared/handle';
import { isOpenExamSetupMessage } from '@/shared/messages';

const problemHtml = readFileSync('tests/fixtures/problem-sample.html', 'utf8');
const page = (html = problemHtml) => new DOMParser().parseFromString(html, 'text/html');
const menuTexts = (doc: Document) =>
  [...doc.querySelectorAll('ul.problem-menu > li')].map((li) => li.textContent?.trim());

beforeEach(() => {
  fakeBrowser.reset();
});

describe('logged-in Baekjoon id', () => {
  it('accepts Baekjoon ids only', () => {
    expect(isHandle('tester_01')).toBe(true);
    expect(isHandle('a'.repeat(21))).toBe(false);
    expect(isHandle('')).toBe(false);
    expect(isHandle('a b')).toBe(false);
    expect(isHandle('a@b')).toBe(false);
    expect(toHandle('  Tester  ')).toBe('tester');
    expect(toHandle('<img>')).toBeUndefined();
    expect(toHandle(undefined)).toBeUndefined();
  });

  it('reads the header link, not the status URL', () => {
    expect(readHandle(page())).toBe('tester');
    const doc = page();
    doc.querySelector('a.username')?.remove();
    expect(readHandle(doc)).toBeUndefined();
    const hostile = page();
    const link = hostile.querySelector('a.username');
    if (link) link.textContent = 'x"); drop';
    expect(readHandle(hostile)).toBeUndefined();
  });

  it('stores the id only when it changed', async () => {
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    await rememberHandle(page());
    await rememberHandle(page());
    expect(await fakeBrowser.storage.local.get(HANDLE_KEY)).toEqual({ [HANDLE_KEY]: 'tester' });
    expect(set).toHaveBeenCalledTimes(1);
  });
});

describe('"모의시험" in the Baekjoon problem menu (#102)', () => {
  it('goes between "코딩테스트" and "제출"', () => {
    const doc = page();
    expect(
      insertOpenButton(
        doc,
        () => undefined,
        () => undefined,
      ),
    ).toBe('menu');
    expect(menuTexts(doc).slice(0, 4)).toEqual(['1000번', OPEN_LABEL, EXAM_LABEL, '제출']);
    const link = doc.getElementById(EXAM_BUTTON_ID);
    expect(link?.parentElement?.id).toBe(EXAM_ITEM_ID);
    expect(link?.getAttribute('role')).toBe('button');
    expect(link?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('follows the IDE button at the title when the menu is missing', () => {
    const doc = page();
    doc.querySelector('ul.problem-menu')?.remove();
    expect(
      insertOpenButton(
        doc,
        () => undefined,
        () => undefined,
      ),
    ).toBe('title');
    const heading = doc.querySelector('h1');
    expect([...(heading?.querySelectorAll('a[role="button"]') ?? [])].map((a) => a.id)).toEqual([
      'cib-open-ide',
      EXAM_BUTTON_ID,
    ]);
  });

  it('opens the exam setup on click and Space', () => {
    const doc = page();
    const onExam = vi.fn();
    const onOpen = vi.fn();
    insertOpenButton(doc, onOpen, onExam);
    const link = doc.getElementById(EXAM_BUTTON_ID) as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    link.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(click.defaultPrevented).toBe(true);
    expect(onExam).toHaveBeenCalledTimes(2);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('is not added without a handler (other callers)', () => {
    const doc = page();
    insertOpenButton(doc, () => undefined);
    expect(doc.getElementById(EXAM_BUTTON_ID)).toBeNull();
  });
});

describe('background: open the exam setup', () => {
  const EXT = fakeBrowser.runtime.id;
  const sender = (url: string): Browser.runtime.MessageSender => ({
    id: EXT,
    url,
    tab: { id: 4, index: 2 } as Browser.tabs.Tab,
  });

  it('validates the message', () => {
    expect(isOpenExamSetupMessage({ type: 'cib:open-exam-setup', problemId: 1000 })).toBe(true);
    expect(isOpenExamSetupMessage({ type: 'cib:open-exam-setup', problemId: '1000' })).toBe(false);
    expect(isOpenExamSetupMessage({ type: 'cib:open-exam-setup', problemId: 0 })).toBe(false);
  });

  it('opens exam.html#setup with the problem next to the problem tab', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    const message = { type: 'cib:open-exam-setup', problemId: 1000 } as const;
    await expect(
      handleOpenExamSetup(message, sender('https://www.acmicpc.net/problem/1000')),
    ).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringMatching(/\/exam\.html#setup\?include=1000$/),
        index: 3,
        openerTabId: 4,
      }),
    );
  });

  it('refuses other pages and other problems', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    const message = { type: 'cib:open-exam-setup', problemId: 1000 } as const;
    for (const url of [
      'https://www.acmicpc.net/problem/1001',
      'https://www.acmicpc.net/status',
      'https://example.com/problem/1000',
    ]) {
      await expect(handleOpenExamSetup(message, sender(url))).resolves.toEqual({ ok: false });
    }
    await expect(
      handleOpenExamSetup(message, { url: 'https://www.acmicpc.net/problem/1000' }),
    ).resolves.toEqual({ ok: false });
    expect(create).not.toHaveBeenCalled();
  });
});
