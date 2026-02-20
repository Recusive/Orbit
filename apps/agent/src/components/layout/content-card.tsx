/**
 * ContentCard — Dia-style floating rounded card
 *
 * The main content area rendered as a rounded, shadowed card that
 * "floats" over the dark base layer. Margin and border-radius
 * animate based on sidebar state and fullscreen mode.
 *
 * Margin logic:
 * - Sidebar open:  0 left (card touches sidebar)
 * - Actions bar open: 0 right (card touches actions bar)
 * - Both closed: 6px on all sides (card floats centered)
 * - Terminal below: bottom margin shrinks to 4px (matching inter-card gap)
 * - Fullscreen: 0 on all sides, 0 border-radius
 */
import { useMemo } from 'react';

import type { CSSProperties, FC, ReactNode } from 'react';

import { CONTENT_CARD } from '@/lib/utils/constants';

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface ContentCardProps {
  readonly sidebarOpen: boolean;
  readonly actionsBarOpen: boolean;
  readonly isFullscreen: boolean;
  /** When true, bottom margin shrinks to 4px to match the inter-card gap (terminal below). */
  readonly terminalBelow?: boolean;
  readonly children: ReactNode;
}

export const ContentCard: FC<ContentCardProps> = ({
  sidebarOpen,
  actionsBarOpen,
  isFullscreen,
  terminalBelow = false,
  children,
}) => {
  const style = useMemo((): CSSProperties => {
    const m = CONTENT_CARD.margin;

    if (isFullscreen) {
      return {
        margin: 0,
        borderRadius: 0,
        background: 'var(--background)',
        boxShadow: 'none',
        transition: PREFERS_REDUCED_MOTION
          ? undefined
          : `margin ${CONTENT_CARD.transition}, border-radius ${CONTENT_CARD.transition}`,
      };
    }

    const top = m;
    const right = actionsBarOpen ? 0 : m;
    // When terminal is below, bottom margin is 0 — the resize handle provides the gap.
    const bottom = terminalBelow ? 0 : m;
    const left = sidebarOpen ? 0 : m;

    return {
      margin: `${String(top)}px ${String(right)}px ${String(bottom)}px ${String(left)}px`,
      borderRadius: `var(--content-card-radius)`,
      background: 'var(--background)',
      boxShadow: 'none',
      transition: PREFERS_REDUCED_MOTION
        ? undefined
        : `margin ${CONTENT_CARD.transition}, border-radius ${CONTENT_CARD.transition}`,
    };
  }, [sidebarOpen, actionsBarOpen, isFullscreen, terminalBelow]);

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative" style={style}>
      {children}
    </div>
  );
};
