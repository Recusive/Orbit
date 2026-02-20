/**
 * ResizeHandle - Draggable resize handle for panels
 *
 * NOTE: Handle dimensions come from @/lib/utils/constants.
 * To change handle width or hover width, update RESIZE_HANDLE in constants.ts.
 */
import { useCallback, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import type { FC, KeyboardEvent } from 'react';

import { cn, PANEL_SIZES, RESIZE_HANDLE } from '@/lib/utils';
import { useUIStore } from '@/stores/ui/ui-store';

/** Keyboard resize step in pixels */
const KEYBOARD_STEP = 10;
const KEYBOARD_STEP_LARGE = 50;

/**
 * Get panel constraints from PANEL_SIZES for consistency.
 * 'review' maps to PANEL_SIZES.review, 'bottom' maps to PANEL_SIZES.terminal.
 */
function getPanelConstraints(target: 'review' | 'bottom'): { min: number; max: number } {
  const panelSizes = target === 'review' ? PANEL_SIZES.review : PANEL_SIZES.terminal;
  return { min: panelSizes.min, max: panelSizes.max };
}

interface ResizeHandleProps {
  readonly direction: 'horizontal' | 'vertical';
  readonly target: 'review' | 'bottom';
  /** When true, hides the persistent separator line — handle is invisible until hovered */
  readonly borderless?: boolean;
  /** Override the handle's layout dimension (width for vertical, height for horizontal).
   *  Defaults to RESIZE_HANDLE.width (1px). Use CONTENT_CARD.gap to fill an inter-card gap. */
  readonly size?: number;
  /** Called on every rAF frame during drag with the clamped value — use for direct DOM updates.
   *  When provided, Zustand store is only updated on mouseup (not every frame). */
  readonly onDrag?: (value: number) => void;
  /** Optional dynamic max constraint — called once at drag start. Overrides the static
   *  PANEL_SIZES max, allowing the max to depend on runtime layout (e.g., available space
   *  minus sibling margins in a flex container). */
  readonly getMax?: () => number;
  /** Called once on mouseup after the final value is committed to the store.
   *  Use to restore CSS transitions that were disabled during drag. */
  readonly onDragEnd?: () => void;
}

export const ResizeHandle: FC<ResizeHandleProps> = ({
  direction,
  target,
  borderless = false,
  size,
  onDrag,
  getMax,
  onDragEnd,
}) => {
  // Use useShallow to prevent re-renders when unrelated store state changes
  const { setReviewPanelWidth, setBottomPanelHeight, reviewPanelWidth, bottomPanelHeight } =
    useUIStore(
      useShallow((s) => ({
        setReviewPanelWidth: s.setReviewPanelWidth,
        setBottomPanelHeight: s.setBottomPanelHeight,
        reviewPanelWidth: s.reviewPanelWidth,
        bottomPanelHeight: s.bottomPanelHeight,
      }))
    );
  const startValueRef = useRef(0);
  const dragValueRef = useRef(0);
  const rafRef = useRef(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startPos = direction === 'vertical' ? e.clientX : e.clientY;
    const currentValue = target === 'review' ? reviewPanelWidth : bottomPanelHeight;
    startValueRef.current = currentValue;
    dragValueRef.current = currentValue;
    const constraints = getPanelConstraints(target);
    // Compute dynamic max ONCE at drag start — stays valid for the entire drag
    // because container dimensions don't change mid-drag (sidebar/panels are fixed).
    const effectiveMax = getMax ? Math.min(constraints.max, getMax()) : constraints.max;
    const setValue = target === 'review' ? setReviewPanelWidth : setBottomPanelHeight;

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      const delta = startPos - (direction === 'vertical' ? moveEvent.clientX : moveEvent.clientY);
      const clamped = Math.max(
        constraints.min,
        Math.min(effectiveMax, startValueRef.current + delta)
      );
      dragValueRef.current = clamped;

      if (onDrag) {
        // Batch DOM updates via rAF — skip React entirely during drag
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          onDrag(clamped);
        });
      } else {
        // Fallback: update store directly (original behavior)
        setValue(clamped);
      }
    };

    const handleMouseUp = (): void => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      cancelAnimationFrame(rafRef.current);
      // Commit final value to store (single render on mouseup)
      setValue(dragValueRef.current);
      onDragEnd?.();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // Keyboard resize handler for accessibility
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
      const constraints = getPanelConstraints(target);
      // Compute dynamic max on each keypress — layout may have changed since last press
      const effectiveMax = getMax ? Math.min(constraints.max, getMax()) : constraints.max;
      const currentValue = target === 'review' ? reviewPanelWidth : bottomPanelHeight;
      const setValue = target === 'review' ? setReviewPanelWidth : setBottomPanelHeight;

      let newValue = currentValue;

      if (direction === 'vertical') {
        // Vertical handle: Left/Right arrows resize
        if (e.key === 'ArrowLeft') {
          newValue = Math.max(constraints.min, currentValue - step);
        } else if (e.key === 'ArrowRight') {
          newValue = Math.min(effectiveMax, currentValue + step);
        } else if (e.key === 'Home') {
          newValue = constraints.min;
        } else if (e.key === 'End') {
          newValue = effectiveMax;
        } else {
          return; // Don't prevent default for other keys
        }
      } else {
        // Horizontal handle: Up/Down arrows resize
        if (e.key === 'ArrowUp') {
          newValue = Math.min(effectiveMax, currentValue + step);
        } else if (e.key === 'ArrowDown') {
          newValue = Math.max(constraints.min, currentValue - step);
        } else if (e.key === 'Home') {
          newValue = constraints.min;
        } else if (e.key === 'End') {
          newValue = effectiveMax;
        } else {
          return; // Don't prevent default for other keys
        }
      }

      e.preventDefault();
      setValue(newValue);
    },
    [
      direction,
      target,
      reviewPanelWidth,
      bottomPanelHeight,
      setReviewPanelWidth,
      setBottomPanelHeight,
      getMax,
    ]
  );

  const isVertical = direction === 'vertical';
  // Container dimension — either explicit `size` prop or default 1px
  const containerSize = size ?? RESIZE_HANDLE.width;
  const handleSize = isHovered || isFocused ? RESIZE_HANDLE.hoverWidth : RESIZE_HANDLE.width;
  const currentValue = target === 'review' ? reviewPanelWidth : bottomPanelHeight;
  const constraints = getPanelConstraints(target);

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-valuenow={currentValue}
      aria-valuemin={constraints.min}
      aria-valuemax={constraints.max}
      aria-label={`Resize ${target} panel. Use ${isVertical ? 'left/right' : 'up/down'} arrow keys to adjust.`}
      tabIndex={0}
      className={cn(
        'group relative shrink-0 flex items-center justify-center',
        'focus:outline-none focus-visible:z-10',
        isVertical ? 'h-full cursor-col-resize' : 'w-full cursor-row-resize'
      )}
      style={isVertical ? { width: containerSize } : { height: containerSize }}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onFocus={
        borderless
          ? undefined
          : () => {
              setIsFocused(true);
            }
      }
      onBlur={
        borderless
          ? undefined
          : () => {
              setIsFocused(false);
            }
      }
      onMouseEnter={
        borderless
          ? undefined
          : () => {
              setIsHovered(true);
            }
      }
      onMouseLeave={
        borderless
          ? undefined
          : () => {
              setIsHovered(false);
            }
      }
    >
      {/* Persistent separator line — hidden in borderless mode */}
      {!borderless ? (
        <div
          className="bg-border transition-colors duration-100"
          style={
            isVertical
              ? { width: RESIZE_HANDLE.width, height: '100%' }
              : { height: RESIZE_HANDLE.width, width: '100%' }
          }
        />
      ) : null}
      {/* Hover indicator line — only for non-borderless handles.
       *  Borderless handles (inter-card gaps) show no visual feedback — just the resize cursor. */}
      {!borderless ? (
        <div
          className={cn(
            'absolute bg-primary transition-opacity duration-100 opacity-0 group-hover:opacity-100',
            isFocused && 'opacity-100'
          )}
          style={
            isVertical
              ? { width: handleSize, height: '100%' }
              : { height: handleSize, width: '100%' }
          }
        />
      ) : null}
    </div>
  );
};
