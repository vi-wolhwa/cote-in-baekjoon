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
