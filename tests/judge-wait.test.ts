// @vitest-environment happy-dom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubmitPanel, type SubmitInfo } from '@/ide/submit';
import { isLongWait, LONG_WAIT_MS, LONG_WAIT_NOTE, waitingSince } from '@/shared/judge-wait';
import type { JudgeResult } from '@/shared/submission';

const NOW = Date.UTC(2026, 10, 24, 3);

function judge(partial: Partial<JudgeResult> = {}): JudgeResult {
  return {
    problemId: 1000,
    solutionId: 5004,
    status: 'pending',
    resultText: '기다리는 중',
    resultCode: 'wait',
    updatedAt: NOW,
    ...partial,
  };
}

describe('waitingSince / isLongWait', () => {
  it('counts only a judge waiting in the queue', () => {
    expect(waitingSince(judge())).toBe(NOW);
    expect(waitingSince(judge({ resultCode: 'rejudge-wait' }))).toBe(NOW);
    expect(waitingSince(judge({ status: 'judging', resultCode: 'judging' }))).toBeUndefined();
    expect(waitingSince(judge({ status: 'done', resultCode: 'ac' }))).toBeUndefined();
    expect(waitingSince(undefined)).toBeUndefined();
  });

  it('is long from LONG_WAIT_MS on', () => {
    expect(LONG_WAIT_MS).toBe(10_000);
    expect(isLongWait(NOW, NOW + LONG_WAIT_MS - 1)).toBe(false);
    expect(isLongWait(NOW, NOW + LONG_WAIT_MS)).toBe(true);
    expect(isLongWait(undefined, NOW + 60_000)).toBe(false);
  });
});

describe('SubmitPanel long wait note', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function info(result: JudgeResult): SubmitInfo {
    return {
      since: NOW - 3000,
      opening: false,
      warnings: [],
      view: { kind: 'judging', judge: result },
    };
  }

  function mount(result: JudgeResult) {
    const root = document.createElement('div');
    document.body.append(root);
    const show = (r: JudgeResult) =>
      act(() =>
        render(h(SubmitPanel, { info: info(r), onFocus: vi.fn(), onRecheck: vi.fn() }), root),
      );
    show(result);
    return { root, show };
  }

  const note = (root: Element) => root.querySelector('[data-testid="judge-wait-note"]');

  it('appears after 10 seconds of 기다리는 중 and goes once judging starts', () => {
    const { root, show } = mount(judge());
    expect(root.textContent).toContain('기다리는 중');
    expect(note(root)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(LONG_WAIT_MS - 1000);
    });
    expect(note(root)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(note(root)?.textContent).toBe(LONG_WAIT_NOTE);
    expect(LONG_WAIT_NOTE).toContain('백준 채점 서버');

    show(judge({ status: 'judging', resultCode: 'judging', resultText: '채점 중 (10%)' }));
    expect(note(root)).toBeNull();
  });

  it('shows at once when the wait began long ago (IDE opened again)', () => {
    const { root } = mount(judge({ updatedAt: NOW - 60_000 }));
    expect(note(root)?.textContent).toBe(LONG_WAIT_NOTE);
  });

  it('never shows while judging, however long', () => {
    const { root } = mount(
      judge({ status: 'judging', resultCode: 'judging', resultText: '채점 중 (35%)' }),
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(note(root)).toBeNull();
  });
});
