/**
 * SidebarItem - Reusable sidebar row with icon, label, and optional shortcut
 */
import type { SidebarItemProps } from '../types';
import type { FC } from 'react';

import { Kbd } from '@/components/ui/kbd';
import { cn, SIDEBAR } from '@/lib/utils';

export const SidebarItem: FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  active,
  small,
  large,
  shortcut,
  badge,
  badgeVariant = 'default',
  className,
  onClick,
}) => {
  const iconSizeClass = small ? 'h-3 w-3' : large ? 'h-4.5 w-4.5' : 'h-4 w-4';

  return (
    <button
      className={cn(
        'flex items-center gap-1.5 h-8 rounded-lg mx-1.5 overflow-hidden hover:bg-lg-sidebar-hover active:scale-[0.98] transition-[background-color,transform] duration-100',
        active ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground',
        className
      )}
      onClick={onClick}
    >
      {/* Fixed-width icon column - never moves */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
      >
        <Icon className={cn('shrink-0', iconSizeClass)} />
      </div>
      {/* Label text */}
      <span className="text-base whitespace-nowrap overflow-hidden w-auto">{label}</span>
      {/* Badge */}
      {badge ? (
        <span
          className="ml-auto mr-2 shrink-0 inline-flex items-center h-4 rounded px-1.5 text-[10px] font-medium select-none"
          style={
            badgeVariant === 'primary'
              ? { color: 'var(--primary-foreground)', backgroundColor: 'var(--primary)' }
              : { color: 'var(--lg-text-secondary)', backgroundColor: 'var(--lg-control)' }
          }
        >
          {badge}
        </span>
      ) : null}
      {/* Keyboard shortcut */}
      {shortcut ? (
        <Kbd className="ml-auto mr-2 h-[18px] !text-[12px] px-1.5 bg-lg-control text-inherit border-lg-separator">
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
