import { IconImagine } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconImagine';
import { Settings2 } from 'lucide-react';
import { memo } from 'react';

import type { MoreActionsMenuProps } from './types';
import type { EffortLevel } from '@/types/protocol';
import type { FC } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, TRANSITION_CLASSES } from '@/lib/utils';

/**
 * Collapsed menu for secondary input actions (Thinking/Effort).
 * Rendered when the input controls container is below the collapse breakpoint.
 *
 * Uses DropdownMenu (not Popover) for proper menu semantics:
 * - role="menu" / role="menuitem"
 * - Arrow key navigation
 * - Escape to close
 */
export const MoreActionsMenu: FC<MoreActionsMenuProps> = memo(function MoreActionsMenu({
  model,
  cycleThinkingMode,
  thinkingMode,
  getThinkingInfo,
  cycleEffortLevel,
  effortLevel,
  getEffortInfo,
}) {
  const isAdaptiveModel = model === 'claude-opus-4-6' || model === 'claude-sonnet-4-6';
  const thinkingInfo = getThinkingInfo();
  const effortInfo = getEffortInfo();

  const effortColorMap: Record<EffortLevel, string> = {
    low: 'var(--info)',
    medium: 'var(--success)',
    high: 'var(--warning)',
    max: 'var(--destructive)',
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="More actions"
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded-lg',
            'bg-transparent text-muted-foreground/70',
            TRANSITION_CLASSES.button,
            'hover:bg-lg-control-hover hover:text-foreground hover:scale-[1.08]',
            'active:scale-95',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
          )}
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {isAdaptiveModel ? (
          <DropdownMenuItem onClick={cycleEffortLevel}>
            <svg width="16" height="16" viewBox="0 0 16 16" className="mr-2" aria-hidden="true">
              <line
                x1="0"
                y1="8"
                x2="16"
                y2="8"
                stroke="var(--muted-foreground)"
                strokeWidth="0.5"
                opacity="0.3"
              />
              <path
                d="M 1 8 L 4.5 8 L 5.5 6.5 L 6.5 2.5 L 7.5 11 L 8 8 L 9 7 L 9.5 8 L 15 8"
                fill="none"
                stroke={effortColorMap[effortLevel]}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="flex-1">Effort</span>
            <span className="text-xs" style={{ color: effortColorMap[effortLevel] }}>
              {effortInfo.level}
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={cycleThinkingMode}>
            <IconImagine
              size={16}
              className={cn('mr-2', thinkingMode !== 'off' && 'text-foreground')}
            />
            <span className="flex-1">Thinking</span>
            <span className="text-xs text-muted-foreground">{thinkingInfo.level}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
