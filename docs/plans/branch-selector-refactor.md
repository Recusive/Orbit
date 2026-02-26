# Plan: Refactor BranchSelector with Search + Create Branch

## Context

The current `BranchSelector` uses a basic Radix `DropdownMenu` — a flat list with no search and no way to create branches. The goal is to match a VS Code–style branch picker: searchable list, current-branch indicator, and a "Create and checkout new branch..." footer action. The `gitCreateBranch` API already exists in both the frontend API layer and Rust backend but has no UI wired up.

## Files to Modify

| File                                                                         | Change                                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/agent/src/components/git/source-control/components/BranchSelector.tsx` | Full rewrite: DropdownMenu → Popover + Command, add create-branch mode              |
| `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`   | Add `handleCreateAndCheckout` handler + `toUserGitError` helper, update return type |
| `apps/agent/src/components/git/source-control/SourceControlTab.tsx`          | Pass new `onCreateAndCheckout` prop to BranchSelector                               |

No new files. No changes to UI primitives, stores, or API layer.

## Reuse Inventory

- **Popover** — `@/components/ui/popover` (Radix, portal + animation)
- **Command** — `@/components/ui/command` (cmdk: `CommandList`, `CommandGroup`, `CommandItem`, `CommandEmpty`, `CommandSeparator`)
- **`gitCreateBranch`** — `@/lib/api/git.ts:207` (already implemented, unused in UI)
- **`gitCheckout`** — `@/lib/api/git.ts:203` (already used by `handleCheckout`)
- **Popover + Command pattern** — `slash-command-popover.tsx` as reference

> **IMPORTANT:** Do NOT use `CommandInput` — it embeds a `<DialogClose>` button (`command.tsx:80`) that requires a `Dialog` ancestor. Use a plain `<input>` for the search field inside the Popover.

---

## Step 1: Update `useSourceControl` hook

**File:** `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`

### 1a. Add `gitCreateBranch` to the import from `@/lib/api`

### 1b. Add `toUserGitError` helper (shared by checkout + create flows)

Normalizes raw libgit2 error strings into user-friendly messages:

```typescript
const toUserGitError = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.replace(/^Git error:\s*/i, '');
  if (/already exists/i.test(message)) return 'Branch already exists.';
  if (/Failed to get HEAD|unborn branch/i.test(message))
    return 'Cannot create a branch before the first commit.';
  if (/invalid.*ref|invalid.*name/i.test(message)) return 'Invalid branch name.';
  return message;
};
```

### 1c. Refactor existing `handleCheckout` to use `toUserGitError`

Replace the inline `message.replace(/^Git error:\s*/i, '')` with `toUserGitError(err)` for consistency.

### 1d. Add `handleCreateAndCheckout` handler

```typescript
const handleCreateAndCheckout = useCallback(
  async (rawName: string): Promise<void> => {
    const branchName = rawName.trim();
    if (operationInProgress.current || !repoPath || branchName.length === 0) return;

    operationInProgress.current = true;
    setIsCheckingOut(true);
    setOperationError(null);

    try {
      await gitCreateBranch(repoPath, branchName);
      try {
        await gitCheckout(repoPath, branchName);
      } catch (checkoutErr) {
        // Partial success: branch was created but checkout failed
        await Promise.all([refreshStatus(), refreshBranches()]);
        const display = toUserGitError(checkoutErr);
        toast.error('Branch created, but checkout failed', { description: display });
        throw new Error(display);
      }
      await Promise.all([refreshStatus(), refreshBranches()]);
      toast.success(`Created and switched to ${branchName}`);
    } catch (err) {
      const display = toUserGitError(err);
      // Only show generic toast if it wasn't already shown by the inner catch
      if (!/checkout failed/i.test(display)) {
        toast.error('Create branch failed', { description: display });
      }
      throw new Error(display); // Re-throw for inline error display in component
    } finally {
      setIsCheckingOut(false);
      operationInProgress.current = false;
    }
  },
  [repoPath, refreshStatus, refreshBranches]
);
```

Key design decisions:

- **Nested try/catch** for partial-success: distinguishes "create failed" from "created but checkout failed" (audit recommended #2)
- Uses `Promise.all([refreshStatus(), refreshBranches()])` for parallel refresh (audit recommended #3)
- Uses shared `toUserGitError()` for consistent error normalization (audit critical #2)
- On partial success, still refreshes branches so the newly created branch appears in the list

### 1e. Update `UseSourceControlReturn` interface and return object

```typescript
handleCreateAndCheckout: (branchName: string) => Promise<void>;
```

---

## Step 2: Update `SourceControlTab.tsx`

**File:** `apps/agent/src/components/git/source-control/SourceControlTab.tsx`

1. Destructure `handleCreateAndCheckout` from `useSourceControl()`
2. Pass to `BranchSelector`:
   ```tsx
   <BranchSelector
     status={status}
     branches={branches}
     isCheckingOut={isCheckingOut}
     onCheckout={(branch) => void handleCheckout(branch)}
     onCreateAndCheckout={handleCreateAndCheckout}
   />
   ```

---

## Step 3: Rewrite `BranchSelector.tsx`

**File:** `apps/agent/src/components/git/source-control/components/BranchSelector.tsx`

### Import changes

- **Remove:** `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`
- **Add:** `Popover`, `PopoverContent`, `PopoverTrigger` from `@/components/ui/popover`
- **Add:** `Command`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandList`, `CommandSeparator` from `@/components/ui/command`
- **Add:** `Plus`, `Search` from `lucide-react`
- **Add:** `useState`, `useCallback`, `useRef` from `react`
- **Remove:** local `BranchInfo` interface → use `GitBranch` from `@/lib/api`

> **Do NOT import `CommandInput`** — it depends on `DialogClose` which requires a `Dialog` ancestor.

### Props

```typescript
interface BranchSelectorProps {
  readonly status: GitStatus;
  readonly branches: GitBranch[];
  readonly isCheckingOut: boolean;
  readonly onCheckout: (branch: string) => void;
  readonly onCreateAndCheckout: (branchName: string) => Promise<void>;
}
```

### Internal state

```typescript
const [open, setOpen] = useState(false);
const [mode, setMode] = useState<'browse' | 'create'>('browse');
const [query, setQuery] = useState(''); // Explicit search query state
const [newBranchName, setNewBranchName] = useState('');
const [isCreating, setIsCreating] = useState(false);
const [createError, setCreateError] = useState<string | null>(null);
```

### Derived data — manual filtering (NOT cmdk built-in)

Since we use a plain `<input>` instead of `CommandInput`, cmdk's built-in filtering has no connection to our search state. We use **manual filtering** with `shouldFilter={false}` on `Command`:

```typescript
const localBranches = branches.filter((b) => !b.isRemote);

const normalizedQuery = query.trim().toLowerCase();
const visibleBranches = useMemo(
  () =>
    localBranches.filter((b) => {
      if (normalizedQuery.length === 0) return true;
      return b.name.toLowerCase().includes(normalizedQuery);
    }),
  [localBranches, normalizedQuery]
);
```

The `Command` component MUST use `shouldFilter={false}` to disable cmdk's internal filtering — we drive filtering entirely through `visibleBranches`.

### Visual structure — Browse mode

```
┌──────────────────────────────────────┐
│ 🔍 Search branches                  │  ← Plain <input> (NOT CommandInput)
├──────────────────────────────────────┤
│  BRANCHES                            │  ← CommandGroup heading
│  ⑂ main                        ✓    │  ← CommandItem (current)
│  ⑂ fix/0.0.5                        │  ← CommandItem
│  ⑂ fix/prod                         │  ← CommandItem
│  No branches found.                  │  ← CommandEmpty (when filtered to zero)
├──────────────────────────────────────┤
│  + Create and checkout new branch... │  ← CommandItem (keyboard navigable)
└──────────────────────────────────────┘
```

Width: `w-[280px]`, padding `p-0` on PopoverContent.

### Visual structure — Create mode

```
┌──────────────────────────────────────┐
│ ⑂ [new-branch-name          ]       │  ← Auto-focused plain <input>
├──────────────────────────────────────┤
│  Press Enter to create · Esc cancel  │  ← Helper text
│  ⚠ Branch already exists             │  ← Error (conditional)
└──────────────────────────────────────┘
```

### Search input (plain `<input>`, NOT `CommandInput`)

The search field is a plain `<input>` inside a styled wrapper, placed above `CommandList`. This avoids the `DialogClose` dependency in `CommandInput`.

```tsx
<div className="px-3 py-2 border-b border-border">
  <div className="relative">
    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
    <input
      ref={searchInputRef}
      autoFocus
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search branches"
      className="w-full h-8 rounded-[9px] bg-[var(--lg-alert-secondary-bg)] pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/40 focus:bg-[var(--lg-control-bg)]"
      aria-label="Search branches"
    />
  </div>
</div>
```

### "Create branch" footer — as a `CommandItem` (keyboard navigable)

The "Create and checkout new branch..." action is a `CommandItem` with a sentinel value, placed in its own group after a separator. This makes it reachable via arrow-key navigation (audit critical #3).

```tsx
<CommandSeparator />
<CommandGroup forceMount>
  <CommandItem
    value="__create_branch__"
    onSelect={() => {
      setMode('create');
      setNewBranchName(query.trim());
      setCreateError(null);
    }}
  >
    <Plus className="h-3.5 w-3.5" />
    <span>Create and checkout new branch...</span>
  </CommandItem>
</CommandGroup>
```

The create group uses **`forceMount`** to ensure it is always visible regardless of search query. Since we use `shouldFilter={false}`, cmdk won't hide items on its own, but `forceMount` provides a belt-and-suspenders guarantee — the create action is always reachable.

### Key behaviors

- **Search filtering:** Manual filtering via `visibleBranches` memo. `Command` uses `shouldFilter={false}` — cmdk does NOT drive filtering. The plain `<input>` controls `query` state, which drives the `useMemo` filter.
- **Branch select:** `onSelect` calls `onCheckout(name)` + `setOpen(false)` (skips if current branch)
- **Switch to create:** carries current `query` as pre-filled `newBranchName` (audit critical #4)
- **Create submit (Enter):** calls `onCreateAndCheckout(name.trim())`, closes on success, shows error on failure
- **Create cancel (Esc):** `e.stopPropagation()` to prevent Popover from closing, returns to browse mode
- **Popover close:** `handleOpenChange` resets all state (mode → browse, clear query/name/error)
- **Create action always visible:** `forceMount` on create `CommandGroup` guarantees the "Create and checkout new branch..." item is always shown, even when `visibleBranches` is empty
- **Upstream display:** Intentionally dropped from the new design — the reference UI shows only branch names and a current-branch checkmark, matching VS Code's branch picker simplicity.

### Create branch inline view

Defined as a private `CreateBranchInput` component inside the same file. Contains:

- `<input>` with auto-focus, git-branch icon prefix
- `aria-label="New branch name"`
- `onKeyDown`: Enter → submit, Escape → cancel (with `e.stopPropagation()`)
- Helper text + conditional error text below
- Loading spinner during creation

### Edge case handling

| Scenario                                    | Behavior                                                                                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No commits yet (`status.branch` empty)      | Trigger shows "No commits yet", popover still openable for create. Backend rejects `create_branch` → `toUserGitError` returns "Cannot create a branch before the first commit."                                                  |
| Invalid ref name (spaces, `..`, `@{`, etc.) | Backend rejects → `toUserGitError` returns "Invalid branch name."                                                                                                                                                                |
| Duplicate branch name                       | Backend rejects → `toUserGitError` returns "Branch already exists."                                                                                                                                                              |
| Case collision on case-insensitive FS       | Backend rejects with libgit2 error → shown as raw fallback message                                                                                                                                                               |
| Create succeeds but checkout fails          | Unlikely but possible. The error toast says "Create branch failed" which is slightly misleading. The branch exists but isn't checked out. Acceptable for now — proper two-phase feedback is over-engineering for this edge case. |
| Repo context changes while popover open     | Branches prop updates reactively from GitStore. If the popover is open and branches change, the list re-renders. The create action uses `repoPath` from the hook, which stays current.                                           |
| Detached HEAD                               | `status.branch` is empty → trigger shows "No commits yet" (existing behavior, separate concern)                                                                                                                                  |

---

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — no lint warnings
3. `bunx tauri dev` → open Source Control tab:
   - Click branch selector → popover opens with search + branch list
   - Type to filter branches → list narrows in real-time
   - Arrow keys navigate through branches AND "Create" action at bottom
   - Click a different branch → checkout happens, toast shown, popover closes
   - Click or select "Create and checkout new branch..." → switches to create mode with input pre-filled from search query
   - Type a name + Enter → branch created, checked out, toast shown, popover closes
   - Try duplicate name → "Branch already exists." shown inline
   - Esc in create mode → back to browse mode (popover stays open)
   - Esc in browse mode → popover closes
   - Test with no branches (fresh repo) → trigger disabled or shows "No commits yet"

---

## Audit Resolutions

Tracking how each audit finding was addressed:

| Audit #       | Type                                   | Issue                                                                               | Resolution |
| ------------- | -------------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| Critical 1    | `CommandInput` has `DialogClose`       | Use plain `<input>` instead — documented in import changes and search input section |
| Critical 2    | Raw libgit2 errors, no normalization   | Added `toUserGitError()` helper with pattern matching for common cases              |
| Critical 3    | Footer not keyboard navigable          | Changed from `<button>` to `CommandItem` with sentinel value                        |
| Critical 4    | No explicit query state for carry-over | Added `query` state with controlled `<input>`                                       |
| Recommended 1 | Inconsistent error normalization       | `toUserGitError()` shared by both `handleCheckout` and `handleCreateAndCheckout`    |
| Recommended 2 | Upstream display unclear               | Explicitly dropped — documented as intentional simplification                       |
| Recommended 3 | Serial refresh after create            | Changed to `Promise.all([refreshStatus(), refreshBranches()])`                      |
| Recommended 4 | No automated tests                     | Deferred — can be added as follow-up after the refactor ships                       |
