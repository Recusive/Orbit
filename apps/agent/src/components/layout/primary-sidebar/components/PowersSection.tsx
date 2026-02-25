/**
 * PowersSection - Collapsible "Powers" tree with child items
 *
 * Mirrors the worktree expand/collapse pattern:
 * icon + label header with chevron, vertical tree line, indented children.
 */
import { Slash, Users } from 'lucide-react';
import { useCallback, useState } from 'react';

import { IconMcp } from './IconMcp';
import { IconPlugins } from './IconPlugins';
import { IconPowers } from './IconPowers';
import { IconSkills } from './IconSkills';

import type { FC } from 'react';

import { cn, SIDEBAR } from '@/lib/utils';

/** Indent for child items — matches CONVERSATION_INDENT_PX (19px) */
const POWERS_INDENT_PX = 19;

/** Evaluated once — reduced-motion preference is static for session lifetime */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Asymmetric enter/exit transitions — mirrors ConversationList pattern.
 * Enter: ease-out (fast arrival, gentle settle) — 200ms
 * Exit:  ease-in  (gentle start, fast disappearance) — 150ms
 */
const GRID_ENTER = 'grid-template-rows 200ms cubic-bezier(0.16, 1, 0.3, 1)';
const GRID_EXIT = 'grid-template-rows 150ms cubic-bezier(0.4, 0, 1, 1)';
const OPACITY_ENTER = 'opacity 150ms cubic-bezier(0.16, 1, 0.3, 1)';
const OPACITY_EXIT = 'opacity 100ms cubic-bezier(0.4, 0, 1, 1)';

/** Slash icon with the -rotate-[25deg] treatment from settings page */
const SlashIcon: FC<{ className?: string }> = ({ className }) => (
  <Slash className={cn(className, '-rotate-[25deg] !h-3 !w-3')} />
);

interface PowerChildItem {
  readonly icon: FC<{ className?: string }>;
  readonly label: string;
  readonly comingSoon?: boolean;
}

const POWER_ITEMS: readonly PowerChildItem[] = [
  { icon: IconPlugins, label: 'Plugins', comingSoon: true },
  { icon: IconSkills, label: 'Skills' },
  { icon: IconMcp, label: 'MCP', comingSoon: true },
  { icon: SlashIcon, label: 'Slash Commands', comingSoon: true },
  { icon: Users, label: 'Sub Agents', comingSoon: true },
];

interface PowersSectionProps {
  readonly onSkillsClick?: () => void;
}

export const PowersSection: FC<PowersSectionProps> = ({ onSkillsClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = useCallback((): void => {
    setIsExpanded((prev) => !prev);
  }, []);

  const iconSizeClass = 'h-4 w-4';

  return (
    <div className="flex flex-col">
      {/* Header — identical structure to SidebarItem expanded layout */}
      <button
        className={cn(
          'flex items-center gap-1.5 h-8 rounded-[9px] mx-1.5 overflow-hidden hover:bg-lg-sidebar-hover active:scale-[0.98] transition-transform duration-75 text-sidebar-foreground hover:text-foreground',
          isExpanded && 'bg-lg-sidebar-selected text-foreground'
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
        <span className="text-base whitespace-nowrap overflow-hidden w-auto">Powers</span>
      </button>

      {/* Expandable child items — animated via CSS Grid row transition */}
      <div
        className="grid"
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          transition: PREFERS_REDUCED_MOTION ? undefined : isExpanded ? GRID_ENTER : GRID_EXIT,
        }}
      >
        <div
          className="overflow-hidden"
          style={{
            opacity: isExpanded ? 1 : 0,
            transition: PREFERS_REDUCED_MOTION
              ? undefined
              : isExpanded
                ? OPACITY_ENTER
                : OPACITY_EXIT,
          }}
        >
          <div className="relative mt-1" style={{ marginLeft: POWERS_INDENT_PX }}>
            {/* Vertical tree line — fades at bottom to match conversation list */}
            <div
              className="absolute top-0 bottom-2 w-[2px] rounded-full bg-border/60"
              style={{
                left: -2,
                maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
              }}
            />
            {/* Child items */}
            <div className="flex flex-col gap-0.5">
              {POWER_ITEMS.map((item) => (
                <div key={item.label} className="relative group mx-1.5 ml-2">
                  <button
                    className={cn(
                      'flex items-center gap-2 h-7 w-full rounded-[9px] pl-[7px] pr-3 overflow-hidden',
                      item.comingSoon === true
                        ? 'text-sidebar-foreground/40 cursor-default'
                        : 'hover:bg-lg-sidebar-hover text-sidebar-foreground hover:text-foreground'
                    )}
                    title={item.label}
                    onClick={item.label === 'Skills' ? onSkillsClick : undefined}
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-sm overflow-hidden flex-1 text-left truncate">
                      {item.label}
                    </span>
                    {item.comingSoon === true && (
                      <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-foreground/5 text-muted-foreground/50 shrink-0">
                        Soon
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
