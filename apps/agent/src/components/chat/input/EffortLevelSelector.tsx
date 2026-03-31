/**
 * EffortLevelSelector — Popover dropdown for Opus 4.6 effort levels.
 *
 * Uses plain buttons inside a Popover instead of cmdk Command,
 * since we only have 4 fixed items and cmdk's pointer-event
 * management blocks Radix Tooltip from working.
 */
import { IconImagine } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconImagine';
import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useState } from 'react';

import { EFFORT_LEVEL_INFO, EFFORT_LEVELS } from './constants';

import type { EffortLevel } from '@/types/protocol';
import type { FC } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, TRANSITION_CLASSES } from '@/lib/utils';

interface EffortLevelSelectorProps {
  readonly effortLevel: EffortLevel;
  readonly onEffortChange: (level: EffortLevel) => void;
}

export const EffortLevelSelector: FC<EffortLevelSelectorProps> = ({
  effortLevel,
  onEffortChange,
}) => {
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback(
    (level: EffortLevel): void => {
      onEffortChange(level);
      setOpen(false);
    },
    [onEffortChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Effort level: ${EFFORT_LEVEL_INFO[effortLevel].level}`}
          className={cn(
            'h-7 px-2.5 flex items-center gap-1.5 rounded-full',
            'bg-transparent text-muted-foreground',
            TRANSITION_CLASSES.button,
            'hover:bg-lg-control-hover hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
            open && 'bg-lg-control text-foreground'
          )}
        >
          <IconImagine size={14} className="shrink-0" />
          <span className="max-w-[120px] truncate text-md font-medium">
            {EFFORT_LEVEL_INFO[effortLevel].level}
          </span>
          <ChevronDown
            className={cn(
              'h-3 w-3 text-muted-foreground/50 transition-transform duration-150',
              open && 'rotate-180'
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[130px] rounded-[10px] p-1.5"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <div className="text-[11px] font-medium text-muted-foreground/70 px-1 pt-0.5 pb-1.5">
          Effort level
        </div>
        <TooltipProvider delayDuration={0} disableHoverableContent>
          <div className="flex flex-col gap-0.5">
            {EFFORT_LEVELS.map((level) => (
              <Tooltip key={level}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      handleSelect(level);
                    }}
                    className={cn(
                      'flex items-center gap-1.5 w-full rounded-[8px] px-1 py-1.5 text-sm',
                      'text-foreground outline-none',
                      'hover:bg-foreground/8',
                      effortLevel === level && 'bg-foreground/8'
                    )}
                  >
                    <IconImagine size={12} className="shrink-0" />
                    <span className="truncate text-md">{EFFORT_LEVEL_INFO[level].level}</span>
                    {effortLevel === level ? (
                      <Check className="h-3.5 w-3.5 shrink-0 ml-auto" />
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12}>
                  {EFFORT_LEVEL_INFO[level].description}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
};
