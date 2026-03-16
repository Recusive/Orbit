/**
 * SlashCommandPopover — inline command palette for "/" commands
 *
 * Renders as an absolutely-positioned element inside the input box container
 * (NOT a Radix portal). This means it resizes and repositions in lockstep with
 * the chat input — no JS-based position recalculation, no frame lag.
 */
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { FC } from 'react';

import { IconSkills } from '@/components/layout/primary-sidebar/components/IconSkills';
import { Command, CommandEmpty, CommandGroup, CommandList } from '@/components/ui/command';
import { useSmoothScroll } from '@/hooks/ui';
import { cn, POPOVER_ANIMATION } from '@/lib/utils';

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
  readonly selectedIndex: number;
  /** Commands fetched from backend (will be merged with UI commands) */
  readonly commands?: SlashCommand[];
}

export const SlashCommandPopover: FC<SlashCommandPopoverProps> = ({
  open,
  onOpenChange,
  query,
  onSelect,
  selectedIndex,
  commands = [],
}) => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // ── Local search state ──────────────────────────────────────────────
  // Syncs from the parent's query (typed in chat input after "/"), but
  // the user can also type directly in the search bar to refine further.
  const [searchQuery, setSearchQuery] = useState(query);

  useEffect(() => {
    setSearchQuery(query);
  }, [query]);

  // Don't auto-focus the search bar — the user is already typing in the chat
  // input and arrow-key navigation is handled by the parent's handleKeyDown.
  // The search bar gets focus only when the user explicitly clicks it.

  // ── Filtering ───────────────────────────────────────────────────────
  const allCommands = [
    ...commands,
    ...UI_COMMANDS.filter((ui) => !commands.some((c) => c.name === ui.name)),
  ];
  const filteredCommands = filterItems(allCommands, searchQuery);

  const handleSelect = (command: SlashCommand): void => {
    onSelect(command);
    onOpenChange(false);
  };

  // Pre-compute indexed arrays in render order (commands first, then skills)
  const commandItems = filteredCommands.filter((cmd) => cmd.kind !== 'skill');
  const skillItems = filteredCommands.filter((cmd) => cmd.kind === 'skill');
  const indexedCommandItems = commandItems.map((cmd, i) => ({ cmd, idx: i }));
  const indexedSkillItems = skillItems.map((cmd, i) => ({ cmd, idx: commandItems.length + i }));

  if (!open) return null;

  return (
    <div
      data-side="top"
      className={cn(
        'absolute bottom-full left-0 right-0 z-50 mb-2 glass-surface p-0',
        // Enter animation — matches Radix popover feel
        'animate-in fade-in-0 zoom-in-[0.97] slide-in-from-bottom-1'
      )}
      style={{
        animationDuration: POPOVER_ANIMATION.enterDuration,
        animationTimingFunction: POPOVER_ANIMATION.enterEasing,
      }}
      // Prevent clicks inside the popover from bubbling to the chat input
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
        }
      }}
    >
      <Command shouldFilter={false} className="bg-transparent">
        {/* Search bar */}
        <div className="flex items-center px-1.5 pt-1.5 pb-0.5">
          <div className="relative flex-1">
            <Search
              className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenChange(false);
                }
              }}
              placeholder="Search commands"
              className="w-full h-7 rounded-[7px] bg-control-fill pl-7 pr-2.5 text-[12px] outline-none placeholder:text-muted-foreground/40 focus:bg-control-fill-hover"
              aria-label="Search commands"
            />
          </div>
        </div>

        <CommandList
          ref={smoothScrollRef}
          className="max-h-72 overflow-y-auto overscroll-y-contain pb-0 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_6px,black_calc(100%-6px),transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_6px,black_calc(100%-6px),transparent)]"
        >
          {filteredCommands.length === 0 ? (
            <CommandEmpty className="px-2.5 py-4 text-center text-[12px] text-muted-foreground/50">
              No commands found.
            </CommandEmpty>
          ) : null}

          {indexedCommandItems.length > 0 ? (
            <CommandGroup heading="Commands">
              {indexedCommandItems.map(({ cmd, idx }) => (
                <SlashCommandItem
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
            <CommandGroup heading="Skills">
              {indexedSkillItems.map(({ cmd, idx }) => (
                <SlashCommandItem
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
    </div>
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

interface SlashCommandItemProps {
  readonly command: SlashCommand;
  readonly isSelected: boolean;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onSelect: (command: SlashCommand) => void;
}

const SlashCommandItem: FC<SlashCommandItemProps> = ({
  command,
  isSelected,
  isFirst,
  isLast,
  onSelect,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when selected.
  // Uses getBoundingClientRect relative to the scroll container instead of
  // offsetTop, which can be wrong when cmdk nests items inside group/sizer divs
  // whose offsetParent isn't the scroll container.
  useEffect(() => {
    if (isSelected && itemRef.current) {
      const el = itemRef.current;
      const container = el.closest('[cmdk-list]');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        // Element's top position within the scrollable content
        const elTopInContainer = elRect.top - containerRect.top + container.scrollTop;

        if (isFirst || elRect.top < containerRect.top) {
          container.scrollTop = elTopInContainer - 8;
        } else if (isLast || elRect.bottom > containerRect.bottom) {
          container.scrollTop = elTopInContainer - container.clientHeight + el.offsetHeight + 8;
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
        'relative flex cursor-default select-none items-center gap-1.5 min-w-0 py-1.5 px-2.5 rounded-[9px] outline-none',
        isSelected ? 'bg-foreground/8 text-foreground' : 'text-foreground hover:bg-foreground/8'
      )}
    >
      {command.kind === 'skill' ? (
        <IconSkills className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      ) : (
        <span className="text-muted-foreground/70 font-mono text-[12px] shrink-0">/</span>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[12px] font-medium truncate">{command.name}</span>
        <span className="truncate text-[11px] text-muted-foreground/50">{command.description}</span>
      </div>
    </div>
  );
};
