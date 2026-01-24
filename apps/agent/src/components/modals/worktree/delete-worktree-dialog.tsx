import { AlertTriangle, GitBranch } from 'lucide-react';
import { useState } from 'react';

import type { WorktreeInfo } from '@/lib/api';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>Delete worktree?</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            This will remove the worktree directory:
            <code className="block mt-2 px-2 py-1 bg-muted rounded text-xs font-mono truncate">
              {folderName}
            </code>
          </DialogDescription>
        </DialogHeader>

        {/* Branch deletion option */}
        {worktree.branch !== null ? (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="delete-branch"
                  className="text-sm font-medium cursor-pointer flex items-center gap-2"
                >
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  Also delete branch &ldquo;{worktree.branch}&rdquo;
                </label>
                <Switch
                  id="delete-branch"
                  checked={deleteBranch}
                  onCheckedChange={setDeleteBranch}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                If off, the branch will remain and can be used for a new worktree later.
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Delete Worktree
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
