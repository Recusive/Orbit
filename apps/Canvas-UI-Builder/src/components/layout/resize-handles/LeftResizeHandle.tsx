/**
 * LeftResizeHandle - Resize handle for the left sidebar
 *
 * Based on SidebarResizeHandle from Agent app.
 * Updates DOM directly during drag for smooth, lag-free resizing.
 */
import { useCallback, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import type { FC, KeyboardEvent } from 'react';

import { cn, PANEL_SIZES, RESIZE_HANDLE, SIDEBAR } from '@/lib/utils';
import { useIsLeftSidebarCollapsed, useUIStore } from '@/stores/ui/ui-store';

/** Keyboard resize step in pixels */
const KEYBOARD_STEP = 10;
const KEYBOARD_STEP_LARGE = 50;

/**
 * LeftResizeHandle - A smooth resize handle for the left sidebar
 *
 * Key features:
 * - Updates DOM directly during drag for smooth, lag-free resizing
 * - Only syncs to React state on mouseup (prevents re-render jank)
 * - Enforces min 240px, max 400px when expanded
 * - Snap-to-collapse: drag below snapThreshold to collapse to 35px
 * - Wide hit area (8px) for easy targeting, thin visual line (1px)
 * - Orange highlight persists during drag
 */
export const LeftResizeHandle: FC = () => {
  const { leftSidebarWidth, setLeftSidebarWidth } = useUIStore(
    useShallow((s) => ({
      leftSidebarWidth: s.leftSidebarWidth,
      setLeftSidebarWidth: s.setLeftSidebarWidth,
    }))
  );
  const isCollapsed = useIsLeftSidebarCollapsed();

  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const currentWidthRef = useRef(leftSidebarWidth);
  const isDraggingRef = useRef(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (isCollapsed) return;

      const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
      let newWidth = leftSidebarWidth;

      if (e.key === 'ArrowLeft') {
        newWidth = Math.max(PANEL_SIZES.sidebar.minUsable, leftSidebarWidth - step);
        if (newWidth < PANEL_SIZES.sidebar.snapThreshold) {
          newWidth = SIDEBAR.collapsed;
        }
      } else if (e.key === 'ArrowRight') {
        newWidth = Math.min(PANEL_SIZES.sidebar.max, leftSidebarWidth + step);
      } else if (e.key === 'Home') {
        newWidth = PANEL_SIZES.sidebar.minUsable;
      } else if (e.key === 'End') {
        newWidth = PANEL_SIZES.sidebar.max;
      } else {
        return;
      }

      e.preventDefault();
      setLeftSidebarWidth(newWidth);
    },
    [isCollapsed, leftSidebarWidth, setLeftSidebarWidth]
  );

  const handleMouseDown = (e: React.MouseEvent): void => {
    if (isCollapsed) return;

    e.preventDefault();

    const sidebarElement = document.querySelector<HTMLElement>('[data-sidebar="canvas-left"]');
    if (!sidebarElement) return;

    isDraggingRef.current = true;
    setIsDragging(true);
    currentWidthRef.current = leftSidebarWidth;

    const startX = e.clientX;
    const startWidth = leftSidebarWidth;

    const originalTransition = sidebarElement.style.transition;
    sidebarElement.style.transition = 'none';

    let wasInSnapZone = false;

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      const delta = moveEvent.clientX - startX;
      let newWidth = startWidth + delta;

      newWidth = Math.min(PANEL_SIZES.sidebar.max, newWidth);

      const isInSnapZone = newWidth < PANEL_SIZES.sidebar.snapThreshold;

      if (isInSnapZone !== wasInSnapZone) {
        wasInSnapZone = isInSnapZone;
        setLeftSidebarWidth(isInSnapZone ? SIDEBAR.collapsed : PANEL_SIZES.sidebar.minUsable);
      }

      if (isInSnapZone) {
        sidebarElement.style.width = `${String(SIDEBAR.collapsed)}px`;
        currentWidthRef.current = SIDEBAR.collapsed;
      } else if (newWidth < PANEL_SIZES.sidebar.minUsable) {
        sidebarElement.style.width = `${String(PANEL_SIZES.sidebar.minUsable)}px`;
        currentWidthRef.current = newWidth;
      } else {
        sidebarElement.style.width = `${String(newWidth)}px`;
        currentWidthRef.current = newWidth;
      }
    };

    const cleanup = (): void => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;
      setIsDragging(false);

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', cleanup);
      window.removeEventListener('blur', cleanup);

      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      sidebarElement.style.transition = originalTransition;

      const finalWidth = currentWidthRef.current;
      if (finalWidth < PANEL_SIZES.sidebar.snapThreshold) {
        setLeftSidebarWidth(SIDEBAR.collapsed);
      } else if (finalWidth < PANEL_SIZES.sidebar.minUsable) {
        setLeftSidebarWidth(PANEL_SIZES.sidebar.minUsable);
      } else {
        setLeftSidebarWidth(finalWidth);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', cleanup);
    window.addEventListener('blur', cleanup);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={leftSidebarWidth}
      aria-valuemin={PANEL_SIZES.sidebar.minUsable}
      aria-valuemax={PANEL_SIZES.sidebar.max}
      aria-label="Resize left sidebar. Use left/right arrow keys to adjust."
      tabIndex={isCollapsed ? -1 : 0}
      className={cn(
        'group relative shrink-0 h-full',
        'focus:outline-none focus-visible:z-10',
        isCollapsed ? 'cursor-default' : 'cursor-col-resize'
      )}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        setIsFocused(true);
      }}
      onBlur={() => {
        setIsFocused(false);
      }}
      style={{ width: RESIZE_HANDLE.width, padding: '0 4px', margin: '0 -4px' }}
    >
      {/* Persistent separator line */}
      <div className="h-full bg-border" style={{ width: RESIZE_HANDLE.width }} />
      {/* Hover/Active indicator line */}
      {!isCollapsed && (
        <div
          className={cn(
            'absolute inset-y-0 left-1/2 -translate-x-1/2 bg-primary transition-opacity duration-100',
            isDragging || isFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
          style={{ width: RESIZE_HANDLE.hoverWidth }}
        />
      )}
    </div>
  );
};
