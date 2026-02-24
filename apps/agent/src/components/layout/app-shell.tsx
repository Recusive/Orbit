/**
 * AppShell — Dia-style base layer root layout
 *
 * Renders the dark base layer with a flex-row layout:
 * [Sidebar (variable width)] [ResizeHandle] [ContentCard (flex: 1)] [ActionsBar?]
 *
 * The base layer is draggable (data-tauri-drag-region) so the user
 * can drag the window from the exposed dark margins around the card.
 *
 * Sidebar animation uses the same pattern as the activity panel:
 * fixed width + single margin-left transition. The wrapper keeps its
 * expanded width at all times; only marginLeft slides it off-screen.
 * This avoids animating `width` (layout-triggering) and eliminates
 * the two-property desync that caused glitchy collapse/expand.
 */
import type { CSSProperties, FC, ReactNode } from 'react';

import { CONTENT_CARD, SIDEBAR } from '@/lib/utils/constants';

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Single-property transition — only margin-left animates (GPU-friendly rigid-body slide) */
const WRAPPER_TRANSITION: string | undefined = PREFERS_REDUCED_MOTION
  ? undefined
  : `margin-left ${CONTENT_CARD.transition}`;

interface AppShellProps {
  readonly sidebar: ReactNode;
  readonly resizeHandle: ReactNode;
  readonly children: ReactNode;
  readonly sidebarWidth: number;
  /** The last expanded width, used to keep the wrapper fixed during collapse animation */
  readonly lastExpandedSidebarWidth: number;
  /** Optional right-side actions bar rendered on the base layer */
  readonly actionsBar?: ReactNode;
}

export const AppShell: FC<AppShellProps> = ({
  sidebar,
  resizeHandle,
  children,
  sidebarWidth,
  lastExpandedSidebarWidth,
  actionsBar,
}) => {
  // Mirror the activity panel's animation pattern: fixed width, single margin slide.
  // When collapsed, the wrapper keeps its expanded width and marginLeft pushes it
  // off the left edge. The parent's overflow:hidden clips the offscreen portion.
  // When open, sidebarWidth IS the visual width; marginLeft stays at 0.
  const isCollapsed = sidebarWidth <= SIDEBAR.collapsed;
  const visualWidth = isCollapsed ? lastExpandedSidebarWidth : sidebarWidth;

  const wrapperStyle: CSSProperties = {
    width: visualWidth,
    marginLeft: isCollapsed ? -visualWidth : 0,
    flexShrink: 0,
    transition: WRAPPER_TRANSITION,
    overflow: 'hidden',
  };

  return (
    <div
      data-tauri-drag-region
      className="h-screen w-screen flex overflow-hidden bg-base-layer text-foreground"
    >
      {/* Sidebar area — renders on the dark base layer */}
      <div data-sidebar="primary-wrapper" style={wrapperStyle}>
        {sidebar}
      </div>

      {/* Resize handle between sidebar and card */}
      {resizeHandle}

      {/* Content card fills remaining space */}
      {children}

      {/* Actions bar — right edge, on the base layer */}
      {actionsBar}
    </div>
  );
};
