/**
 * SidebarMenuItem - Tree item with connecting line decoration
 *
 * Displays a menu item in the sidebar tree structure with:
 * - Horizontal connector line to the vertical tree line
 * - Hover and active states
 * - Optional "last item" styling to cap off the tree line
 */
import type { FC } from 'react';

import { cn } from '@/lib/utils';

interface SidebarMenuItemProps {
  readonly label: string;
  readonly active?: boolean;
  readonly isLast?: boolean;
  readonly onClick?: () => void;
}

export const SidebarMenuItem: FC<SidebarMenuItemProps> = ({
  label,
  active = false,
  isLast = false,
  onClick,
}) => {
  return (
    <li className="relative">
      {/* Horizontal connector from tree line to item */}
      <div className="absolute left-[-12px] top-1/2 w-3 h-px bg-border/40" />

      {/* Cap off tree line for last item */}
      {isLast ? (
        <div className="absolute left-[-13px] top-1/2 bottom-[-4px] w-[3px] bg-card" />
      ) : null}

      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full text-left px-2 py-1 rounded-md',
          'text-sm transition-colors duration-150',
          active
            ? 'bg-accent text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        {label}
      </button>
    </li>
  );
};
