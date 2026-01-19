'use client';

import { TAB_SWITCHER } from '@canvas/lib/constants';
import { useState } from 'react';

import type { FC } from 'react';

import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface Tab {
  readonly id: string;
  readonly label: string;
}

interface TabSwitcherProps {
  readonly tabs: readonly Tab[];
  readonly defaultTab?: string;
  readonly onChange?: (tabId: string) => void;
  /** When true, the container and buttons stretch to fill available width */
  readonly fullWidth?: boolean;
}

// ============================================
// Component
// ============================================

/**
 * A pill-style tab switcher with contained background.
 *
 * Uses the design tokens from constants.ts for consistent sizing
 * and automatically adapts to light/dark themes.
 */
export const TabSwitcher: FC<TabSwitcherProps> = ({
  tabs,
  defaultTab,
  onChange,
  fullWidth = false,
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id);

  const handleTabClick = (tabId: string): void => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  return (
    <div
      className={cn(
        'flex items-center',
        TAB_SWITCHER.container.gap,
        TAB_SWITCHER.container.padding,
        TAB_SWITCHER.container.background,
        TAB_SWITCHER.container.borderRadius,
        TAB_SWITCHER.container.border,
        fullWidth && 'w-full'
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={(): void => {
              handleTabClick(tab.id);
            }}
            className={cn(
              TAB_SWITCHER.button.height,
              TAB_SWITCHER.button.padding,
              TAB_SWITCHER.button.fontSize,
              TAB_SWITCHER.button.fontWeight,
              TAB_SWITCHER.button.borderRadius,
              TAB_SWITCHER.button.layout,
              'transition-colors',
              fullWidth && 'flex-1',
              isActive ? TAB_SWITCHER.button.active : TAB_SWITCHER.button.inactive
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
