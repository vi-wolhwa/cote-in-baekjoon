/**
 * The result page submits the saved answers after the exam (batch.ts, ADR-0005): one at a
 * time through the usual submission (requestSubmit with autoSubmit), which runs in a
 * background tab (shared/submit-tab.ts), waiting until the status page reports each one, or
 * it fails, before the next. The queue lives in the exam record, so this picks up where it
 * left off after a reload.
 */
import { useEffect, useRef } from 'preact/hooks';
import { isActiveTab, isSubmitTab, submitTabKey, type SubmitTab } from '@/shared/submit-tab';
import { isJudgeResult, judgeKey, requestSubmit } from '@/shared/submission';
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

/** Give up waiting for a report after this long. */
export const GIVE_UP_MS = 10 * 60_000;
/** After a report, wait this long at most for the tab to finish before the next one. */
export const TAB_FINISH_WAIT_MS = 90_000;
/** Another page may have just claimed an entry and not opened its tab yet. */
const CLAIM_GRACE_MS = 15_000;

export const CLOSED_REASON = '제출 탭이 제출 전에 닫혀 제출하지 못했어요.';
export const GAVE_UP_REASON =
  '10분 안에 제출 결과를 받지 못했어요. 백준 채점 현황을 확인하고 필요하면 다시 제출해 주세요.';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The problem's submission tab, if it belongs to the submission asked for at `since`. */
async function tabState(problemId: number, since?: number): Promise<SubmitTab | undefined> {
  const key = submitTabKey(problemId);
  const value = (await browser.storage.session.get(key))[key];
  if (!isSubmitTab(value) || value.problemId !== problemId) return undefined;
  return since === undefined || value.since >= since - 5_000 ? value : undefined;
}

/** ok: Baekjoon has it (reported, or sent before its tab closed); otherwise why not. */
type Report = { ok: true } | { ok: false; reason: string };

/** Waits for the status page to report the submission asked for at `since`, or its failure. */
function waitForReport(problemId: number, since: number, onManual: () => void): Promise<Report> {
  return new Promise((resolve) => {
    let settled = false;
    let manual = false;
    const finish = (report: Report) => {
      if (settled) return;
      settled = true;
      browser.storage.onChanged.removeListener(listener);
      clearTimeout(giveUp);
      resolve(report);
    };
    const onJudge = (judge: unknown) => {
      if (isJudgeResult(judge) && judge.problemId === problemId && judge.updatedAt >= since) {
        finish({ ok: true });
      }
    };
    const onTab = (tab: unknown) => {
      if (!isSubmitTab(tab) || tab.problemId !== problemId || tab.since < since - 5_000) return;
      if (tab.state === 'needs-user' && !manual) {
        manual = true;
        onManual();
      }
      // Closed before the result: sent already means Baekjoon has it ('결과 다시 확인').
      if (tab.state === 'closed')
        finish(tab.sent ? { ok: true } : { ok: false, reason: CLOSED_REASON });
    };
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const judge = changes[judgeKey(problemId)];
      const tab = changes[submitTabKey(problemId)];
      if (area === 'local' && judge) onJudge(judge.newValue);
      if (area === 'session' && tab) onTab(tab.newValue);
    };
    browser.storage.onChanged.addListener(listener);
    const giveUp = setTimeout(() => finish({ ok: false, reason: GAVE_UP_REASON }), GIVE_UP_MS);
    void Promise.all([
      browser.storage.local.get(judgeKey(problemId)),
      tabState(problemId, since),
    ]).then(([local, tab]) => {
      onJudge(local[judgeKey(problemId)]);
      onTab(tab);
    });
  });
}

/** Waits until the problem's submission tab is done or closed (one tab at a time), or `ms`. */
async function waitTabFinished(problemId: number, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until && isActiveTab(await tabState(problemId))) await sleep(500);
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
    // One submission tab at a time: let this one finish judging and close.
    await waitTabFinished(problemId, TAB_FINISH_WAIT_MS);
  } else {
    await updateExam(id, (e) => markFailed(e, problemId, report.reason, Date.now()));
  }
}

/**
 * An entry already submitting: ours (wait for it), or left by a reload or another page
 * (resume: reported or sent → submitted, tab still running → wait, otherwise failed, never
 * sent again).
 */
async function follow(exam: Exam, problemId: number, owner: string) {
  const entry = exam.submitQueue?.[problemId];
  const since = entry?.startedAt ?? entry?.updatedAt ?? Date.now();
  if (entry?.owner !== owner) {
    const judge = (await loadJudges([problemId])).get(problemId);
    const tab = await tabState(problemId, since);
    const running = isActiveTab(tab);
    if (!running && !judge && !tab && Date.now() - since < CLAIM_GRACE_MS) {
      await sleep(1000);
      return;
    }
    const resumed = await updateExam(exam.id, (e) =>
      resumeEntry(e, problemId, judge, running, Date.now(), tab?.sent === true),
    );
    const state = resumed?.submitQueue?.[problemId]?.state;
    if (state !== 'submitting' && state !== 'manual') {
      if (state === 'submitted') await waitTabFinished(problemId, TAB_FINISH_WAIT_MS);
      return;
    }
  }
  await settle(exam.id, problemId, since);
}
