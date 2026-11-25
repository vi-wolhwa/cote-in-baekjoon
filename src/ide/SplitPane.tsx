import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';

/** Narrowest the problem pane gets: it could be dragged away entirely before. */
export const PROBLEM_MIN_PX = 320;
/** Narrowest the editor side next to it gets. */
export const EDITOR_MIN_PX = 360;
/** A drag this close to the snap size lands on it. */
export const SNAP_RANGE_PX = 12;

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
  /** A size of the first pane, in pixels, that dragging snaps to and shows (권장 너비). */
  snapFirstPx?: number;
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
  snapFirstPx,
  first,
  second,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const horizontal = direction === 'horizontal';
  /** The drag is resting on the snap size. */
  const [snapped, setSnapped] = useState(false);

  /** `px` pulled to the snap size when it is near. */
  const snap = (px: number): number => {
    const near = snapFirstPx !== undefined && Math.abs(px - snapFirstPx) <= SNAP_RANGE_PX;
    setSnapped(near);
    return near ? (snapFirstPx as number) : px;
  };

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
      const pos = snap((horizontal ? e.clientX : e.clientY) - start);
      onResize(clamp((pos / total) * 100, total));
    };
    const up = () => {
      setSnapped(false);
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
    let next = size + (event.key === inc ? step : -step);
    // A step over the snap size stops on it first.
    if (snapFirstPx !== undefined && total > 0) {
      const at = (snapFirstPx / total) * 100;
      if ((size < at && next > at) || (size > at && next < at)) next = at;
    }
    onResize(clamp(next, total));
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
        data-snapped={snapped || undefined}
      >
        {snapped && <span class="split-snap-label">권장 너비</span>}
      </div>
      <div class="split-pane split-pane-rest">{second}</div>
    </div>
  );
}
