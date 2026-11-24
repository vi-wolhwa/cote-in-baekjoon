import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

/** Narrowest the problem pane gets: it could be dragged away entirely before. */
export const PROBLEM_MIN_PX = 320;
/** Narrowest the editor side next to it gets. */
export const EDITOR_MIN_PX = 360;

interface Props {
  direction: 'horizontal' | 'vertical';
  /** Size of the first pane in percent. */
  size: number;
  onResize: (size: number) => void;
  onResizeEnd?: () => void;
  /** Minimum size of each pane in pixels. */
  minPx?: number;
  /** Minimum size of the first pane in pixels, when it needs more than minPx. */
  minFirstPx?: number;
  first: ComponentChildren;
  second: ComponentChildren;
}

/** Two panes with a draggable gutter between them (design spec §1). */
export function SplitPane({
  direction,
  size,
  onResize,
  onResizeEnd,
  minPx = 0,
  minFirstPx = minPx,
  first,
  second,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const horizontal = direction === 'horizontal';

  /** `pct` limited so both panes keep their minimum size in a split of `total` pixels. */
  const clamp = (pct: number, total: number) => {
    if (total <= 0) return Math.min(100, Math.max(0, pct));
    const low = (minFirstPx / total) * 100;
    const high = Math.max(low, 100 - (minPx / total) * 100);
    return Math.min(high, Math.max(low, pct));
  };

  const onPointerDown = (event: PointerEvent) => {
    const el = root.current;
    if (!el) return;
    event.preventDefault();
    const gutter = event.currentTarget as HTMLElement;
    gutter.setPointerCapture(event.pointerId);
    const rect = el.getBoundingClientRect();
    const total = horizontal ? rect.width : rect.height;
    const start = horizontal ? rect.left : rect.top;

    const move = (e: PointerEvent) => {
      const pos = (horizontal ? e.clientX : e.clientY) - start;
      onResize(clamp((pos / total) * 100, total));
    };
    const up = () => {
      gutter.removeEventListener('pointermove', move);
      gutter.removeEventListener('pointerup', up);
      onResizeEnd?.();
    };
    gutter.addEventListener('pointermove', move);
    gutter.addEventListener('pointerup', up);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 2;
    const dec = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const inc = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== dec && event.key !== inc) return;
    event.preventDefault();
    const rect = root.current?.getBoundingClientRect();
    const total = rect ? (horizontal ? rect.width : rect.height) : 0;
    onResize(clamp(size + (event.key === inc ? step : -step), total));
    onResizeEnd?.();
  };

  return (
    <div ref={root} class={`split split-${direction}`}>
      <div
        class="split-pane"
        style={{
          flexBasis: `${size}%`,
          // Also when the window shrinks or a saved size is smaller.
          [horizontal ? 'minWidth' : 'minHeight']: `${minFirstPx}px`,
        }}
      >
        {first}
      </div>
      <div
        class={`split-gutter split-gutter-${direction}`}
        role="separator"
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(size)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={horizontal ? '문제와 코드 영역 크기 조절' : '코드와 실행 결과 영역 크기 조절'}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
      <div class="split-pane split-pane-rest">{second}</div>
    </div>
  );
}
