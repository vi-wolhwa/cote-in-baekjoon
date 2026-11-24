// @vitest-environment happy-dom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemRail, railLabel } from '@/exam/ExamChrome';
import { saveAnswer } from '@/exam/batch';
import {
  createExam,
  DEFAULT_DRAFT,
  recordSubmission,
  setProblemBody,
  toggleFlag,
  type Exam,
} from '@/exam/model';

const NOW = 1_800_000_000_000;

function exam(): Exam {
  let e = createExam({
    id: 'abcdefgh12',
    now: NOW,
    draft: DEFAULT_DRAFT,
    problems: [
      { id: 2001, title: '가', level: 7 },
      { id: 2002, title: '<b>나</b>', level: 9 },
      { id: 2003, title: '다', level: 12 },
    ],
  });
  for (const p of e.problems) e = setProblemBody(e, body(p.id));
  e = saveAnswer(e, 2001, 'print(1)', 'python3', NOW + 1000);
  e = toggleFlag(e, 2003);
  return toggleFlag(saveAnswer(e, 2003, 'int main(){}', 'cpp17', NOW + 2000), 2002);
}

function body(id: number) {
  return {
    id,
    title: '합',
    timeLimitText: '1 초',
    memoryLimitText: '256 MB',
    sections: { description: '<p>x</p>', input: '', output: '' },
    samples: [],
    labels: [],
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(current = 1) {
  const root = document.createElement('div');
  document.body.append(root);
  const onSelect = vi.fn();
  act(() => render(h(ProblemRail, { exam: exam(), current, onSelect }), root));
  const items = [...root.querySelectorAll<HTMLButtonElement>('[data-testid="rail-item"]')];
  return { root, items, onSelect };
}

describe('problem rail', () => {
  it('names each problem with its state', () => {
    expect(railLabel(exam(), 0)).toBe('1번 문제 · 가 · 답안 저장함');
    expect(railLabel(exam(), 1)).toBe('2번 문제 · <b>나</b> · 다시 볼 문제');
    expect(railLabel(exam(), 2)).toBe('3번 문제 · 다 · 답안 저장함 · 다시 볼 문제');
    expect(railLabel(exam(), 5)).toBe('');
  });

  it('dims problems not read yet and spins on the one being read', () => {
    const unread = createExam({
      id: 'abcdefgh12',
      now: NOW,
      draft: DEFAULT_DRAFT,
      problems: [
        { id: 2001, title: '가', level: 7 },
        { id: 2002, title: '나', level: 9 },
      ],
    });
    expect(railLabel(unread, 0, 2001)).toBe('1번 문제 · 가 · 불러오는 중');
    expect(railLabel(unread, 1, 2001)).toBe('2번 문제 · 나 · 불러오기 전');
    // A submission made during the exam by an older version still shows the check.
    expect(railLabel(recordSubmission(unread, 2002, 'python3', NOW), 1)).toBe(
      '2번 문제 · 나 · 불러오기 전 · 답안 저장함',
    );
    const root = document.createElement('div');
    document.body.append(root);
    act(() =>
      render(h(ProblemRail, { exam: unread, current: 1, onSelect: vi.fn(), loading: 2001 }), root),
    );
    const items = [...root.querySelectorAll('[data-testid="rail-item"]')];
    expect(items.map((b) => b.className)).toEqual([
      'rail-item is-loading',
      'rail-item is-current is-unread',
    ]);
    expect(items[0]?.querySelector('[data-testid="rail-loading"]')).not.toBeNull();
    expect(items[1]?.querySelector('[data-testid="rail-loading"]')).toBeNull();
  });

  it('shows 1..N, the current one, and a badge per state', () => {
    const { items } = mount(1);
    expect(items.map((b) => b.textContent)).toEqual(['1', '2', '3']);
    expect(items.map((b) => b.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(items[1]?.classList.contains('is-current')).toBe(true);
    // Only the current button is in the tab order; arrows move between them.
    expect(items.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    const badges = (b: HTMLButtonElement | undefined, id: string) =>
      b?.querySelectorAll(`[data-testid="${id}"]`).length;
    expect(items.map((b) => badges(b, 'rail-submitted'))).toEqual([1, 0, 1]);
    expect(items.map((b) => badges(b, 'rail-flagged'))).toEqual([0, 1, 1]);
    // The title is page text: it is never parsed as HTML.
    expect(items[1]?.getAttribute('aria-label')).toBe('2번 문제 · <b>나</b> · 다시 볼 문제');
    expect(items[1]?.querySelector('b')).toBeNull();
  });

  it('selects on click and moves with the arrow keys within the list', () => {
    const { items, onSelect } = mount(1);
    act(() => items[2]?.click());
    expect(onSelect).toHaveBeenLastCalledWith(2);
    const key = (k: string) =>
      act(() => {
        items[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      });
    key('ArrowDown');
    expect(onSelect).toHaveBeenLastCalledWith(2);
    key('ArrowUp');
    expect(onSelect).toHaveBeenLastCalledWith(0);
    onSelect.mockClear();
    key('Enter');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('stops at both ends', () => {
    const { items, onSelect } = mount(0);
    act(() => {
      items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
