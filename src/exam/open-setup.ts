/**
 * Background side of the Baekjoon menu's '모의시험' (#102): opens the setup page with that
 * problem included, in a new tab next to the problem page. Only a Baekjoon problem page of
 * the same problem may ask.
 */
import { bojPath } from '@/boj/submission-service';
import type { OpenExamSetupMessage } from '@/shared/messages';
import { examPagePath } from './routes';

type Sender = Browser.runtime.MessageSender;

export async function handleOpenExamSetup(
  message: OpenExamSetupMessage,
  sender: Sender,
): Promise<{ ok: boolean }> {
  const path = bojPath(sender);
  if (path === undefined || !new RegExp(`^/problem/${message.problemId}/?$`).test(path)) {
    return { ok: false };
  }
  const url = (browser.runtime.getURL as (path: string) => string)(
    examPagePath({ kind: 'setup', include: message.problemId }),
  );
  const tab = sender.tab;
  await browser.tabs.create({
    url,
    active: true,
    ...(tab?.index !== undefined ? { index: tab.index + 1 } : {}),
    ...(tab?.id !== undefined ? { openerTabId: tab.id } : {}),
  });
  return { ok: true };
}
