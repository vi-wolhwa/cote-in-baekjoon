/**
 * Who sent a runtime message to the background: a Baekjoon page (content script) or a page
 * of this extension. Content scripts run on untrusted pages, so handlers check this first.
 */
type Sender = Browser.runtime.MessageSender;

const BOJ_PAGE = /^https:\/\/(?:www\.)?acmicpc\.net(\/[^?#]*)?/;

/** `acmicpc.net` is the canonical host: `www.acmicpc.net` redirects there. */
export function submitUrl(problemId: number): string {
  return `https://acmicpc.net/submit/${problemId}`;
}

/** The Baekjoon path (`/submit/1000`, `/status`) a content script message came from. */
export function bojPath(sender: Sender): string | undefined {
  if (sender.id !== browser.runtime.id || !sender.tab || !sender.url) return undefined;
  const m = BOJ_PAGE.exec(sender.url);
  return m ? (m[1] ?? '/') : undefined;
}

/** True for a page of this extension (the IDE frame, the exam page), not a content script. */
export function isExtensionPage(sender: Sender): boolean {
  if (sender.id !== browser.runtime.id || !sender.url) return false;
  try {
    return /^(chrome|moz)-extension:$/.test(new URL(sender.url).protocol);
  } catch {
    return false;
  }
}
