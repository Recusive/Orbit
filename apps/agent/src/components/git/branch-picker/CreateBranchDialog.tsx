/**
 * CreateBranchDialog - Standalone dialog for creating and checking out a new git branch
 *
 * Extracted from BranchPickerContent so it can be rendered outside the Popover tree.
 * This prevents the dialog from being unmounted when the popover closes — a classic
 * Radix UI issue where Dialog state is lost when its parent Popover unmounts.
 */
import { IconBranch } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconBranch';
import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { FC, KeyboardEvent } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export interface CreateBranchDialogProps {
  /** Whether the dialog is open */
  readonly open: boolean;
  /** Callback when dialog open state changes */
  readonly onOpenChange: (open: boolean) => void;
  /** Called when the user submits a branch name — should create + checkout */
  readonly onSubmit: (branchName: string) => Promise<void>;
  /** Pre-filled branch name (from search query in the branch picker) */
  readonly suggestedName?: string;
}

export const CreateBranchDialog: FC<CreateBranchDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
  suggestedName,
}) => {
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Sync suggested name when dialog opens
  useEffect(() => {
    if (open) {
      setNewBranchName(suggestedName ?? '');
      setCreateError(null);
      setIsCreating(false);
    }
  }, [open, suggestedName]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        setNewBranchName('');
        setCreateError(null);
        setIsCreating(false);
      }
    },
    [onOpenChange]
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    const branchName = newBranchName.trim();
    if (branchName.length === 0 || isCreating) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      await onSubmit(branchName);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCreateError(message.replace(/^Git error:\s*/i, ''));
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, newBranchName, onSubmit, onOpenChange]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContentGlass className="w-[360px] gap-0 overflow-hidden p-0 glass-surface [&>.absolute]:hidden">
        <DialogClose className="absolute right-3 top-3 z-10 rounded-[9px] p-1 bg-foreground/8 text-muted-foreground/50 transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text">
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <div className="relative flex flex-col items-center gap-4 px-4 pb-4 pt-5">
          {/* Icon */}
          <div className="flex w-full items-center px-1.5">
            <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-primary/10">
              <IconBranch className="h-7 w-7 text-primary" />
            </div>
          </div>

          {/* Title + Description */}
          <div className="flex w-full flex-col items-start gap-2.5 px-1.5 pb-0.5">
            <DialogTitle className="liquid-glass-title w-full">Create new branch</DialogTitle>
            <DialogDescription className="liquid-glass-desc w-full">
              Enter a name for the new branch. It will be created from the current HEAD and checked
              out.
            </DialogDescription>
          </div>

          {/* Branch name input */}
          <div className="w-full px-1.5">
            <div className="relative">
              <IconBranch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                autoFocus
                value={newBranchName}
                onChange={(event) => {
                  setNewBranchName(event.target.value);
                  setCreateError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="new-branch-name"
                className="liquid-glass-textarea liquid-glass-textarea-icon h-9 w-full rounded-[9px] text-sm outline-none"
                aria-label="New branch name"
                disabled={isCreating}
              />
            </div>
            {createError !== null ? (
              <p className="mt-1.5 text-[12px] text-destructive">{createError}</p>
            ) : null}
          </div>

          {/* Buttons */}
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => {
                handleOpenChange(false);
              }}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={isCreating || newBranchName.trim().length === 0}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
