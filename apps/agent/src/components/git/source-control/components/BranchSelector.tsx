/**
 * BranchSelector - Branch picker with search and create+checkout flow
 */
import { IconPlusLarge } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconPlusLarge';
import { Check, ChevronDown, GitBranch as GitBranchIcon, Loader2, Search, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { GitBranch, GitStatus } from '@/lib/api';
import type { FC, KeyboardEvent } from 'react';

import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface BranchSelectorProps {
  readonly status: GitStatus;
  readonly branches: GitBranch[];
  readonly isCheckingOut: boolean;
  readonly onCheckout: (branch: string) => void;
  readonly onCreateAndCheckout: (branchName: string) => Promise<void>;
}

export const BranchSelector: FC<BranchSelectorProps> = ({
  status,
  branches,
  isCheckingOut,
  onCheckout,
  onCreateAndCheckout,
}) => {
  // Popover state
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cmdkValue, setCmdkValue] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  const localBranches = useMemo(() => branches.filter((branch) => !branch.isRemote), [branches]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleBranches = useMemo(() => {
    return localBranches.filter((branch) => {
      if (normalizedQuery.length === 0) return true;
      return branch.name.toLowerCase().includes(normalizedQuery);
    });
  }, [localBranches, normalizedQuery]);

  const handleOpenChange = useCallback((nextOpen: boolean): void => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setCmdkValue('');
    }
  }, []);

  const handleBranchSelect = useCallback(
    (branchName: string): void => {
      if (branchName === status.branch) {
        return;
      }
      onCheckout(branchName);
      setOpen(false);
    },
    [onCheckout, status.branch]
  );

  const handleCreateMode = useCallback((): void => {
    setNewBranchName(query.trim());
    setCreateError(null);
    setOpen(false);
    setDialogOpen(true);
  }, [query]);

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
    if (branchName.length === 0 || isCreating) return;

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
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={isCheckingOut || branches.length === 0}
            className="flex items-center gap-1.5 text-sm min-w-0 hover:bg-lg-control-hover data-[state=open]:bg-lg-control-hover rounded-[9px] px-2.5 py-1 active:scale-[0.98] transition-[background-color,transform] duration-150 disabled:opacity-40"
          >
            {isCheckingOut ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground/70" />
            ) : (
              <GitBranchIcon className="h-4 w-4 shrink-0 text-muted-foreground/70" />
            )}
            <span
              className={cn(
                'font-medium truncate',
                !status.branch && 'text-muted-foreground italic'
              )}
            >
              {status.branch || 'No commits yet'}
            </span>
            {branches.length > 0 ? (
              <ChevronDown className="h-[11px] w-[11px] shrink-0 text-muted-foreground" />
            ) : null}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[320px] p-0 bg-[#f3f3f3] dark:bg-[oklch(23%_0_0)] border-white dark:border-white/5 rounded-[10px] shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_4px_12px_-2px_rgba(0,0,0,0.1),0_8px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInputRef.current?.focus();
          }}
        >
          <Command
            shouldFilter={false}
            value={cmdkValue}
            onValueChange={setCmdkValue}
            disablePointerSelection
            className="bg-transparent"
          >
            <div className="flex items-center px-2 pt-2 pb-0.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
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
                      setOpen(false);
                    }
                  }}
                  placeholder="Search branches"
                  className="w-full h-9 rounded-[9px] bg-black/10 dark:bg-[var(--lg-alert-secondary-bg)] pl-9 pr-3 text-[12px] outline-none placeholder:text-muted-foreground/40 focus:bg-black/12 dark:focus:bg-[var(--lg-control-bg)]"
                  aria-label="Search branches"
                />
              </div>
            </div>

            <CommandList className="max-h-64 overflow-y-auto pb-0 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-8px),transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-8px),transparent)]">
              {visibleBranches.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground/50">
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
                      className="gap-2 min-w-0 text-foreground"
                    >
                      <GitBranchIcon className="h-2.5 w-2.5 shrink-0 text-foreground" />
                      <span className="truncate text-[12px]">{branch.name}</span>
                      {branch.name === status.branch ? (
                        <Check className="h-[13px] w-[13px] shrink-0 text-foreground ml-auto" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>

            {/* Sticky footer — outside CommandList scroll container */}
            <div className="mx-3 h-px bg-foreground/5" />
            <div
              className="p-1.5"
              onMouseEnter={() => {
                setCmdkValue('');
              }}
            >
              <button
                type="button"
                onClick={handleCreateMode}
                className="group relative flex w-full cursor-default select-none items-center gap-2 min-w-0 rounded-lg px-3 py-2 text-foreground hover:bg-foreground/8"
              >
                <IconPlusLarge className="h-[13px] w-[13px] shrink-0 text-foreground" />
                <span className="text-[12px]">Create and checkout new branch...</span>
              </button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Create branch dialog — liquid glass, centered in window */}
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
                <GitBranchIcon className="h-7 w-7 text-foreground" />
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
                <GitBranchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
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
                <p className="mt-1.5 text-xs text-destructive">{createError}</p>
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
    </>
  );
};
