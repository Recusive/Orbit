/**
 * AppShell — Dia-style base layer root layout
 *
 * Renders the dark base layer with a flex-row layout:
 * [Sidebar (variable width)] [ResizeHandle] [ContentCard (flex: 1)]
 *
 * The base layer is draggable (data-tauri-drag-region) so the user
 * can drag the window from the exposed dark margins around the card.
 */
import type { CSSProperties, FC, ReactNode } from 'react';

import { CONTENT_CARD, PANEL_SIZES } from '@/lib/utils/constants';

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const WRAPPER_TRANSITION: string | undefined = PREFERS_REDUCED_MOTION
  ? undefined
  : `margin-left ${CONTENT_CARD.transition}, width ${CONTENT_CARD.transition}`;

interface AppShellProps {
  readonly sidebar: ReactNode;
  readonly resizeHandle: ReactNode;
  readonly children: ReactNode;
  readonly sidebarWidth: number;
}

export const AppShell: FC<AppShellProps> = ({ sidebar, resizeHandle, children, sidebarWidth }) => {
  // The sidebar wrapper always maintains at least minUsable width so content
  // never compresses. When sidebarWidth drops below that (during collapse
  // animation), a negative margin-left slides the entire wrapper off the left
  // edge as one rigid body. Single-property animation = no desync, pure slide.
  const minWidth = PANEL_SIZES.sidebar.minUsable;
  const isSliding = sidebarWidth < minWidth;

  const wrapperStyle: CSSProperties = {
    width: isSliding ? minWidth : sidebarWidth,
    marginLeft: isSliding ? sidebarWidth - minWidth : 0,
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
    </div>
  );
};
