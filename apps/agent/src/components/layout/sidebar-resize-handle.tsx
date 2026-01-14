/**
 * NOTE: Layout dimensions come from @/lib/utils/constants.
 * To change sidebar widths, snap thresholds, or handle dimensions,
 * update SIDEBAR, PANEL_SIZES, and RESIZE_HANDLE in constants.ts.
 */
import { useRef, useState } from 'react';

import type { FC } from 'react';

import { PANEL_SIZES, RESIZE_HANDLE, SIDEBAR } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/utils';
import { useIsLeftSidebarCollapsed, useUIStore } from '@/stores/ui/ui-store';

/**
 * SidebarResizeHandle - A smooth resize handle for the left sidebar
 *
 * Key features:
 * - Updates DOM directly during drag for smooth, lag-free resizing
 * - Only syncs to React state on mouseup (prevents re-render jank)
 * - Enforces min 240px, max 400px when expanded
 * - Snap-to-collapse: drag below snapThreshold to collapse to 40px
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

    // Track if we're in snap zone to update React state only on threshold crossing
    let wasInSnapZone = false;

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      // Calculate delta (positive = dragging right = wider)
      const delta = moveEvent.clientX - startX;
      let newWidth = startWidth + delta;

      // Clamp max, but allow going below minUsable for snap behavior
      newWidth = Math.min(PANEL_SIZES.sidebar.max, newWidth);

      const isInSnapZone = newWidth < PANEL_SIZES.sidebar.snapThreshold;

      // Update React state only when crossing the snap threshold (not every frame)
      if (isInSnapZone !== wasInSnapZone) {
        wasInSnapZone = isInSnapZone;
        // This updates isCollapsed which controls sidebar content visibility
        setLeftSidebarWidth(isInSnapZone ? SIDEBAR.collapsed : PANEL_SIZES.sidebar.minUsable);
      }

      // Snap behavior: if below threshold, show collapsed width
      if (isInSnapZone) {
        sidebarElement.style.width = `${String(SIDEBAR.collapsed)}px`;
        currentWidthRef.current = SIDEBAR.collapsed;
      } else if (newWidth < PANEL_SIZES.sidebar.minUsable) {
        // Between threshold and minUsable: show minUsable (visual feedback)
        sidebarElement.style.width = `${String(PANEL_SIZES.sidebar.minUsable)}px`;
        currentWidthRef.current = newWidth; // Keep actual value for snap decision
      } else {
        // Normal range: show actual width
        sidebarElement.style.width = `${String(newWidth)}px`;
        currentWidthRef.current = newWidth;
      }
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

      // Determine final width based on snap behavior
      const finalWidth = currentWidthRef.current;
      if (finalWidth < PANEL_SIZES.sidebar.snapThreshold) {
        // Snap to collapsed
        setLeftSidebarWidth(SIDEBAR.collapsed);
      } else if (finalWidth < PANEL_SIZES.sidebar.minUsable) {
        // Was in "resistance zone" but didn't cross threshold - snap back to minUsable
        setLeftSidebarWidth(PANEL_SIZES.sidebar.minUsable);
      } else {
        // Normal range
        setLeftSidebarWidth(finalWidth);
      }
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
      // Wider hit area via padding, visual line matches RESIZE_HANDLE.width
      style={{ width: RESIZE_HANDLE.width, padding: '0 4px', margin: '0 -4px' }}
    >
      {/* Persistent separator line (always visible, matches site border) */}
      <div className="h-full bg-border" style={{ width: RESIZE_HANDLE.width }} />
      {/* Hover/Active indicator line - only show when expanded (can resize) */}
      {!isCollapsed && (
        <div
          className={cn(
            'absolute inset-y-0 left-1/2 -translate-x-1/2 bg-primary transition-opacity duration-100',
            // Use group-hover for reliable hit area detection (outer div is 8px wide)
            isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
          // Always use hoverWidth (3px) since line is only visible on hover/drag
          style={{ width: RESIZE_HANDLE.hoverWidth }}
        />
      )}
    </div>
  );
};
