/**
 * '새 버전' notice after a store update (ADR-0014). The background stores it when the browser
 * installs a newer version; the toolbar popup shows it until the user closes it.
 */
import { REPO_URL } from './report';

export const UPDATE_NOTICE_KEY = 'update:notice';

export interface UpdateNotice {
  from: string;
  to: string;
}

export function isUpdateNotice(value: unknown): value is UpdateNotice {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.from === 'string' && typeof v.to === 'string';
}

/** Numeric dotted versions (manifest format); a missing part counts as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/** The notice for an `onInstalled` event, or undefined when it is not an upgrade. */
export function noticeFor(
  details: { reason: string; previousVersion?: string },
  current: string,
): UpdateNotice | undefined {
  const from = details.previousVersion;
  if (details.reason !== 'update' || !from) return undefined;
  return compareVersions(current, from) > 0 ? { from, to: current } : undefined;
}

export function releaseUrl(version: string): string {
  return `${REPO_URL}/releases/tag/v${version}`;
}
