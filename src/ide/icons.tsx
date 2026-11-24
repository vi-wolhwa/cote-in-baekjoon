/**
 * Line icons drawn for this extension (no icon font, no third-party icon set). They use
 * `currentColor`, so CSS sets their color. All are decorative: the button around each one
 * carries the accessible name.
 */
import type { ComponentChildren } from 'preact';

function Icon({ size = 20, children }: { size?: number; children: ComponentChildren }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Stopwatch for the sidebar timer. */
export const TimerIcon = () => (
  <Icon>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M10 2.5h4M12 2.5v3.5M18 6.5l1.5-1.5" />
    <path d="M12 13.5V9.5" />
  </Icon>
);

export const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
);

export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const BackArrowIcon = () => (
  <Icon size={16}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

/** '다시 볼 문제' in the mock exam. */
export const FlagIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 21V4M6 4h11l-2.5 4L17 12H6" />
  </Icon>
);

export const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const CrossIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const DashIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M7 12h10" />
  </Icon>
);

/** Hourglass for the exam's remaining time. */
export const HourglassIcon = () => (
  <Icon>
    <path d="M7 3h10M7 21h10M8 3c0 4 4 6 4 9s-4 5-4 9M16 3c0 4-4 6-4 9s4 5 4 9" />
  </Icon>
);

/** '새로 고침' in the 제출 기록 tab. */
export const RefreshIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
  </Icon>
);

/** Opens a page on Baekjoon in a new tab. */
export const ExternalIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);

export const ChevronIcon = ({ size = 16, left = false }: { size?: number; left?: boolean }) => (
  <Icon size={size}>
    <path d={left ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </Icon>
);

/** A source the viewer cannot open. */
export const LockIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

/** A source the viewer can open. */
export const CodeIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
  </Icon>
);

export const CopyIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </Icon>
);

/** '편집기로 불러오기'. */
export const ImportIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);
