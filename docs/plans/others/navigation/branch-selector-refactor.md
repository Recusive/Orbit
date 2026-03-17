# Plan: Refactor BranchSelector with Search + Create Branch

## Context

The current `BranchSelector` uses a basic Radix `DropdownMenu` — a flat list with no search and no way to create branches. The goal is to match a VS Code–style branch picker: searchable list, current-branch indicator, and a "Create and checkout new branch..." footer action. The `gitCreateBranch` API already exists in both the frontend API layer and Rust backend but has no UI wired up.

## Files to Modify

| File                                                                         | Change                                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/agent/src/components/git/source-control/components/BranchSelector.tsx` | Full rewrite: DropdownMenu → Popover + Command, add create-branch mode              |
| `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`   | Add `handleCreateAndCheckout` handler + `toUserGitError` helper, update return type |
| `apps/agent/src/components/git/source-control/SourceControlTab.tsx`          | Pass new `onCreateAndCheckout` prop to BranchSelector                               |

No changes to UI primitives, stores, or API layer. Test files will be added under `apps/agent/src/__tests__/` as part of this refactor (see Step 4).

## Reuse Inventory

- **Popover** — `@/components/ui/popover` (Radix, portal + animation)
- **Command** — `@/components/ui/command` (cmdk: `Command`, `CommandList`, `CommandGroup`, `CommandItem`, `CommandSeparator`). Note: `CommandEmpty` and `CommandInput` are intentionally NOT used — see notes below.
- **`gitCreateBranch`** — `@/lib/api/git.ts:207` (already implemented, unused in UI)
- **`gitCheckout`** — `@/lib/api/git.ts:203` (already used by `handleCheckout`)
- **Popover + Command pattern** — `slash-command-popover.tsx` as reference

> **IMPORTANT:** Do NOT use `CommandInput` — it embeds a `<DialogClose>` button (`command.tsx:80`) that requires a `Dialog` ancestor. Use a plain `<input>` for the search field inside the Popover.

---

## Step 1: Update `useSourceControl` hook

**File:** `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`

### 1a. Add `gitCreateBranch` to the import from `@/lib/api`

### 1b. Add `toUserGitError` helper (exported, shared by checkout + create flows)

Normalizes raw libgit2 error strings into user-friendly messages. **Exported** from the hook module to enable direct unit testing (audit v3 recommended #1):

```typescript
export const toUserGitError = (err: unknown): string => {
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

A custom error class prevents duplicate toasts on partial success (audit v3 critical #1):

```typescript
/** Marks a checkout failure after successful branch creation — prevents duplicate toasts */
class CheckoutAfterCreateError extends Error {}

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
        // Partial success: branch was created but checkout failed.
        // Toast FIRST so user messaging is deterministic even if refresh fails (audit v7 critical #1).
        const display = toUserGitError(checkoutErr);
        toast.error('Branch created, but checkout failed', { description: display });

        try {
          await Promise.all([refreshStatus(), refreshBranches()]);
        } catch {
          // Non-blocking; git polling will reconcile within seconds.
        }

        throw new CheckoutAfterCreateError(display);
      }
      await Promise.all([refreshStatus(), refreshBranches()]);
      toast.success(`Created and switched to ${branchName}`);
    } catch (err) {
      // Only show generic "create failed" toast if the inner catch didn't already handle it
      if (!(err instanceof CheckoutAfterCreateError)) {
        const display = toUserGitError(err);
        toast.error('Create branch failed', { description: display });
      }
      // Re-throw for inline error display in the component
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      setIsCheckingOut(false);
      operationInProgress.current = false;
    }
  },
  [repoPath, refreshStatus, refreshBranches]
);
```

Key design decisions:

- **`CheckoutAfterCreateError` class** for deterministic partial-success detection — `instanceof` check is reliable regardless of error message content, avoiding the regex-on-normalized-text bug (audit v3 critical #1)
- **Nested try/catch** for partial-success: distinguishes "create failed" from "created but checkout failed" with separate toast messages (audit v2 recommended #2)
- Uses `Promise.all([refreshStatus(), refreshBranches()])` for parallel refresh (audit v1 recommended #3)
- Uses shared `toUserGitError()` for consistent error normalization (audit v1 critical #2)
- On partial success, still refreshes branches so the newly created branch appears in the list for manual checkout. Refresh is wrapped in an inner `try/catch` so a refresh failure cannot mask the primary partial-success toast (audit v7 critical #1).

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
- **Add:** `Command`, `CommandGroup`, `CommandItem`, `CommandList`, `CommandSeparator` from `@/components/ui/command`
- **Add:** `Plus`, `Search` from `lucide-react`
- **Add:** `useCallback`, `useMemo`, `useRef`, `useState` from `react`
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
│  No branches found.                  │  ← Explicit div (when visibleBranches.length === 0)
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
      className="w-full h-8 rounded-[9px] bg-(--lg-alert-secondary-bg) pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/40 focus:bg-lg-control"
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
- **No-results rendering:** Do NOT use `CommandEmpty` — it may not trigger correctly with `shouldFilter={false}` and `forceMount` items. Instead, render an explicit `<div>` when `visibleBranches.length === 0`:
  ```tsx
  {
    visibleBranches.length === 0 ? (
      <div className="px-3 py-6 text-center text-sm text-muted-foreground/50">
        No branches found.
      </div>
    ) : (
      <CommandGroup heading="Branches">{visibleBranches.map(/* ... */)}</CommandGroup>
    );
  }
  ```
- **Branch select:** `onSelect` calls `onCheckout(name)` + `setOpen(false)` (skips if current branch)
- **Switch to create:** carries current `query` as pre-filled `newBranchName` (audit v1 critical #4)
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

| Scenario                                            | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No commits yet (`status.branch` empty, no branches) | Trigger shows "No commits yet" and is **disabled** (`branches.length === 0` disables trigger). Creating branches requires at least one commit (HEAD must exist). This is consistent with current behavior — not a regression.                                                                                                                                                                                                                                                                                                      |
| Invalid ref name (spaces, `..`, `@{`, etc.)         | Backend rejects → `toUserGitError` returns "Invalid branch name."                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Duplicate branch name                               | Backend rejects → `toUserGitError` returns "Branch already exists."                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Case collision on case-insensitive FS               | Backend rejects with libgit2 error → shown as raw fallback message                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Create succeeds but checkout fails                  | Nested try/catch in `handleCreateAndCheckout` shows distinct toast: "Branch created, but checkout failed" with the checkout error detail. Branches are still refreshed so the new branch appears in the list for manual checkout.                                                                                                                                                                                                                                                                                                  |
| Create succeeds, checkout fails, refresh also fails | The partial-success toast ("Branch created, but checkout failed") is shown first. If `Promise.all([refreshStatus(), refreshBranches()])` then rejects, the error propagates to the outer catch but is already a `CheckoutAfterCreateError` — so no duplicate toast. The branch list may be stale until next poll cycle. **Fallback rule:** preserve the partial-success toast as the primary user message; do not show an additional refresh-failure toast. The global git polling (`useGitPolling`) will catch up within seconds. |
| Repo context changes while popover open             | Branches prop updates reactively from GitStore. If the popover is open and branches change, the list re-renders. The create action uses `repoPath` from the hook, which stays current.                                                                                                                                                                                                                                                                                                                                             |
| Detached HEAD (non-empty repo)                      | `status.branch` is empty → trigger currently shows "No commits yet" which is misleading for detached HEAD in repos with commits. **TODO (follow-up):** Distinguish detached HEAD from unborn branch — show "HEAD detached" or the short SHA instead. Out of scope for this refactor but tracked here as a known issue.                                                                                                                                                                                                             |
| Query text matches sentinel value                   | If a user types `__create_branch__` as a search, the create `CommandItem` value would match. Since `shouldFilter={false}`, cmdk doesn't use the value for filtering — it's only used for selection state. No functional impact.                                                                                                                                                                                                                                                                                                    |

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
   - Test with no branches (fresh repo) → trigger shows "No commits yet" and is disabled

---

## Step 4: Automated Tests

Tests are included in this refactor scope per repo policy. Minimum coverage:

### 4a. Hook unit tests (`use-source-control.test.ts`)

Test `handleCreateAndCheckout` by mocking the Tauri `invoke` layer (git API functions):

- **Success path:** `gitCreateBranch` + `gitCheckout` succeed → toast.success called, `isCheckingOut` resets to false
- **Create failure:** `gitCreateBranch` rejects with "already exists" → `toUserGitError` returns "Branch already exists.", toast.error shown, error re-thrown
- **Partial success:** `gitCreateBranch` succeeds, `gitCheckout` rejects → toast.error says "Branch created, but checkout failed" (NOT duplicate "Create branch failed"), branches still refreshed
- **Invalid name:** `gitCreateBranch` rejects with "invalid ref" → `toUserGitError` returns "Invalid branch name."
- **Guard: empty name:** `handleCreateAndCheckout('')` returns without calling any API
- **Guard: concurrent operation:** calling while `operationInProgress` is true returns without action

### 4b. Component tests (`BranchSelector.test.tsx`)

Test UI state transitions using React Testing Library:

- **Browse mode rendering:** search input visible, branch list rendered, create action at bottom
- **Search filtering:** typing in search input narrows `visibleBranches` (manual filter, not cmdk)
- **Branch selection:** clicking a non-current branch calls `onCheckout`, popover closes
- **Current branch skip:** clicking the current branch does NOT call `onCheckout`
- **Enter create mode:** clicking "Create and checkout new branch..." switches to create mode, search query pre-fills name input
- **Create mode Esc:** pressing Escape returns to browse mode without closing popover
- **Browse mode Esc:** pressing Escape closes popover
- **State reset on close:** closing popover resets mode to browse, clears query/name/error
- **Create action always visible:** when search filters all branches, create `CommandItem` remains visible (`forceMount`)
- **Focus management:** opening popover focuses search input; switching to create mode focuses name input; switching back to browse focuses search input

### 4c. Error normalization tests

Test `toUserGitError` as a pure exported function (imported directly from `use-source-control.ts`):

- `"Git error: reference 'refs/heads/foo' already exists"` → `"Branch already exists."`
- `"Git error: Failed to get HEAD for new branch"` → `"Cannot create a branch before the first commit."`
- `"Git error: invalid reference name"` → `"Invalid branch name."`
- `"some unknown error"` → `"some unknown error"` (passthrough)
- `new Error("Git error: unborn branch")` → `"Cannot create a branch before the first commit."` (Error object input)

### 4d. Integration verification (manual, in-app)

Unit tests mock the Tauri invoke layer. Integration verification runs the real app to confirm end-to-end behavior through the actual Rust backend:

1. `bunx tauri dev` → open Source Control tab
2. Create a branch with a unique name → verify it appears in `git branch` output
3. Switch to a different branch → verify `git status` shows new branch
4. Attempt duplicate branch name → verify inline error matches normalized message
5. Delete the test branch after verification: `git branch -d <test-branch>`

This manual step is listed in the Verification section (Step 3 of the plan). It supplements the automated unit tests and aligns with the repo's preference for real integration validation.

---

## Audit Resolutions

Tracking how each audit finding was addressed:

| Audit #               | Type                                                                                          | Issue                                                                                                                                    | Resolution |
| --------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Critical 1 (v1)       | `CommandInput` has `DialogClose`                                                              | Use plain `<input>` instead — documented in import changes and search input section                                                      |
| Critical 2 (v1)       | Raw libgit2 errors, no normalization                                                          | Added exported `toUserGitError()` helper with pattern matching for common cases                                                          |
| Critical 3 (v1)       | Footer not keyboard navigable                                                                 | Changed from `<button>` to `CommandItem` with sentinel value + `forceMount`                                                              |
| Critical 4 (v1)       | No explicit query state for carry-over                                                        | Added `query` state with controlled `<input>`                                                                                            |
| Critical 1 (v2)       | Search wiring ambiguous (cmdk vs manual)                                                      | Resolved: manual filtering via `visibleBranches` memo + `shouldFilter={false}` on Command                                                |
| Critical 2 (v2)       | Create action visibility unresolved                                                           | Resolved: `forceMount` on create `CommandGroup` + explicit no-results `<div>` instead of `CommandEmpty`                                  |
| Critical 3 (v2)       | Tests deferred vs repo policy                                                                 | Resolved: Step 4 added with hook, component, and error normalization tests                                                               |
| Critical 1 (v3)       | Partial-success toast duplication bug                                                         | Resolved: `CheckoutAfterCreateError` class + `instanceof` check replaces fragile regex on error message                                  |
| Critical 2 (v3)       | Scope says "no new files" but tests add files                                                 | Resolved: updated scope statement to include test file additions                                                                         |
| Recommended 1 (v1)    | Inconsistent error normalization                                                              | `toUserGitError()` shared by both `handleCheckout` and `handleCreateAndCheckout`                                                         |
| Recommended 1 (v3)    | `toUserGitError` export/test seam unspecified                                                 | Resolved: function is exported from hook module for direct unit testing                                                                  |
| Recommended 2 (v1)    | Upstream display unclear                                                                      | Explicitly dropped — documented as intentional simplification                                                                            |
| Recommended 2 (v2)    | Partial success message unclear                                                               | Nested try/catch: "Branch created, but checkout failed" distinct from "Create branch failed"                                             |
| Recommended 2 (v3)    | `CommandEmpty` unreliable with `forceMount`                                                   | Resolved: explicit `visibleBranches.length === 0` div instead of `CommandEmpty`                                                          |
| Recommended 3 (v1+v2) | Serial refresh after create                                                                   | Changed to `Promise.all([refreshStatus(), refreshBranches()])`                                                                           |
| Recommended 3 (v2)    | Detached HEAD mislabeled                                                                      | Documented as follow-up TODO in edge case table                                                                                          |
| Recommended 4 (v1)    | No automated tests                                                                            | Tests now in scope — see Step 4                                                                                                          |
| Critical 1 (v4)       | Import list missing `useMemo`, still lists `CommandEmpty`                                     | Resolved: added `useMemo`, removed `CommandEmpty` from import spec                                                                       |
| Critical 2 (v4)       | `toUserGitError` snippet missing `export`                                                     | Resolved: snippet now shows `export const toUserGitError`                                                                                |
| Critical 3 (v4)       | Tests mock-only, repo prefers integration tests                                               | Resolved: Step 4d adds manual integration verification path; unit tests supplement                                                       |
| Recommended 1 (v4)    | Focus assertions missing from component tests                                                 | Resolved: added focus management test case in Step 4b                                                                                    |
| Recommended 1 (v5)    | `CommandEmpty` still in reuse inventory                                                       | Resolved: removed from reuse inventory, noted as intentionally not used                                                                  |
| Recommended 2 (v5)    | Consider automated integration test later                                                     | Acknowledged: current scope has manual integration (Step 4d); automated harness is a future enhancement                                  |
| Recommended 3 (v5)    | Detached HEAD TODO needs follow-up tracking                                                   | Tracked below in Follow-up Tasks section                                                                                                 |
| Recommended 1 (v6)    | Detached HEAD trigger label deferred                                                          | Already tracked in Follow-up Tasks #1 and edge case table                                                                                |
| Recommended 2 (v6)    | Refresh-failure-after-partial-success UX implicit                                             | Resolved: added explicit edge case row with fallback rule — preserve partial-success toast, rely on git polling to catch up              |
| Recommended 3 (v6)    | Integration verification manual-only                                                          | Acknowledged: keep as-is for this scope; automated harness tracked in Follow-up Tasks #2                                                 |
| Critical 1 (v7)       | Checkout-failure catch refreshes before toast — refresh failure masks partial-success message | Resolved: reordered to toast first, then guarded refresh in inner `try/catch`. Toast is now deterministic regardless of refresh outcome. |
| Recommended 1 (v7)    | Detached HEAD trigger label deferred                                                          | Already tracked in Follow-up Tasks #1                                                                                                    |
| Recommended 2 (v7)    | Integration verification manual-only                                                          | Already acknowledged in Follow-up Tasks #2                                                                                               |
| Recommended 3 (v7)    | No explicit test for refresh failure after partial success                                    | Already tracked in Follow-up Tasks #6                                                                                                    |
| Recommended 1 (v8)    | Detached HEAD label deferred                                                                  | Already tracked in Follow-up Tasks #1                                                                                                    |
| Recommended 2 (v8)    | Integration verification manual-only                                                          | Already tracked in Follow-up Tasks #2                                                                                                    |
| Recommended 3 (v8)    | Refresh-failure-after-partial-success lightly validated                                       | Already tracked in Follow-up Tasks #6                                                                                                    |
| Nice-to-have 1 (v8)   | Extract `toUserGitError` to shared git-ui utility at `lib/git-error.ts`                       | Already tracked in Follow-up Tasks #3; audit suggests path `components/git/source-control/lib/git-error.ts`                              |
| Nice-to-have 2 (v8)   | Client-side branch name pre-validation                                                        | Already tracked in Follow-up Tasks #4                                                                                                    |
| Recommended 1 (v9)    | Detached HEAD label deferred                                                                  | Already tracked in Follow-up Tasks #1                                                                                                    |
| Recommended 2 (v9)    | Integration verification manual-only                                                          | Already tracked in Follow-up Tasks #2                                                                                                    |
| Recommended 3 (v9)    | Refresh-failure-after-partial-success lightly tested                                          | Already tracked in Follow-up Tasks #6                                                                                                    |
| Nice-to-have 1 (v9)   | Extract `toUserGitError` to shared utility                                                    | Already tracked in Follow-up Tasks #3                                                                                                    |
| Nice-to-have 2 (v9)   | Client-side branch name pre-validation                                                        | Already tracked in Follow-up Tasks #4                                                                                                    |
| Nice-to-have 3 (v9)   | Case-collision friendly error mapping                                                         | Already tracked in Follow-up Tasks #5                                                                                                    |

---

## Follow-up Tasks (Out of Scope)

These items were identified during the audit process and are explicitly deferred from this refactor. They should be tracked as separate work items.

| #   | Task                                                                                                                                                                                            | Context                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Fix detached HEAD label** — Distinguish detached HEAD from unborn branch in BranchSelector trigger. Show "HEAD detached at `<short-sha>`" instead of "No commits yet" for repos with commits. | Audit v2 recommended #3, v5 recommended #3. Requires checking `status.branch` emptiness + branch count to differentiate. |
| 2   | **Automated integration test harness for git UI** — Add a test that exercises the real Tauri invoke layer for branch create/checkout/switch without manual verification.                        | Audit v5 recommended #2. Depends on having a Tauri test harness or temp git repo fixture.                                |
| 3   | **Extract `toUserGitError` to shared git-ui utility** — Move from `use-source-control.ts` to a dedicated module (e.g., `lib/git-error.ts`) for reuse in worktree dialog and future git UIs.     | Audit v3 nice-to-have #1, v5 nice-to-have #1.                                                                            |
| 4   | **Client-side branch name pre-validation** — Add lightweight format check before API call (reject spaces, `..`, `@{`, leading `-`, etc.).                                                       | Audit v3 nice-to-have #3, v5 nice-to-have #2.                                                                            |
| 5   | **Case-collision error normalization** — Map case-insensitive filesystem errors from libgit2 to a user-friendly message.                                                                        | Audit v3 edge case, v5 edge case.                                                                                        |
| 6   | **Refresh-failure-after-partial-success test** — Add targeted test verifying no duplicate toast when checkout fails and subsequent refresh also fails.                                          | Audit v6 nice-to-have #3.                                                                                                |
