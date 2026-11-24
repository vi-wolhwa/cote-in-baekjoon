/**
 * Short-coding ranking and source pages, and the login page a source page sends a logged-out
 * user to: in a tab the background opened to read them for the 제출 기록 tab (ADR-0012), parse
 * the page and hand it over. Anywhere else this does nothing.
 */
import { answerCapture } from '@/boj/capture-answer';

export default defineContentScript({
  matches: [
    'https://acmicpc.net/short/status/*',
    'https://www.acmicpc.net/short/status/*',
    'https://acmicpc.net/source/*',
    'https://www.acmicpc.net/source/*',
    'https://acmicpc.net/login*',
    'https://www.acmicpc.net/login*',
  ],
  runAt: 'document_idle',
  async main() {
    await answerCapture(document, location.href);
  },
});
