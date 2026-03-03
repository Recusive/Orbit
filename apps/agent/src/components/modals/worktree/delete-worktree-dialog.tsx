import { AlertTriangle, GitBranch, X } from 'lucide-react';
import { useState } from 'react';

import type { WorktreeInfo } from '@/lib/api';
import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

export interface DeleteWorktreeDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly worktree: WorktreeInfo | null;
  readonly onConfirm: (deleteBranch: boolean) => void;
}

/**
 * Confirmation dialog for deleting a worktree.
 * Shows the worktree path and branch, with option to also delete the branch.
 */
export const DeleteWorktreeDialog: FC<DeleteWorktreeDialogProps> = ({
  open,
  onOpenChange,
  worktree,
  onConfirm,
}) => {
  const [deleteBranch, setDeleteBranch] = useState(false);

  // Reset checkbox when dialog opens
  const handleOpenChange = (newOpen: boolean): void => {
    if (newOpen) {
      setDeleteBranch(false);
    }
    onOpenChange(newOpen);
  };

  const handleConfirm = (): void => {
    onConfirm(deleteBranch);
    onOpenChange(false);
  };

  if (!worktree) return null;

  // Extract folder name from path for display
  const folderName = worktree.path.split('/').pop() ?? worktree.path;

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
            <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
            </div>
          </div>

          {/* Title + Description */}
          <div className="flex w-full flex-col items-start gap-2.5 px-1.5 pb-0.5">
            <DialogTitle className="liquid-glass-title w-full">Delete worktree?</DialogTitle>
            <DialogDescription className="liquid-glass-desc w-full">
              This will remove the worktree directory:
              <code className="block mt-2 px-2 py-1 bg-muted rounded-[5px] text-xs font-mono truncate">
                {folderName}
              </code>
            </DialogDescription>
          </div>

          {/* Branch deletion option */}
          {worktree.branch !== null ? (
            <div className="w-full px-1.5">
              <div className="flex items-center justify-between rounded-[9px] px-3 py-2.5 liquid-glass-textarea">
                <label
                  htmlFor="delete-branch"
                  className="text-sm cursor-pointer flex items-center gap-2"
                >
                  <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Also delete branch &ldquo;{worktree.branch}&rdquo;
                </label>
                <Switch
                  id="delete-branch"
                  checked={deleteBranch}
                  onCheckedChange={setDeleteBranch}
                />
              </div>
            </div>
          ) : null}

          {/* Buttons */}
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-destructive flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={handleConfirm}
            >
              Delete Worktree
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
