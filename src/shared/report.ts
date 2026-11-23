/**
 * Links that open a GitHub issue form with what the extension already knows filled in
 * (#78). Only the problem number, language, version and browser go into the link; the
 * user's code never does, because the issue is public.
 */
export const REPO_URL = 'https://github.com/vi-wolhwa/cote-in-baekjoon';

/** Issue form file names in .github/ISSUE_TEMPLATE/. */
export const ISSUE_FORMS = {
  bug: '1-bug.yml',
  'run-diff': '2-run-diff.yml',
  feature: '3-feature.yml',
} as const;

export type IssueKind = keyof typeof ISSUE_FORMS;

export interface ReportContext {
  /** Extension version, e.g. "0.3.0". */
  version: string;
  /** e.g. "Chrome 131", from describeBrowser(). */
  browser?: string;
  problemId?: number;
  /** Language label shown in the IDE, e.g. "Java 11". */
  language?: string;
}

/** The issue form URL with the known fields filled in (form field ids are the keys). */
export function issueUrl(kind: IssueKind, context: ReportContext): string {
  const params = new URLSearchParams({ template: ISSUE_FORMS[kind] });
  if (kind !== 'feature') {
    params.set('version', [context.version, context.browser].filter(Boolean).join(' / '));
    if (context.problemId) params.set('problem', String(context.problemId));
    if (context.language) params.set('language', context.language);
  }
  return `${REPO_URL}/issues/new?${params.toString()}`;
}

interface Brand {
  brand: string;
  version: string;
}

/**
 * "Edge 131", "Whale 4", "Chrome 131" from the browser's brand list, or from the user
 * agent string when brands are not available.
 */
export function describeBrowser(nav: {
  userAgent: string;
  userAgentData?: { brands?: Brand[] };
}): string {
  const brands = nav.userAgentData?.brands ?? [];
  const find = (name: string) => brands.find((b) => b.brand.includes(name));
  const named = find('Edge') ?? find('Whale') ?? find('Opera') ?? find('Google Chrome');
  if (named) return `${shortName(named.brand)} ${named.version}`;
  const ua = nav.userAgent;
  const match =
    /Edg\/(\d+)/.exec(ua) ??
    /Whale\/(\d+)/.exec(ua) ??
    /OPR\/(\d+)/.exec(ua) ??
    /Chrome\/(\d+)/.exec(ua);
  if (!match) return '알 수 없는 브라우저';
  const name = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('Whale/')
      ? 'Whale'
      : ua.includes('OPR/')
        ? 'Opera'
        : 'Chrome';
  return `${name} ${match[1]}`;
}

function shortName(brand: string): string {
  if (brand.includes('Edge')) return 'Edge';
  if (brand.includes('Whale')) return 'Whale';
  if (brand.includes('Opera')) return 'Opera';
  return 'Chrome';
}
