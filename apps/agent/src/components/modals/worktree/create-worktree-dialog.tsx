import { createLogger } from '@orbit/common/lib';
import { AlertCircle, GitBranch, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BranchInfo, WorktreeInfo } from '@/lib/api';
import type { FC, KeyboardEvent } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
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
import { gitBranchInfo, gitWorktreeAdd } from '@/lib/api';
import { useRepoRootPath, useUIStore, useWorkspacePath } from '@/stores/ui/ui-store';

const logger = createLogger('CreateWorktreeDialog');

// Hoisted RegExp patterns (avoids recreation on each render)
const PATH_SEPARATOR_RE = /[/\\]/;
const UNSAFE_FS_CHARS_RE = /[/\\:*?"<>|]/g;

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
  const repoRootPath = useRepoRootPath();
  const repoPath = repoRootPath ?? workspacePath;
  const addWorktree = useUIStore((s) => s.addWorktree);
  const inputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [newBranchName, setNewBranchName] = useState('');
  const [createNewBranch, setCreateNewBranch] = useState(true);
  const [baseBranch, setBaseBranch] = useState('');
  const [selectedExistingBranch, setSelectedExistingBranch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available branches for selection
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Filter branches that can be checked out (not already in a worktree)
  const availableBranches = useMemo(() => branches.filter((b) => !b.isCurrent), [branches]);

  // Load branches when dialog opens
  useEffect(() => {
    if (!open || !repoPath) return;

    const loadBranches = async (): Promise<void> => {
      setLoadingBranches(true);
      try {
        const branchList = await gitBranchInfo(repoPath);
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
  }, [open, repoPath]);

  // Reset form and autofocus when dialog opens
  useEffect(() => {
    if (open) {
      setNewBranchName('');
      setSelectedExistingBranch('');
      setCreateNewBranch(true);
      setError(null);
      const isTouchDevice = 'ontouchstart' in window;
      if (!isTouchDevice) {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }
    }
  }, [open]);

  // Get the effective branch name based on mode
  const effectiveBranchName = createNewBranch ? newBranchName : selectedExistingBranch;

  // Compute worktree path based on branch name
  const worktreePath = useMemo(() => {
    if (!repoPath || !effectiveBranchName) return '';

    // Get parent directory and repo name
    const parts = repoPath.split(PATH_SEPARATOR_RE);
    const repoName = parts.pop() ?? 'repo';
    const parentDir = parts.join('/');

    // Sanitize branch name for filesystem
    const safeBranchName = effectiveBranchName.replace(UNSAFE_FS_CHARS_RE, '-');

    return `${parentDir}/${repoName}-${safeBranchName}`;
  }, [repoPath, effectiveBranchName]);

  const handleCreate = useCallback(async (): Promise<void> => {
    if (!repoPath || !effectiveBranchName || !worktreePath) return;

    setIsCreating(true);
    setError(null);

    try {
      // Build options carefully to satisfy exactOptionalPropertyTypes
      const options: Parameters<typeof gitWorktreeAdd>[2] = {};
      if (createNewBranch) {
        options.newBranch = newBranchName;
        if (baseBranch) {
          options.commitIsh = baseBranch;
        }
      } else {
        options.commitIsh = selectedExistingBranch;
      }
      const worktree = await gitWorktreeAdd(repoPath, worktreePath, options);

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
    repoPath,
    effectiveBranchName,
    newBranchName,
    selectedExistingBranch,
    worktreePath,
    createNewBranch,
    baseBranch,
    addWorktree,
    onCreated,
    onOpenChange,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter' && effectiveBranchName) {
        e.preventDefault();
        void handleCreate();
      }
    },
    [effectiveBranchName, handleCreate]
  );

  const isValid = effectiveBranchName.length > 0 && worktreePath.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentGlass className="w-[425px] gap-0 overflow-hidden p-0 glass-surface [&>.absolute]:hidden">
        <div className="relative flex flex-col gap-4 px-4 pb-4 pt-5">
          {/* Close button */}
          <DialogClose className="absolute right-4 top-4 z-10 rounded-[9px] p-1.5 bg-foreground/6 text-muted-foreground transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text active:bg-destructive-subtle-hover">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogClose>

          {/* Icon + Title + Description */}
          <div className="flex items-start gap-3">
            <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-primary/10">
              <GitBranch className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1 min-w-0 pt-2 pr-8">
              <DialogTitle className="liquid-glass-title">Create Worktree</DialogTitle>
              <DialogDescription className="liquid-glass-desc">
                Work on multiple branches simultaneously with isolated worktrees.
              </DialogDescription>
            </div>
          </div>

          {/* Form fields */}
          <div className="flex flex-col gap-3.5">
            {/* Create new branch toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Create new branch</span>
              <Switch checked={createNewBranch} onCheckedChange={setCreateNewBranch} />
            </div>

            {createNewBranch ? (
              /* New branch mode: text input + base branch selector */
              <>
                <div className="grid gap-2">
                  <label htmlFor="new-branch-name" className="text-sm font-medium">
                    New Branch Name
                  </label>
                  <div className="relative">
                    <GitBranch
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      ref={inputRef}
                      id="new-branch-name"
                      placeholder="feature/my-feature"
                      value={newBranchName}
                      onChange={(e) => {
                        setNewBranchName(e.target.value);
                      }}
                      onKeyDown={handleKeyDown}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <label htmlFor="base-branch" className="text-sm font-medium">
                    Base Branch
                  </label>
                  <Select
                    value={baseBranch}
                    onValueChange={setBaseBranch}
                    disabled={loadingBranches}
                  >
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
              </>
            ) : (
              /* Existing branch mode: dropdown selector */
              <div className="grid gap-2">
                <label htmlFor="existing-branch" className="text-sm font-medium">
                  Select Branch
                </label>
                <Select
                  value={selectedExistingBranch}
                  onValueChange={setSelectedExistingBranch}
                  disabled={loadingBranches}
                >
                  <SelectTrigger id="existing-branch">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <SelectValue
                        placeholder={
                          loadingBranches
                            ? 'Loading branches...'
                            : availableBranches.length === 0
                              ? 'No branches available'
                              : 'Select a branch'
                        }
                      />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranches.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                        All branches are already checked out
                      </div>
                    ) : (
                      availableBranches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          {branch.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {availableBranches.length === 0 && !loadingBranches ? (
                  <p className="text-xs text-muted-foreground">
                    Create a new branch instead, or close worktrees to free up branches.
                  </p>
                ) : null}
              </div>
            )}

            {/* Worktree path preview */}
            <div className="grid gap-2">
              <span className="text-sm text-muted-foreground">Worktree Path</span>
              <div className="flex items-center gap-2 px-3 py-2 rounded-[9px] bg-[var(--lg-control-bg)] text-sm">
                <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{worktreePath || 'Enter a branch name...'}</span>
              </div>
            </div>

            {/* Error message */}
            {error !== null && (
              <div className="flex items-start gap-2 p-3 rounded-[9px] bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex w-full items-center gap-2 pt-2">
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => void handleCreate()}
              disabled={!isValid || isCreating}
            >
              {isCreating ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Creating&hellip;
                </span>
              ) : (
                'Create Worktree'
              )}
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
