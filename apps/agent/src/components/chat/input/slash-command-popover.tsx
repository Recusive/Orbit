import { useEffect, useRef } from 'react';

import type { FC } from 'react';

import { Command, CommandEmpty, CommandGroup, CommandList } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils/utils';

// Measurable interface expected by Radix Popover
interface Measurable {
  getBoundingClientRect(): DOMRect;
}

export interface SlashCommand {
  name: string;
  description: string;
  icon?: string;
}

// UI-only commands that are handled client-side (not from backend)
const UI_COMMANDS: SlashCommand[] = [
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
  /** Commands fetched from backend (will be merged with UI commands) */
  readonly commands?: SlashCommand[];
}

export const SlashCommandPopover: FC<SlashCommandPopoverProps> = ({
  open,
  onOpenChange,
  query,
  onSelect,
  anchorRef,
  selectedIndex,
  commands = [],
}) => {
  // Merge backend commands with UI-only commands, avoiding duplicates
  const allCommands = [
    ...commands,
    ...UI_COMMANDS.filter((ui) => !commands.some((c) => c.name === ui.name)),
  ];

  // Filter commands based on query
  const filteredCommands = allCommands.filter(
    (cmd) =>
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
        className="w-[280px] p-0 rounded-lg border-border/50 bg-popover/98 backdrop-blur-sm shadow-lg"
        side="top"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <Command shouldFilter={false} className="rounded-lg bg-transparent">
          <CommandList className="scroll-py-2">
            {filteredCommands.length === 0 ? <CommandEmpty>No commands found.</CommandEmpty> : null}

            <CommandGroup
              heading="Commands"
              className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground/60"
            >
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

// Helper to merge commands with UI commands
const mergeCommands = (commands: SlashCommand[]): SlashCommand[] => [
  ...commands,
  ...UI_COMMANDS.filter((ui) => !commands.some((c) => c.name === ui.name)),
];

// Export helper to get filtered commands count
export const getFilteredCommandsCount = (query: string, commands: SlashCommand[] = []): number => {
  const allCommands = mergeCommands(commands);
  return allCommands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase())
  ).length;
};

// Export helper to get command at index
export const getCommandAtIndex = (
  query: string,
  index: number,
  commands: SlashCommand[] = []
): SlashCommand | null => {
  const allCommands = mergeCommands(commands);
  const filtered = allCommands.filter(
    (cmd) =>
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
      onClick={() => {
        onSelect(command);
      }}
      className={cn(
        'relative flex cursor-pointer gap-2.5 select-none items-center px-2.5 py-2 outline-none transition-all duration-150',
        isSelected
          ? 'rounded-r-md bg-primary/10 text-foreground border-l-2 border-primary/60 pl-2'
          : 'rounded-md hover:bg-muted/50 active:scale-[0.99]'
      )}
    >
      <span className="text-muted-foreground/70 font-mono text-base">/</span>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-base font-medium">{command.name}</span>
        <span className="truncate text-sm text-muted-foreground/60">{command.description}</span>
      </div>
    </div>
  );
};
