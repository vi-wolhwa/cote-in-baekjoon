/**
 * The result page submits the saved answers after the exam (batch.ts, ADR-0005): one at a
 * time through the usual submit window (requestSubmit with autoSubmit), waiting until the
 * status page reports each one, or it fails, before the next. The queue lives in the exam
 * record, so this picks up where it left off after a reload.
 */
import { useEffect, useRef } from 'preact/hooks';
import {
  isJudgeResult,
  isSubmitWindow,
  judgeKey,
  requestSubmit,
  submitWindowKey,
} from '@/shared/submission';
import {
  activeEntry,
  claimEntry,
  markFailed,
  markManual,
  markSubmitted,
  nextPending,
  resumeEntry,
} from './batch';
import { isOver, type Exam } from './model';
import { loadExam, loadJudges, updateExam } from './storage';

/** No report this long after the window opened: it probably waits for the user. */
export const MANUAL_AFTER_MS = 20_000;
/** Give up waiting for a report after this long. */
export const GIVE_UP_MS = 10 * 60_000;
/** After a report, wait this long at most for the window to close before the next one. */
export const WINDOW_CLOSE_WAIT_MS = 90_000;
/** Another page may have just claimed an entry and not opened its window yet. */
const CLAIM_GRACE_MS = 15_000;

export const CLOSED_REASON = '제출 창이 닫혀 제출하지 못했어요.';
export const GAVE_UP_REASON =
  '10분 안에 제출 결과를 받지 못했어요. 백준 채점 현황을 확인하고 필요하면 다시 제출해 주세요.';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function windowState(problemId: number) {
  const key = submitWindowKey(problemId);
  const value = (await browser.storage.session.get(key))[key];
  return isSubmitWindow(value) ? value : undefined;
}

/** Brings the submit window of a problem to the front ('제출 창 보기'). */
export async function focusSubmitWindow(problemId: number): Promise<boolean> {
  const record = await windowState(problemId);
  if (!record || record.state !== 'open') return false;
  return browser.windows
    .update(record.windowId, { focused: true })
    .then(() => true)
    .catch(() => false);
}

type Report = { ok: true } | { ok: false; reason: string };

/** Waits for the status page to report the submission sent at `since`, or for its failure. */
function waitForReport(problemId: number, since: number, onManual: () => void): Promise<Report> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (report: Report) => {
      if (settled) return;
      settled = true;
      browser.storage.onChanged.removeListener(listener);
      clearTimeout(manual);
      clearTimeout(giveUp);
      resolve(report);
    };
    const check = (judge: unknown, window: unknown) => {
      if (isJudgeResult(judge) && judge.problemId === problemId && judge.updatedAt >= since) {
        finish({ ok: true });
      } else if (isSubmitWindow(window) && window.state === 'closed' && window.updatedAt >= since) {
        finish({ ok: false, reason: CLOSED_REASON });
      }
    };
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const judge = changes[judgeKey(problemId)];
      const window = changes[submitWindowKey(problemId)];
      if (area === 'local' && judge) check(judge.newValue, undefined);
      if (area === 'session' && window) check(undefined, window.newValue);
    };
    browser.storage.onChanged.addListener(listener);
    const manual = setTimeout(onManual, MANUAL_AFTER_MS);
    const giveUp = setTimeout(() => finish({ ok: false, reason: GAVE_UP_REASON }), GIVE_UP_MS);
    void Promise.all([browser.storage.local.get(judgeKey(problemId)), windowState(problemId)]).then(
      ([local, window]) => check(local[judgeKey(problemId)], window),
    );
  });
}

/** Waits until the submit window of a problem is no longer open (judging done), or `ms`. */
async function waitWindowClosed(problemId: number, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until && (await windowState(problemId))?.state === 'open') await sleep(500);
}

export function useBatchSubmit(exam: Exam | undefined) {
  const running = useRef(false);
  const live = useRef(true);
  const owner = useRef(
    `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`,
  );

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!exam?.submitQueue || !isOver(exam, Date.now()) || running.current) return;
    if (activeEntry(exam) === undefined && nextPending(exam) === undefined) return;
    running.current = true;
    void drive(exam.id, owner.current, () => live.current).finally(() => {
      running.current = false;
    });
  }, [exam]);
}

/** Submits the queue one entry at a time until nothing is pending. */
export async function drive(id: string, owner: string, alive: () => boolean): Promise<void> {
  while (alive()) {
    const exam = await loadExam(id);
    if (!exam?.submitQueue) return;
    const active = activeEntry(exam);
    if (active !== undefined) {
      await follow(exam, active, owner);
      continue;
    }
    const next = nextPending(exam);
    if (next === undefined) return;
    const claimed = await updateExam(id, (e) => claimEntry(e, next, owner, Date.now()));
    // Two result pages: the later write wins; only its owner goes on.
    await sleep(300);
    const mine = (await loadExam(id))?.submitQueue?.[next];
    const answer = claimed?.answers?.[next];
    if (mine?.owner !== owner || mine.state !== 'submitting' || !answer || !mine.startedAt) {
      continue;
    }
    const sent = await requestSubmit({
      problemId: next,
      language: answer.language,
      code: answer.code,
      autoSubmit: true,
    });
    if (!sent.ok) {
      await updateExam(id, (e) => markFailed(e, next, sent.reason, Date.now()));
      continue;
    }
    await settle(id, next, mine.startedAt);
  }
}

/** Waits for the active entry's report and records the outcome. */
async function settle(id: string, problemId: number, since: number) {
  const report = await waitForReport(problemId, since, () => {
    void updateExam(id, (e) => markManual(e, problemId, Date.now()));
  });
  if (report.ok) {
    await updateExam(id, (e) => markSubmitted(e, problemId, Date.now()));
    // One submit window at a time: let this one finish judging and close.
    await waitWindowClosed(problemId, WINDOW_CLOSE_WAIT_MS);
  } else {
    await updateExam(id, (e) => markFailed(e, problemId, report.reason, Date.now()));
  }
}

/**
 * An entry already submitting: ours (wait for it), or left by a reload or another page
 * (resume: reported → submitted, window open → wait, otherwise failed, never sent again).
 */
async function follow(exam: Exam, problemId: number, owner: string) {
  const entry = exam.submitQueue?.[problemId];
  const since = entry?.startedAt ?? entry?.updatedAt ?? Date.now();
  if (entry?.owner !== owner) {
    const judge = (await loadJudges([problemId])).get(problemId);
    const window = await windowState(problemId);
    const open = window?.state === 'open';
    if (!open && !judge && Date.now() - since < CLAIM_GRACE_MS) {
      await sleep(1000);
      return;
    }
    const resumed = await updateExam(exam.id, (e) =>
      resumeEntry(e, problemId, judge, open, Date.now()),
    );
    const state = resumed?.submitQueue?.[problemId]?.state;
    if (state !== 'submitting' && state !== 'manual') {
      if (state === 'submitted') await waitWindowClosed(problemId, WINDOW_CLOSE_WAIT_MS);
      return;
    }
  }
  await settle(exam.id, problemId, since);
}
