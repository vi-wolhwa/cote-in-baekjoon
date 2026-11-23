/**
 * Help page (#80): the frequently asked questions from src/shared/help-content.ts, opened
 * from the popup's 도움말 tab and the IDE's top bar. Each section links to the issue form.
 */
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { HELP_SECTIONS, HELP_TITLE, inlineParts } from '@/shared/help-content';
import { describeBrowser, issueUrl } from '@/shared/report';
import '@/shared/app-theme.css';
import './style.css';

/** Help text with its inline marks as elements; nothing is parsed as HTML. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((part, i) =>
        part.kind === 'code' ? (
          <code key={i}>{part.text}</code>
        ) : part.kind === 'strong' ? (
          <strong key={i}>{part.text}</strong>
        ) : part.kind === 'link' ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function Help() {
  const version = browser.runtime.getManifest().version;
  const context = { version, browser: describeBrowser(navigator) };

  // The page renders after load, so jump to the #section the popup linked to.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <main class="help">
      <header class="help-header">
        <img src={browser.runtime.getURL('/icon/48.png')} alt="" width={28} height={28} />
        <h1>{HELP_TITLE}</h1>
      </header>
      <nav class="card toc" aria-label="목차">
        <ul class="rows">
          {HELP_SECTIONS.map((s) => (
            <li key={s.id}>
              <a class="row" href={`#${s.id}`}>
                <span class="row-label">{s.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {HELP_SECTIONS.map((section) => (
        <section
          key={section.id}
          id={section.id}
          class="card faq"
          aria-labelledby={`${section.id}-title`}
        >
          <h2 id={`${section.id}-title`}>
            <a href={`#${section.id}`}>{section.title}</a>
          </h2>
          {section.intro && (
            <p>
              <Inline text={section.intro} />
            </p>
          )}
          {section.items.length > 0 && (
            <ul>
              {section.items.map((item) => (
                <li key={item}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          )}
          {section.outro && (
            <p>
              <Inline text={section.outro} />
            </p>
          )}
          <p class="faq-report">
            <a
              href={issueUrl(section.report, context)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="report-link"
            >
              해결되지 않았나요? 신고하기
            </a>
          </p>
        </section>
      ))}
      <footer class="help-footer">코딩테스트 in 백준 v{version}</footer>
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<Help />, root);
