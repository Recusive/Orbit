import { AlertCircle, Folder, GitBranch, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
  addRecentProject,
  fileExists,
  gitClone,
  openFileDialog,
  setWorkspacePath,
} from '@/lib/api/backend';
import { createLogger } from '@/lib/logger';
import { useFileStore } from '@/stores/file/file-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('CloneRepositoryDialog');

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
  const parts = cleaned.split(/[/:]/).filter(Boolean);
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

      // Open the cloned project
      await setWorkspacePath(finalPath);
      await addRecentProject(finalPath);
      useUIStore.getState().setWorkspace(finalPath);
      setRootPath(finalPath);

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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Clone Repository</DialogTitle>
          <DialogDescription>
            Clone a git repository from a URL to your local machine.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Repository URL input */}
          <div className="grid gap-2">
            <label htmlFor="repo-url" className="text-sm font-medium">
              Repository URL
            </label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="repo-url"
                placeholder="https://github.com/user/repo.git"
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          {/* Target path with browse button */}
          <div className="grid gap-2">
            <label htmlFor="target-path" className="text-sm font-medium">
              Clone to
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Folder className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="target-path"
                  placeholder="/path/to/clone/directory"
                  value={targetPath}
                  onChange={(e) => {
                    setTargetPath(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={() => void handleBrowse()} disabled={isCloning}>
                Browse
              </Button>
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
            disabled={isCloning}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleClone()} disabled={!isValid || isCloning}>
            {isCloning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cloning...
              </>
            ) : (
              'Clone'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
