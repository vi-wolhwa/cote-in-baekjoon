/** Inline SVG icons for the popup and help page (no icon font, no CDN). 24×24 strokes. */
import type { ComponentChildren } from 'preact';

function Icon({ size = 20, children }: { size?: number; children: ComponentChildren }) {
  return (
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
      {children}
    </svg>
  );
}

type Props = { size?: number };

export const HomeIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </Icon>
);

/** Clipboard with a check: the '모의 시험' tab. */
export const ExamIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 4h6v3H9z" />
    <path d="M9 5.5H6v15h12v-15h-3" />
    <path d="M9 13.5l2 2 4-4" />
  </Icon>
);

export const BackupIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 17v3h16v-3" />
  </Icon>
);

export const HelpIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
    <path d="M12 17.5h.01" />
  </Icon>
);

export const CheckIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const CrossIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ClockIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const DotsIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" />
  </Icon>
);

export const CodeIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
  </Icon>
);

export const ChevronIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const SearchIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Icon>
);

export const BulbIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </Icon>
);

export const DocIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4M10 12h5M10 16h5" />
  </Icon>
);

export const AlertIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);
