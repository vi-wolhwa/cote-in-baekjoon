/**
 * The exam record for the exam and result screens: loaded from `exam:{id}`, kept in step
 * with other tabs, and fed with judge results as they arrive (also after the exam ended,
 * since judging takes time). A result that belongs to the exam is copied into the record,
 * so practising the same problem later cannot change the exam's result.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { isJudgeResult, judgeKey, type JudgeResult } from '@/shared/submission';
import { examKey, isExam, recordJudge, type Exam } from './model';
import { loadExam, loadJudges, updateExam } from './storage';

export type ExamState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; exam: Exam; judges: Map<number, JudgeResult> };

export function useExamRecord(id: string) {
  const [state, setState] = useState<ExamState>({ status: 'loading' });
  const judges = useRef(new Map<number, JudgeResult>());

  useEffect(() => {
    let live = true;
    const key = examKey(id);
    const show = (exam: Exam) => {
      if (live) setState({ status: 'ready', exam, judges: new Map(judges.current) });
    };
    const keep = (judge: JudgeResult) =>
      updateExam(id, (exam) => recordJudge(exam, judge)).catch(() => undefined);

    void (async () => {
      const exam = await loadExam(id).catch(() => undefined);
      if (!live) return;
      if (!exam) {
        setState({ status: 'missing' });
        return;
      }
      judges.current = await loadJudges(exam.problems.map((p) => p.id)).catch(() => new Map());
      show(exam);
      for (const judge of judges.current.values()) await keep(judge);
    })();

    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local' || !live) return;
      for (const [changed, change] of Object.entries(changes)) {
        const value = change.newValue;
        if (changed === key && isExam(value) && value.id === id) {
          show(value);
        } else if (isJudgeResult(value) && changed === judgeKey(value.problemId)) {
          judges.current.set(value.problemId, value);
          setState((s) => (s.status === 'ready' ? { ...s, judges: new Map(judges.current) } : s));
          void keep(value);
        }
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      live = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [id]);

  /** Applies a change to the stored record; the storage listener shows the result. */
  const update = (change: (exam: Exam) => Exam) =>
    updateExam(id, change).then((next) => {
      if (next) setState((s) => (s.status === 'ready' ? { ...s, exam: next } : s));
      return next;
    });

  return { state, update };
}

/** The current time, refreshed every `intervalMs` while `active`. */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}
