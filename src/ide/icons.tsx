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

export const GearIcon = () => (
  <Icon>
    <path d="M19 10.3L21.4 10.7L21.4 13.3L19 13.7L18.2 15.7L19.6 17.7L17.7 19.6L15.7 18.2L13.7 19L13.3 21.4L10.7 21.4L10.3 19L8.3 18.2L6.3 19.6L4.4 17.7L5.8 15.7L5 13.7L2.6 13.3L2.6 10.7L5 10.3L5.8 8.3L4.4 6.3L6.3 4.4L8.3 5.8L10.3 5L10.7 2.6L13.3 2.6L13.7 5L15.7 5.8L17.7 4.4L19.6 6.3L18.2 8.3Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

/** Stopwatch for the sidebar timer. */
export const TimerIcon = () => (
  <Icon>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M10 2.5h4M12 2.5v3.5M18 6.5l1.5-1.5" />
    <path d="M12 13.5V9.5" />
  </Icon>
);

export const MoonIcon = () => (
  <Icon size={18}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
);

export const SunIcon = () => (
  <Icon size={18}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon size={24}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const BackArrowIcon = () => (
  <Icon size={16}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
