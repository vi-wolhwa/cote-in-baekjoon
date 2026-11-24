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

/** A saved answer, or a submission made during the exam by older versions. */
const hasAnswer = (exam: Exam, problemId: number) =>
  Boolean(exam.answers?.[problemId] ?? exam.submissions[problemId]);

/** "1번 문제 · 제목 · 답안 저장함 · 다시 볼 문제": the rail button's name and tooltip. */
export function railLabel(exam: Exam, index: number, loading?: number): string {
  const p = exam.problems[index];
  if (!p) return '';
  return [
    `${index + 1}번 문제`,
    p.title,
    p.body ? '' : p.id === loading ? '불러오는 중' : '불러오기 전',
    hasAnswer(exam, p.id) ? '답안 저장함' : '',
    exam.flagged.includes(p.id) ? '다시 볼 문제' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The problem rail left of the problem pane (product owner, 2026-11-24): one rounded square
 * per problem, top to bottom. A green check sits on the bottom-right corner of a problem
 * with a saved answer, a yellow flag on the top-right corner of a '다시 볼 문제'. A problem
 * not read yet is dimmed, with a small spinner while its background tab is open. Up/Down
 * move between problems.
 */
export function ProblemRail({
  exam,
  current,
  onSelect,
  loading,
}: {
  exam: Exam;
  current: number;
  onSelect: (index: number) => void;
  /** The problem being read now (prefetch.ts). */
  loading?: number;
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
          const label = railLabel(exam, i, loading);
          const state = p.body ? '' : p.id === loading ? ' is-loading' : ' is-unread';
          return (
            <li key={p.id}>
              <button
                type="button"
                class={`rail-item${i === current ? ' is-current' : ''}${state}`}
                aria-current={i === current ? 'step' : undefined}
                aria-label={label}
                title={label}
                tabIndex={i === current ? 0 : -1}
                data-testid="rail-item"
                onClick={() => onSelect(i)}
              >
                {i + 1}
                {p.id === loading && !p.body && (
                  <span class="rail-spinner" data-testid="rail-loading" aria-hidden="true" />
                )}
                {exam.flagged.includes(p.id) && (
                  <span
                    class="rail-badge rail-flagged"
                    data-testid="rail-flagged"
                    aria-hidden="true"
                  >
                    <FlagIcon size={10} />
                  </span>
                )}
                {hasAnswer(exam, p.id) && (
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
