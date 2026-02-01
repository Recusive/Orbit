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
        active ? 'text-foreground' : 'text-muted-foreground/80 hover:text-foreground'
      )}
      onClick={onClick}
      title={label}
    >
      {/* Tab background - Orbit style */}
      <div
        className={cn(
          'absolute inset-x-0 top-1.5 bottom-0 rounded-t-md transition-colors duration-200',
          active ? 'bg-muted/70' : 'hover:bg-muted/40'
        )}
      />
      {/* Active indicator */}
      {/* Active indicator - offset to sit on parent's bottom border */}
      {active ? (
        <div className="absolute inset-x-0 h-[3px] bg-primary/90" style={{ bottom: -3 }} />
      ) : null}
      <span className="relative text-base font-medium truncate">{label}</span>
    </button>
  );
};
