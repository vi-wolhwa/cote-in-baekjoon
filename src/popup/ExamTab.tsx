/**
 * The popup's '모의 시험' tab (#100): the setup form and the last five exams. Starting an exam
 * opens exam.html#{id} in a new tab.
 */
import type { Exam, ExamDraft } from '@/exam/model';
import type { PastExam } from '@/exam/results';
import { SetupForm, type SetupFormProps } from '@/exam/SetupForm';
import { ChevronIcon } from './icons';

export interface ExamTabProps {
  draft: ExamDraft;
  handle?: string;
  past: PastExam[];
  onDraft: (draft: ExamDraft) => void;
  onStarted: (exam: Exam) => void;
  /** Opens a past exam: its result, or the exam itself while it runs. */
  onOpenExam: (exam: PastExam) => void;
  start?: SetupFormProps['start'];
}

export function ExamTab(props: ExamTabProps) {
  return (
    <>
      <SetupForm
        initial={props.draft}
        {...(props.handle ? { handle: props.handle } : {})}
        onDraft={props.onDraft}
        onStarted={props.onStarted}
        {...(props.start ? { start: props.start } : {})}
      />

      <section class="card past" aria-labelledby="past-title">
        <h2 id="past-title" class="card-title">
          지난 시험
        </h2>
        {props.past.length === 0 ? (
          <p class="empty">아직 본 시험이 없어요.</p>
        ) : (
          <ul class="recent-list">
            {props.past.map((exam) => (
              <li key={exam.id}>
                <button
                  type="button"
                  class="recent-row past-row"
                  data-testid="past-exam"
                  onClick={() => props.onOpenExam(exam)}
                >
                  <span class="recent-main">
                    <span class="recent-name">{exam.label}</span>
                  </span>
                  {exam.inProgress ? (
                    <span class="badge badge-live">진행 중</span>
                  ) : (
                    <span class="past-score" aria-label={`맞은 문제 ${exam.score ?? ''}`}>
                      {exam.score}
                    </span>
                  )}
                  <span class="row-chevron">
                    <ChevronIcon size={16} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
