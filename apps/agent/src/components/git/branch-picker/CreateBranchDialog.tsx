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
              Enter a name for the new branch. It will be created from the current HEAD and checked
              out.
            </DialogDescription>
          </div>

          {/* Branch name input */}
          <div className="w-full" style={{ padding: '0 6px' }}>
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
