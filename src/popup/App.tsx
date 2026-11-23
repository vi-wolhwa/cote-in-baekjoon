/**
 * Toolbar popup (#79): the problem in the active tab, recent problems, backup and help.
 * Reads the active tab's URL through `activeTab`, granted when the user opens the popup.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { createBackup, summarizeBackup } from '@/shared/backup';
import type { OpenIdeMessage } from '@/shared/messages';
import { describeBrowser, issueUrl } from '@/shared/report';
import { BackupTab } from './BackupTab';
import { HelpTab } from './HelpTab';
import { HomeTab } from './HomeTab';
import { BackupIcon, HelpIcon, HomeIcon } from './icons';
import {
  bugReportUrl,
  computeStats,
  parseProblemUrl,
  problemUrl,
  readProblems,
  recentProblems,
} from './model';

type Tab = 'home' | 'backup' | 'help';

const TABS: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: '홈', icon: HomeIcon },
  { id: 'backup', label: '백업', icon: BackupIcon },
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

  useEffect(() => {
    load().then(setLoaded, () => setLoaded({ items: {} }));
  }, []);

  const data = useMemo(() => readProblems(loaded?.items ?? {}), [loaded]);
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
        ) : tab === 'backup' ? (
          <BackupTab
            summary={summarizeBackup(createBackup(loaded.items).items)}
            onImport={() => void browser.runtime.openOptionsPage().then(() => window.close())}
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
