// @vitest-environment happy-dom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpPage, sectionFromHash, type HelpPageProps } from '@/entrypoints/help/HelpPage';
import { HELP_SECTIONS } from '@/shared/help-content';

function mount(props: Partial<HelpPageProps> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const all: HelpPageProps = {
    context: { version: '1.2.3', browser: 'Chrome 131' },
    iconUrl: 'icon.png',
    onQueryChange: vi.fn(),
    ...props,
  };
  act(() => render(h(HelpPage, all), root));
  const input = root.querySelector<HTMLInputElement>('#help-search');
  if (!input) throw new Error('no search box');
  return { root, input, props: all };
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const sectionIds = (root: HTMLElement) => [...root.querySelectorAll('.faq')].map((s) => s.id);
const status = (root: HTMLElement) => root.querySelector('[data-testid="result-count"]');

afterEach(() => {
  // Unmount, so the page's document key listeners do not outlive the test.
  for (const root of document.body.children) act(() => render(null, root));
  document.body.innerHTML = '';
});

describe('HelpPage', () => {
  it('shows every question, a labelled search box and the keyword chips', () => {
    const { root, input } = mount();
    expect(root.querySelector('h1')?.textContent).toBe('도움말');
    expect(root.querySelector('label[for="help-search"]')?.textContent).toBe('도움말 검색');
    expect(input.placeholder).toContain('무엇이 궁금한가요?');
    expect(sectionIds(root)).toEqual(HELP_SECTIONS.map((s) => s.id));
    const chips = [...root.querySelectorAll<HTMLButtonElement>('.chip')];
    expect(chips.map((c) => c.textContent)).toContain('자동 제출');
    expect(chips.every((c) => c.type === 'button')).toBe(true);
    expect(status(root)?.getAttribute('aria-live')).toBe('polite');
    expect(status(root)?.textContent).toBe('');
    expect(root.querySelectorAll('[data-testid="report-link"]')).toHaveLength(6);
  });

  it('filters while typing, marks the words and counts the results', () => {
    const { root, input, props } = mount();
    type(input, 'c++ 예외');
    expect(sectionIds(root)).toEqual(['run-diff']);
    expect(status(root)?.textContent).toBe('1개 찾음');
    const marks = [...root.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(expect.arrayContaining(['C++', '예외']));
    expect(props.onQueryChange).toHaveBeenLastCalledWith('c++ 예외');
    // The run-diff section still reports with its own form.
    const report = root.querySelector<HTMLAnchorElement>('#run-diff [data-testid="report-link"]');
    expect(new URL(report?.href ?? '').searchParams.get('template')).toBe('2-run-diff.yml');
  });

  it('never parses the query as HTML', () => {
    const { root, input } = mount();
    type(input, '<img src=x onerror=alert(1)>');
    expect(root.querySelector('img:not(.hero-logo)')).toBeNull();
  });

  it('fills the search from a chip, and the same chip clears it', () => {
    const { root, input } = mount();
    const chip = [...root.querySelectorAll<HTMLButtonElement>('.chip')].find(
      (c) => c.textContent === '코드 백업',
    );
    act(() => chip?.click());
    expect(input.value).toBe('코드 백업');
    expect(chip?.getAttribute('aria-pressed')).toBe('true');
    expect(sectionIds(root)[0]).toBe('code-lost');
    act(() => chip?.click());
    expect(input.value).toBe('');
    expect(sectionIds(root)).toHaveLength(HELP_SECTIONS.length);
  });

  it('shows the empty state with report and suggestion links', () => {
    const { root, input } = mount();
    type(input, '블록체인');
    expect(sectionIds(root)).toEqual([]);
    const empty = root.querySelector('[data-testid="empty"]');
    expect(empty?.querySelector('h2')?.textContent).toBe('찾는 내용이 없나요?');
    const links = [...(empty?.querySelectorAll('a') ?? [])].map((a) => new URL(a.href));
    expect(links.map((u) => u.searchParams.get('template'))).toEqual([
      '1-bug.yml',
      '3-feature.yml',
    ]);
    expect(links[0]?.searchParams.get('version')).toBe('1.2.3 / Chrome 131');
    expect(status(root)?.textContent).toBe('검색 결과가 없어요');
  });

  it('opens with the query from ?q=', () => {
    const { root, input } = mount({ initialQuery: '캡차' });
    expect(input.value).toBe('캡차');
    expect(sectionIds(root)).toEqual(['auto-submit']);
  });

  it('focuses the search with "/" and clears it with Esc', () => {
    const { root, input } = mount({ initialQuery: 'java' });
    input.blur();
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    expect(document.activeElement).toBe(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(input.value).toBe('');
    expect(sectionIds(root)).toHaveLength(HELP_SECTIONS.length);
  });

  it('scrolls to and highlights the section from #id', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { root } = mount({ initialSection: 'run-diff' });
    expect(scroll).toHaveBeenCalledOnce();
    expect(root.querySelector('#run-diff')?.classList.contains('flash')).toBe(true);
  });

  it('reads the section id from a location hash', () => {
    expect(sectionFromHash('#run-diff')).toBe('run-diff');
    expect(sectionFromHash('')).toBe('');
    expect(sectionFromHash('#%E0%A4%A')).toBe('');
  });

  it('offers the issue forms and the issue list at the bottom', () => {
    const { root } = mount();
    const support = root.querySelector('.support');
    const hrefs = [...(support?.querySelectorAll('a') ?? [])].map((a) => a.href);
    expect(hrefs[0]).toContain('template=1-bug.yml');
    expect(hrefs[1]).toContain('template=3-feature.yml');
    expect(hrefs[2]).toBe('https://github.com/vi-wolhwa/cote-in-baekjoon/issues');
  });
});
