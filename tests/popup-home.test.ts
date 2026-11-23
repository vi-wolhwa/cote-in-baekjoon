// @vitest-environment happy-dom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeTab, type HomeProps } from '@/popup/HomeTab';

const NOW = Date.UTC(2026, 10, 24, 3);

function mount(props: Partial<HomeProps> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const all: HomeProps = {
    stats: { submitted: 0, accepted: 0, lastWeek: 0 },
    recent: [],
    now: NOW,
    onOpenIde: vi.fn(),
    onOpenProblem: vi.fn(),
    ...props,
  };
  act(() => render(h(HomeTab, all), root));
  return { root, props: all };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('HomeTab', () => {
  it('shows the problem in the active tab and opens the IDE', () => {
    const { root, props } = mount({ active: { id: 1000, title: '<img src=x onerror=alert(1)>' } });
    expect(root.querySelector('.hero-id')?.textContent).toBe('1000번');
    // The page title is shown as text, never parsed as HTML.
    expect(root.querySelector('.hero-title')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('form')).toBeNull();
    const button = root.querySelector<HTMLButtonElement>('.hero-button');
    expect(button?.textContent).toBe('코테 화면으로 풀기 →');
    act(() => button?.click());
    expect(props.onOpenIde).toHaveBeenCalledOnce();
  });

  it('shows the search card on other pages and validates the number', () => {
    const { root, props } = mount();
    expect(root.querySelector('.hero')).toBeNull();
    const input = root.querySelector<HTMLInputElement>('#problem-number');
    const form = root.querySelector('form');
    if (!input || !form) throw new Error('no search card');

    act(() => {
      input.value = '12a';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      '1부터 9999999까지의 숫자로 입력해 주세요.',
    );
    expect(props.onOpenProblem).not.toHaveBeenCalled();

    act(() => {
      input.value = '2557';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(props.onOpenProblem).toHaveBeenCalledWith(2557);
  });

  it('lists recent problems with status, time and language', () => {
    const { root, props } = mount({
      stats: { submitted: 2, accepted: 1, lastWeek: 1 },
      recent: [
        {
          id: 1000,
          title: 'A+B',
          language: 'C++17',
          status: 'accepted',
          resultText: '맞았습니다!!',
          at: NOW - 3 * 60_000,
        },
        { id: 1001, status: 'wrong', resultText: '틀렸습니다', at: NOW - 2 * 86_400_000 },
      ],
    });
    const stats = [...root.querySelectorAll('[data-testid="stat"]')].map((s) => s.textContent);
    expect(stats).toEqual(['2제출한 문제', '1맞은 문제', '1최근 7일']);
    const rows = [...root.querySelectorAll<HTMLButtonElement>('[data-testid="recent"]')];
    expect(rows.map((r) => r.textContent)).toEqual(['1000 · A+B3분 전C++17', '1001번2일 전']);
    expect(rows[0]?.querySelector('.status-accepted')?.getAttribute('aria-label')).toBe(
      '맞았습니다!!',
    );
    act(() => rows[1]?.click());
    expect(props.onOpenProblem).toHaveBeenCalledWith(1001);
  });

  it('has a friendly empty state', () => {
    const { root } = mount();
    expect(root.querySelector('.empty')?.textContent).toContain('아직 푼 문제가 없어요');
  });
});
