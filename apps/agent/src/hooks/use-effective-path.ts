/**
 * useEffectivePath - Returns the active worktree path or workspace path
 *
 * Git operations should target the active worktree when one is selected,
 * falling back to the main workspace path otherwise.
 */
import { useUIStore } from '@/stores/ui/ui-store';

/**
 * Returns the effective working path for git operations:
 * - activeWorktreePath if a worktree is selected
 * - workspacePath otherwise (main workspace)
 *
 * This ensures git status, commit, push, pull etc. operate on the
 * correct worktree directory.
 */
export function useEffectivePath(): string | null {
  const activeWorktreePath = useUIStore((s) => s.activeWorktreePath);
  const workspacePath = useUIStore((s) => s.workspacePath);
  return activeWorktreePath ?? workspacePath;
}
