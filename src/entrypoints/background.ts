import {
  handleJudgeReport,
  handleLanguageMissing,
  handleLanguageMissingQuery,
  handlePendingQuery,
  handleSubmitRequest,
  handleWatchQuery,
} from '@/boj/submission-service';
import {
  handleRecheck,
  handleSubmitProgress,
  handleSubmitTabRemoved,
} from '@/boj/submit-tab-service';
import { isRecheckMessage, isSubmitProgressMessage } from '@/shared/submit-tab';
import {
  handleCaptureCancel,
  handleCaptureQuery,
  handleCaptureRequest,
  handleCaptureResult,
  handleCaptureTabRemoved,
} from '@/exam/capture';
import {
  isCaptureCancelMessage,
  isCaptureQueryMessage,
  isCaptureRequestMessage,
  isCaptureResultMessage,
} from '@/exam/capture-contract';
import { handleOpenExamSetup } from '@/exam/open-setup';
import { isOpenExamSetupMessage } from '@/shared/messages';
import {
  isJudgeReportMessage,
  isLanguageMissingMessage,
  isLanguageMissingQuery,
  isPendingQueryMessage,
  isSubmitRequestMessage,
  isWatchQueryMessage,
} from '@/shared/submission';

export default defineBackground(() => {
  // A background tab closed early: a submission (ADR-0002) or a mock exam problem being
  // read (ADR-0005) did not finish.
  browser.tabs.onRemoved.addListener((tabId) => {
    handleSubmitTabRemoved(tabId).catch((error: unknown) =>
      console.error('[cib] submit tab cleanup failed', error),
    );
    handleCaptureTabRemoved(tabId).catch((error: unknown) =>
      console.error('[cib] capture cleanup failed', error),
    );
  });
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
  if (isLanguageMissingMessage(message)) return handleLanguageMissing(message, sender);
  if (isLanguageMissingQuery(message)) return handleLanguageMissingQuery(sender);
  if (isOpenExamSetupMessage(message)) return handleOpenExamSetup(message, sender);
  if (isSubmitProgressMessage(message)) return handleSubmitProgress(message, sender);
  if (isRecheckMessage(message)) return handleRecheck(message, sender);
  if (isCaptureRequestMessage(message)) return handleCaptureRequest(message, sender);
  if (isCaptureCancelMessage(message)) return handleCaptureCancel(message, sender);
  if (isCaptureQueryMessage(message)) return handleCaptureQuery(sender);
  if (isCaptureResultMessage(message)) return handleCaptureResult(message, sender);
  return null;
}
