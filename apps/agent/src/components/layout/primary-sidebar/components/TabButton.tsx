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
        'relative flex items-center justify-center h-full pt-1.5 px-3 flex-1 transition-[background-color] duration-100',
        active ? 'text-foreground' : 'text-gray-10 hover:text-gray-12'
      )}
      onClick={onClick}
      title={label}
    >
      {/* Tab background - Orbit style */}
      <div
        className={cn(
          'absolute inset-x-0 top-1.5 bottom-0 rounded-t-md transition-[background-color] duration-100',
          active ? 'bg-gray-4' : 'hover:bg-gray-4'
        )}
      />
      {/* Active indicator */}
      {/* Active indicator - offset to sit on parent's bottom border */}
      {active ? (
        <div className="absolute inset-x-0 h-[2px] bg-primary" style={{ bottom: -1.5 }} />
      ) : null}
      <span className="relative text-base font-medium truncate">{label}</span>
    </button>
  );
};
