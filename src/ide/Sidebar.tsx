/**
 * Right sidebar (docs/design/ide-spec.md §10): tools for the problem on screen. The theme
 * switch first (one click, no dialog: it was the only setting), then a divider and the
 * timer. Extension-wide links (도움말, 문제 신고, 백업과 복원) live in the top bar.
 */
import type { Theme } from '@/shared/theme';
import { MoonIcon, SunIcon } from './icons';
import { TimerTool } from './TimerTool';

interface Props {
  problemId: number;
  theme: Theme;
  onTheme: (theme: Theme) => void;
}

export function Sidebar({ problemId, theme, onTheme }: Props) {
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? '라이트 테마로 바꾸기' : '다크 테마로 바꾸기';
  return (
    <aside class="sidebar" aria-label="도구">
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
      <hr class="sidebar-divider" />
      <TimerTool problemId={problemId} />
    </aside>
  );
}
