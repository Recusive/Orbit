import { createLogger } from '@orbit/common/lib';
import { AlertCircle, Folder, GitBranch, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { FC, KeyboardEvent } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  addRecentProject,
  conversationList,
  fileExists,
  gitClone,
  initializeWorkspace,
  openFileDialog,
} from '@/lib/api';
import { toConversationSummaries } from '@/lib/mappers';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('CloneRepositoryDialog');

// Hoisted RegExp for URL path splitting (avoids recreation on each call)
const URL_PATH_SEPARATOR_RE = /[/:]/;

export interface CloneRepositoryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Validate a git repository URL.
 * Accepts HTTPS URLs (github.com, gitlab.com, bitbucket.org, etc.)
 * and SSH URLs (git@github.com:user/repo.git)
 */
function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  // HTTPS URLs
  const httpsPattern = /^https?:\/\/.+\/.+/;
  // SSH URLs
  const sshPattern = /^git@.+:.+/;
  // Git protocol URLs
  const gitPattern = /^git:\/\/.+\/.+/;

  return httpsPattern.test(trimmed) || sshPattern.test(trimmed) || gitPattern.test(trimmed);
}

/**
 * Find a unique path by appending -2, -3, etc. if the path already exists.
 * Like how browsers handle duplicate downloads.
 */
async function findUniquePath(basePath: string): Promise<string> {
  // First check if the base path is available
  const exists = await fileExists(basePath);
  if (!exists) {
    return basePath;
  }

  // Path exists, try incrementing suffix
  let counter = 2;
  while (counter <= 100) {
    // Safety limit
    const candidatePath = `${basePath}-${String(counter)}`;
    const candidateExists = await fileExists(candidatePath);
    if (!candidateExists) {
      return candidatePath;
    }
    counter++;
  }

  // Fallback: just return with a timestamp
  return `${basePath}-${String(Date.now())}`;
}

/**
 * Extract repository name from URL for default folder name.
 * Returns null if the URL is empty or doesn't contain a valid repo name.
 *
 * Examples:
 * - https://github.com/user/my-repo.git → "my-repo"
 * - git@github.com:user/my-repo.git → "my-repo"
 * - https://github.com/user/my-repo → "my-repo"
 */
function extractRepoName(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Remove .git suffix if present
  const withoutGit = trimmed.replace(/\.git$/, '');
  // Remove trailing slashes
  const cleaned = withoutGit.replace(/\/+$/, '');
  // Get the last path segment (handles both / and : separators for SSH URLs)
  const parts = cleaned.split(URL_PATH_SEPARATOR_RE).filter(Boolean);
  const lastPart = parts[parts.length - 1];

  // Must have a valid name (not empty, not just whitespace)
  if (!lastPart?.trim()) {
    return null;
  }

  return lastPart;
}

/**
 * Dialog for cloning a git repository.
 * Allows user to paste a URL and select a destination folder.
 */
export const CloneRepositoryDialog: FC<CloneRepositoryDialogProps> = ({ open, onOpenChange }) => {
  const setRootPath = useFileStore((s) => s.setRootPath);

  // Form state
  const [repoUrl, setRepoUrl] = useState('');
  const [baseDirectory, setBaseDirectory] = useState(''); // Parent directory selected by user
  const [targetPath, setTargetPath] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setRepoUrl('');
      setBaseDirectory('');
      setTargetPath('');
      setError(null);
    }
  }, [open]);

  // Update target path when URL or base directory changes
  // Also checks for existing folders and auto-increments the name
  useEffect(() => {
    if (!baseDirectory) return;

    const repoName = extractRepoName(repoUrl);
    if (!repoName) {
      // No valid repo name yet, just show the base directory
      setTargetPath(baseDirectory);
      return;
    }

    const basePath = `${baseDirectory}/${repoName}`;

    // Track if effect is still active (for cleanup)
    let cancelled = false;

    // Check if path exists and find unique name
    const updatePath = async (): Promise<void> => {
      try {
        const uniquePath = await findUniquePath(basePath);
        // Only update if effect hasn't been cancelled
        if (!cancelled) {
          setTargetPath(uniquePath);
        }
      } catch {
        // If check fails, just use the base path
        if (!cancelled) {
          setTargetPath(basePath);
        }
      }
    };

    void updatePath();

    // Cleanup function to prevent state updates after unmount or re-run
    return (): void => {
      cancelled = true;
    };
  }, [repoUrl, baseDirectory]);

  const handleBrowse = useCallback(async (): Promise<void> => {
    try {
      const selected = await openFileDialog({
        title: 'Select Clone Destination',
        directory: true,
        multiple: false,
      });

      if (selected !== null && typeof selected === 'string') {
        setBaseDirectory(selected);
        // Target path will be updated by the effect above
      }
    } catch (err) {
      logger.error('Failed to open folder dialog', err);
    }
  }, []);

  const handleClone = useCallback(async (): Promise<void> => {
    if (!repoUrl || !targetPath) return;

    // Validate URL
    if (!isValidGitUrl(repoUrl)) {
      setError('Please enter a valid Git repository URL');
      return;
    }

    setIsCloning(true);
    setError(null);

    try {
      // Safety check: verify path is still available (in case folder was created after we checked)
      const finalPath = await findUniquePath(targetPath);

      // Update UI if path changed (rare edge case)
      if (finalPath !== targetPath) {
        setTargetPath(finalPath);
      }

      await gitClone(repoUrl, finalPath);

      logger.info('Cloned repository', { url: repoUrl, path: finalPath });

      // Open the cloned project and build file index for fuzzy search
      await initializeWorkspace(finalPath);
      await addRecentProject(finalPath);
      useUIStore.getState().initializeWorkspace(finalPath);
      setRootPath(finalPath);

      // Load conversations for this workspace (Claude Code-style folder isolation)
      const conversations = await conversationList(finalPath);
      useUIStore.getState().setConversations(toConversationSummaries(conversations));

      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clone repository';
      logger.error('Failed to clone repository', err);
      setError(message);
    } finally {
      setIsCloning(false);
    }
  }, [repoUrl, targetPath, setRootPath, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      // Prevent triggering clone while already cloning
      if (e.key === 'Enter' && repoUrl && targetPath && !isCloning) {
        e.preventDefault();
        void handleClone();
      }
    },
    [repoUrl, targetPath, isCloning, handleClone]
  );

  const isValid = repoUrl.length > 0 && targetPath.length > 0;

  // Prevent closing dialog while cloning is in progress
  const handleOpenChange = useCallback(
    (newOpen: boolean): void => {
      if (!newOpen && isCloning) {
        // Don't allow closing while cloning
        return;
      }
      onOpenChange(newOpen);
    },
    [isCloning, onOpenChange]
  );

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
              <GitBranch className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
          </div>

          {/* Title + Description */}
          <div className="flex w-full flex-col items-start gap-2.5 px-1.5 pb-0.5">
            <DialogTitle className="liquid-glass-title w-full">Clone repository</DialogTitle>
            <DialogDescription className="liquid-glass-desc w-full">
              Clone a git repository from a URL to your local machine.
            </DialogDescription>
          </div>

          {/* Repository URL input */}
          <div className="w-full px-1.5">
            <div className="relative">
              <GitBranch
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
                aria-hidden="true"
              />
              <input
                id="repo-url"
                autoFocus
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="https://github.com/user/repo.git"
                className="liquid-glass-textarea liquid-glass-textarea-icon h-9 w-full rounded-[9px] text-sm outline-none"
                aria-label="Repository URL"
                disabled={isCloning}
              />
            </div>
          </div>

          {/* Clone target path + Browse */}
          <div className="w-full px-1.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Folder
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
                  aria-hidden="true"
                />
                <input
                  id="target-path"
                  value={targetPath}
                  onChange={(e) => {
                    setTargetPath(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="/path/to/clone/directory"
                  className="liquid-glass-textarea liquid-glass-textarea-icon h-9 w-full rounded-[9px] text-sm outline-none"
                  aria-label="Clone destination"
                  disabled={isCloning}
                />
              </div>
              <button
                type="button"
                className="liquid-glass-btn liquid-glass-btn-secondary cursor-pointer transition-transform duration-75 active:scale-[0.97] shrink-0 px-4"
                onClick={() => {
                  void handleBrowse();
                }}
                disabled={isCloning}
              >
                Browse
              </button>
            </div>
            {error !== null ? (
              <div className="mt-1.5 flex items-start gap-1.5">
                <AlertCircle
                  className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive"
                  aria-hidden="true"
                />
                <p className="text-[12px] text-destructive">{error}</p>
              </div>
            ) : null}
          </div>

          {/* Buttons */}
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={isCloning}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] flex items-center justify-center gap-2"
              onClick={() => {
                void handleClone();
              }}
              disabled={!isValid || isCloning}
            >
              {isCloning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Cloning...
                </>
              ) : (
                'Clone'
              )}
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
