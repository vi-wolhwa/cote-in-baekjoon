/**
 * exam.html (ADR-0005): `#setup[?include=N]` the setup form as a page, `#{id}` the exam and
 * `#{id}/result` the results. The theme is the IDE's (`ui:theme`), switched in the exam
 * screen's sidebar.
 */
import { useEffect, useState } from 'preact/hooks';
import * as ideStore from '@/ide/storage';
import { applyTheme, DEFAULT_THEME, type Theme } from '@/shared/theme';
import { ExamScreen } from './ExamScreen';
import type { ExamDraft } from './model';
import { ResultPage } from './ResultPage';
import { parseRoute, routeHash, type ExamRoute } from './routes';
import { SetupForm } from './SetupForm';
import { loadDraft, loadHandle, saveDraft } from './storage';

export function ExamApp() {
  const [route, setRoute] = useState<ExamRoute>(() => parseRoute(location.hash));
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onHash);
    void ideStore.loadTheme().then(setTheme);
    // Another exam tab switched the theme.
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && 'ui:theme' in changes) void ideStore.loadTheme().then(setTheme);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      window.removeEventListener('hashchange', onHash);
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  useEffect(() => applyTheme(document.documentElement, theme), [theme]);

  useEffect(() => {
    document.title =
      route.kind === 'result'
        ? '모의 시험 결과 · 코딩테스트 in 백준'
        : route.kind === 'exam'
          ? '모의 시험 · 코딩테스트 in 백준'
          : '모의 시험 만들기 · 코딩테스트 in 백준';
  }, [route]);

  const go = (next: ExamRoute) => {
    location.hash = routeHash(next);
  };
  const changeTheme = (next: Theme) => {
    setTheme(next);
    void ideStore.saveTheme(next);
  };

  switch (route.kind) {
    case 'exam':
      return (
        <ExamScreen
          key={route.id}
          id={route.id}
          theme={theme}
          onTheme={changeTheme}
          onFinished={() => go({ kind: 'result', id: route.id })}
        />
      );
    case 'result':
      return <ResultPage key={route.id} id={route.id} onNewExam={() => go({ kind: 'setup' })} />;
    case 'setup':
      return (
        <SetupPage
          key={route.include ?? 0}
          {...(route.include ? { include: route.include } : {})}
          onStarted={(id) => go({ kind: 'exam', id })}
        />
      );
    default:
      return (
        <div class="exam-page">
          <main class="exam-page-main">
            <p class="exam-empty">페이지를 찾지 못했습니다.</p>
            <a class="btn btn-primary" href="#setup">
              새 시험 만들기
            </a>
          </main>
        </div>
      );
  }
}

function SetupPage({ include, onStarted }: { include?: number; onStarted: (id: string) => void }) {
  const [loaded, setLoaded] = useState<{ draft: ExamDraft; handle?: string }>();
  useEffect(() => {
    void Promise.all([loadDraft(), loadHandle()]).then(([draft, handle]) =>
      setLoaded({ draft, ...(handle ? { handle } : {}) }),
    );
  }, []);
  return (
    <div class="exam-page">
      <nav class="topbar" aria-label="경로">
        <ol class="crumbs">
          <li>모의 시험</li>
          <li aria-current="page">시험 만들기</li>
        </ol>
      </nav>
      <main class="exam-page-main setup">
        <h1 class="setup-title">모의 시험 만들기</h1>
        <p class="setup-sub">
          solved.ac에서 조건에 맞는 문제를 무작위로 골라 제한 시간 안에 풀어요. 결과는 시험이 끝나면
          공개돼요.
        </p>
        {loaded ? (
          <SetupForm
            initial={loaded.draft}
            {...(loaded.handle ? { handle: loaded.handle } : {})}
            {...(include ? { include } : {})}
            onDraft={(draft) => void saveDraft(draft).catch(() => undefined)}
            onStarted={(exam) => onStarted(exam.id)}
          />
        ) : (
          <p class="exam-loading">불러오는 중…</p>
        )}
      </main>
    </div>
  );
}
