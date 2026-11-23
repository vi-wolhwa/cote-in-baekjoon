/**
 * "설정" dialog from the sidebar gear (docs/design/ide-spec.md §10). It stays white in both
 * themes, like the reference screen. A choice applies at once; there is no save button.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { Theme } from '@/shared/theme';
import { CloseIcon, MoonIcon, SunIcon } from './icons';

interface Props {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onClose: () => void;
}

const OPTIONS = [
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
] as const;

export function SettingsDialog({ theme, onTheme, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      class="modal settings"
      aria-labelledby="settings-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header class="settings-header">
        <h2 id="settings-title" class="settings-title">
          설정
        </h2>
        <button type="button" class="settings-x" aria-label="설정 창 닫기" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      <div class="settings-body">
        <fieldset class="settings-field">
          <legend>
            테마
            <span class="settings-required" aria-hidden="true">
              *
            </span>
          </legend>
          <div class="theme-options">
            {OPTIONS.map(({ value, label, Icon }) => (
              <label key={value} class="theme-option">
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => onTheme(value)}
                />
                <Icon />
                {label}
              </label>
            ))}
          </div>
          <p class="settings-hint">ⓘ 배경화면 테마를 선택할 수 있습니다.</p>
        </fieldset>
      </div>
      <footer class="settings-footer">
        <button type="button" class="btn btn-light" onClick={onClose}>
          닫기
        </button>
      </footer>
    </dialog>
  );
}
