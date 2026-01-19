'use client';

import { HEADER, LOGO } from '@canvas/lib/constants';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// ============================================
// Main Component
// ============================================

/**
 * Secondary header for the Canvas UI Builder.
 *
 * Layout:
 * - Left: Logo with "Orbit Canvas"
 * - Right: (buttons moved to main header bar)
 */
export const CanvasHeader: FC = () => {
  return (
    <header
      className={cn(
        'flex items-center',
        HEADER.height,
        HEADER.padding,
        HEADER.background,
        HEADER.border
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center', LOGO.gap)}>
        <span className={cn(LOGO.title.fontSize, LOGO.title.fontWeight, LOGO.title.whitespace)}>
          Orbit Canvas
        </span>
        <span
          className={cn(
            LOGO.badge.background,
            LOGO.badge.color,
            LOGO.badge.borderRadius,
            LOGO.badge.padding,
            LOGO.badge.fontWeight,
            LOGO.badge.tracking,
            LOGO.badge.whitespace
          )}
          style={{ fontSize: LOGO.badge.fontSize }}
        >
          Preview
        </span>
      </div>
    </header>
  );
};
