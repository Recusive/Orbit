/**
 * ActivityCard — Secondary floating card for the Activity Panel
 *
 * Sits to the right of the main ContentCard inside an Allotment pane.
 * The pane controls the width; this card just applies margins, radius,
 * and background to match the Dia-style card aesthetic.
 *
 * Margin logic:
 * - Left: 4px (gap between main card and activity card)
 * - Right: 0 when actions bar is open, 6px when closed
 * - Top/Bottom: always 6px
 * - Fullscreen: 0 margins, 0 border-radius
 */
import { useMemo } from 'react';

import type { CSSProperties, FC, ReactNode } from 'react';

import { CONTENT_CARD } from '@/lib/utils/constants';

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface ActivityCardProps {
  readonly actionsBarOpen: boolean;
  readonly isFullscreen: boolean;
  readonly children: ReactNode;
}

export const ActivityCard: FC<ActivityCardProps> = ({ actionsBarOpen, isFullscreen, children }) => {
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

    const right = actionsBarOpen ? 0 : m;

    return {
      margin: `${String(m)}px ${String(right)}px ${String(m)}px 4px`,
      borderRadius: `var(--content-card-radius)`,
      background: 'var(--chat-area)',
      boxShadow: 'none',
      transition: PREFERS_REDUCED_MOTION
        ? undefined
        : `margin ${CONTENT_CARD.transition}, border-radius ${CONTENT_CARD.transition}`,
    };
  }, [actionsBarOpen, isFullscreen]);

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative" style={style}>
      {children}
    </div>
  );
};
