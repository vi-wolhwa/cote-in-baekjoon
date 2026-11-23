/**
 * Right sidebar (docs/design/ide-spec.md §10): tools for the problem on screen. Settings
 * first, as on the reference screen, then a divider and the timer. Extension-wide links
 * (도움말, 문제 신고, 백업과 복원) live in the top bar.
 */
import { GearIcon } from './icons';
import { TimerTool } from './TimerTool';

interface Props {
  problemId: number;
  onOpenSettings: () => void;
}

export function Sidebar({ problemId, onOpenSettings }: Props) {
  return (
    <aside class="sidebar" aria-label="도구">
      <button
        type="button"
        class="sidebar-button"
        title="설정"
        aria-label="설정"
        aria-haspopup="dialog"
        onClick={onOpenSettings}
      >
        <GearIcon />
      </button>
      <hr class="sidebar-divider" />
      <TimerTool problemId={problemId} />
    </aside>
  );
}
