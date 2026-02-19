/**
 * ContentCard — Dia-style floating rounded card
 *
 * The main content area rendered as a rounded, shadowed card that
 * "floats" over the dark base layer. Margin and border-radius
 * animate based on sidebar state and fullscreen mode.
 *
 * Margin logic:
 * - Sidebar open:  6px top/right/bottom, 0 left (card touches sidebar)
 * - Sidebar closed: 6px on all sides (card floats centered)
 * - Fullscreen:     0 on all sides, 0 border-radius
 */
import { useMemo } from 'react';

import type { CSSProperties, FC, ReactNode } from 'react';

import { CONTENT_CARD } from '@/lib/utils/constants';

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface ContentCardProps {
  readonly sidebarOpen: boolean;
  readonly isFullscreen: boolean;
  readonly children: ReactNode;
}

export const ContentCard: FC<ContentCardProps> = ({ sidebarOpen, isFullscreen, children }) => {
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

    return {
      margin: sidebarOpen ? `${String(m)}px ${String(m)}px ${String(m)}px 0` : m,
      borderRadius: `var(--content-card-radius)`,
      background: 'var(--background)',
      boxShadow: 'none',
      transition: PREFERS_REDUCED_MOTION
        ? undefined
        : `margin ${CONTENT_CARD.transition}, border-radius ${CONTENT_CARD.transition}`,
    };
  }, [sidebarOpen, isFullscreen]);

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative" style={style}>
      {children}
    </div>
  );
};
