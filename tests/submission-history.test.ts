import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { StatusRow } from '@/boj/status';
import { handleJudgeReport, handleSubmitRequest } from '@/boj/submission-service';
import { isBackupKey, isValidEntry, planRestore, summarizeBackup } from '@/shared/backup';
import { isSubmitRequestMessage, type SubmitRequestMessage } from '@/shared/submission';
import {
  HISTORY_LIMIT,
  LINK_WINDOW_MS,
  addEntry,
  attachResult,
  historyKey,
  isHistoryEntry,
  isHistoryList,
  mergeHistory,
  readHistory,
  watchHistory,
  type HistoryEntry,
  type HistoryResult,
} from '@/shared/submission-history';

const NOW = 1_800_000_000_000;

const entry = (submittedAt: number, patch: Partial<HistoryEntry> = {}): HistoryEntry => ({
  problemId: 1000,
  language: 'python3',
  code: `print(${submittedAt})`,
  submittedAt,
  ...patch,
});

const ac: HistoryResult = {
  solutionId: 5004,
  status: 'done',
  resultCode: 'ac',
  resultText: '맞았습니다!!',
  memoryKb: 9000,
  timeMs: 44,
};

describe('history model', () => {
  it('checks entries as untrusted values', () => {
    expect(isHistoryEntry(entry(NOW))).toBe(true);
    expect(isHistoryEntry(entry(NOW, { result: ac, fnCode: 'def solution(): pass' }))).toBe(true);
    expect(isHistoryEntry({ ...entry(NOW), language: 'brainfuck' })).toBe(false);
    expect(isHistoryEntry({ ...entry(NOW), code: 1 })).toBe(false);
    expect(isHistoryEntry({ ...entry(NOW), code: 'x'.repeat(600_000) })).toBe(false);
    expect(isHistoryEntry({ ...entry(NOW), submittedAt: -1 })).toBe(false);
    expect(isHistoryEntry({ ...entry(NOW), result: { ...ac, resultCode: 'nope' } })).toBe(false);
    expect(isHistoryEntry({ ...entry(NOW), result: { ...ac, memoryKb: -5 } })).toBe(false);
    expect(isHistoryList([entry(NOW)], 1000)).toBe(true);
    expect(isHistoryList([entry(NOW)], 2000)).toBe(false);
    expect(isHistoryList({}, 1000)).toBe(false);
  });

  it('adds newest first and keeps only the last 50', () => {
    let list: HistoryEntry[] = [];
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) list = addEntry(list, entry(NOW + i));
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0]?.submittedAt).toBe(NOW + HISTORY_LIMIT + 5);
    expect(list.at(-1)?.submittedAt).toBe(NOW + 6);
    // The same submission time replaces, never duplicates.
    expect(
      addEntry(list, entry(NOW + 10, { code: 'new' })).filter((e) => e.code === 'new'),
    ).toHaveLength(1);
  });

  it('reads stored values, dropping broken entries and other problems', () => {
    const stored = [entry(NOW), { broken: true }, entry(NOW + 5), entry(NOW + 1, { problemId: 2 })];
    expect(readHistory(stored, 1000).map((e) => e.submittedAt)).toEqual([NOW + 5, NOW]);
    expect(readHistory('nope', 1000)).toEqual([]);
  });

  it('links a result to the submission that started the watch', () => {
    const list = [entry(NOW + 100), entry(NOW)];
    const linked = attachResult(list, NOW + 100, ac);
    expect(linked?.[0]?.result).toEqual(ac);
    expect(linked?.[1]?.result).toBeUndefined();
    // '결과 다시 확인' restarts the watch from the IDE's clock, a moment earlier.
    expect(attachResult(list, NOW + 150, ac)?.[0]?.result).toEqual(ac);
    // Nothing recorded since the watch started: nothing to link.
    expect(attachResult(list, NOW + 100 + LINK_WINDOW_MS + 1, ac)).toBeUndefined();
    expect(attachResult([], NOW, ac)).toBeUndefined();
  });

  it('keeps the newest report and skips repeats', () => {
    const judging: HistoryResult = {
      solutionId: 5004,
      status: 'judging',
      resultCode: 'judging',
      resultText: '채점 중 (35%)',
    };
    const list = attachResult([entry(NOW)], NOW, judging) ?? [];
    expect(list[0]?.result?.status).toBe('judging');
    const done = attachResult(list, NOW, ac) ?? [];
    expect(done[0]?.result).toEqual(ac);
    expect(attachResult(done, NOW, ac)).toBeUndefined();
    expect(attachResult(done, NOW, { ...judging, solutionId: 4000 })).toBeUndefined();
  });

  it('merges two lists by submission time', () => {
    const merged = mergeHistory(
      [entry(NOW + 2), entry(NOW, { result: ac })],
      [entry(NOW + 1), entry(NOW)],
    );
    expect(merged.map((e) => e.submittedAt)).toEqual([NOW + 2, NOW + 1, NOW]);
    // The first list wins for the same submission.
    expect(merged[2]?.result).toEqual(ac);
  });
});

describe('recording in the background', () => {
  const ideSender = {
    id: 'test-extension-id',
    url: 'chrome-extension://test-extension-id/ide.html',
    tab: { id: 7, index: 2, windowId: 1 },
  } as Browser.runtime.MessageSender;
  const statusSender = {
    id: 'test-extension-id',
    url: 'https://www.acmicpc.net/status?from_mine=1&problem_id=1000&user_id=tester',
    tab: { id: 9, index: 4 },
  } as Browser.runtime.MessageSender;
  const message: SubmitRequestMessage = {
    type: 'cib:submit-request',
    problemId: 1000,
    language: 'python3',
    code: 'import sys\nprint(solution())',
    fnCode: 'def solution():\n    return 1',
    autoSubmit: true,
  };
  const row = (patch: Partial<StatusRow> = {}): StatusRow => ({
    solutionId: 5004,
    username: 'tester',
    problemId: 1000,
    resultCode: 'ac',
    resultText: '맞았습니다!!',
    memoryKb: 9000,
    timeMs: 44,
    submittedAt: NOW + 30_000,
    ...patch,
  });
  const stored = async () =>
    (await fakeBrowser.storage.local.get(historyKey(1000)))[historyKey(1000)] as HistoryEntry[];

  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({ id: 77, windowId: 1 } as never);
  });

  it('accepts the solution function next to the program, within the code limit', () => {
    expect(isSubmitRequestMessage(message)).toBe(true);
    expect(isSubmitRequestMessage({ ...message, fnCode: 5 })).toBe(false);
    expect(isSubmitRequestMessage({ ...message, fnCode: 'x'.repeat(600_000) })).toBe(false);
  });

  it('records the code when 제출하기 is pressed and links the judge result', async () => {
    expect(await handleSubmitRequest(message, ideSender, NOW)).toEqual({ ok: true });
    expect(await stored()).toEqual([
      {
        problemId: 1000,
        language: 'python3',
        code: message.code,
        fnCode: message.fnCode,
        submittedAt: NOW,
      },
    ]);

    await handleJudgeReport({ type: 'cib:judge-report', row: row() }, statusSender, NOW + 40_000);
    expect((await stored())[0]?.result).toEqual({
      solutionId: 5004,
      status: 'done',
      resultCode: 'ac',
      resultText: '맞았습니다!!',
      memoryKb: 9000,
      timeMs: 44,
    });
  });

  it('keeps every submission, newest first, each with its own result', async () => {
    await handleSubmitRequest(message, ideSender, NOW);
    await handleJudgeReport(
      { type: 'cib:judge-report', row: row({ resultCode: 'wa', resultText: '틀렸습니다' }) },
      statusSender,
      NOW + 40_000,
    );
    await handleSubmitRequest({ ...message, code: 'print(2)' }, ideSender, NOW + 60_000);
    await handleJudgeReport(
      { type: 'cib:judge-report', row: row({ solutionId: 5010, submittedAt: NOW + 90_000 }) },
      statusSender,
      NOW + 100_000,
    );
    const list = await stored();
    expect(list.map((e) => [e.code, e.result?.resultCode, e.result?.solutionId])).toEqual([
      ['print(2)', 'ac', 5010],
      [message.code, 'wa', 5004],
    ]);
  });

  it('does not record a submit whose page could not open', async () => {
    vi.spyOn(fakeBrowser.tabs, 'create').mockRejectedValue(new Error('no'));
    await handleSubmitRequest(message, ideSender, NOW);
    expect(await stored()).toBeUndefined();
  });

  it('tells extension pages about changes', async () => {
    const seen: number[][] = [];
    const stop = watchHistory(1000, (list) => seen.push(list.map((e) => e.submittedAt)));
    await handleSubmitRequest(message, ideSender, NOW);
    await vi.waitFor(() => expect(seen.at(-1)).toEqual([NOW]));
    stop();
  });
});

describe('backup of the history', () => {
  it('backs up valid lists and counts their submissions', () => {
    const list = [entry(NOW + 1), entry(NOW, { result: ac })];
    expect(isBackupKey('history:1000')).toBe(true);
    expect(isValidEntry('history:1000', list)).toBe(true);
    expect(isValidEntry('history:2000', list)).toBe(false);
    expect(isValidEntry('history:1000', [{ code: 'x' }])).toBe(false);
    expect(summarizeBackup({ 'history:1000': list })).toMatchObject({
      problems: 1,
      submissions: 2,
    });
  });

  it('merges lists on a merging restore instead of keeping only one side', () => {
    const current = { 'history:1000': [entry(NOW + 2)] };
    const items = { 'history:1000': [entry(NOW + 1)], 'history:2000': [] };
    const plan = planRestore(current, items, 'merge');
    expect((plan.set['history:1000'] as HistoryEntry[]).map((e) => e.submittedAt)).toEqual([
      NOW + 2,
      NOW + 1,
    ]);
    expect(plan.set['history:2000']).toEqual([]);
  });
});
