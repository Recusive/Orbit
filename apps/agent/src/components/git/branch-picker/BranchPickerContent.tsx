/**
 * BranchPickerContent - Reusable branch picker popover content
 *
 * Renders the searchable branch list + optional "Create and checkout new branch..." button.
 * Designed to be placed inside a <PopoverContent> by the parent — does NOT own the popover
 * or trigger. Both source-control BranchSelector and sidebar WorktreeItem compose this.
 *
 * The create-branch dialog is intentionally NOT rendered here — it lives at the parent level
 * via CreateBranchDialog, so it doesn't unmount when the popover closes.
 */
import { IconBranch } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconBranch';
import { IconPlusLarge } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconPlusLarge';
import { Check, Search } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { GitBranch } from '@/lib/api';
import type { FC } from 'react';

import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { useSmoothScroll } from '@/hooks/ui';

export interface BranchPickerContentProps {
  /** Currently checked-out branch name (to show check mark) */
  readonly currentBranch: string | null;
  /** Available branches to display (should be pre-filtered to local only) */
  readonly branches: GitBranch[];
  /** Called when the user selects a branch to checkout */
  readonly onCheckout: (branch: string) => void;
  /** Called when the user wants to create a new branch. Receives the search query as a suggested name. If omitted, create button is hidden. */
  readonly onRequestCreate?: (suggestedName: string) => void;
  /** Called when the popover should close (after branch selection or entering create mode) */
  readonly onClose: () => void;
}

export const BranchPickerContent: FC<BranchPickerContentProps> = ({
  currentBranch,
  branches,
  onCheckout,
  onRequestCreate,
  onClose,
}) => {
  const smoothScrollRef = useSmoothScroll(0.08);

  // Search state
  const [query, setQuery] = useState('');
  const [cmdkValue, setCmdkValue] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleBranches = useMemo(() => {
    return branches.filter((branch) => {
      if (normalizedQuery.length === 0) return true;
      return branch.name.toLowerCase().includes(normalizedQuery);
    });
  }, [branches, normalizedQuery]);

  const handleBranchSelect = useCallback(
    (branchName: string): void => {
      if (branchName === currentBranch) {
        return;
      }
      onCheckout(branchName);
      onClose();
    },
    [onCheckout, currentBranch, onClose]
  );

  const handleCreateMode = useCallback((): void => {
    onClose();
    onRequestCreate?.(query.trim());
  }, [query, onClose, onRequestCreate]);

  return (
    <Command
      shouldFilter={false}
      value={cmdkValue}
      onValueChange={setCmdkValue}
      disablePointerSelection
      className="bg-transparent"
    >
      <div className="flex items-center px-1.5 pt-1.5 pb-0.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
          <input
            ref={searchInputRef}
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }
            }}
            placeholder="Search branches"
            className="w-full h-7 rounded-[7px] bg-black/10 dark:bg-[var(--lg-alert-secondary-bg)] pl-7 pr-2.5 text-[12px] outline-none placeholder:text-muted-foreground/40 focus:bg-black/12 dark:focus:bg-[var(--lg-control-bg)]"
            aria-label="Search branches"
          />
        </div>
      </div>

      <CommandList
        ref={smoothScrollRef}
        className="max-h-52 overflow-y-auto overscroll-y-contain pb-0 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_6px,black_calc(100%-6px),transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_6px,black_calc(100%-6px),transparent)]"
      >
        {visibleBranches.length === 0 ? (
          <div className="px-2.5 py-4 text-center text-[12px] text-muted-foreground/50">
            No branches found.
          </div>
        ) : (
          <CommandGroup heading="Branches">
            {visibleBranches.map((branch) => (
              <CommandItem
                key={branch.name}
                value={branch.name}
                onSelect={() => {
                  handleBranchSelect(branch.name);
                }}
                className="gap-1.5 min-w-0 text-foreground py-1.5 px-2.5 rounded-[9px]"
              >
                <IconBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-[12px]">{branch.name}</span>
                {branch.name === currentBranch ? (
                  <Check className="h-3.5 w-3.5 shrink-0 ml-auto" />
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      {/* Sticky footer — outside CommandList scroll container */}
      {onRequestCreate !== undefined ? (
        <>
          <div className="mx-2.5 h-px bg-foreground/5" />
          <div
            className="p-1"
            onMouseEnter={() => {
              setCmdkValue('');
            }}
          >
            <button
              type="button"
              onClick={handleCreateMode}
              className="group relative flex w-full cursor-default select-none items-center gap-1.5 min-w-0 rounded-[9px] px-2.5 py-1.5 text-foreground hover:bg-foreground/8"
            >
              <IconPlusLarge className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[12px]">Create and checkout new branch...</span>
            </button>
          </div>
        </>
      ) : null}
    </Command>
  );
};
