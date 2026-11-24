/**
 * The exam screen, exam.html#{id} (#101, docs/design/ide-spec.md §8): the top bar with
 * '시험 종료', the problem rail, one ProblemWorkspace and the sidebar with the remaining
 * time. The problems are read one after another in the background (prefetch.ts). When the
 * time is up the exam ends by itself and the result screen opens, which submits the saved
 * answers (batch.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Modal } from '@/ide/Modal';
import * as store from '@/ide/storage';
import { SandboxRunner } from '@/runner/client';
import { DEFAULT_LANGUAGE, type LanguageId } from '@/shared/languages';
import type { Theme } from '@/shared/theme';
import { ExamSidebar, ProblemRail } from './ExamChrome';
import { answeredProblems, finishExam, saveAnswer } from './batch';
import { examLabel, isOver, remainingMs, toggleFlag, type Exam } from './model';
import { useCaptureQueue } from './prefetch';
import { ProblemWorkspace } from './ProblemWorkspace';
import { useExamRecord, useNow } from './useExam';

/** Files added by build hooks (language runtimes) are not in WXT's path types. */
const runtimeUrl = () => (browser.runtime.getURL as (path: string) => string)('/runtime/');

interface Props {
  id: string;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  /** Goes to the result screen. */
  onFinished: () => void;
}

export function ExamScreen({ id, theme, onTheme, onFinished }: Props) {
  const { state, update } = useExamRecord(id);
  const [index, setIndex] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [language, setLanguage] = useState<LanguageId>(DEFAULT_LANGUAGE);
  const [keymap, setKeymap] = useState<store.Keymap>();
  const [split, setSplit] = useState<store.SplitSizes>();
  const runner = useMemo(
    () => new SandboxRunner(browser.runtime.getURL('/sandbox.html'), runtimeUrl()),
    [],
  );
  const warmEngines = useRef(new Set<string>(['js']));
  const exam = state.status === 'ready' ? state.exam : undefined;
  const now = useNow(exam !== undefined && exam.endedAt === undefined);
  const over = exam ? isOver(exam, now) : false;
  const opened = exam?.problems[Math.min(index, exam.problems.length - 1)]?.id;
  const reading = useCaptureQueue(exam, opened, over);

  useEffect(() => {
    void Promise.all([store.loadLanguage(), store.loadKeymap(), store.loadSplit()]).then(
      ([lang, km, sp]) => {
        setLanguage(lang);
        setKeymap(km);
        setSplit(sp);
      },
    );
  }, []);

  // Time is up, or the exam was ended in another tab: record the end and show the results.
  const finishing = useRef(false);
  useEffect(() => {
    if (!exam || !over || finishing.current) return;
    finishing.current = true;
    void update((e) => finishExam(e, Date.now()))
      .catch(() => undefined)
      .then(onFinished);
  }, [exam, over]);

  if (state.status === 'loading' || !keymap || !split) {
    return <div class="ide-loading">시험을 불러오는 중입니다…</div>;
  }
  if (state.status === 'missing' || !exam) return <MissingExam />;

  const problem = exam.problems[Math.min(index, exam.problems.length - 1)];
  if (!problem) return <MissingExam />;
  const answered = answeredProblems(exam).length;
  const unanswered = exam.problems.length - answered;
  const change = (fn: (e: Exam) => Exam) => void update(fn).catch(() => undefined);

  return (
    <div class="ide exam">
      <nav class="topbar" aria-label="시험">
        <ol class="crumbs">
          <li>모의 시험</li>
          <li aria-current="page">{examLabel(exam)}</li>
        </ol>
        <div class="topbar-links">
          <span class="exam-hint">결과는 시험이 끝나면 공개</span>
          <button
            type="button"
            class="end-button"
            disabled={over}
            onClick={() => setConfirmEnd(true)}
          >
            시험 종료
          </button>
        </div>
      </nav>
      <div class="ide-body">
        <ProblemRail
          exam={exam}
          current={index}
          onSelect={setIndex}
          {...(reading.loading !== undefined ? { loading: reading.loading } : {})}
        />
        <ProblemWorkspace
          key={problem.id}
          examId={exam.id}
          problem={problem}
          index={exam.problems.indexOf(problem)}
          flagged={exam.flagged.includes(problem.id)}
          {...(exam.answers?.[problem.id] ? { answer: exam.answers[problem.id] } : {})}
          {...(reading.errors.has(problem.id) ? { loadError: reading.errors.get(problem.id) } : {})}
          startedAt={exam.startedAt}
          over={over}
          language={language}
          keymap={keymap}
          theme={theme}
          split={split}
          onSplit={(change) => setSplit((s) => (s ? change(s) : s))}
          onSplitEnd={() => setSplit((s) => (s && void store.saveSplit(s), s))}
          runner={runner}
          warmEngines={warmEngines.current}
          onLanguage={(next) => {
            setLanguage(next);
            void store.saveLanguage(next);
          }}
          onFlag={() => change((e) => toggleFlag(e, problem.id))}
          onRetry={() => reading.retry(problem.id)}
          onSaveAnswer={(code, lang) =>
            change((e) => saveAnswer(e, problem.id, code, lang, Date.now()))
          }
        />
        <ExamSidebar remainingMs={remainingMs(exam, now)} theme={theme} onTheme={onTheme} />
      </div>

      {confirmEnd && (
        <Modal
          title="시험 종료"
          onClose={() => setConfirmEnd(false)}
          footer={
            <>
              <button type="button" class="btn btn-light" onClick={() => setConfirmEnd(false)}>
                계속 풀기
              </button>
              <button
                type="button"
                class="btn btn-danger"
                onClick={() => {
                  setConfirmEnd(false);
                  change((e) => finishExam(e, Date.now()));
                }}
              >
                시험 종료
              </button>
            </>
          }
        >
          <p>시험을 끝낼까요? 끝내면 답안을 바꿀 수 없고 결과 화면으로 넘어갑니다.</p>
          <p data-testid="end-summary">
            {answered > 0
              ? `저장한 답안 ${answered}개를 백준에 제출합니다.`
              : '저장한 답안이 없어 백준에 제출하지 않습니다.'}
            {unanswered > 0 && answered > 0
              ? ` 답안이 없는 문제 ${unanswered}개는 제출하지 않습니다.`
              : ''}
          </p>
        </Modal>
      )}
    </div>
  );
}

function MissingExam() {
  return (
    <div class="exam-page">
      <main class="exam-page-main">
        <p class="exam-empty">시험 기록을 찾지 못했습니다.</p>
        <a class="btn btn-primary" href="#setup">
          새 시험 만들기
        </a>
      </main>
    </div>
  );
}
