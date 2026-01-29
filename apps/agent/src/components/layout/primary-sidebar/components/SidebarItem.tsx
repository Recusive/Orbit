/**
 * SidebarItem - Reusable sidebar row with icon, label, and optional shortcut
 */
import type { SidebarItemProps } from '../types';
import type { FC } from 'react';

import { Kbd, KbdGroup } from '@/components/ui/kbd';
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
            "relative h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 active:scale-95 transition-[background-color,color,transform] duration-150 before:absolute before:content-[''] before:inset-[-8px]",
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
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
      {/* Badge */}
      {badge && !collapsed ? (
        <span
          className="ml-auto mr-2 shrink-0 inline-flex items-center h-4 rounded border-dotted px-1 text-[10px] font-medium select-none"
          style={{
            color: 'var(--warning-foreground)',
            borderWidth: '1.5px',
            borderColor: 'var(--warning)',
            backgroundColor: 'color-mix(in oklch, var(--warning) 10%, transparent)',
          }}
        >
          {badge}
        </span>
      ) : null}
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
