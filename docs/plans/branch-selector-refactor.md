# Plan: Refactor BranchSelector with Search + Create Branch

## Context

The current `BranchSelector` uses a basic Radix `DropdownMenu` — a flat list with no search and no way to create branches. The goal is to match a VS Code–style branch picker: searchable list, current-branch indicator, and a "Create and checkout new branch..." footer action. The `gitCreateBranch` API already exists in both the frontend API layer and Rust backend but has no UI wired up.

## Files to Modify

| File                                                                         | Change                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/agent/src/components/git/source-control/components/BranchSelector.tsx` | Full rewrite: DropdownMenu → Popover + Command, add create-branch mode |
| `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`   | Add `handleCreateAndCheckout` handler, update return type              |
| `apps/agent/src/components/git/source-control/SourceControlTab.tsx`          | Pass new `onCreateAndCheckout` prop to BranchSelector                  |

No new files. No changes to UI primitives, stores, or API layer.

## Reuse Inventory

- **Popover** — `@/components/ui/popover` (Radix, portal + animation)
- **Command** — `@/components/ui/command` (cmdk: `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`, `CommandEmpty`, `CommandSeparator`)
- **`gitCreateBranch`** — `@/lib/api/git.ts:207` (already implemented, unused in UI)
- **`gitCheckout`** — `@/lib/api/git.ts:203` (already used by `handleCheckout`)
- **Popover + Command pattern** — `slash-command-popover.tsx` as reference

---

## Step 1: Update `useSourceControl` hook

**File:** `apps/agent/src/components/git/source-control/hooks/use-source-control.ts`

1. Add `gitCreateBranch` to the import from `@/lib/api`
2. Add `handleCreateAndCheckout` handler:
   - Guards with `operationInProgress.current` + `repoPath`
   - Sets `isCheckingOut = true` (reuses existing loading state — these operations are mutually exclusive)
   - Calls `gitCreateBranch(repoPath, branchName)` → `gitCheckout(repoPath, branchName)` → `refreshStatus()` → `refreshBranches()`
   - Shows `toast.success(...)` on success
   - On error: shows `toast.error(...)` AND **re-throws** so the component can display the error inline
   - Finally: resets `isCheckingOut` and `operationInProgress`
3. Add to `UseSourceControlReturn` interface:
   ```typescript
   handleCreateAndCheckout: (branchName: string) => Promise<void>;
   ```
4. Add to the return object

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

## Step 3: Rewrite `BranchSelector.tsx`

**File:** `apps/agent/src/components/git/source-control/components/BranchSelector.tsx`

### Import changes

- **Remove:** `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`
- **Add:** `Popover`, `PopoverContent`, `PopoverTrigger` from `@/components/ui/popover`
- **Add:** `Command`, `CommandEmpty`, `CommandGroup`, `CommandInput`, `CommandItem`, `CommandList`, `CommandSeparator` from `@/components/ui/command`
- **Add:** `Plus` from `lucide-react`
- **Add:** `useState`, `useCallback` from `react`
- **Remove:** local `BranchInfo` interface → use `GitBranch` from `@/lib/api`

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
const [newBranchName, setNewBranchName] = useState('');
const [isCreating, setIsCreating] = useState(false);
const [createError, setCreateError] = useState<string | null>(null);
```

### Derived data

```typescript
const localBranches = branches.filter((b) => !b.isRemote);
```

### Visual structure — Browse mode

```
┌──────────────────────────────────────┐
│ 🔍 Search branches                  │  ← CommandInput
├──────────────────────────────────────┤
│  BRANCHES                            │  ← CommandGroup heading
│  ⑂ main                        ✓    │  ← CommandItem (current)
│  ⑂ fix/0.0.5                        │  ← CommandItem
│  ⑂ fix/prod                         │  ← CommandItem
├──────────────────────────────────────┤
│  + Create and checkout new branch... │  ← Footer button
└──────────────────────────────────────┘
```

Width: `w-[280px]`, padding `p-0` on PopoverContent.

### Visual structure — Create mode

```
┌──────────────────────────────────────┐
│ ⑂ [new-branch-name          ]       │  ← Auto-focused input
├──────────────────────────────────────┤
│  Press Enter to create · Esc cancel  │  ← Helper text
│  ⚠ Branch already exists             │  ← Error (conditional)
└──────────────────────────────────────┘
```

### Key behaviors

- **Search filtering:** cmdk's built-in `shouldFilter={true}` handles fuzzy matching
- **Branch select:** calls `onCheckout(name)` + closes popover (skips if current branch)
- **Switch to create:** carries current search query as pre-filled branch name
- **Create submit (Enter):** calls `onCreateAndCheckout(name.trim())`, closes on success, shows error on failure
- **Create cancel (Esc):** `e.stopPropagation()` to prevent Popover from closing, returns to browse mode
- **Popover close:** resets all state (mode → browse, clear name/error)

### Footer "Create" button

Placed **outside** `CommandList` but inside `Command` wrapper, separated by `CommandSeparator`. This is a plain `<button>`, not a `CommandItem`, so it doesn't participate in cmdk keyboard navigation.

### Create branch inline view

Defined as a private `CreateBranchInput` component inside the same file (not a separate file). Contains:

- `<input>` with auto-focus, git-branch icon prefix
- `aria-label="New branch name"`
- `onKeyDown`: Enter → submit, Escape → cancel (with `e.stopPropagation()`)
- Helper text + conditional error text below

---

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — no lint warnings
3. `bunx tauri dev` → open Source Control tab:
   - Click branch selector → popover opens with search + branch list
   - Type to filter branches → list narrows in real-time
   - Click a different branch → checkout happens, toast shown, popover closes
   - Click "Create and checkout new branch..." → switches to create mode with input
   - Type a name + Enter → branch created, checked out, toast shown, popover closes
   - Try duplicate name → error shown inline
   - Esc in create mode → back to browse mode (popover stays open)
   - Esc in browse mode → popover closes
