'use client';

import { HEADER, PANEL, SECTION_HEADER } from '@canvas/lib/constants';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// ============================================
// Component
// ============================================

/**
 * Right panel showing properties and AI prompt section.
 *
 * Layout:
 * - Properties section (empty state when nothing selected)
 * - AI Prompt section at bottom for element modifications
 */
export const PropertiesPanel: FC = () => {
  return (
    <div className={cn('h-full flex flex-col', PANEL.sidebar.background)}>
      {/* Properties Section */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div
          className={cn('flex items-center', HEADER.height, HEADER.paddingSidebar, HEADER.border)}
        >
          <h2
            className={cn(
              SECTION_HEADER.fontSize,
              SECTION_HEADER.fontWeight,
              SECTION_HEADER.color,
              SECTION_HEADER.textTransform,
              SECTION_HEADER.letterSpacing
            )}
          >
            Properties
          </h2>
        </div>

        {/* Empty State */}
        <div className={cn('flex-1 flex items-center justify-center', PANEL.emptyState.padding)}>
          <p className={cn(PANEL.emptyState.textSize, PANEL.emptyState.textColor)}>No selection</p>
        </div>
      </div>
    </div>
  );
};
