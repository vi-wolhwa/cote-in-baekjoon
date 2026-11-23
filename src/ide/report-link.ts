/**
 * "문제 신고" in the IDE sidebar: the bug form with the problem and the language filled in.
 * The user's code is never put in the link (the issue is public).
 */
import { languageInfo, type LanguageId } from '@/shared/languages';
import { issueUrl } from '@/shared/report';

export interface SidebarReportContext {
  version: string;
  /** From describeBrowser(navigator). */
  browser: string;
  /** 0 for the demo problem; left out of the link then. */
  problemId: number;
  language: LanguageId;
}

export function sidebarReportUrl(context: SidebarReportContext): string {
  return issueUrl('bug', {
    version: context.version,
    browser: context.browser,
    problemId: context.problemId > 0 ? context.problemId : undefined,
    language: languageInfo(context.language).label,
  });
}
