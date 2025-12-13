import { useEffect, useRef } from 'react';

import type { FC } from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Measurable interface expected by Radix Popover
interface Measurable {
  getBoundingClientRect(): DOMRect;
}

export interface SlashCommand {
  name: string;
  description: string;
  icon?: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'compact', description: 'Toggle compact message view' },
  { name: 'clear', description: 'Clear current conversation' },
  { name: 'help', description: 'Show available commands' },
  { name: 'new', description: 'Start a new conversation' },
  { name: 'model', description: 'Change the AI model' },
  { name: 'settings', description: 'Open settings' },
];

interface SlashCommandPopoverProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly query: string;
  readonly onSelect: (command: SlashCommand) => void;
  readonly anchorRef: React.RefObject<HTMLElement | null>;
  readonly selectedIndex: number;
}

export const SlashCommandPopover: FC<SlashCommandPopoverProps> = ({
  open,
  onOpenChange,
  query,
  onSelect,
  anchorRef,
  selectedIndex,
}) => {
  // Filter commands based on query
  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (command: SlashCommand): void => {
    onSelect(command);
    onOpenChange(false);
  };

  // Cast the anchor ref to Measurable (HTMLElement has getBoundingClientRect)
  const measurableRef = anchorRef as React.RefObject<Measurable>;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={measurableRef} />
      <PopoverContent
        className="w-[280px] p-0"
        side="top"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => { e.preventDefault(); }}
        onInteractOutside={(e) => { e.preventDefault(); }}
      >
        <Command
          shouldFilter={false}
          className="rounded-lg"
        >
          <CommandList className="scroll-py-2">
            {filteredCommands.length === 0 ? (
              <CommandEmpty>No commands found.</CommandEmpty>
            ) : null}

            <CommandGroup heading="Commands">
              {filteredCommands.map((cmd, idx) => (
                <CommandItem
                  key={cmd.name}
                  command={cmd}
                  isSelected={selectedIndex === idx}
                  isFirst={idx === 0}
                  isLast={idx === filteredCommands.length - 1}
                  onSelect={handleSelect}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// Export helper to get filtered commands count
export const getFilteredCommandsCount = (query: string): number => {
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  ).length;
};

// Export helper to get command at index
export const getCommandAtIndex = (query: string, index: number): SlashCommand | null => {
  const filtered = SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );
  return filtered[index] ?? null;
};

interface CommandItemProps {
  readonly command: SlashCommand;
  readonly isSelected: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onSelect: (command: SlashCommand) => void;
}

const CommandItem: FC<CommandItemProps> = ({ command, isSelected, isFirst, isLast, onSelect }) => {
  const itemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when selected
  useEffect(() => {
    if (isSelected && itemRef.current) {
      const el = itemRef.current;
      const container = el.closest('[cmdk-list]');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        if (isFirst || elRect.top < containerRect.top) {
          container.scrollTop = el.offsetTop - 8;
        } else if (isLast || elRect.bottom > containerRect.bottom) {
          container.scrollTop = el.offsetTop - container.clientHeight + el.offsetHeight + 8;
        }
      }
    }
  }, [isSelected, isFirst, isLast]);

  return (
    <div
      ref={itemRef}
      onClick={() => { onSelect(command); }}
      className={cn(
        'relative flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
    >
      <span className="text-muted-foreground font-mono">/</span>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium">{command.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {command.description}
        </span>
      </div>
    </div>
  );
};
