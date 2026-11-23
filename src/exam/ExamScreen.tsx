/**
 * The exam screen, exam.html#{id} (#101, docs/design/ide-spec.md §8): the top bar with
 * '시험 종료', the problem strip, one ProblemWorkspace and the sidebar with the remaining
 * time. When the time is up the exam ends by itself and the result screen opens.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Modal } from '@/ide/Modal';
import * as store from '@/ide/storage';
import { SandboxRunner } from '@/runner/client';
import { DEFAULT_LANGUAGE, type LanguageId } from '@/shared/languages';
import type { Theme } from '@/shared/theme';
import { ExamSidebar, ProblemStrip } from './ExamChrome';
import {
  endExam,
  examLabel,
  isOver,
  recordSubmission,
  remainingMs,
  toggleFlag,
  type Exam,
} from './model';
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
  const runner = useMemo(
    () => new SandboxRunner(browser.runtime.getURL('/sandbox.html'), runtimeUrl()),
    [],
  );
  const warmEngines = useRef(new Set<string>(['js']));
  const exam = state.status === 'ready' ? state.exam : undefined;
  const now = useNow(exam !== undefined && exam.endedAt === undefined);
  const over = exam ? isOver(exam, now) : false;

  useEffect(() => {
    void Promise.all([store.loadLanguage(), store.loadKeymap()]).then(([lang, km]) => {
      setLanguage(lang);
      setKeymap(km);
    });
  }, []);

  // Time is up, or the exam was ended in another tab: record the end and show the results.
  const finishing = useRef(false);
  useEffect(() => {
    if (!exam || !over || finishing.current) return;
    finishing.current = true;
    void update((e) => endExam(e, Date.now()))
      .catch(() => undefined)
      .then(onFinished);
  }, [exam, over]);

  if (state.status === 'loading' || !keymap) {
    return <div class="ide-loading">시험을 불러오는 중입니다…</div>;
  }
  if (state.status === 'missing' || !exam) return <MissingExam />;

  const problem = exam.problems[Math.min(index, exam.problems.length - 1)];
  if (!problem) return <MissingExam />;
  const unsubmitted = exam.problems.filter((p) => !exam.submissions[p.id]).length;
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
      <ProblemStrip exam={exam} current={index} onSelect={setIndex} />

      <div class="ide-body">
        <ProblemWorkspace
          key={problem.id}
          examId={exam.id}
          problem={problem}
          index={exam.problems.indexOf(problem)}
          flagged={exam.flagged.includes(problem.id)}
          {...(exam.submissions[problem.id] ? { submission: exam.submissions[problem.id] } : {})}
          startedAt={exam.startedAt}
          over={over}
          language={language}
          keymap={keymap}
          theme={theme}
          runner={runner}
          warmEngines={warmEngines.current}
          onLanguage={(next) => {
            setLanguage(next);
            void store.saveLanguage(next);
          }}
          onFlag={() => change((e) => toggleFlag(e, problem.id))}
          onSubmitted={(lang, at) => change((e) => recordSubmission(e, problem.id, lang, at))}
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
                  change((e) => endExam(e, Date.now()));
                }}
              >
                시험 종료
              </button>
            </>
          }
        >
          <p>시험을 끝낼까요? 끝내면 더 제출할 수 없고 결과 화면으로 넘어갑니다.</p>
          {unsubmitted > 0 && <p>아직 제출하지 않은 문제가 {unsubmitted}개 있습니다.</p>}
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
