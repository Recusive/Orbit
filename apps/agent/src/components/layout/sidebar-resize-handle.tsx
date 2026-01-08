import { useRef, useState } from 'react';

import type { FC } from 'react';

import { PANEL_SIZES } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/utils';
import { useIsLeftSidebarCollapsed, useUIStore } from '@/stores/ui/ui-store';

/**
 * SidebarResizeHandle - A smooth resize handle for the left sidebar
 *
 * Key features:
 * - Updates DOM directly during drag for smooth, lag-free resizing
 * - Only syncs to React state on mouseup (prevents re-render jank)
 * - Enforces min 240px, max 400px when expanded
 * - Disabled when sidebar is collapsed (40px)
 * - Wide hit area (8px) for easy targeting, thin visual line (1px)
 * - Orange highlight persists during drag
 *
 * This approach avoids the lag that occurs when updating React state
 * on every mousemove event.
 */
export const SidebarResizeHandle: FC = () => {
  const { leftSidebarWidth, setLeftSidebarWidth } = useUIStore();
  const isCollapsed = useIsLeftSidebarCollapsed();

  // Track dragging state for visual feedback (needs React state for re-render)
  const [isDragging, setIsDragging] = useState(false);

  // Track the current width during drag (not in React state to avoid re-renders)
  const currentWidthRef = useRef(leftSidebarWidth);
  const isDraggingRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent): void => {
    // Don't allow resizing when collapsed
    if (isCollapsed) return;

    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    currentWidthRef.current = leftSidebarWidth;

    const startX = e.clientX;
    const startWidth = leftSidebarWidth;

    // Find the sidebar element to update directly
    const sidebarElement = document.querySelector<HTMLElement>('[data-sidebar="primary"]');
    if (!sidebarElement) return;

    // Store original transition and disable it for smooth dragging
    const originalTransition = sidebarElement.style.transition;
    sidebarElement.style.transition = 'none';

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      // Calculate delta (positive = dragging right = wider)
      const delta = moveEvent.clientX - startX;
      let newWidth = startWidth + delta;

      // Clamp to valid range when expanded
      newWidth = Math.max(
        PANEL_SIZES.sidebar.minUsable,
        Math.min(PANEL_SIZES.sidebar.max, newWidth)
      );

      // Update DOM directly (no React re-renders, no transition = instant!)
      sidebarElement.style.width = `${String(newWidth)}px`;
      currentWidthRef.current = newWidth;
    };

    const cleanup = (): void => {
      if (!isDraggingRef.current) return; // Already cleaned up

      isDraggingRef.current = false;
      setIsDragging(false);

      // Remove event listeners
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', cleanup);
      window.removeEventListener('blur', cleanup);

      // Reset cursor
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Restore original transition
      sidebarElement.style.transition = originalTransition;

      // Now sync to React state (single update)
      setLeftSidebarWidth(currentWidthRef.current);
    };

    // Add global listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', cleanup);
    // Also cleanup if window loses focus (mouse released outside browser)
    window.addEventListener('blur', cleanup);

    // Set cursor for the entire document during drag
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      className={cn(
        'group relative shrink-0 h-full',
        // Only show resize cursor when expanded
        isCollapsed ? 'cursor-default' : 'cursor-col-resize'
      )}
      onMouseDown={handleMouseDown}
      // Wider hit area via padding, visual line is 1px
      style={{ width: 1, padding: '0 4px', margin: '0 -4px' }}
    >
      {/* Persistent separator line (always visible, matches site border) */}
      <div className="w-px h-full bg-border" />
      {/* Hover/Active indicator line - only show when expanded (can resize) */}
      {!isCollapsed && (
        <div
          className={cn(
            'absolute inset-y-0 left-1/2 -translate-x-1/2 bg-primary',
            // Show on hover OR when dragging
            isDragging
              ? 'w-[3px] opacity-100'
              : 'w-px opacity-0 group-hover:w-[3px] group-hover:opacity-100'
          )}
        />
      )}
    </div>
  );
};
