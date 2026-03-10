# Plan: Default Worktree Location → `.orbit/worktrees/`

## Context

Users can create git worktrees via the Create Worktree dialog, but the location is auto-computed as a sibling directory next to the repo (e.g., `~/Dev/myproject-feature-auth`). This scatters worktrees across the filesystem.

The `.orbit/` directory already exists per-workspace for the Vault feature (`{workspace}/.orbit/Vault/`). Placing worktrees at `{workspace}/.orbit/worktrees/{branchName}` keeps all Orbit workspace data consolidated in one place.

## Changes

### 1. Update path computation in `create-worktree-dialog.tsx`

**File**: `apps/agent/src/components/modals/worktree/create-worktree-dialog.tsx`

Replace lines 114-126 (the `worktreePath` useMemo):

```typescript
// BEFORE: sibling directory
const parts = repoPath.split(PATH_SEPARATOR_RE);
const repoName = parts.pop() ?? 'repo';
const parentDir = parts.join('/');
const safeBranchName = effectiveBranchName.replace(UNSAFE_FS_CHARS_RE, '-');
return `${parentDir}/${repoName}-${safeBranchName}`;

// AFTER: inside .orbit/worktrees/
const safeBranchName = effectiveBranchName.replace(UNSAFE_FS_CHARS_RE, '-');
return `${repoPath}/.orbit/worktrees/${safeBranchName}`;
```

Remove the now-unused `PATH_SEPARATOR_RE` constant (line 30). Keep `UNSAFE_FS_CHARS_RE` — still needed for branch name sanitization.

### 2. Auto-ensure `.orbit/` is gitignored before creating worktree

**File**: `apps/agent/src/components/modals/worktree/create-worktree-dialog.tsx`

Add imports for `readFile` and `writeFile` from `@/lib/api/files`.

Add a helper function to ensure `.orbit` is in the project's `.gitignore`:

```typescript
async function ensureOrbitGitignored(repoPath: string): Promise<void> {
  const gitignorePath = `${repoPath}/.gitignore`;
  try {
    const content = await readFile(gitignorePath);
    const lines = content.split('\n');
    if (lines.some((l) => l.trim() === '.orbit' || l.trim() === '.orbit/')) return;
    const suffix = content.endsWith('\n') ? '' : '\n';
    await writeFile(gitignorePath, `${content}${suffix}.orbit/\n`);
  } catch {
    await writeFile(gitignorePath, '.orbit/\n');
  }
}
```

Call it at the top of `handleCreate` (before `gitWorktreeAdd`).

**Why this matters**: Without gitignoring `.orbit/`, the worktree contents would appear as untracked files in the parent repo's `git status`. The vault feature has the same implicit requirement but never enforced it.

### 3. No backend changes needed

- `git worktree add` automatically creates intermediate directories (`.orbit/worktrees/{branchName}`)
- The Rust backend (`crates/common/git/src/lib.rs:worktree_add`) and Tauri command (`src-tauri/src/commands/common/git.rs:git_worktree_add`) receive an absolute path and pass it through — path computation is entirely frontend

## Files Modified

| File                                                                   | Change                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/agent/src/components/modals/worktree/create-worktree-dialog.tsx` | New path computation, remove `PATH_SEPARATOR_RE`, add `.gitignore` enforcement, add `readFile`/`writeFile` imports |

## Edge Cases

- **Branch name collisions**: `feature/auth` and `feature-auth` both sanitize to `feature-auth` — existing limitation, handled by git's "path already exists" error (already caught in dialog error handling)
- **`.orbit/` already exists**: Vault may have created it — `git worktree add` handles this fine
- **Nested worktree in parent repo**: Git handles worktrees inside the working tree correctly via `.git` files (not directories)
- **Windows paths**: Forward slashes work — Tauri and git normalize them

## Verification

1. Open the app with `bunx tauri dev`
2. Open a git repository
3. Open Create Worktree dialog → verify path preview shows `.orbit/worktrees/{branchName}`
4. Create a worktree → verify it's created at the expected location
5. Check `.gitignore` → verify `.orbit/` was added
6. Run `git status` in parent repo → verify `.orbit/` doesn't show as untracked
7. Run `bun run check` to verify no TypeScript/lint errors
