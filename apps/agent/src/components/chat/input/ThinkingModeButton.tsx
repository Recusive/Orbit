import { IconImagine } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconImagine';
import { Coins } from 'lucide-react';

import type { ThinkingModeButtonProps } from './types';
import type { FC } from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn, TRANSITION_CLASSES } from '@/lib/utils';

export const ThinkingModeButton: FC<ThinkingModeButtonProps> = ({
  thinkingMode,
  thinkingHoverOpen,
  setThinkingHoverOpen,
  cycleThinkingMode,
  getThinkingInfo,
  getActiveDots,
}) => {
  const activeDots = getActiveDots();
  const thinkingInfo = getThinkingInfo();

  return (
    <HoverCard open={thinkingHoverOpen}>
      <div
        onMouseEnter={() => {
          setThinkingHoverOpen(true);
        }}
        onMouseLeave={() => {
          setThinkingHoverOpen(false);
        }}
      >
        <HoverCardTrigger asChild>
          <button
            onClick={cycleThinkingMode}
            aria-label={`Extended thinking: ${thinkingInfo.level}. Click to change.`}
            className={cn(
              'h-7 flex items-center justify-center gap-1 px-1.5 rounded-lg',
              TRANSITION_CLASSES.button,
              'hover:bg-lg-control-hover hover:scale-[1.02]',
              'active:scale-95',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
              thinkingMode === 'off' && 'text-muted-foreground/70 hover:text-foreground'
            )}
          >
            <IconImagine
              size={16}
              className={cn(
                'transition-colors duration-150',
                thinkingMode !== 'off' && 'text-foreground'
              )}
            />
            {/* Vertical dots indicator */}
            <div className="flex flex-col gap-[2px]">
              {[2, 1, 0].map((dotIndex) => {
                const isActive = dotIndex < activeDots;
                return (
                  <div
                    key={dotIndex}
                    className={cn(
                      'w-[4px] h-[4px] rounded-full transition-[background-color,box-shadow] duration-200',
                      isActive
                        ? 'bg-black dark:bg-white shadow-[0_0_6px_rgba(0,0,0,0.4)] dark:shadow-[0_0_6px_rgba(255,255,255,0.8)]'
                        : 'bg-muted-foreground/30'
                    )}
                  />
                );
              })}
            </div>
          </button>
        </HoverCardTrigger>
      </div>
      <HoverCardContent
        side="top"
        align="center"
        className="w-auto p-2.5"
        onMouseEnter={() => {
          setThinkingHoverOpen(true);
        }}
        onMouseLeave={() => {
          setThinkingHoverOpen(false);
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <IconImagine
              size={16}
              className={cn(thinkingMode !== 'off' ? 'text-foreground' : 'text-muted-foreground')}
            />
            <span className="text-xs font-medium">{thinkingInfo.level}</span>
          </div>
          {thinkingMode !== 'off' ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Coins className="h-3 w-3" />
              <span>{thinkingInfo.tokens} tokens</span>
            </div>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
