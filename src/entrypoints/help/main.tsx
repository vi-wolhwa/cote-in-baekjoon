/**
 * Help page (#80) entry: reads help.html?q=... and #{id}, and keeps the search in the URL
 * so reloading or sharing the page shows the same results. The page is HelpPage.tsx.
 */
import { render } from 'preact';
import { describeBrowser } from '@/shared/report';
import { HelpPage, sectionFromHash } from './HelpPage';
import '@/shared/app-theme.css';
import './style.css';

/** The longest query taken from the URL, like the search box's maxlength. */
const MAX_QUERY = 100;

function keepQueryInUrl(query: string) {
  const url = new URL(location.href);
  const current = url.searchParams.get('q') ?? '';
  if (current === query) return;
  if (query) {
    url.searchParams.set('q', query);
    // A search replaces the #section the page was opened at.
    url.hash = '';
  } else {
    url.searchParams.delete('q');
  }
  history.replaceState(null, '', url);
}

const root = document.getElementById('app');
if (root) {
  render(
    <HelpPage
      context={{
        version: browser.runtime.getManifest().version,
        browser: describeBrowser(navigator),
      }}
      iconUrl={browser.runtime.getURL('/icon/128.png')}
      initialQuery={(new URLSearchParams(location.search).get('q') ?? '').slice(0, MAX_QUERY)}
      initialSection={sectionFromHash(location.hash)}
      onQueryChange={keepQueryInUrl}
    />,
    root,
  );
}
