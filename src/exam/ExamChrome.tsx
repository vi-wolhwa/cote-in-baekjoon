/**
 * Parts of the exam screen around the workspace (docs/design/ide-spec.md §8): the problem
 * number strip under the top bar and the right sidebar with the remaining time.
 */
import { CheckIcon, FlagIcon, HourglassIcon, MoonIcon, SunIcon } from '@/ide/icons';
import type { Theme } from '@/shared/theme';
import { formatClock, type Exam } from './model';

/** Under five minutes the remaining time turns red. */
export const WARN_MS = 5 * 60_000;

export function ProblemStrip({
  exam,
  current,
  onSelect,
}: {
  exam: Exam;
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav class="exam-strip" aria-label="문제 목록">
      <ol>
        {exam.problems.map((p, i) => {
          const submitted = exam.submissions[p.id] !== undefined;
          const flagged = exam.flagged.includes(p.id);
          const states = [submitted ? '제출함' : '', flagged ? '다시 볼 문제' : '']
            .filter(Boolean)
            .join(', ');
          return (
            <li key={p.id}>
              <button
                type="button"
                class={`strip-item${i === current ? ' is-current' : ''}`}
                aria-current={i === current ? 'step' : undefined}
                aria-label={`${i + 1}번 문제${states ? `, ${states}` : ''}`}
                data-testid="strip-item"
                onClick={() => onSelect(i)}
              >
                <span class="strip-number">{i + 1}</span>
                {submitted && (
                  <span class="strip-mark strip-submitted" data-testid="strip-submitted">
                    <CheckIcon size={14} />
                  </span>
                )}
                {flagged && (
                  <span class="strip-mark strip-flagged" data-testid="strip-flagged">
                    <FlagIcon size={14} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ExamSidebar({
  remainingMs,
  theme,
  onTheme,
}: {
  remainingMs: number;
  theme: Theme;
  onTheme: (theme: Theme) => void;
}) {
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? '라이트 테마로 바꾸기' : '다크 테마로 바꾸기';
  const warn = remainingMs <= WARN_MS;
  return (
    <aside class="sidebar exam-sidebar" aria-label="도구">
      <div class={`exam-time${warn ? ' is-warning' : ''}`} data-testid="remaining">
        <HourglassIcon />
        <span class="exam-time-label">남은 시간</span>
        <span class="exam-time-value" aria-live="off">
          {formatClock(remainingMs)}
        </span>
      </div>
      <hr class="sidebar-divider" />
      <button
        type="button"
        class="sidebar-button"
        title={label}
        aria-label={label}
        data-testid="theme-toggle"
        onClick={() => onTheme(next)}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
    </aside>
  );
}
