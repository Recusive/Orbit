/**
 * BranchPickerContent - Reusable branch picker popover content
 *
 * Renders the searchable branch list + optional "Create and checkout new branch..." dialog.
 * Designed to be placed inside a <PopoverContent> by the parent — does NOT own the popover
 * or trigger. Both source-control BranchSelector and sidebar WorktreeItem compose this.
 */
import { IconBranch } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconBranch';
import { IconPlusLarge } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconPlusLarge';
import { Check, Search, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { GitBranch } from '@/lib/api';
import type { FC, KeyboardEvent } from 'react';

import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSmoothScroll } from '@/hooks/ui';

export interface BranchPickerContentProps {
  /** Currently checked-out branch name (to show check mark) */
  readonly currentBranch: string | null;
  /** Available branches to display (should be pre-filtered to local only) */
  readonly branches: GitBranch[];
  /** Called when the user selects a branch to checkout */
  readonly onCheckout: (branch: string) => void;
  /** Called when the user creates and checks out a new branch. If omitted, create button is hidden. */
  readonly onCreateAndCheckout?: (branchName: string) => Promise<void>;
  /** Called when the popover should close (after branch selection or entering create mode) */
  readonly onClose: () => void;
}

export const BranchPickerContent: FC<BranchPickerContentProps> = ({
  currentBranch,
  branches,
  onCheckout,
  onCreateAndCheckout,
  onClose,
}) => {
  const smoothScrollRef = useSmoothScroll(0.08);

  // Search state
  const [query, setQuery] = useState('');
  const [cmdkValue, setCmdkValue] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);

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
    setNewBranchName(query.trim());
    setCreateError(null);
    onClose();
    setDialogOpen(true);
  }, [query, onClose]);

  const handleDialogOpenChange = useCallback((nextOpen: boolean): void => {
    setDialogOpen(nextOpen);
    if (!nextOpen) {
      setNewBranchName('');
      setCreateError(null);
      setIsCreating(false);
    }
  }, []);

  const handleCreateSubmit = useCallback(async (): Promise<void> => {
    const branchName = newBranchName.trim();
    if (branchName.length === 0 || isCreating || onCreateAndCheckout === undefined) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      await onCreateAndCheckout(branchName);
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCreateError(message.replace(/^Git error:\s*/i, ''));
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, newBranchName, onCreateAndCheckout]);

  const handleCreateKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleCreateSubmit();
    }
  };

  return (
    <>
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
        {onCreateAndCheckout !== undefined ? (
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

      {/* Create branch dialog — liquid glass, centered in window */}
      {onCreateAndCheckout !== undefined ? (
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContentGlass className="liquid-glass-dialog gap-0 overflow-hidden p-0 bg-chat-area border-0 shadow-none [&>.absolute]:hidden">
            <DialogClose className="liquid-glass-close absolute right-2 top-2 z-10 rounded-full p-1 opacity-60 transition-opacity duration-150 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Close</span>
            </DialogClose>

            <div
              className="relative flex flex-col items-center"
              style={{ padding: '20px 16px 16px', gap: 16 }}
            >
              {/* Icon */}
              <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
                <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-foreground/5">
                  <IconBranch className="h-7 w-7 text-foreground" />
                </div>
              </div>

              {/* Title + Description */}
              <div
                className="flex w-full flex-col items-start"
                style={{ padding: '0 6px 2px', gap: 10 }}
              >
                <DialogTitle className="liquid-glass-title w-full">Create new branch</DialogTitle>
                <DialogDescription className="liquid-glass-desc w-full">
                  Enter a name for the new branch. It will be created from the current HEAD and
                  checked out.
                </DialogDescription>
              </div>

              {/* Branch name input */}
              <div className="w-full" style={{ padding: '0 6px' }}>
                <div className="relative">
                  <IconBranch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                  <input
                    ref={createInputRef}
                    autoFocus
                    value={newBranchName}
                    onChange={(event) => {
                      setNewBranchName(event.target.value);
                      setCreateError(null);
                    }}
                    onKeyDown={handleCreateKeyDown}
                    placeholder="new-branch-name"
                    className="liquid-glass-textarea w-full h-9 rounded-[9px] text-sm outline-none"
                    style={{ paddingLeft: 36 }}
                    aria-label="New branch name"
                    disabled={isCreating}
                  />
                </div>
                {createError !== null ? (
                  <p className="mt-1.5 text-[12px] text-destructive">{createError}</p>
                ) : null}
              </div>

              {/* Buttons */}
              <div className="flex w-full items-center" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
                  onClick={() => {
                    setDialogOpen(false);
                  }}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
                  onClick={() => {
                    void handleCreateSubmit();
                  }}
                  disabled={isCreating || newBranchName.trim().length === 0}
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </DialogContentGlass>
        </Dialog>
      ) : null}
    </>
  );
};
