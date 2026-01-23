/**
 * SidebarItem - Reusable sidebar row with icon, label, and optional shortcut
 */
import type { SidebarItemProps } from '../types';
import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { cn, SIDEBAR, TRANSITIONS } from '@/lib/utils';

// Transition string builder
const getCollapseTransition = (collapsed: boolean): string =>
  collapsed
    ? `opacity 0ms, width ${TRANSITIONS.sidebar}`
    : `width ${TRANSITIONS.sidebar}, opacity ${TRANSITIONS.opacity} ${String(TRANSITIONS.opacityDelay)}ms`;

export const SidebarItem: FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  collapsed,
  active,
  small,
  large,
  equalSpacing,
  shortcut,
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
            'h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150',
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          title={label}
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
        'flex items-center gap-1.5 h-8 rounded-lg mx-1.5 overflow-hidden hover:bg-muted/50 active:scale-[0.98] transition-[background-color,color,transform] duration-200',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
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
      {/* Keyboard shortcut */}
      {shortcut && !collapsed ? (
        <KbdGroup className="ml-auto mr-2">
          {shortcut.map((key, index) => (
            <Kbd key={index} className="bg-foreground/10 text-inherit border-foreground/15">
              {key}
            </Kbd>
          ))}
        </KbdGroup>
      ) : null}
    </button>
  );
};
