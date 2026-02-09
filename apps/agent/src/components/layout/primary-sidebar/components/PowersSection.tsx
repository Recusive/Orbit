/**
 * PowersSection - Collapsible "Powers" tree with child items
 *
 * Mirrors the worktree expand/collapse pattern:
 * icon + label header with chevron, vertical tree line, indented children.
 */
import { Slash } from 'lucide-react';
import { useCallback, useState } from 'react';

import { IconMcp } from './IconMcp';
import { IconPlugins } from './IconPlugins';
import { IconPowers } from './IconPowers';
import { IconSkills } from './IconSkills';

import type { FC } from 'react';

import { cn, getCollapseTransition, SIDEBAR } from '@/lib/utils';

/** Indent for child items — matches CONVERSATION_INDENT_PX (19px) */
const POWERS_INDENT_PX = 19;

/** Slash icon with the -rotate-[25deg] treatment from settings page */
const SlashIcon: FC<{ className?: string }> = ({ className }) => (
  <Slash className={cn(className, '-rotate-[25deg] !h-3 !w-3')} />
);

interface PowerChildItem {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
}

const POWER_ITEMS: readonly PowerChildItem[] = [
  { icon: IconPlugins, label: 'Plugins' },
  { icon: IconSkills, label: 'Skills' },
  { icon: IconMcp, label: 'MCP' },
  { icon: SlashIcon, label: 'Slash Commands' },
];

interface PowersSectionProps {
  readonly collapsed: boolean;
}

export const PowersSection: FC<PowersSectionProps> = ({ collapsed }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = useCallback((): void => {
    setIsExpanded((prev) => !prev);
  }, []);

  const iconSizeClass = 'h-4 w-4';

  // When sidebar is fully collapsed, render a compact square button (same as SidebarItem equalSpacing)
  if (collapsed) {
    return (
      <div
        className="flex items-center justify-center shrink-0"
        style={{ height: SIDEBAR.itemHeight, width: SIDEBAR.iconColumnWidth }}
      >
        <button
          className="relative h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-95 transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground before:absolute before:content-[''] before:inset-[-8px]"
          aria-label="Powers"
          title="Powers — Coming soon"
        >
          <IconPowers className={cn('shrink-0', iconSizeClass)} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header — identical structure to SidebarItem expanded layout */}
      <button
        className={cn(
          'flex items-center gap-1.5 h-8 rounded-lg mx-1.5 overflow-hidden hover:bg-gray-3 dark:hover:bg-gray-4 active:scale-[0.98] transition-[background-color,transform] duration-100 text-sidebar-foreground hover:text-foreground',
          isExpanded && 'bg-gray-3 dark:bg-gray-4 text-foreground'
        )}
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        {/* Fixed-width icon column */}
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: SIDEBAR.iconColumnWidth - SIDEBAR.itemPadding }}
        >
          <IconPowers className={cn('shrink-0', iconSizeClass)} />
        </div>

        {/* Label */}
        <span
          className="text-base whitespace-nowrap overflow-hidden w-auto opacity-100"
          style={{ transition: getCollapseTransition(false) }}
        >
          Powers
        </span>

        {/* Badge */}
        <span
          className="ml-auto mr-2 shrink-0 inline-flex items-center h-4 rounded px-1.5 text-[10px] font-medium select-none"
          style={{
            color: 'var(--gray-11)',
            backgroundColor: 'var(--gray-a4)',
          }}
        >
          Coming soon
        </span>
      </button>

      {/* Expandable child items — kept mounted, toggled via CSS */}
      <div style={{ display: isExpanded ? 'block' : 'none' }}>
        <div className="relative mt-1" style={{ marginLeft: POWERS_INDENT_PX }}>
          {/* Vertical tree line */}
          <div
            className="absolute top-0 bottom-2 w-[2px] rounded-full bg-border/60"
            style={{ left: -2 }}
          />
          {/* Child items */}
          <div className="flex flex-col gap-0.5">
            {POWER_ITEMS.map((item) => (
              <div key={item.label} className="relative group mx-1.5 ml-2">
                <button
                  className="flex items-center gap-2 h-7 w-full rounded-lg pl-[7px] pr-3 overflow-hidden hover:bg-gray-3 dark:hover:bg-gray-4 transition-[background-color] duration-100 text-sidebar-foreground hover:text-foreground"
                  title={item.label}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-sm overflow-hidden flex-1 text-left truncate">
                    {item.label}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
