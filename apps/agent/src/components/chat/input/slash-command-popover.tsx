import { useEffect, useRef } from 'react';

import type { FC } from 'react';

import { IconSkills } from '@/components/layout/primary-sidebar/components/IconSkills';
import { Command, CommandEmpty, CommandGroup, CommandList } from '@/components/ui/command';
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
  /** Distinguishes skills from regular slash commands */
  kind?: 'command' | 'skill';
}

// UI-only commands that are handled client-side (not from backend)
const UI_COMMANDS: SlashCommand[] = [];

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

  // Filter items based on query — "skills" shows all skills unfiltered
  const filteredCommands = filterItems(allCommands, query);

  const handleSelect = (command: SlashCommand): void => {
    onSelect(command);
    onOpenChange(false);
  };

  // Cast the anchor ref to Measurable (HTMLElement has getBoundingClientRect)
  const measurableRef = anchorRef as React.RefObject<Measurable>;

  // Pre-compute indexed arrays in render order (commands first, then skills)
  // so keyboard navigation indices match the visual order without a mutable counter.
  const commandItems = filteredCommands.filter((cmd) => cmd.kind !== 'skill');
  const skillItems = filteredCommands.filter((cmd) => cmd.kind === 'skill');
  const indexedCommandItems = commandItems.map((cmd, i) => ({ cmd, idx: i }));
  const indexedSkillItems = skillItems.map((cmd, i) => ({ cmd, idx: commandItems.length + i }));

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={measurableRef} />
      <PopoverContent
        className="w-[280px] p-0 rounded-[12px] border border-lg-separator shadow-lg"
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
        <Command shouldFilter={false} className="rounded-[12px] bg-transparent">
          <CommandList className="scroll-py-2 pb-1.5">
            {filteredCommands.length === 0 ? <CommandEmpty>No commands found.</CommandEmpty> : null}

            {indexedCommandItems.length > 0 ? (
              <CommandGroup
                heading="Commands"
                className="**:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:text-muted-foreground/60"
              >
                {indexedCommandItems.map(({ cmd, idx }) => (
                  <CommandItem
                    key={`cmd-${cmd.name}`}
                    command={cmd}
                    isSelected={selectedIndex === idx}
                    isFirst={idx === 0}
                    isLast={idx === filteredCommands.length - 1}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {indexedSkillItems.length > 0 ? (
              <CommandGroup
                heading="Skills"
                className="**:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:text-muted-foreground/60"
              >
                {indexedSkillItems.map(({ cmd, idx }) => (
                  <CommandItem
                    key={`skill-${cmd.name}`}
                    command={cmd}
                    isSelected={selectedIndex === idx}
                    isFirst={idx === 0}
                    isLast={idx === filteredCommands.length - 1}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            ) : null}
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

// Shared filter logic — "skills" shows all skills unfiltered
const filterItems = (allCommands: SlashCommand[], query: string): SlashCommand[] => {
  const lq = query.toLowerCase();
  const isSkillsQuery = lq === 'skills';
  return allCommands.filter(
    (cmd) =>
      (isSkillsQuery && cmd.kind === 'skill') ||
      cmd.name.toLowerCase().includes(lq) ||
      cmd.description.toLowerCase().includes(lq)
  );
};

// Export helper to get filtered commands count
export const getFilteredCommandsCount = (query: string, commands: SlashCommand[] = []): number =>
  filterItems(mergeCommands(commands), query).length;

// Export helper to get command at index
export const getCommandAtIndex = (
  query: string,
  index: number,
  commands: SlashCommand[] = []
): SlashCommand | null => {
  const filtered = filterItems(mergeCommands(commands), query);
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
        'relative flex cursor-pointer gap-2.5 select-none items-center border-l-2 border-transparent pl-2 pr-2.5 py-2 outline-none',
        isSelected
          ? 'rounded-r-md bg-primary/10 text-foreground border-primary/60'
          : 'rounded-md hover:bg-lg-control-hover active:scale-[0.99]'
      )}
    >
      {command.kind === 'skill' ? (
        <IconSkills className="size-4 shrink-0 text-muted-foreground/70" />
      ) : (
        <span className="text-muted-foreground/70 font-mono text-base">/</span>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-base font-medium">{command.name}</span>
        <span className="truncate text-sm text-muted-foreground/60">{command.description}</span>
      </div>
    </div>
  );
};
