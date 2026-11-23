// @vitest-environment happy-dom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_DRAFT, DRAFT_KEY, isExam, type ExamDraft } from '@/exam/model';
import { SetupForm, type SetupFormProps } from '@/exam/SetupForm';
import { PERMISSION_DENIED, startExam } from '@/exam/start';
import { loadDraft, loadHandle, readExams, updateExam } from '@/exam/storage';
import { HANDLE_KEY } from '@/shared/handle';

const NOW = 1_800_000_000_000;

/** Synthetic solved.ac items. */
const item = (id: number, level = 8) => ({ problemId: id, titleKo: `문제 ${id}`, level });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function solvedAc(found: number[]) {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/problem/show')) {
      return json(item(Number(u.searchParams.get('problemId')), 3));
    }
    return json({ count: found.length, items: found.map((id) => item(id)) });
  });
}

let request: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeBrowser.reset();
  request = vi.fn(async () => true);
  (fakeBrowser.permissions as unknown as { request: typeof request }).request = request;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('startExam', () => {
  it('asks for the solved.ac permission first and stops when refused', async () => {
    request.mockResolvedValue(false);
    const fetcher = solvedAc([1, 2, 3, 4]);
    const result = await startExam({ draft: DEFAULT_DRAFT, fetcher });
    expect(result).toEqual({ ok: false, reason: PERMISSION_DENIED });
    expect(request).toHaveBeenCalledWith({ origins: ['https://solved.ac/*'] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('treats a failing permission prompt as refused', async () => {
    request.mockRejectedValue(new Error('no gesture'));
    const result = await startExam({ draft: DEFAULT_DRAFT, fetcher: solvedAc([]) });
    expect(result).toEqual({ ok: false, reason: PERMISSION_DENIED });
  });

  it('picks problems, stores the exam and leaves out solved ones only when on', async () => {
    const fetcher = solvedAc([11, 12, 13, 14, 15]);
    const result = await startExam({
      draft: { ...DEFAULT_DRAFT, count: 3, minutes: 90 },
      handle: 'tester',
      now: () => NOW,
      fetcher,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.exam.problems.map((p) => p.id)).toEqual([11, 12, 13]);
    expect(result.exam.excludedSolvedBy).toBe('tester');
    const query = new URL(fetcher.mock.calls[0]?.[0] as string).searchParams.get('query');
    expect(query).toBe('*s5..g1 !s@tester lang:ko');
    const stored = readExams(await fakeBrowser.storage.local.get(null));
    expect(stored).toEqual([result.exam]);
    expect(isExam(stored[0])).toBe(true);

    const off = solvedAc([11, 12, 13, 14]);
    await startExam({
      draft: { ...DEFAULT_DRAFT, excludeSolved: false },
      handle: 'tester',
      fetcher: off,
    });
    expect(new URL(off.mock.calls[0]?.[0] as string).searchParams.get('query')).toBe(
      '*s5..g1 lang:ko',
    );
  });

  it('includes the problem from the Baekjoon menu', async () => {
    const fetcher = solvedAc([1000, 21, 22, 23]);
    const result = await startExam({ draft: DEFAULT_DRAFT, include: 1000, fetcher });
    if (!result.ok) throw new Error(result.reason);
    expect(result.exam.include).toBe(1000);
    expect(result.exam.problems.map((p) => p.id)).toEqual([1000, 21, 22, 23]);
  });

  it('says how many problems there are when too few match', async () => {
    expect(await startExam({ draft: DEFAULT_DRAFT, fetcher: solvedAc([1, 2]) })).toEqual({
      ok: false,
      reason: '조건에 맞는 문제가 2개뿐이에요. 조건을 넓혀 주세요.',
    });
    expect(
      await startExam({ draft: DEFAULT_DRAFT, include: 1000, fetcher: solvedAc([1000, 5]) }),
    ).toEqual({ ok: false, reason: '조건에 맞는 문제가 2개뿐이에요. 조건을 넓혀 주세요.' });
  });

  it('explains network failures', async () => {
    const result = await startExam({
      draft: DEFAULT_DRAFT,
      fetcher: () => Promise.reject(new TypeError('offline')),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('연결하지 못했어요'),
    });
    expect(readExams(await fakeBrowser.storage.local.get(null))).toEqual([]);
  });
});

describe('exam storage', () => {
  it('reads only valid drafts, handles and exams', async () => {
    await fakeBrowser.storage.local.set({
      [DRAFT_KEY]: { ...DEFAULT_DRAFT, count: 99 },
      [HANDLE_KEY]: 'Not Valid',
      'exam:abcdefgh12': { id: 'abcdefgh12' },
    });
    expect(await loadDraft()).toEqual(DEFAULT_DRAFT);
    expect(await loadHandle()).toBeUndefined();
    expect(readExams(await fakeBrowser.storage.local.get(null))).toEqual([]);
    await fakeBrowser.storage.local.set({ [HANDLE_KEY]: 'tester' });
    expect(await loadHandle()).toBe('tester');
  });

  it('applies updates one after another', async () => {
    const result = await startExam({ draft: DEFAULT_DRAFT, fetcher: solvedAc([1, 2, 3, 4]) });
    if (!result.ok) throw new Error(result.reason);
    const id = result.exam.id;
    await Promise.all([
      updateExam(id, (e) => ({ ...e, flagged: [...e.flagged, 1] })),
      updateExam(id, (e) => ({ ...e, flagged: [...e.flagged, 2] })),
    ]);
    const [stored] = readExams(await fakeBrowser.storage.local.get(null));
    expect(stored?.flagged).toEqual([1, 2]);
  });
});

describe('SetupForm', () => {
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
  const button = (root: HTMLElement, text: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

  it('keeps tiers a range, toggles tags and saves the draft', () => {
    const { root, props } = mount({ handle: 'tester' });
    act(() => button(root, '플래티넘')?.click());
    act(() => button(root, 'DP')?.click());
    const last = (props.onDraft as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as ExamDraft;
    expect(last.tiers).toEqual(['silver', 'gold', 'platinum']);
    expect(last.tags).toEqual(['dp']);
    expect(button(root, '트리')).toBeUndefined();
    act(() => button(root, '+ 더보기')?.click());
    expect(button(root, '트리')).toBeDefined();
  });

  it('calls start synchronously from the click and shows errors', async () => {
    const start = vi.fn(async () => ({
      ok: false as const,
      reason: '조건에 맞는 문제가 1개뿐이에요.',
    }));
    const { root } = mount({ start, include: 1000 });
    act(() => button(root, '시험 시작')?.click());
    // Called during the click itself: permissions.request() needs the user's gesture.
    expect(start).toHaveBeenCalledWith({
      draft: { ...DEFAULT_DRAFT, excludeSolved: false },
      include: 1000,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      '조건에 맞는 문제가 1개뿐이에요.',
    );
  });

  it('turns off and explains 이미 푼 문제 빼기 without a Baekjoon id', () => {
    const { root } = mount();
    const toggle = root.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(toggle?.disabled).toBe(true);
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(root.textContent).toContain('백준 아이디를 몰라서');
  });
});
