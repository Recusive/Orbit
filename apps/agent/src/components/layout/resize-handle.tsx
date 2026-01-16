/**
 * ResizeHandle - Draggable resize handle for panels
 *
 * NOTE: Handle dimensions come from @/lib/utils/constants.
 * To change handle width or hover width, update RESIZE_HANDLE in constants.ts.
 */
import { useCallback, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import type { FC, KeyboardEvent } from 'react';

import { PANEL_SIZES, RESIZE_HANDLE } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/utils';
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
}

export const ResizeHandle: FC<ResizeHandleProps> = ({ direction, target }) => {
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
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startPos = direction === 'vertical' ? e.clientX : e.clientY;
    startValueRef.current = target === 'review' ? reviewPanelWidth : bottomPanelHeight;

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      if (target === 'review') {
        const delta = startPos - moveEvent.clientX;
        setReviewPanelWidth(startValueRef.current + delta);
      } else {
        const delta = startPos - moveEvent.clientY;
        setBottomPanelHeight(startValueRef.current + delta);
      }
    };

    const handleMouseUp = (): void => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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
      const currentValue = target === 'review' ? reviewPanelWidth : bottomPanelHeight;
      const setValue = target === 'review' ? setReviewPanelWidth : setBottomPanelHeight;

      let newValue = currentValue;

      if (direction === 'vertical') {
        // Vertical handle: Left/Right arrows resize
        if (e.key === 'ArrowLeft') {
          newValue = Math.max(constraints.min, currentValue - step);
        } else if (e.key === 'ArrowRight') {
          newValue = Math.min(constraints.max, currentValue + step);
        } else if (e.key === 'Home') {
          newValue = constraints.min;
        } else if (e.key === 'End') {
          newValue = constraints.max;
        } else {
          return; // Don't prevent default for other keys
        }
      } else {
        // Horizontal handle: Up/Down arrows resize
        if (e.key === 'ArrowUp') {
          newValue = Math.min(constraints.max, currentValue + step);
        } else if (e.key === 'ArrowDown') {
          newValue = Math.max(constraints.min, currentValue - step);
        } else if (e.key === 'Home') {
          newValue = constraints.min;
        } else if (e.key === 'End') {
          newValue = constraints.max;
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
    ]
  );

  const isVertical = direction === 'vertical';
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
      style={isVertical ? { width: RESIZE_HANDLE.width } : { height: RESIZE_HANDLE.width }}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        setIsFocused(true);
      }}
      onBlur={() => {
        setIsFocused(false);
      }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      {/* Persistent separator line */}
      <div
        className="bg-border transition-colors duration-100"
        style={
          isVertical
            ? { width: RESIZE_HANDLE.width, height: '100%' }
            : { height: RESIZE_HANDLE.width, width: '100%' }
        }
      />
      {/* Hover indicator line */}
      <div
        className="absolute bg-primary transition-opacity duration-100"
        style={{
          opacity: isHovered ? 1 : 0,
          ...(isVertical
            ? { width: handleSize, height: '100%' }
            : { height: handleSize, width: '100%' }),
        }}
      />
    </div>
  );
};
