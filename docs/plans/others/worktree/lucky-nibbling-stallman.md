# Fix: Worktree deletion fails — missing `deleteBranch` parameter

## Context

Deleting a worktree throws:

```
missing required key deleteBranch for command git_worktree_remove
```

The Rust command requires `delete_branch: bool`, but the TypeScript API wrapper omits it from the `invoke` call. The dialog UI already collects this value — it just never reaches the backend.

## Root Cause

**Frontend/backend parameter mismatch across 2 files:**

1. **Rust** (`src-tauri/src/commands/common/git.rs:287-292`): requires `delete_branch: bool`
2. **TS API** (`apps/agent/src/lib/api/git.ts:303-309`): does NOT send `deleteBranch`
3. **Caller** (`use-sidebar-actions.ts:322`): has `deleteBranch` param but doesn't pass it to API

## Changes

### 1. `crates/common/git/src/lib.rs` — Return structured result, make prune non-fatal

**Structured result:** Add `WorktreeRemoveResult` struct and change `worktree_remove` return type from `Result<()>` to `Result<WorktreeRemoveResult>`. This stops the backend from silently swallowing branch deletion failures.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeRemoveResult {
    /// If branch deletion was requested but failed, contains the error message.
    /// `None` when branch deletion was not requested or succeeded.
    pub branch_delete_failed: Option<String>,
}
```

In `worktree_remove`: replace the `error!()` log + silent `Ok(())` for branch-D failure with `Ok(WorktreeRemoveResult { branch_delete_failed: Some(err_msg) })`. Success path returns `Ok(WorktreeRemoveResult { branch_delete_failed: None })`.

**Normalize branch-delete error messages** before storing in `branch_delete_failed`: strip git's `error: ` prefix and trim whitespace so the frontend gets a clean sentence for toast display. Raw git stderr can contain verbose multi-line output that doesn't belong in a toast description.

```rust
// After branch-D fails:
let stderr = String::from_utf8_lossy(&branch_output.stderr);
let cleaned = stderr.trim().trim_start_matches("error: ");
Some(cleaned.to_owned())
```

**Non-fatal prune (edge case #5):** Change `worktree_prune(repo_path).await?;` (line 1560) to non-fatal, matching the pattern already used by `worktree_list` (line 1259):

```rust
// Before (fatal — worktree is already removed but prune failure causes Err):
worktree_prune(repo_path).await?;

// After (non-fatal — log and continue, matching worktree_list pattern):
if let Err(err) = worktree_prune(repo_path).await {
    error!(
        ?repo_path,
        error = %err,
        "Worktree prune failed after removal; continuing"
    );
}
```

This is correct because the worktree directory is already gone at this point. Prune is a best-effort cleanup of `.git/worktrees/` metadata. Failing here should not report an error to the user — the operation succeeded.

### 2. `src-tauri/src/commands/common/git.rs` — Update return type

Change `git_worktree_remove` return type from `Result<()>` to `Result<WorktreeRemoveResult>` (pass-through from crate).

### 3. `apps/agent/src/lib/api/git.ts` — Replace JSDoc, make params required, add result type

- **Replace the entire JSDoc block.** The current JSDoc falsely claims `deleteBranch` was "intentionally removed in the file-store refactor." The Rust backend has always required `delete_branch: bool`.
- **Make both `force` and `deleteBranch` required booleans** (not optional). Defaults belong at call sites, not in the transport contract.
- Add `WorktreeRemoveResult` interface. Change return type to `Promise<WorktreeRemoveResult>`.

```typescript
export interface WorktreeRemoveResult {
  branchDeleteFailed: string | null;
}

export async function gitWorktreeRemove(
  repoPath: string,
  worktreePath: string,
  force: boolean,
  deleteBranch: boolean
): Promise<WorktreeRemoveResult> {
  return invoke<WorktreeRemoveResult>('git_worktree_remove', {
    repoPath,
    worktreePath,
    force,
    deleteBranch,
  });
}
```

### 4. `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` — Wire it through + edge case fixes

**Parameter wiring:**

- Pass `deleteBranch` to `gitWorktreeRemove(removePath, worktreeToDelete.path, false, deleteBranch)`
- Remove the stale comment on line 321 ("deleteBranch option not yet supported by backend")
- Add `TESTED:` warning comment above `handleRemoveWorktree` per repo integration-test convention

**Edge case: Silent branch deletion failure (#1):**
Use the `WorktreeRemoveResult` for accurate toasts:

```typescript
const result = await gitWorktreeRemove(removePath, worktreeToDelete.path, false, deleteBranch);

if (result.branchDeleteFailed !== null) {
  toast.warning(`Worktree deleted, but branch removal failed`, {
    description: result.branchDeleteFailed,
  });
} else if (deleteBranch && worktreeToDelete.branch !== null) {
  toast.success(`Worktree and branch "${worktreeToDelete.branch}" deleted`);
} else {
  toast.success('Worktree deleted');
}
```

**Edge case: Double-click race (#2):**
Add a `useRef` in-flight guard. `useState` won't work because `useCallback` captures stale state — `useRef` is mutable across renders without triggering re-renders.

```typescript
const isRemovingWorktreeRef = useRef(false);

const handleRemoveWorktree = useCallback(
  async (deleteBranch: boolean): Promise<void> => {
    if (isRemovingWorktreeRef.current) return;
    // ... existing guards ...
    isRemovingWorktreeRef.current = true;
    try {
      // ... removal logic ...
    } catch (err) {
      // ... error handling ...
    } finally {
      isRemovingWorktreeRef.current = false;
    }
  },
  [workspacePath, worktreeToDelete, removeWorktree]
);
```

### 5. `apps/agent/src/__tests__/integration/hooks/primary-sidebar/use-sidebar-actions.test.tsx` — Regression tests

There is currently **no `handleRemoveWorktree` behavior test at all** in this file. Add a `describe('handleRemoveWorktree')` block with these test cases:

**Core wiring:**

1. `deleteBranch=true` → assert `gitWorktreeRemove` called with `..., true`
2. `deleteBranch=false` → assert `gitWorktreeRemove` called with `..., false`

**Edge case: Null branch with deleteBranch=true (#4):** 3. Worktree with `branch: null` + `handleRemoveWorktree(true)` → assert `gitWorktreeRemove` still called with `deleteBranch=true` (backend handles safely), toast says "Worktree deleted" (not "branch deleted")

**Edge case: Double-click guard (#2):** 4. Call `handleRemoveWorktree(false)` twice in rapid succession → assert `gitWorktreeRemove` called exactly once

**Edge case: Stale worktree / backend error (#3):** 5. Mock `gitWorktreeRemove` to reject → assert `toast.error('Failed to remove worktree')` is shown, dialog state remains consistent

**Edge case: Branch deletion partial failure (#1):** 6. Mock `gitWorktreeRemove` to resolve with `{ branchDeleteFailed: 'Branch checked out elsewhere' }` → assert `toast.warning` is called (not `toast.success`)

Update the mock to return `WorktreeRemoveResult`:

```typescript
gitWorktreeRemove: vi.fn().mockResolvedValue({ branchDeleteFailed: null }),
```

```typescript
it('passes deleteBranch=true to gitWorktreeRemove', async () => {
  const { result } = renderHook(() => useSidebarActions(createDefaultHookProps()));
  const worktree = {
    path: '/test/worktree-feature',
    head: 'abc',
    shortHead: 'abc',
    branch: 'feature/x',
    isMain: false,
    isDetached: false,
    locked: null,
  };

  act(() => {
    result.current.handleOpenDeleteWorktreeDialog(worktree);
  });
  await act(async () => {
    await result.current.handleRemoveWorktree(true);
  });

  expect(gitWorktreeRemove).toHaveBeenCalledWith('/test/workspace', worktree.path, false, true);
});

it('shows warning toast when branch deletion fails', async () => {
  vi.mocked(gitWorktreeRemove).mockResolvedValueOnce({
    branchDeleteFailed: 'Branch "feature/x" is checked out elsewhere',
  });
  // ... setup worktree, call handleRemoveWorktree(true) ...
  // assert toast.warning was called, not toast.success
});

it('prevents duplicate calls on rapid double-click', async () => {
  // ... setup worktree ...
  const promise1 = act(async () => {
    await result.current.handleRemoveWorktree(false);
  });
  const promise2 = act(async () => {
    await result.current.handleRemoveWorktree(false);
  });
  await Promise.all([promise1, promise2]);

  expect(gitWorktreeRemove).toHaveBeenCalledTimes(1);
});

it('handles null branch with deleteBranch=true gracefully', async () => {
  // worktree with branch: null
  // call handleRemoveWorktree(true)
  // assert gitWorktreeRemove called with deleteBranch=true
  // assert toast says "Worktree deleted" (not "branch deleted")
});
```

## Files Modified

| File                                                                                      | Change                                                                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `crates/common/git/src/lib.rs`                                                            | Add `WorktreeRemoveResult`, change return type, make prune non-fatal, normalize error msgs |
| `src-tauri/src/commands/common/git.rs`                                                    | Update `git_worktree_remove` return type                                                   |
| `apps/agent/src/lib/api/git.ts`                                                           | Replace JSDoc, make params required, add `WorktreeRemoveResult` type                       |
| `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts`           | Wire `deleteBranch`, add in-flight guard, use result for toasts                            |
| `apps/agent/src/__tests__/integration/hooks/primary-sidebar/use-sidebar-actions.test.tsx` | Add 6 test cases covering core wiring + all edge cases                                     |

## Edge Cases Addressed

| #   | Edge Case                                                           | Fix                                                                                                         | Location          |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | `deleteBranch=true` but `git branch -D` fails silently              | Return `WorktreeRemoveResult` with failure info; frontend shows `toast.warning`                             | Rust crate + hook |
| 2   | Rapid double-click fires duplicate remove calls                     | `useRef` in-flight guard, early return if already removing                                                  | Hook              |
| 3   | Worktree removed externally between dialog open and confirm         | Existing backend error path is correct; add test asserting error toast                                      | Test              |
| 4   | `worktree.branch === null` with `deleteBranch=true`                 | Backend handles safely (`.and_then`); add test asserting toast says "Worktree deleted" not "branch deleted" | Test              |
| 5   | `git worktree remove` succeeds but `worktree_prune` fails afterward | Change prune to non-fatal (`if let Err`), matching `worktree_list` pattern                                  | Rust crate        |
| 6   | Branch-delete failure messages too noisy for toast                  | Strip `error: ` prefix and trim in Rust before returning in result                                          | Rust crate        |

## Known Limitations (not in scope)

- **Concurrent delete across windows/surfaces:** The `useRef` in-flight guard is per hook instance. If multi-window support is added, concurrent deletes from different windows can still race. The backend would reject the second call (worktree already gone) but the error toast is noisy. Mitigation: the Tauri app is currently single-window; revisit if multi-window lands (`docs/plans/MULTI-WINDOW-PLAN.md`).
- **Stale UI after background refresh:** After `removeWorktree(path)` optimistically removes the entry from UIStore, the `loadWorktrees` useEffect (triggered by `repoRootPath`/`workspacePath` changes) could re-add the worktree if it runs before git has fully cleaned up `.git/worktrees/`. In practice this is unlikely because `worktree_prune` runs in the remove call, and `worktree_list` also prunes before listing. If it did happen, the next poll cycle would correct it. No fix needed — document and monitor.
- **`force` hardcoded to `false`:** Line 322 always passes `false` for force removal. Separate concern for a follow-up (dialog could expose a "force remove" toggle).

## Verification

1. `cargo check` — Rust compiles with new return type and non-fatal prune
2. `bun run typecheck` — no TS type errors
3. `bun run lint` — no lint violations
4. `bun run test apps/agent/src/__tests__/integration/hooks/primary-sidebar/use-sidebar-actions.test.tsx` — targeted regression check
5. `bun test` — full test suite passes
6. `bunx tauri dev` — create a worktree, then delete it:
   - Toggle off "delete branch" → toast says "Worktree deleted"
   - Toggle on "delete branch" → toast says "Worktree and branch deleted"
   - Toggle on for branch checked out elsewhere → toast shows warning with clean message
