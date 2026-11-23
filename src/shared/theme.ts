/**
 * IDE color theme (settings dialog in the right sidebar). Kept under `ui:theme` in
 * `storage.local` and included in backups.
 */
export type Theme = 'dark' | 'light';

export const THEMES: readonly Theme[] = ['dark', 'light'];
export const DEFAULT_THEME: Theme = 'dark';
export const THEME_KEY = 'ui:theme';

export function isTheme(v: unknown): v is Theme {
  return v === 'dark' || v === 'light';
}

/** A stored value as a theme; anything else falls back to the default. */
export function toTheme(v: unknown): Theme {
  return isTheme(v) ? v : DEFAULT_THEME;
}

/** Sets `data-theme` on the IDE's <html>; style.css keys the light colors on it. */
export function applyTheme(root: HTMLElement, theme: Theme) {
  root.dataset.theme = theme;
}
