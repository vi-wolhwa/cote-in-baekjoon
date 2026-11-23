import { describe, expect, it, vi } from 'vitest';
import type { StatusRow } from '@/boj/status';
import { POLL_GRACE_MS } from '@/boj/status-ajax';
import { StatusPoller } from '@/boj/status-poller';

const waiting: StatusRow = {
  solutionId: 7,
  username: 'tester',
  problemId: 1000,
  resultCode: 'wait',
  resultText: '기다리는 중',
  submittedAt: 1,
};

/** A poller on a fake clock; timers are collected and fired by hand. */
function setup(answers: unknown[]) {
  let clock = 0;
  const timers: { fn: () => void; at: number }[] = [];
  const reported: StatusRow[] = [];
  let rows = [waiting];
  const fetchStatus = vi.fn(async () => answers.shift());
  const poller = new StatusPoller({
    readRows: () => rows,
    fetchStatus,
    report: (r) => reported.push(r),
    now: () => clock,
    setTimer: (fn, ms) => timers.push({ fn, at: clock + ms }),
    clearTimer: () => {},
  });
  const advance = async (ms: number) => {
    clock += ms;
    for (const t of timers.splice(0).filter((t) => t.at <= clock)) {
      t.fn();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
  };
  return {
    poller,
    reported,
    fetchStatus,
    advance,
    setRows: (r: StatusRow[]) => (rows = r),
    tick: () => poller.tick(),
    setClock: (ms: number) => (clock = ms),
  };
}

describe('StatusPoller', () => {
  it('polls even while unrelated parts of the page keep changing', async () => {
    const t = setup([{ result: 4, memory: 9000, time: 44 }]);
    t.poller.start();
    // The relative time cell ticks: DOM changes, but the watched result does not.
    for (let i = 1; i <= 5; i++) {
      t.setClock(i * 1000);
      t.poller.scan();
    }
    await t.tick();
    expect(t.fetchStatus).toHaveBeenCalledWith(7);
    expect(t.reported.at(-1)).toMatchObject({ resultCode: 'ac', memoryKb: 9000 });
    expect(t.poller.isStopped).toBe(true);
  });

  it('waits while the page itself is changing the result', async () => {
    const t = setup([{ result: 4 }]);
    t.poller.start();
    t.setClock(POLL_GRACE_MS - 500);
    t.setRows([{ ...waiting, resultCode: 'judging', resultText: '채점 중 (10%)' }]);
    t.poller.scan();
    t.setClock(POLL_GRACE_MS);
    await t.tick();
    expect(t.fetchStatus).not.toHaveBeenCalled();
  });

  it('keeps asking until the result is final', async () => {
    const t = setup([{ result: 3, progress: 50 }, { result: 6 }]);
    t.poller.start();
    t.setClock(POLL_GRACE_MS);
    await t.tick();
    expect(t.reported.at(-1)?.resultText).toBe('채점 중 (50%)');
    expect(t.poller.isStopped).toBe(false);
    t.setClock(POLL_GRACE_MS * 3);
    await t.tick();
    expect(t.reported.at(-1)?.resultText).toBe('틀렸습니다');
    expect(t.poller.isStopped).toBe(true);
  });

  it('does not let a stale page overwrite a final polled result', async () => {
    const t = setup([{ result: 4 }]);
    t.poller.start();
    t.setClock(POLL_GRACE_MS);
    await t.tick();
    const count = t.reported.length;
    t.poller.scan(); // The page still shows 기다리는 중.
    expect(t.reported.length).toBe(count);
  });

  it('stops immediately when the page already shows a final result', () => {
    const t = setup([]);
    t.setRows([{ ...waiting, resultCode: 'ac', resultText: '맞았습니다!!' }]);
    t.poller.start();
    expect(t.poller.isStopped).toBe(true);
    expect(t.fetchStatus).not.toHaveBeenCalled();
  });

  it('survives a failed request', async () => {
    const t = setup([]);
    t.fetchStatus.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ result: 4 });
    t.poller.start();
    t.setClock(POLL_GRACE_MS);
    await t.tick();
    expect(t.poller.isStopped).toBe(false);
    t.setClock(POLL_GRACE_MS * 3);
    await t.tick();
    expect(t.reported.at(-1)?.resultCode).toBe('ac');
  });
});
