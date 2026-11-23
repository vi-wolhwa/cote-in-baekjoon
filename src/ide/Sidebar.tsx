/**
 * Right sidebar (docs/design/ide-spec.md §10): settings first, as on the reference screen,
 * then a divider and this product's extra tools.
 */
import type { LanguageId } from '@/shared/languages';
import { describeBrowser } from '@/shared/report';
import { BackupIcon, GearIcon, HelpIcon, ReportIcon } from './icons';
import { sidebarReportUrl } from './report-link';

interface Props {
  problemId: number;
  language: LanguageId;
  onOpenSettings: () => void;
}

export function Sidebar({ problemId, language, onOpenSettings }: Props) {
  const reportUrl = sidebarReportUrl({
    version: browser.runtime.getManifest().version,
    browser: describeBrowser(navigator),
    problemId,
    language,
  });

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
      <div class="sidebar-tools">
        <a
          class="sidebar-button"
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="문제 신고"
          aria-label="문제 신고"
        >
          <ReportIcon />
        </a>
        <a
          class="sidebar-button"
          href={browser.runtime.getURL('/help.html')}
          target="_blank"
          rel="noopener noreferrer"
          title="도움말"
          aria-label="도움말"
        >
          <HelpIcon />
        </a>
        <button
          type="button"
          class="sidebar-button"
          title="백업과 복원"
          aria-label="백업과 복원"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          <BackupIcon />
        </button>
      </div>
    </aside>
  );
}
