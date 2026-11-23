// @vitest-environment happy-dom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BELOW_INCLUDED_MESSAGE,
  FULL_MESSAGE,
  includeProblem,
  isIncludeFull,
  minCount,
  parseIncludeInput,
} from '@/exam/includes';
import { DEFAULT_DRAFT, type ExamDraft } from '@/exam/model';
import { SetupForm, type SetupFormProps } from '@/exam/SetupForm';

describe('포함할 문제 rules', () => {
  it('reads a problem number', () => {
    expect(parseIncludeInput(' 1000 ', [], 4)).toEqual({ ok: true, id: 1000 });
    expect(parseIncludeInput('9999999', [], 4)).toEqual({ ok: true, id: 9_999_999 });
    for (const bad of ['0', '10000000', '-1', '1.5', '1e3', 'abc', '١٢']) {
      expect(parseIncludeInput(bad, [], 4)).toEqual({
        ok: false,
        reason: '1부터 9999999까지의 숫자로 입력해 주세요.',
      });
    }
    expect(parseIncludeInput('  ', [], 4)).toEqual({
      ok: false,
      reason: '문제 번호를 입력해 주세요.',
    });
  });

  it('refuses duplicates and anything over the count', () => {
    expect(parseIncludeInput('1000', [1000], 4)).toEqual({
      ok: false,
      reason: '1000번은 이미 넣었어요.',
    });
    expect(parseIncludeInput('1001', [1000, 1002], 2)).toEqual({
      ok: false,
      reason: `${FULL_MESSAGE}.`,
    });
    expect(isIncludeFull([1000, 1002], 2)).toBe(true);
    expect(isIncludeFull([1000], 2)).toBe(false);
  });

  it('keeps 문제 수 at least the number of included problems', () => {
    expect(minCount([])).toBe(1);
    expect(minCount([1000])).toBe(1);
    expect(minCount([1000, 1001, 1002])).toBe(3);
  });

  it('checks again before starting', () => {
    expect(includeProblem([], 4)).toBeUndefined();
    expect(includeProblem([1, 2, 3, 4], 4)).toBeUndefined();
    expect(includeProblem([1, 2, 3], 2)).toBe(
      '포함할 문제(3개)가 문제 수(2개)보다 많아요. 문제를 빼거나 문제 수를 늘려 주세요.',
    );
    expect(includeProblem([1, 1], 4)).toBe('같은 문제를 두 번 넣었어요.');
    expect(includeProblem([0], 4)).toBe('포함할 문제 번호가 올바르지 않아요.');
    expect(includeProblem([], 9)).toBe('문제 수는 1개부터 8개까지예요.');
  });
});

describe('SetupForm: 포함할 문제', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function mount(props: Partial<SetupFormProps> = {}) {
    const root = document.createElement('div');
    document.body.append(root);
    const all: SetupFormProps = {
      initial: DEFAULT_DRAFT,
      onDraft: vi.fn(),
      onStarted: vi.fn(),
      start: vi.fn(async () => ({ ok: false as const, reason: '실패' })),
      ...props,
    };
    act(() => render(h(SetupForm, all), root));
    return { root, props: all };
  }
  const q = <T extends Element>(root: HTMLElement, selector: string) =>
    root.querySelector<T>(selector);
  const chips = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-testid="included"]')].map((c) => c.textContent);
  const count = (root: HTMLElement) => q(root, '[data-testid="count"]')?.textContent;
  const minus = (root: HTMLElement) =>
    q<HTMLButtonElement>(root, 'button[aria-label="문제 수 줄이기"]');

  function type(root: HTMLElement, text: string) {
    const input = q<HTMLInputElement>(root, 'input[aria-label="포함할 문제 번호"]');
    act(() => {
      if (!input) return;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      input?.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('starts empty from the popup and adds, refuses and removes numbers', () => {
    const { root, props } = mount();
    expect(chips(root)).toEqual([]);
    type(root, '1000');
    type(root, '2557');
    expect(chips(root)).toEqual(['1000번 ×', '2557번 ×']);
    type(root, '1000');
    expect(q(root, '[role="alert"]')?.textContent).toBe('1000번은 이미 넣었어요.');
    type(root, 'x');
    expect(q(root, '[role="alert"]')?.textContent).toBe(
      '1부터 9999999까지의 숫자로 입력해 주세요.',
    );
    act(() => q<HTMLButtonElement>(root, 'button[aria-label="1000번 빼기"]')?.click());
    expect(chips(root)).toEqual(['2557번 ×']);
    // The list is not part of the saved draft.
    for (const call of (props.onDraft as ReturnType<typeof vi.fn>).mock.calls) {
      expect(Object.keys(call[0] as ExamDraft)).not.toContain('included');
    }
  });

  it('stops adding at 문제 수 and keeps the count above the list', () => {
    const { root } = mount({ initial: { ...DEFAULT_DRAFT, count: 2 } });
    type(root, '1000');
    expect(minus(root)?.disabled).toBe(false);
    type(root, '1001');
    const input = q<HTMLInputElement>(root, 'input[aria-label="포함할 문제 번호"]');
    expect(input?.disabled).toBe(true);
    expect(q(root, '#xf-include-help')?.textContent).toBe(FULL_MESSAGE);
    expect(minus(root)?.disabled).toBe(true);
    expect(minus(root)?.title).toBe(BELOW_INCLUDED_MESSAGE);
    act(() => q<HTMLButtonElement>(root, 'button[aria-label="문제 수 늘리기"]')?.click());
    expect(count(root)).toBe('3');
    expect(input?.disabled).toBe(false);
    expect(minus(root)?.disabled).toBe(false);
  });

  it('starts with the Baekjoon menu problem, which can be removed', async () => {
    const start = vi.fn(async () => ({ ok: false as const, reason: '실패' }));
    const { root } = mount({ initialIncluded: [1000], start });
    expect(chips(root)).toEqual(['1000번 ×']);
    act(() => q<HTMLButtonElement>(root, 'button[aria-label="1000번 빼기"]')?.click());
    const startButton = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === '시험 시작',
    );
    act(() => startButton?.click());
    expect(start).toHaveBeenCalledWith({ draft: { ...DEFAULT_DRAFT, excludeSolved: false } });
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('raises 문제 수 to fit the problems it starts with', () => {
    const { root } = mount({
      initial: { ...DEFAULT_DRAFT, count: 1 },
      initialIncluded: [1000, 1001],
    });
    expect(count(root)).toBe('2');
  });
});
