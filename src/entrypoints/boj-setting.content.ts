/**
 * Baekjoon settings pages (#59): when the submit window was sent here because the chosen
 * language is not in the user's language list, explain why and link back to the submit page.
 */
import { showLanguageMissingNotice } from '@/boj/submit-banner';
import { isLanguageMissingQueryResponse, type LanguageMissingQuery } from '@/shared/submission';

export default defineContentScript({
  matches: ['https://acmicpc.net/setting*', 'https://www.acmicpc.net/setting*'],
  runAt: 'document_idle',
  async main(ctx) {
    const query: LanguageMissingQuery = { type: 'cib:language-missing-query' };
    const response: unknown = await browser.runtime.sendMessage(query).catch(() => undefined);
    if (!isLanguageMissingQueryResponse(response) || !response.info || ctx.isInvalid) return;
    const { problemId, languageName } = response.info;
    showLanguageMissingNotice(document, {
      languageName,
      submitUrl: `https://acmicpc.net/submit/${problemId}`,
    });
  },
});
