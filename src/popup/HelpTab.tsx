import type { FunctionComponent, JSX } from 'preact';
import { HELP_SECTIONS } from '@/shared/help-content';
import {
  AlertIcon,
  BulbIcon,
  ChevronIcon,
  ClockIcon,
  CodeIcon,
  DocIcon,
  HelpIcon,
  SearchIcon,
} from './icons';

type Icon = FunctionComponent<{ size?: number }>;

/** Icon and colour of each FAQ row's square; unknown sections get the help icon. */
const FAQ_ICONS: Record<string, { icon: Icon; tone: string }> = {
  'no-button': { icon: SearchIcon, tone: 'blue' },
  'auto-submit': { icon: AlertIcon, tone: 'yellow' },
  'judge-result': { icon: ClockIcon, tone: 'green' },
  'run-diff': { icon: CodeIcon, tone: 'purple' },
  'code-lost': { icon: DocIcon, tone: 'red' },
  'slow-start': { icon: ClockIcon, tone: 'teal' },
};

export interface HelpProps {
  bugUrl: string;
  featureUrl: string;
  /** Opens an extension page or a web page in a new tab. */
  onOpen: (url: string) => void;
  helpUrl: (sectionId: string) => string;
  noticesUrl: string;
}

export function HelpTab({ bugUrl, featureUrl, onOpen, helpUrl, noticesUrl }: HelpProps) {
  return (
    <>
      <section class="report-card">
        <h2 class="report-title">문제가 생겼나요?</h2>
        <p class="report-sub">버전과 브라우저 정보는 자동으로 채워져요.</p>
        <a
          class="report-button"
          href={bugUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            onOpen(bugUrl);
          }}
        >
          문제 신고하기
        </a>
      </section>

      <section class="card list-card" aria-labelledby="faq-title">
        <h2 id="faq-title" class="card-title">
          자주 묻는 질문
        </h2>
        <ul class="rows">
          {HELP_SECTIONS.map((section) => {
            const { icon: SectionIcon, tone } = FAQ_ICONS[section.id] ?? {
              icon: HelpIcon,
              tone: 'blue',
            };
            return (
              <li key={section.id}>
                <LinkRow
                  href={helpUrl(section.id)}
                  onOpen={onOpen}
                  label={section.title}
                  icon={<SectionIcon size={15} />}
                  tone={tone}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section class="card list-card">
        <ul class="rows">
          <li>
            <LinkRow
              href={featureUrl}
              onOpen={onOpen}
              label="기능 제안하기"
              icon={<BulbIcon size={15} />}
              tone="yellow"
            />
          </li>
          <li>
            <LinkRow
              href={noticesUrl}
              onOpen={onOpen}
              label="오픈소스 라이선스"
              icon={<DocIcon size={15} />}
              tone="gray"
            />
          </li>
        </ul>
      </section>
    </>
  );
}

function LinkRow(props: {
  href: string;
  label: string;
  icon: JSX.Element;
  tone: string;
  onOpen: (url: string) => void;
}) {
  return (
    <a
      class="row"
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        props.onOpen(props.href);
      }}
    >
      <span class={`row-icon tone-${props.tone}`}>{props.icon}</span>
      <span class="row-label">{props.label}</span>
      <span class="row-chevron">
        <ChevronIcon size={16} />
      </span>
    </a>
  );
}
