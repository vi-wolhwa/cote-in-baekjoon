/**
 * Reading the exam's problems (ADR-0005, product owner 2026-11-24): after the first problem,
 * the others are read too without the user opening them, so moving between problems is
 * instant. One at a time (one background tab), in problem order, with a short pause between
 * them; a problem the user opens goes first. It stops when the exam ends. A problem that
 * could not be read is not tried again by itself: its pane shows the reason and '다시 시도'.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { captureAndWait } from './capture-client';
import { isExam, type Exam } from './model';

/** Pause between two reads, so the background tabs do not come in a burst. */
export const PREFETCH_PAUSE_MS = 500;

/** The problem to read next: the opened one first, then the first in order still unread. */
export function nextToCapture(
  problems: readonly { id: number; body?: unknown }[],
  options: { priority?: number; skip: ReadonlySet<number>; over: boolean },
): number | undefined {
  if (options.over) return undefined;
  const waiting = problems.filter((p) => !p.body && !options.skip.has(p.id));
  return (waiting.find((p) => p.id === options.priority) ?? waiting[0])?.id;
}

const hasBody = (examId: string, problemId: number) => (stored: unknown) =>
  isExam(stored) &&
  stored.id === examId &&
  Boolean(stored.problems.find((p) => p.id === problemId)?.body);

export function useCaptureQueue(exam: Exam | undefined, opened: number | undefined, over: boolean) {
  /** The problem whose background tab is open now. */
  const [loading, setLoading] = useState<number>();
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(new Map());
  const busy = useRef(false);
  /** Read in this page; skipped even before the exam record shows the statement. */
  const done = useRef(new Set<number>());
  const startedOnce = useRef(false);

  useEffect(() => {
    if (!exam || busy.current) return;
    const skip = new Set([...done.current, ...errors.keys()]);
    const next = nextToCapture(exam.problems, { priority: opened, skip, over });
    if (next === undefined) return;
    // The opened problem goes right away; the others wait a moment after the previous one.
    const delay = startedOnce.current && next !== opened ? PREFETCH_PAUSE_MS : 0;
    const timer = setTimeout(() => {
      if (busy.current) return;
      busy.current = true;
      startedOnce.current = true;
      setLoading(next);
      void captureAndWait(exam.id, next, hasBody(exam.id, next)).then((outcome) => {
        busy.current = false;
        if (outcome.ok) done.current.add(next);
        else setErrors((m) => new Map(m).set(next, outcome.reason));
        setLoading(undefined);
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [exam, opened, over, errors, loading]);

  /** '다시 시도': read it again, first. */
  const retry = (problemId: number) =>
    setErrors((m) => {
      const next = new Map(m);
      next.delete(problemId);
      return next;
    });

  return { loading, errors, retry };
}
