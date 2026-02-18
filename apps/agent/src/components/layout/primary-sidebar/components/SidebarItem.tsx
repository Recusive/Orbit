/**
 * SidebarItem - Reusable sidebar row with icon, label, and optional shortcut
 */
import type { SidebarItemProps } from '../types';
import type { FC } from 'react';

import { Kbd } from '@/components/ui/kbd';
import { cn, getCollapseTransition, SIDEBAR } from '@/lib/utils';

export const SidebarItem: FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  collapsed,
  active,
  small,
  large,
  equalSpacing,
  shortcut,
  badge,
  badgeVariant = 'default',
  className,
  onClick,
}) => {
  const iconSizeClass = small ? 'h-3 w-3' : large ? 'h-4.5 w-4.5' : 'h-4 w-4';
  // When collapsed with equalSpacing, render a small square button like the panel toggler
  if (equalSpacing) {
    return (
      <div
        className="flex items-center justify-center shrink-0"
        style={{ height: SIDEBAR.itemHeight, width: SIDEBAR.iconColumnWidth }}
      >
        <button
          className={cn(
            "relative h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-95 transition-[background-color,transform] duration-100 before:absolute before:content-[''] before:inset-[-8px]",
            active ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground',
            className
          )}
          aria-label={badge ? `${label} (${badge})` : label}
          title={badge ? `${label} — ${badge}` : label}
          onClick={onClick}
        >
          <Icon className={cn('shrink-0', iconSizeClass)} />
        </button>
      </div>
    );
  }

  return (
    <button
      className={cn(
        'flex items-center gap-1.5 h-8 rounded-lg mx-1.5 overflow-hidden hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98] transition-[background-color,transform] duration-100',
        active ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground',
        className
      )}
      title={collapsed ? label : undefined}
      onClick={onClick}
    >
      {/* Fixed-width icon column - never moves */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
      >
        <Icon className={cn('shrink-0', iconSizeClass)} />
      </div>
      {/* Text that slides in */}
      <span
        className={cn(
          'text-base whitespace-nowrap overflow-hidden',
          collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
        )}
        style={{ transition: getCollapseTransition(collapsed) }}
      >
        {label}
      </span>
      {/* Badge */}
      {badge && !collapsed ? (
        <span
          className="ml-auto mr-2 shrink-0 inline-flex items-center h-4 rounded px-1.5 text-[10px] font-medium select-none"
          style={
            badgeVariant === 'primary'
              ? { color: 'var(--primary-foreground)', backgroundColor: 'var(--primary)' }
              : { color: 'var(--gray-11)', backgroundColor: 'var(--gray-a4)' }
          }
        >
          {badge}
        </span>
      ) : null}
      {/* Keyboard shortcut */}
      {shortcut && !collapsed ? (
        <Kbd className="ml-auto mr-2 h-[18px] !text-[12px] px-1.5 bg-gray-5 text-inherit border-gray-6">
          {shortcut.map((key, index) => (
            <span key={index} className={index === 0 ? 'text-[14px] leading-none' : ''}>
              {key}
            </span>
          ))}
        </Kbd>
      ) : null}
    </button>
  );
};
