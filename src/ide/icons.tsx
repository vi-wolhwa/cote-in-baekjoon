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
