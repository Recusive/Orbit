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
        active ? 'text-foreground' : 'text-lg-text-secondary hover:text-foreground'
      )}
      onClick={onClick}
      title={label}
    >
      {/* Tab background */}
      <div
        className={cn(
          'absolute inset-x-0 top-1.5 bottom-0 rounded-md transition-[background-color] duration-100',
          active ? 'bg-lg-sidebar-selected' : 'hover:bg-lg-sidebar-hover'
        )}
      />
      <span className="relative text-base font-medium truncate">{label}</span>
    </button>
  );
};
