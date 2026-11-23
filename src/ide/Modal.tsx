import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer: ComponentChildren;
  wide?: boolean;
}

/** Accessible dialog built on <dialog> (Escape closes, focus is trapped by the browser). */
export function Modal({ title, onClose, children, footer, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      class={`modal${wide ? ' modal-wide' : ''}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id="modal-title" class="modal-title">
        {title}
      </h2>
      <div class="modal-body">{children}</div>
      <div class="modal-footer">{footer}</div>
    </dialog>
  );
}
