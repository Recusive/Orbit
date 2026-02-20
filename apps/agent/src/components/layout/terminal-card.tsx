/**
 * TerminalCard — Floating card for the terminal in all 3 positions
 *
 * Rendered at the App.tsx level as an independent card below ContentCard
 * or ActivityCard (or spanning full width). Matches the card styling of
 * ContentCard and ActivityCard (rounded corners, background, margins).
 *
 * Position-aware margin logic:
 *
 * 'chat' position (below ContentCard):
 * - Top: 0 (ContentCard's bottom margin provides the gap)
 * - Bottom: CONTENT_CARD.margin
 * - Left: 0 when sidebar open, CONTENT_CARD.margin when closed
 * - Right: 0 when activity/actions bar open, CONTENT_CARD.margin when closed
 *
 * 'activity' position (below ActivityCard):
 * - Top: 0 (ActivityCard's bottom margin provides the gap)
 * - Bottom: CONTENT_CARD.margin
 * - Left: 4px (gap between content column and activity column)
 * - Right: 0 when actions bar open, CONTENT_CARD.margin when closed
 *
 * 'both' position (full width below cards row):
 * - Top: 0 (cards above provide bottom margin gap)
 * - Bottom: CONTENT_CARD.margin
 * - Left: 0 when sidebar open, CONTENT_CARD.margin when closed
 * - Right: 0 when actions bar open, CONTENT_CARD.margin when closed
 *
 * Fullscreen: 0 margins, 0 border-radius
 */
import { useMemo } from 'react';

import type { TerminalPosition } from '@/stores/ui/ui-store';
import type { CSSProperties, FC, ReactNode } from 'react';

import { CONTENT_CARD } from '@/lib/utils/constants';

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface TerminalCardProps {
  readonly position: TerminalPosition;
  readonly sidebarOpen: boolean;
  readonly actionsBarOpen: boolean;
  readonly isFullscreen: boolean;
  readonly children: ReactNode;
}

export const TerminalCard: FC<TerminalCardProps> = ({
  position,
  sidebarOpen,
  actionsBarOpen,
  isFullscreen,
  children,
}) => {
  const style = useMemo((): CSSProperties => {
    const m = CONTENT_CARD.margin;

    if (isFullscreen) {
      return {
        margin: 0,
        borderRadius: 0,
        background: 'var(--chat-area)',
        boxShadow: 'none',
        transition: PREFERS_REDUCED_MOTION
          ? undefined
          : `margin ${CONTENT_CARD.transition}, border-radius ${CONTENT_CARD.transition}`,
      };
    }

    // Top margin is 0 — the card above (ContentCard or ActivityCard) has
    // its own bottom margin that provides the visual gap.
    const top = 0;
    const bottom = m;

    // Left margin: 'activity' position uses 0 (the vertical ResizeHandle provides the gap).
    // 'chat' and 'both' positions follow sidebar state.
    const left = position === 'activity' ? 0 : sidebarOpen ? 0 : m;

    // Right margin: 0 when actions bar touches the right edge
    const right = actionsBarOpen ? 0 : m;

    return {
      margin: `${String(top)}px ${String(right)}px ${String(bottom)}px ${String(left)}px`,
      borderRadius: `var(--content-card-radius)`,
      background: 'var(--chat-area)',
      boxShadow: 'none',
      transition: PREFERS_REDUCED_MOTION
        ? undefined
        : `margin ${CONTENT_CARD.transition}, border-radius ${CONTENT_CARD.transition}`,
    };
  }, [position, sidebarOpen, actionsBarOpen, isFullscreen]);

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative" style={style}>
      {children}
    </div>
  );
};
