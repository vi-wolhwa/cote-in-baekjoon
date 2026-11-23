/**
 * Help page (#80): search box with suggested keywords, then the frequently asked questions
 * from src/shared/help-content.ts as cards. Opened from the popup's 도움말 tab
 * (help.html#{id}) and the IDE's top bar; help.html?q=... opens with a search filled in.
 */
import type { FunctionComponent } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  AlertIcon,
  BulbIcon,
  ChevronIcon,
  ClockIcon,
  CodeIcon,
  CrossIcon,
  DocIcon,
  HelpIcon,
  SearchIcon,
} from '@/popup/icons';
import { HELP_SUGGESTIONS, HELP_TITLE } from '@/shared/help-content';
import { normalize, queryTerms, searchHelp, type HelpHit } from '@/shared/help-search';
import { issueUrl, REPO_URL, type ReportContext } from '@/shared/report';
import { Inline, Marked } from './Highlight';

type Icon = FunctionComponent<{ size?: number }>;

/** Icon and colour of each topic's square, as in the popup's 도움말 tab. */
const TOPIC_ICONS: Record<string, { icon: Icon; tone: string }> = {
  'no-button': { icon: SearchIcon, tone: 'blue' },
  'auto-submit': { icon: AlertIcon, tone: 'yellow' },
  'judge-result': { icon: ClockIcon, tone: 'green' },
  'run-diff': { icon: CodeIcon, tone: 'purple' },
  'code-lost': { icon: DocIcon, tone: 'red' },
  'slow-start': { icon: ClockIcon, tone: 'teal' },
};

const ListIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

/** How long a section linked with #id stays highlighted. */
const FLASH_MS = 1600;

export interface HelpPageProps {
  /** Version and browser for the prefilled issue forms. */
  context: ReportContext;
  iconUrl: string;
  /** THIRD_PARTY_NOTICES.txt, linked in the footer next to the version. */
  noticesUrl?: string;
  /** From help.html?q=... */
  initialQuery?: string;
  /** From help.html#{id}: scrolled to and briefly highlighted. */
  initialSection?: string;
  /** The query after every change, so the page URL can keep it. */
  onQueryChange?: (query: string) => void;
}

export function HelpPage({
  context,
  iconUrl,
  noticesUrl,
  initialQuery = '',
  initialSection = '',
  onQueryChange,
}: HelpPageProps) {
  const [query, setQuery] = useState(initialQuery);
  const [flashId, setFlashId] = useState('');
  const [stuck, setStuck] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  const terms = useMemo(() => queryTerms(query), [query]);
  const hits = useMemo(() => searchHelp(query), [query]);
  const searching = terms.length > 0;
  const bugUrl = issueUrl('bug', context);
  const featureUrl = issueUrl('feature', context);

  const clear = () => {
    setQuery('');
    input.current?.focus();
  };

  useEffect(() => onQueryChange?.(query), [query, onQueryChange]);

  // #id from the popup: the page renders after load, so scroll there ourselves.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const jump = (id: string) => {
      const target = id ? document.getElementById(id) : null;
      if (!target?.classList.contains('faq')) return;
      target.scrollIntoView({ block: 'start' });
      setFlashId(id);
      clearTimeout(timer);
      timer = setTimeout(() => setFlashId(''), FLASH_MS);
    };
    jump(initialSection);
    const onHash = () => jump(sectionFromHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('hashchange', onHash);
    };
  }, [initialSection]);

  // "/" focuses the search box, Esc clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        input.current?.focus();
      } else if (e.key === 'Escape' && input.current?.value) {
        e.preventDefault();
        setQuery('');
        input.current.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // A shadow under the search bar once it sticks to the top.
  useEffect(() => {
    const onScroll = () => setStuck((bar.current?.getBoundingClientRect().top ?? 1) <= 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div class="help-page">
      <header class="hero">
        <div class="wrap hero-inner">
          <img class="hero-logo" src={iconUrl} alt="" width={48} height={48} />
          <div>
            <h1>도움말</h1>
            <p class="hero-sub">궁금한 점을 검색하거나 아래 키워드를 눌러 바로 찾아보세요.</p>
          </div>
        </div>
      </header>

      <div ref={bar} class={`search-bar${stuck ? ' stuck' : ''}`}>
        <form class="wrap" role="search" onSubmit={(e) => e.preventDefault()}>
          <div class="search">
            <label for="help-search" class="sr-only">
              도움말 검색
            </label>
            <span class="search-icon">
              <SearchIcon size={20} />
            </span>
            <input
              id="help-search"
              ref={input}
              type="search"
              placeholder="무엇이 궁금한가요? 예: 자동 제출, 시간 초과"
              autocomplete="off"
              spellcheck={false}
              enterKeyHint="search"
              maxLength={100}
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            {query ? (
              <button type="button" class="search-clear" aria-label="검색어 지우기" onClick={clear}>
                <CrossIcon size={16} />
              </button>
            ) : (
              <kbd class="search-key" title="/ 키로 검색창으로 이동">
                /
              </kbd>
            )}
          </div>
        </form>
      </div>

      <main class="wrap help">
        <section class="chips" aria-label="추천 키워드">
          {HELP_SUGGESTIONS.map((word) => {
            const pressed = normalize(query) === normalize(word);
            return (
              <button
                key={word}
                type="button"
                class="chip"
                aria-pressed={pressed}
                onClick={() => setQuery(pressed ? '' : word)}
              >
                {word}
              </button>
            );
          })}
        </section>

        <div class="list-head">
          <p class="list-status" aria-live="polite" data-testid="result-count">
            {searching ? (hits.length ? `${hits.length}개 찾음` : '검색 결과가 없어요') : ''}
          </p>
          {searching ? (
            <button type="button" class="text-button" onClick={clear}>
              전체 보기
            </button>
          ) : (
            <p class="list-label">{HELP_TITLE}</p>
          )}
        </div>

        <div class="results" aria-label="도움말 목록" role="region">
          {hits.map((hit) => (
            <Topic
              key={hit.section.id}
              hit={hit}
              terms={terms}
              flash={flashId === hit.section.id}
              context={context}
            />
          ))}
          {searching && !hits.length && (
            <section class="card empty" data-testid="empty">
              <span class="empty-icon">
                <SearchIcon size={24} />
              </span>
              <h2>찾는 내용이 없나요?</h2>
              <p>다른 낱말로 찾아보거나 알려 주세요. 버전과 브라우저 정보는 자동으로 채워져요.</p>
              <div class="empty-actions">
                <a class="report-button" href={bugUrl} target="_blank" rel="noopener noreferrer">
                  문제 신고하기
                </a>
                <a class="ghost-button" href={featureUrl} target="_blank" rel="noopener noreferrer">
                  기능 제안하기
                </a>
              </div>
            </section>
          )}
        </div>

        {!(searching && !hits.length) && (
          <section class="support" aria-labelledby="support-title">
            <div class="support-main">
              <h2 id="support-title">아직 해결되지 않았나요?</h2>
              <p>버전과 브라우저 정보는 자동으로 채워져요.</p>
              <a
                class="report-button"
                href={bugUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="support-report"
              >
                문제 신고하기
              </a>
            </div>
            <ul class="rows support-links">
              <LinkRow href={featureUrl} label="기능 제안하기" tone="yellow" icon={BulbIcon} />
              <LinkRow
                href={`${REPO_URL}/issues`}
                label="GitHub 이슈 목록 보기"
                tone="gray"
                icon={ListIcon}
              />
            </ul>
          </section>
        )}

        <footer class="help-footer">
          코딩테스트 in 백준 v{context.version}
          {noticesUrl && (
            <>
              <span aria-hidden="true"> · </span>
              <a href={noticesUrl} target="_blank" rel="noopener noreferrer">
                오픈소스 라이선스
              </a>
            </>
          )}
        </footer>
      </main>
    </div>
  );
}

function Topic(props: {
  hit: HelpHit;
  terms: readonly string[];
  flash: boolean;
  context: ReportContext;
}) {
  const { section, items } = props.hit;
  const { terms } = props;
  const [expanded, setExpanded] = useState(false);
  // A new query shows the filtered items again.
  useEffect(() => setExpanded(false), [terms]);
  const { icon: TopicIcon, tone } = TOPIC_ICONS[section.id] ?? { icon: HelpIcon, tone: 'blue' };
  const shown = expanded ? section.items : items;
  const hidden = section.items.length - shown.length;
  return (
    <section
      id={section.id}
      class={`card faq${props.flash ? ' flash' : ''}`}
      aria-labelledby={`${section.id}-title`}
    >
      <div class="faq-head">
        <span class={`faq-icon tone-${tone}`}>
          <TopicIcon size={18} />
        </span>
        <h2 id={`${section.id}-title`}>
          <a href={`#${section.id}`}>
            <Marked text={section.title} terms={terms} />
          </a>
        </h2>
      </div>
      {section.intro && (
        <p class="faq-text">
          <Inline text={section.intro} terms={terms} />
        </p>
      )}
      {shown.length > 0 && (
        <ul class="faq-items">
          {shown.map((item) => (
            <li key={item}>
              <Inline text={item} terms={terms} />
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button type="button" class="text-button faq-more" onClick={() => setExpanded(true)}>
          이 주제 전체 보기 (+{hidden})
        </button>
      )}
      {section.outro && (
        <p class="faq-text">
          <Inline text={section.outro} terms={terms} />
        </p>
      )}
      <a
        class="faq-report"
        href={issueUrl(section.report, props.context)}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="report-link"
      >
        <span class="faq-report-ask">해결되지 않았나요?</span> 신고하기
        <ChevronIcon size={14} />
      </a>
    </section>
  );
}

function LinkRow(props: { href: string; label: string; tone: string; icon: Icon }) {
  const RowIcon = props.icon;
  return (
    <li>
      <a class="row" href={props.href} target="_blank" rel="noopener noreferrer">
        <span class={`row-icon tone-${props.tone}`}>
          <RowIcon size={15} />
        </span>
        <span class="row-label">{props.label}</span>
        <span class="row-chevron">
          <ChevronIcon size={16} />
        </span>
      </a>
    </li>
  );
}

/** Whether a key press goes into a text field rather than the page. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** The section id in a location hash ("#run-diff"), or "" when it cannot be decoded. */
export function sectionFromHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return '';
  }
}
