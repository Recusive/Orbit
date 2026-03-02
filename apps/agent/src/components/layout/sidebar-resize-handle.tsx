/**
 * NOTE: Layout dimensions come from @/lib/utils/constants.
 * To change sidebar widths, snap thresholds, or handle dimensions,
 * update SIDEBAR, PANEL_SIZES, and RESIZE_HANDLE in constants.ts.
 */
import { useCallback, useRef } from 'react';
import { useShallow } from 'zustand/shallow';

import type { FC, KeyboardEvent } from 'react';

import { cn, PANEL_SIZES, RESIZE_HANDLE, SIDEBAR } from '@/lib/utils';
import { useIsLeftSidebarCollapsed, useUIStore } from '@/stores/ui/ui-store';

/**
 * Apply sidebar width to a wrapper element that uses the margin-left slide pattern.
 *
 * Three visual states (all during drag with transition: none):
 * - Normal range (>= minUsable): actual width, no marginLeft
 * - Resistance zone (< minUsable, > collapsed): stuck at minUsable, no marginLeft
 * - Collapsed (<= 0): expanded width preserved, marginLeft = -expandedWidth
 *
 * The collapsed case uses expandedWidth (not minUsable) so the DOM matches
 * what React will set on mouseup — prevents a visible width flash when
 * transitions re-enable.
 */
function applySidebarWidth(el: HTMLElement, width: number, expandedWidth: number): void {
  const minWidth = PANEL_SIZES.sidebar.minUsable;
  if (width <= SIDEBAR.collapsed) {
    // Fully collapsed: match React's layout so no flash on mouseup
    el.style.width = `${String(expandedWidth)}px`;
    el.style.marginLeft = `${String(-expandedWidth)}px`;
  } else if (width < minWidth) {
    // Resistance zone: sidebar appears stuck at minimum usable width
    el.style.width = `${String(minWidth)}px`;
    el.style.marginLeft = '0px';
  } else {
    el.style.width = `${String(width)}px`;
    el.style.marginLeft = '0px';
  }
}

/** Keyboard resize step in pixels */
const KEYBOARD_STEP = 10;
const KEYBOARD_STEP_LARGE = 50;

/**
 * SidebarResizeHandle - A smooth resize handle for the left sidebar
 *
 * Layout: Zero-width flex container with absolutely positioned 8px hit area.
 * The outer div occupies 0px in flex flow. An inner absolute-positioned div
 * extends 4px on each side (centered on the sidebar/card boundary) to create
 * the interactive region without negative margins or padding hacks.
 *
 * Key features:
 * - Updates DOM directly during drag for smooth, lag-free resizing
 * - Only syncs to React state on mouseup (prevents re-render jank)
 * - Enforces min 240px, max 400px when expanded
 * - Snap-to-collapse: drag below snapThreshold to collapse to 0px
 * - Wide hit area (8px) for easy targeting
 */
export const SidebarResizeHandle: FC = () => {
  // Use useShallow to prevent re-renders when unrelated store state changes
  const { leftSidebarWidth, setLeftSidebarWidth } = useUIStore(
    useShallow((s) => ({
      leftSidebarWidth: s.leftSidebarWidth,
      setLeftSidebarWidth: s.setLeftSidebarWidth,
    }))
  );
  const isCollapsed = useIsLeftSidebarCollapsed();

  // Track the current width during drag (not in React state to avoid re-renders)
  const currentWidthRef = useRef(leftSidebarWidth);
  const isDraggingRef = useRef(false);

  // Keyboard resize handler for accessibility
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (isCollapsed) return; // Can't resize when collapsed

      const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
      let newWidth: number;

      if (e.key === 'ArrowLeft') {
        newWidth = Math.max(PANEL_SIZES.sidebar.minUsable, leftSidebarWidth - step);
        // Check for snap-to-collapse
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
        return; // Don't prevent default for other keys
      }

      e.preventDefault();
      setLeftSidebarWidth(newWidth);
    },
    [isCollapsed, leftSidebarWidth, setLeftSidebarWidth]
  );

  const handleMouseDown = (e: React.MouseEvent): void => {
    // Don't allow resizing when collapsed
    if (isCollapsed) return;

    e.preventDefault();

    // Find the sidebar wrapper element first - if not found, bail out before setting any state.
    // In AppShell layout, the sidebar is wrapped in a width-controlling div
    // (data-sidebar="primary-wrapper"). Fall back to the sidebar element itself
    // for Editor mode (data-sidebar="editor-primary").
    const sidebarElement =
      document.querySelector<HTMLElement>(
        '[data-sidebar="primary-wrapper"], [data-sidebar="editor-primary"]'
      ) ?? null;
    if (!sidebarElement) return;

    // Now safe to set dragging state since we have a valid element
    isDraggingRef.current = true;
    currentWidthRef.current = leftSidebarWidth;

    const startX = e.clientX;
    const startWidth = leftSidebarWidth;

    // Store original transition and disable it for smooth dragging
    const originalTransition = sidebarElement.style.transition;
    sidebarElement.style.transition = 'none';

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      // Calculate delta (positive = dragging right = wider)
      const delta = moveEvent.clientX - startX;
      let newWidth = startWidth + delta;

      // Clamp max, but allow going below minUsable for snap behavior
      newWidth = Math.min(PANEL_SIZES.sidebar.max, newWidth);

      // Snap behavior: if below threshold, slide to collapsed
      if (newWidth < PANEL_SIZES.sidebar.snapThreshold) {
        applySidebarWidth(sidebarElement, SIDEBAR.collapsed, startWidth);
        currentWidthRef.current = SIDEBAR.collapsed;
      } else if (newWidth < PANEL_SIZES.sidebar.minUsable) {
        // Between threshold and minUsable: show minUsable (visual resistance)
        applySidebarWidth(sidebarElement, PANEL_SIZES.sidebar.minUsable, startWidth);
        currentWidthRef.current = newWidth; // Keep actual value for snap decision
      } else {
        // Normal range: show actual width
        applySidebarWidth(sidebarElement, newWidth, startWidth);
        currentWidthRef.current = newWidth;
      }
    };

    const cleanup = (): void => {
      if (!isDraggingRef.current) return; // Already cleaned up

      isDraggingRef.current = false;

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
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={leftSidebarWidth}
      aria-valuemin={PANEL_SIZES.sidebar.minUsable}
      aria-valuemax={PANEL_SIZES.sidebar.max}
      aria-label="Resize sidebar. Use left/right arrow keys to adjust."
      tabIndex={isCollapsed ? -1 : 0}
      className="relative shrink-0 h-full focus:outline-none focus-visible:z-10"
      style={{ width: 0 }}
    >
      {/* Hit area — absolutely positioned, centered on the sidebar/card boundary */}
      <div
        className={cn(
          'absolute inset-y-0 z-10',
          isCollapsed ? 'cursor-default' : 'cursor-col-resize'
        )}
        style={{
          width: RESIZE_HANDLE.hitArea,
          left: -(RESIZE_HANDLE.hitArea / 2),
        }}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};
