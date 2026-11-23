import {
  handleJudgeReport,
  handlePendingQuery,
  handleSubmitRequest,
  handleWatchQuery,
} from '@/boj/submission-service';
import {
  isJudgeReportMessage,
  isPendingQueryMessage,
  isSubmitRequestMessage,
  isWatchQueryMessage,
} from '@/shared/submission';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const reply = route(message, sender);
    if (!reply) return undefined;
    reply.then(sendResponse, (error: unknown) => {
      console.error('[cib] message failed', error);
      sendResponse(undefined);
    });
    return true; // Keeps the channel open for the async response.
  });
});

function route(message: unknown, sender: Browser.runtime.MessageSender): Promise<unknown> | null {
  if (isSubmitRequestMessage(message)) return handleSubmitRequest(message, sender);
  if (isPendingQueryMessage(message)) return handlePendingQuery(message, sender);
  if (isWatchQueryMessage(message)) return handleWatchQuery(sender);
  if (isJudgeReportMessage(message)) return handleJudgeReport(message, sender);
  return null;
}
