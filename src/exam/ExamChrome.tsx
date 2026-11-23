/**
 * Parts of the exam screen around the workspace (docs/design/ide-spec.md §8): the problem
 * rail on the left and the right sidebar with the remaining time.
 */
import { useRef } from 'preact/hooks';
import { CheckIcon, FlagIcon, HourglassIcon, MoonIcon, SunIcon } from '@/ide/icons';
import type { Theme } from '@/shared/theme';
import { formatClock, type Exam } from './model';

/** Under five minutes the remaining time turns red. */
export const WARN_MS = 5 * 60_000;

/** "1번 문제 · 제목 · 제출함 · 다시 볼 문제": the rail button's name and tooltip. */
export function railLabel(exam: Exam, index: number): string {
  const p = exam.problems[index];
  if (!p) return '';
  return [
    `${index + 1}번 문제`,
    p.title,
    exam.submissions[p.id] ? '제출함' : '',
    exam.flagged.includes(p.id) ? '다시 볼 문제' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The problem rail left of the problem pane (product owner, 2026-11-24): one rounded square
 * per problem, top to bottom. A green check sits on the bottom-right corner of a submitted
 * problem (the result stays hidden), a yellow flag on the top-right corner of a
 * '다시 볼 문제'. Up/Down move between problems.
 */
export function ProblemRail({
  exam,
  current,
  onSelect,
}: {
  exam: Exam;
  current: number;
  onSelect: (index: number) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const move = (to: number) => {
    if (to < 0 || to >= exam.problems.length) return;
    onSelect(to);
    list.current?.querySelectorAll<HTMLButtonElement>('button')[to]?.focus();
  };
  return (
    <nav class="exam-rail" aria-label="문제 목록">
      <ol
        ref={list}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          move(current + (e.key === 'ArrowDown' ? 1 : -1));
        }}
      >
        {exam.problems.map((p, i) => {
          const label = railLabel(exam, i);
          return (
            <li key={p.id}>
              <button
                type="button"
                class={`rail-item${i === current ? ' is-current' : ''}`}
                aria-current={i === current ? 'step' : undefined}
                aria-label={label}
                title={label}
                tabIndex={i === current ? 0 : -1}
                data-testid="rail-item"
                onClick={() => onSelect(i)}
              >
                {i + 1}
                {exam.flagged.includes(p.id) && (
                  <span
                    class="rail-badge rail-flagged"
                    data-testid="rail-flagged"
                    aria-hidden="true"
                  >
                    <FlagIcon size={10} />
                  </span>
                )}
                {exam.submissions[p.id] && (
                  <span
                    class="rail-badge rail-submitted"
                    data-testid="rail-submitted"
                    aria-hidden="true"
                  >
                    <CheckIcon size={11} />
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
