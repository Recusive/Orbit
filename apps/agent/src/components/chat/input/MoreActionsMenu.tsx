import { IconImagine } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconImagine';
import { AtSign, Globe, Settings2 } from 'lucide-react';
import { memo } from 'react';

import type { MoreActionsMenuProps } from './types';
import type { FC } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Collapsed menu for secondary input actions (@, Thinking, Globe).
 * Rendered when the input controls container is below the collapse breakpoint.
 *
 * Uses DropdownMenu (not Popover) for proper menu semantics:
 * - role="menu" / role="menuitem"
 * - Arrow key navigation
 * - Escape to close
 */
export const MoreActionsMenu: FC<MoreActionsMenuProps> = memo(function MoreActionsMenu({
  handleAtClick,
  cycleThinkingMode,
  thinkingMode,
  getThinkingInfo,
  handleGlobeClick,
}) {
  const thinkingInfo = getThinkingInfo();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="More actions"
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded-lg',
            'bg-transparent text-muted-foreground/70',
            'transition-[background-color,color,transform] duration-150',
            'hover:bg-muted/50 hover:text-foreground hover:scale-[1.08]',
            'active:scale-95',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
          )}
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleAtClick}>
          <AtSign className="mr-2 h-4 w-4" />
          Add context
        </DropdownMenuItem>
        <DropdownMenuItem onClick={cycleThinkingMode}>
          <IconImagine size={16} className={cn('mr-2', thinkingMode !== 'off' && 'text-primary')} />
          <span className="flex-1">Thinking</span>
          <span className="text-xs text-muted-foreground">{thinkingInfo.level}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleGlobeClick?.()}
          disabled={handleGlobeClick === undefined}
          className={cn(handleGlobeClick === undefined && 'opacity-50 cursor-not-allowed')}
        >
          <Globe className="mr-2 h-4 w-4" />
          Web browser
          {handleGlobeClick === undefined && (
            <span className="ml-auto text-xs text-muted-foreground">Soon</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
