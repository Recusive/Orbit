import { AlertCircle, Folder, GitBranch, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { BranchInfo, WorktreeInfo } from '@/lib/api/backend';
import type { FC, KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { gitBranchInfo, gitWorktreeAdd } from '@/lib/api/backend';
import { createLogger } from '@/lib/logger';
import { useUIStore, useWorkspacePath } from '@/stores/ui/ui-store';

const logger = createLogger('CreateWorktreeDialog');

export interface CreateWorktreeDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (worktree: WorktreeInfo) => void;
}

/**
 * Dialog for creating a new git worktree.
 * Allows user to specify branch name, whether to create a new branch,
 * and the path where the worktree will be created.
 */
export const CreateWorktreeDialog: FC<CreateWorktreeDialogProps> = ({
  open,
  onOpenChange,
  onCreated,
}) => {
  const workspacePath = useWorkspacePath();
  const addWorktree = useUIStore((s) => s.addWorktree);

  // Form state
  const [branchName, setBranchName] = useState('');
  const [createNewBranch, setCreateNewBranch] = useState(true);
  const [baseBranch, setBaseBranch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available branches for base selection
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Load branches when dialog opens
  useEffect(() => {
    if (!open || !workspacePath) return;

    const loadBranches = async (): Promise<void> => {
      setLoadingBranches(true);
      try {
        const branchList = await gitBranchInfo(workspacePath);
        setBranches(branchList);
        // Set default base branch to current branch
        const currentBranch = branchList.find((b) => b.isCurrent);
        if (currentBranch) {
          setBaseBranch(currentBranch.name);
        }
      } catch (err) {
        logger.error('Failed to load branches', err);
      } finally {
        setLoadingBranches(false);
      }
    };

    void loadBranches();
  }, [open, workspacePath]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setBranchName('');
      setCreateNewBranch(true);
      setError(null);
    }
  }, [open]);

  // Compute worktree path based on branch name
  const worktreePath = useMemo(() => {
    if (!workspacePath || !branchName) return '';

    // Get parent directory and repo name
    const parts = workspacePath.split(/[/\\]/);
    const repoName = parts.pop() ?? 'repo';
    const parentDir = parts.join('/');

    // Sanitize branch name for filesystem
    const safeBranchName = branchName.replace(/[/\\:*?"<>|]/g, '-');

    return `${parentDir}/${repoName}-${safeBranchName}`;
  }, [workspacePath, branchName]);

  const handleCreate = useCallback(async (): Promise<void> => {
    if (!workspacePath || !branchName || !worktreePath) return;

    setIsCreating(true);
    setError(null);

    try {
      // Build options carefully to satisfy exactOptionalPropertyTypes
      const options: Parameters<typeof gitWorktreeAdd>[2] = {};
      if (createNewBranch) {
        options.newBranch = branchName;
        if (baseBranch) {
          options.commitIsh = baseBranch;
        }
      } else {
        options.commitIsh = branchName;
      }
      const worktree = await gitWorktreeAdd(workspacePath, worktreePath, options);

      logger.info('Created worktree', { path: worktree.path, branch: worktree.branch });

      // Add to UI store
      addWorktree(worktree);

      // Notify parent
      onCreated?.(worktree);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create worktree';
      logger.error('Failed to create worktree', err);

      // Provide user-friendly error messages
      if (message.includes('already checked out')) {
        setError('This branch is already checked out in another worktree');
      } else if (message.includes('already exists')) {
        setError('A worktree already exists at this path');
      } else if (message.includes('is not a valid branch')) {
        setError('Branch does not exist. Enable "Create new branch" to create it.');
      } else {
        setError(message);
      }
    } finally {
      setIsCreating(false);
    }
  }, [
    workspacePath,
    branchName,
    worktreePath,
    createNewBranch,
    baseBranch,
    addWorktree,
    onCreated,
    onOpenChange,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter' && branchName) {
        e.preventDefault();
        void handleCreate();
      }
    },
    [branchName, handleCreate]
  );

  const isValid = branchName.length > 0 && worktreePath.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Worktree</DialogTitle>
          <DialogDescription>
            Create a new git worktree to work on multiple branches simultaneously.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Branch name input */}
          <div className="grid gap-2">
            <label htmlFor="branch-name" className="text-sm font-medium">
              Branch Name
            </label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="branch-name"
                placeholder={createNewBranch ? 'feature/my-feature' : 'existing-branch'}
                value={branchName}
                onChange={(e) => {
                  setBranchName(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          {/* Create new branch toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Create new branch</span>
            <Switch checked={createNewBranch} onCheckedChange={setCreateNewBranch} />
          </div>

          {/* Base branch selector (only when creating new branch) */}
          {createNewBranch ? (
            <div className="grid gap-2">
              <label htmlFor="base-branch" className="text-sm font-medium">
                Base Branch
              </label>
              <Select value={baseBranch} onValueChange={setBaseBranch} disabled={loadingBranches}>
                <SelectTrigger id="base-branch">
                  <SelectValue
                    placeholder={loadingBranches ? 'Loading branches...' : 'Select base branch'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      {branch.name}
                      {branch.isCurrent ? ' (current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {/* Worktree path preview */}
          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">Worktree Path</span>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm text-muted-foreground">
              <Folder className="h-4 w-4 shrink-0" />
              <span className="truncate">{worktreePath || 'Enter a branch name...'}</span>
            </div>
          </div>

          {/* Error message */}
          {error !== null && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!isValid || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Worktree'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
