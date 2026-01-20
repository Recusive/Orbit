/**
 * TabButton - Sidebar tab navigation button
 */
import type { TabButtonProps } from '../types';
import type { FC } from 'react';

import { cn } from '@/lib/utils';

export const TabButton: FC<TabButtonProps> = ({ label, active, onClick }) => {
  return (
    <button
      className={cn(
        'relative flex items-center justify-center h-full pt-1.5 px-3 flex-1 transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        active ? 'text-foreground' : 'text-muted-foreground/80 hover:text-foreground'
      )}
      onClick={onClick}
      aria-selected={active}
      role="tab"
    >
      {/* Tab background - Orbit style */}
      <div
        className={cn(
          'absolute inset-x-0 top-1.5 bottom-0 rounded-t-md transition-colors duration-200',
          active ? 'bg-muted/70' : 'hover:bg-muted/40'
        )}
        aria-hidden="true"
      />
      {/* Active indicator */}
      {active ? (
        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary/90" aria-hidden="true" />
      ) : null}
      <span className="relative text-base font-medium truncate">{label}</span>
    </button>
  );
};
