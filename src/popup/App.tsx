/**
 * Toolbar popup (#79): the problem in the active tab, recent problems, mock exams and help.
 * Reads the active tab's URL through `activeTab`, granted when the user opens the popup.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { DRAFT_KEY, parseDraft, type ExamDraft } from '@/exam/model';
import { pastExams, runningExamProblems, type PastExam } from '@/exam/results';
import { examPagePath } from '@/exam/routes';
import { readExams, readJudges, saveDraft } from '@/exam/storage';
import { HANDLE_KEY, isHandle } from '@/shared/handle';
import type { OpenIdeMessage } from '@/shared/messages';
import { describeBrowser, issueUrl } from '@/shared/report';
import { isUpdateNotice, releaseUrl, UPDATE_NOTICE_KEY } from '@/shared/update-notice';
import { ExamTab } from './ExamTab';
import { HelpTab } from './HelpTab';
import { HomeTab } from './HomeTab';
import { ExamIcon, HelpIcon, HomeIcon } from './icons';
import {
  bugReportUrl,
  computeStats,
  parseProblemUrl,
  problemUrl,
  readProblems,
  recentProblems,
} from './model';

type Tab = 'home' | 'exam' | 'help';

const TABS: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: '홈', icon: HomeIcon },
  { id: 'exam', label: '모의 시험', icon: ExamIcon },
  { id: 'help', label: '도움말', icon: HelpIcon },
];

interface Loaded {
  items: Record<string, unknown>;
  /** The active tab when it shows a Baekjoon problem. */
  active?: { tabId: number; problemId: number };
}

/** Files added by build hooks are not in WXT's path types. */
const extensionUrl = (path: string) => (browser.runtime.getURL as (path: string) => string)(path);

async function load(): Promise<Loaded> {
  const [tabs, items] = await Promise.all([
    browser.tabs.query({ active: true, currentWindow: true }).catch(() => []),
    browser.storage.local.get(null),
  ]);
  const tab = tabs[0];
  const problemId = parseProblemUrl(tab?.url);
  return {
    items,
    ...(tab?.id !== undefined && problemId ? { active: { tabId: tab.id, problemId } } : {}),
  };
}

/** Opens a page in a new tab and closes the popup. */
async function openTab(url: string) {
  await browser.tabs.create({ url });
  window.close();
}

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [loaded, setLoaded] = useState<Loaded>();
  const [openError, setOpenError] = useState<string>();
  const version = browser.runtime.getManifest().version;
  const now = useMemo(() => Date.now(), [loaded]);

  const [noticeClosed, setNoticeClosed] = useState(false);

  useEffect(() => {
    load().then(setLoaded, () => setLoaded({ items: {} }));
    // The update badge (ADR-0014) has done its job once the popup is open.
    void browser.action.setBadgeText({ text: '' }).catch(() => undefined);
  }, []);
  const notice = noticeClosed ? undefined : loaded?.items[UPDATE_NOTICE_KEY];
  const closeNotice = () => {
    setNoticeClosed(true);
    void browser.storage.local.remove(UPDATE_NOTICE_KEY).catch(() => undefined);
  };

  const data = useMemo(() => {
    const items = loaded?.items ?? {};
    const problems = readProblems(items);
    // Results of a running mock exam stay hidden until it ends (ADR-0005).
    for (const id of runningExamProblems(readExams(items), now)) problems.judges.delete(id);
    return problems;
  }, [loaded, now]);
  const exams = useMemo(() => {
    const items = loaded?.items ?? {};
    const handle = items[HANDLE_KEY];
    return {
      draft: parseDraft(items[DRAFT_KEY]),
      ...(isHandle(handle) ? { handle } : {}),
      past: pastExams(readExams(items), readJudges(items), now),
    };
  }, [loaded, now]);
  const active = loaded?.active;
  const activeTitle = active ? data.metas.get(active.problemId)?.title : undefined;

  const openIde = async () => {
    if (!active) return;
    try {
      const message: OpenIdeMessage = { type: 'cib:open-ide' };
      await browser.tabs.sendMessage(active.tabId, message);
      window.close();
    } catch {
      // No content script: the tab was open before the extension was installed or updated.
      setOpenError('백준 탭을 새로고침한 뒤 다시 눌러 주세요.');
    }
  };

  const context = { version, browser: describeBrowser(navigator) };

  return (
    <div class="popup">
      <header class="header">
        <img class="logo" src={extensionUrl('/icon/48.png')} alt="" width={24} height={24} />
        <h1 class="app-name">코테 in 백준</h1>
        <span class="version">v{version}</span>
      </header>

      {isUpdateNotice(notice) && (
        <div class="update-notice" role="status">
          <span>v{notice.to}로 업데이트되었습니다.</span>
          <button type="button" class="link" onClick={() => void openTab(releaseUrl(notice.to))}>
            변경 내용
          </button>
          <button type="button" class="close" aria-label="알림 닫기" onClick={closeNotice}>
            ×
          </button>
        </div>
      )}

      <div class="content" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {!loaded ? (
          <p class="loading">불러오는 중…</p>
        ) : tab === 'home' ? (
          <HomeTab
            {...(active
              ? {
                  active: {
                    id: active.problemId,
                    ...(activeTitle ? { title: activeTitle } : {}),
                  },
                }
              : {})}
            stats={computeStats(data, now)}
            recent={recentProblems(data)}
            now={now}
            {...(openError ? { openError } : {})}
            onOpenIde={() => void openIde()}
            onOpenProblem={(id) => void openTab(problemUrl(id))}
          />
        ) : tab === 'exam' ? (
          <ExamTab
            {...exams}
            onDraft={(draft: ExamDraft) => void saveDraft(draft).catch(() => undefined)}
            onStarted={(exam) =>
              void openTab(extensionUrl(examPagePath({ kind: 'exam', id: exam.id })))
            }
            onOpenExam={(exam: PastExam) =>
              void openTab(
                extensionUrl(
                  examPagePath({ kind: exam.inProgress ? 'exam' : 'result', id: exam.id }),
                ),
              )
            }
          />
        ) : (
          <HelpTab
            bugUrl={bugReportUrl(context, active?.problemId, data)}
            featureUrl={issueUrl('feature', context)}
            helpUrl={(id) => `${extensionUrl('/help.html')}#${id}`}
            noticesUrl={extensionUrl('/THIRD_PARTY_NOTICES.txt')}
            onOpen={(url) => void openTab(url)}
          />
        )}
      </div>

      <nav class="tabbar" role="tablist" aria-label="메뉴">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            class={tab === id ? 'tab active' : 'tab'}
            onClick={() => setTab(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
