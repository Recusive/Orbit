# Plan: Worktree Switching = Workspace Switching

> **Audit status:** Revised per combined audit rounds 1, 2 & 3 (Claude + Codex, Feb 24–25 2026).
> See `reviews/audit-plan.md` for full audit report.

## Context

The previous approach tried to keep `workspacePath` fixed at the repo root and layer worktree awareness on top via `sessionWorktreeMap`, `worktreePath` on conversations, and complex merge logic in `setConversations`. This was unreliable — the Rust backend always returns `worktree_path: None` from JSONL, so every `conversation:list` response wiped worktree metadata from the sidebar.

**New approach:** Treat each worktree as a separate project. When you click a worktree, `workspacePath` changes to that worktree's path. Everything downstream — conversation list, file explorer, terminal, header — naturally scopes to the worktree because they already depend on `workspacePath`. No merge hacks needed.

**Why this works:** The Claude Agent SDK already stores JONLs per-cwd:

- Main: `~/.claude/projects/-Users-you-project/<session>.jsonl`
- Worktree: `~/.claude/projects/-Users-you-project-feat-yes/<session>.jsonl`

And `ensureSession` already sets `cwd = activeWorktreePath` (use-tauri-session.ts:72). JONLs are already in the right place — we just need `conversation_list` to look in the right directory.

---

## Changes

### 1. UIStore — add `repoRootPath`, split `setWorkspace` into `initializeWorkspace`, add `switchToWorktree`

**File:** `apps/agent/src/stores/ui/ui-store.ts`

**a) Add state** (in `UIState` interface, ~line 86):

```typescript
repoRootPath: string | null; // Git repo root — stable across worktree switches
```

**b) Initialize** (~line 266):

```typescript
repoRootPath: null,
```

**c) Add `initializeWorkspace` action + keep `setWorkspace` as transitional shim** (audit round 2 critical #1, audit round 3 critical #1):

The old `setWorkspace` had `if (state.repoRootPath === null)` which broke after opening a second project — `repoRootPath` stayed pointed at the first project.

**Migration strategy:** Keep `setWorkspace` as a shim that delegates to `initializeWorkspace`. This avoids partial-migration breakage — there are 8+ call sites across the codebase including `chat-message-service.ts:396` (workspace bootstrap on first `system:init`), `App.tsx:102` (demo mode), and test files. All call sites migrate incrementally; the shim is removed in a follow-up PR.

```typescript
initializeWorkspace: (path: string): void => {
  set((state) => {
    state.workspacePath = path;
    state.repoRootPath = path; // ALWAYS reset — this is a new project context
    state.activeWorktreePath = null;
    saveActiveWorktreeToStorage(null);
    const segments = path.split(PATH_SEPARATOR_RE).filter(Boolean);
    state.workspaceName = segments[segments.length - 1] ?? path;
    // Clear all prior-project state
    state.conversations = [];
    state.isLoadingConversation = true;
    state.isConversationTransitioning = true;
  });
},

// TRANSITIONAL: shim for unmigrated call sites. Remove after all callers use initializeWorkspace.
setWorkspace: (path: string): void => {
  get().initializeWorkspace(path);
},
```

**Full call site inventory** (all must eventually migrate to `initializeWorkspace`):

| Call site                          | Context                                    | Priority           |
| ---------------------------------- | ------------------------------------------ | ------------------ |
| `PrimarySidebar.tsx:183`           | openProject                                | Migrate in this PR |
| `file-handlers.ts:71`              | handleOpenFolder                           | Migrate in this PR |
| `file-explorer.tsx:220`            | onSelectFolder                             | Migrate in this PR |
| `ssh-connection-dialog.tsx:149`    | handleConnect                              | Migrate in this PR |
| `ProjectsDialog.tsx:104`           | handleOpenProject                          | Migrate in this PR |
| `clone-repository-dialog.tsx:224`  | handleClone                                | Migrate in this PR |
| `chat-message-service.ts:396`      | Workspace bootstrap on first `system:init` | Migrate in this PR |
| `App.tsx:102`                      | Demo/mock mode setup                       | Migrate in this PR |
| `ui-store.test.ts` (4 occurrences) | Unit tests                                 | Update in this PR  |

> **Why split from `switchToWorktree`?** Project initialization and worktree switching have different invariants. `initializeWorkspace` is a full reset (root, worktree, conversations, loading state). `switchToWorktree` is a lens change within an established root. Conflating them caused the stale `repoRootPath` bug.

**d) Add `switchToWorktree` action** (in `UIActions` interface + implementation):

```typescript
switchToWorktree: (worktreePath: string | null): void => {
  set((state) => {
    const targetPath = worktreePath ?? state.repoRootPath;
    if (!targetPath) return;
    state.workspacePath = targetPath;
    state.activeWorktreePath = worktreePath;
    saveActiveWorktreeToStorage(worktreePath);
    // Update display name
    const segments = targetPath.split(PATH_SEPARATOR_RE).filter(Boolean);
    state.workspaceName = segments[segments.length - 1] ?? targetPath;
    // Clear conversation list immediately to avoid stale sessions from
    // previous worktree showing during async fetch (audit round 1 critical #1)
    state.conversations = [];
    // Clear active conversation — prevents stale session reference
    state.activeConversationId = null;
    state.activeConversationTitle = null;
    // Trigger loading state for conversation list refresh
    state.isLoadingConversation = true;
    state.isConversationTransitioning = true;
  });
},
```

**e) Update `removeWorktree`** — must also reset `workspacePath` when deleting the active worktree (audit round 1 critical #2):

```typescript
removeWorktree: (path: string): void => {
  set((state) => {
    state.worktrees = state.worktrees.filter((w) => w.worktree.path !== path);
    if (state.activeWorktreePath === path) {
      // Reset to repo root — don't leave workspacePath pointing to deleted dir
      const targetPath = state.repoRootPath;
      if (targetPath) {
        state.workspacePath = targetPath;
        const segments = targetPath.split(PATH_SEPARATOR_RE).filter(Boolean);
        state.workspaceName = segments[segments.length - 1] ?? targetPath;
      }
      state.activeWorktreePath = null;
      saveActiveWorktreeToStorage(null);
      // Clear stale conversations and trigger refresh
      state.activeConversationId = null;
      state.activeConversationTitle = null;
      state.conversations = [];
      state.isLoadingConversation = true;
      state.isConversationTransitioning = true;
    }
    saveWorktreesToStorage(state.worktrees);
  });
},
```

**f) Add `setRepoRootPath` action** — explicit, testable store action for `loadWorktrees` to use (audit recommended #1):

```typescript
setRepoRootPath: (path: string): void => {
  set((state) => {
    state.repoRootPath = path;
  });
},
```

**g) Add selector:**

```typescript
export const useRepoRootPath = (): string | null => {
  return useUIStore((state) => state.repoRootPath);
};
```

### 1b. ChatStore — add `clearActiveSession` action (audit round 2 critical #2)

**File:** `apps/agent/src/stores/chat/chat-store.ts`

After worktree switching, `activeSessionId` in ChatStore can still point to a session from the previous worktree. `handleSend` (`chat-actions.ts:97-119`) reads both `ChatStore.activeSessionId` and `UIStore.workspacePath`, so a stale session + updated workspace = context mismatch. Messages would land in the old session tagged with new workspace metadata.

```typescript
clearActiveSession: (): void => {
  set((draft) => {
    draft.activeSessionId = null;
  });
},
```

This is called from `PrimarySidebar` alongside `switchToWorktree` (Section 2b), `loadWorktrees` fallback (Section 3), and `removeWorktree` flows. The combination of `UIStore.switchToWorktree` (clears `activeConversationId/Title`) + `ChatStore.clearActiveSession` (clears `activeSessionId`) ensures no cross-store mismatch after context switches.

### 2. PrimarySidebar — wire project-open to `initializeWorkspace`, worktree select to `switchToWorktree` + session clearing

**File:** `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`

**a) Project-open flows** — use `initializeWorkspace` instead of `setWorkspace` (audit round 2 critical #1, round 3 critical #1):

```typescript
// Before (line ~183 in openProject and similar handlers):
useUIStore.getState().setWorkspace(path);

// After:
useUIStore.getState().initializeWorkspace(path);
```

All 8 call sites that previously called `setWorkspace(path)` must be migrated. The `setWorkspace` shim (Section 1c) ensures unmigrated call sites still work during transition, but all should be explicitly migrated in this PR:

- `PrimarySidebar.tsx:183` — `openProject`
- `file-handlers.ts:71` — `handleOpenFolder`
- `file-explorer.tsx:220` — `onSelectFolder`
- `ssh-connection-dialog.tsx:149` — `handleConnect`
- `ProjectsDialog.tsx:104` — `handleOpenProject`
- `clone-repository-dialog.tsx:224` — `handleClone`
- `chat-message-service.ts:396` — workspace bootstrap on first `system:init` (guarded by `!uiState.workspacePath`)
- `App.tsx:102` — demo/mock mode setup (`applyDemoView`)

**b) Both `onSelectWorktree` handlers** (lines 500-502 and 526-528) — switch worktree AND clear active session (audit round 2 critical #2):

```typescript
// Before:
onSelectWorktree={(path) => {
  useUIStore.getState().setActiveWorktree(path);
}}

// After:
onSelectWorktree={(path) => {
  useUIStore.getState().switchToWorktree(path);
  // Clear active session to prevent sending to old worktree context
  useChatStore.getState().clearActiveSession();
}}
```

**c) `CreateWorktreeDialog` `onCreated`** (line 602-605):

```typescript
// Before:
onCreated={(worktree) => {
  useUIStore.getState().setActiveWorktree(worktree.path);
}}

// After:
onCreated={(worktree) => {
  useUIStore.getState().switchToWorktree(worktree.path);
  useChatStore.getState().clearActiveSession();
}}
```

### 3. `use-sidebar-actions.ts` — use `repoRootPath` for worktree discovery + startup reconciliation

**File:** `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts`

**a) Add `repoRootPath` to store reads:**

```typescript
const repoRootPath = useUIStore((s) => s.repoRootPath);
```

**b) Change `loadWorktrees`** (line 118-190) to use `repoRootPath` for discovery, derive `repoRootPath` from main worktree, and reconcile startup state:

```typescript
const loadWorktrees = useCallback(async (): Promise<void> => {
  const discoveryPath = repoRootPath ?? workspacePath;
  if (!discoveryPath) return;

  try {
    const worktreeList = await gitWorktreeList(discoveryPath);

    // GUARD: parent repo detection (unchanged from current code)
    const worktreePaths = new Set(worktreeList.map((wt) => wt.path));
    const workspaceIsWorktree = worktreePaths.has(discoveryPath);
    const workspaceInsideWorktree = worktreeList.some((wt) =>
      discoveryPath.startsWith(wt.path + '/')
    );
    if (!workspaceIsWorktree && workspaceInsideWorktree) {
      setWorktrees([]);
      return;
    }

    // Derive repoRootPath from the main worktree (audit round 1 critical #2).
    // This is authoritative — overrides the fallback set by initializeWorkspace.
    // Uses a dedicated store action instead of raw set() (audit recommended #1).
    const mainWorktree = worktreeList.find((wt) => wt.isMain);
    if (mainWorktree) {
      const currentRoot = useUIStore.getState().repoRootPath;
      if (currentRoot !== mainWorktree.path) {
        useUIStore.getState().setRepoRootPath(mainWorktree.path);
      }
    }

    // Preserve existing isExpanded state (unchanged)
    const existingWorktrees = useUIStore.getState().worktrees;
    const existingExpandedMap = new Map(
      existingWorktrees.map((wt) => [wt.worktree.path, wt.isExpanded])
    );
    const worktreeStates = worktreeList.map((wt) => ({
      worktree: wt,
      isExpanded: existingExpandedMap.get(wt.path) ?? true,
    }));
    setWorktrees(worktreeStates);

    // Validate activeWorktreePath
    const currentActiveWorktree = useUIStore.getState().activeWorktreePath;
    const isActiveWorktreeValid =
      currentActiveWorktree !== null && worktreePaths.has(currentActiveWorktree);

    if (!isActiveWorktreeValid) {
      // Invalid/stale — fall back to main + clear session (audit round 2 critical #2)
      const fallbackWorktree = mainWorktree ?? worktreeList[0];
      if (fallbackWorktree) {
        useUIStore.getState().switchToWorktree(fallbackWorktree.path);
      } else {
        useUIStore.getState().switchToWorktree(null);
      }
      useChatStore.getState().clearActiveSession();
    } else {
      // STARTUP RECONCILIATION (audit round 1 critical #4):
      // activeWorktreePath is valid (restored from localStorage), but
      // workspacePath may still be the repo root from initializeWorkspace().
      // Reconcile by calling switchToWorktree so workspacePath matches.
      const currentWorkspace = useUIStore.getState().workspacePath;
      if (currentActiveWorktree && currentWorkspace !== currentActiveWorktree) {
        useUIStore.getState().switchToWorktree(currentActiveWorktree);
        // Don't clear session here — startup reconciliation preserves continuity
      }
    }
  } catch {
    setWorktrees([]);
    const current = useUIStore.getState().activeWorktreePath;
    const root = useUIStore.getState().repoRootPath;
    if (current !== null && current !== root) {
      useUIStore.getState().switchToWorktree(null);
      useChatStore.getState().clearActiveSession();
    }
  }
}, [repoRootPath, workspacePath, setWorktrees]);
```

**c) Use `repoRootPath` for `handleRemoveWorktree` + clear active session** (audit round 1 critical #2, audit round 3 critical #2):

```typescript
const handleRemoveWorktree = useCallback(
  async (deleteBranch: boolean): Promise<void> => {
    const repoRoot = useUIStore.getState().repoRootPath;
    const removePath = repoRoot ?? workspacePath;
    if (!removePath || !worktreeToDelete) return;

    try {
      await gitWorktreeRemove(removePath, worktreeToDelete.path, false);
      removeWorktree(worktreeToDelete.path);
      // removeWorktree() resets UIStore (workspacePath, conversations, activeConversationId)
      // but ChatStore.activeSessionId must also be cleared to prevent cross-context sends
      useChatStore.getState().clearActiveSession();
      // ... rest unchanged
    }
  },
  [workspacePath, worktreeToDelete, removeWorktree]
);
```

### 4. ConversationList — simplify: conversations under active worktree only

**File:** `apps/agent/src/components/layout/primary-sidebar/components/ConversationList.tsx`

The complex `conversationsByWorktree` useMemo (lines 58-112) is no longer needed. All conversations in the list are already scoped to the current workspace (= active worktree). Simplify to:

- Keep worktree items as **navigation headers** (switch-to-this-worktree buttons)
- Show ALL conversations flat under the **active worktree** only
- Other worktrees show as collapsed items (no nested conversations)

Remove: `conversationsByWorktree` useMemo, `getWorktreeConversations` callback.

### 5. CreateWorktreeDialog — use `repoRootPath` for repo operations

**File:** `apps/agent/src/components/modals/worktree/create-worktree-dialog.tsx`

After the refactor, `workspacePath` may point to a feature worktree. Git operations (branch listing, worktree creation) and path derivation (sibling directory naming) must use the repo root.

**a) Add `repoRootPath` selector:**

```typescript
const repoRootPath = useUIStore((s) => s.repoRootPath);
const repoPath = repoRootPath ?? workspacePath;
```

**b) Update branch loading** (line 77):

```typescript
// Before:
const branchList = await gitBranchInfo(workspacePath);

// After:
if (!repoPath) return;
const branchList = await gitBranchInfo(repoPath);
```

**c) Update worktree path derivation** (lines 108-120) — derive from repo root, not current workspace:

```typescript
const worktreePath = useMemo(() => {
  if (!repoPath || !effectiveBranchName) return '';

  // Get parent directory and repo name FROM REPO ROOT
  const parts = repoPath.split(PATH_SEPARATOR_RE);
  const repoName = parts.pop() ?? 'repo';
  const parentDir = parts.join('/');

  const safeBranchName = effectiveBranchName.replace(UNSAFE_FS_CHARS_RE, '-');
  return `${parentDir}/${repoName}-${safeBranchName}`;
}, [repoPath, effectiveBranchName]);
```

**d) Update `handleCreate`** (line 139):

```typescript
// Before:
const worktree = await gitWorktreeAdd(workspacePath, worktreePath, options);

// After:
if (!repoPath) return;
const worktree = await gitWorktreeAdd(repoPath, worktreePath, options);
```

### 6. `chat-message-service.ts` — handle empty conversation lists

**File:** `apps/agent/src/services/chat/chat-message-service.ts`

The `handleConversationList` handler (line 853) currently drops empty responses, keeping stale conversations visible when switching to a worktree with no sessions.

```typescript
// Before (line 850-865):
private handleConversationList(
  message: Extract<ExtensionMessage, { type: 'conversation:list' }>
): void {
  if (message.conversations.length > 0) {
    useUIStore.getState().setConversations(
      message.conversations.map((c) => ({ ... }))
    );
  }
}

// After — always apply, including empty arrays:
private handleConversationList(
  message: Extract<ExtensionMessage, { type: 'conversation:list' }>
): void {
  useUIStore.getState().setConversations(
    message.conversations.map((c) => ({
      sessionId: c.session_id,
      title: c.title,
      updatedAt: c.updated_at,
      messageCount: c.message_count,
      ...(c.workspace_path ? { workspacePath: c.workspace_path } : {}),
      ...(c.worktree_path ? { worktreePath: c.worktree_path } : {}),
    }))
  );
}
```

**Note:** The `setConversations` action in UIStore already handles optimistic merge (preserving in-memory titles, keeping TTL-guarded optimistic entries). An empty backend response will correctly clear stale entries while preserving any in-flight optimistic conversations created in the last 60 seconds.

### 7. `use-file-tree.ts` — handle null-main worktree transitions

**File:** `apps/agent/src/hooks/file/use-file-tree.ts`

The `useWorktreeFileTreeSync` subscribe callback (line 55) has `&& activeWorktree` which skips the transition when `switchToWorktree(null)` fires. The file tree and Rust backend workspace stay pointed at the previous worktree.

```typescript
// Before (line 50-55):
const unsubscribe = useUIStore.subscribe((state) => {
  const activeWorktree = state.activeWorktreePath;
  const prevWorktree = prevWorktreeRef.current;
  if (activeWorktree !== prevWorktree && activeWorktree) {

// After — react to workspacePath, handle null transitions:
const unsubscribe = useUIStore.subscribe((state) => {
  // Use workspacePath as the sync target — after the refactor, switchToWorktree
  // always updates workspacePath (even when activeWorktreePath is null for main).
  const targetPath = state.workspacePath;
  const prevWorktree = prevWorktreeRef.current;
  if (targetPath && targetPath !== prevWorktree) {
    prevWorktreeRef.current = targetPath;
    logger.info(`Workspace path changed: ${prevWorktree ?? 'none'} → ${targetPath}`);
    setWorkspacePath(targetPath)
      .then(() => {
        useFileStore.getState().setRootPath(targetPath);
        initFileWatcher(targetPath).catch(/* ... */);
        buildFileIndex(targetPath).catch(/* ... */);
      })
      .catch(/* ... */);
  }
});
```

Also update the mount-time initial sync (lines 30-39) to use `workspacePath`:

```typescript
// Before:
const currentWorktree = useUIStore.getState().activeWorktreePath;
const currentRoot = useFileStore.getState().rootPath;
if (currentWorktree && currentWorktree !== currentRoot) {

// After:
const currentWorkspace = useUIStore.getState().workspacePath;
const currentRoot = useFileStore.getState().rootPath;
if (currentWorkspace && currentWorkspace !== currentRoot) {
```

### 8. Files that need no changes (verified)

These files already work correctly because they read `workspacePath` or `activeWorktreePath`:

| File                                               | Why no change needed                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `use-chat-messages.ts` Effect 2                    | Sends `conversation:list` with `workspacePath` — auto-scopes. Fires on `workspacePath` change.                                                                                                                                                               |
| `chat-message-service.ts` `scheduleSidebarRefresh` | Reads `workspacePath` at callback time — auto-scopes                                                                                                                                                                                                         |
| `use-tauri-session.ts` `ensureSession`             | Uses `activeWorktreePath ?? getWorkspacePath()` — both correct                                                                                                                                                                                               |
| `chat-actions.ts` `handleSend`                     | Reads `workspacePath` + `activeWorktreePath` — both correct after switch. Protected by `clearActiveSession` (Section 1b) which nulls `activeSessionId` before new workspace takes effect, preventing messages from landing in old session with new metadata. |
| `content-top-bar.tsx` header                       | Uses `useWorkspaceName()` — updated by `switchToWorktree`                                                                                                                                                                                                    |
| `terminal-panel.tsx`                               | Uses `workspacePath` for new terminal cwd — auto-scopes                                                                                                                                                                                                      |

---

## What gets simplified (deferred cleanup, not in this PR)

Mark these as `// TRANSITIONAL: remove after worktree-as-workspace migration` in code:

- `setWorkspace` shim — remove after all call sites use `initializeWorkspace` directly
- `sessionWorktreeMap` — no longer needed for sidebar grouping
- `conversationBelongsToWorktree()` — no longer needed (conversations are workspace-scoped)
- `useEffectivePath()` — redundant (`workspacePath` IS the effective path)
- `worktreePath` field on `ConversationSummary` — no longer needed for filtering

---

## Edge cases

1. **Switching back to main:** `switchToWorktree(mainPath)` or `switchToWorktree(null)` → restores `workspacePath = repoRootPath`. File tree sync now reacts to `workspacePath` changes (change #7), so null transitions work.
2. **Active streaming during switch:** Running session keeps its cwd. UI shows different conversation list. `clearActiveSession()` nulls `activeSessionId`, so `handleSend` cannot accidentally write to the old session. Session continues in background — user can find it in the original worktree's conversation list.
3. **First switch with no conversations:** Empty list shown immediately (`switchToWorktree` clears `conversations` in the batch). User creates new session manually.
4. **Non-git projects:** `worktrees[]` empty, `repoRootPath === workspacePath`. No behavioral change.
5. **Worktree deletion while active:** `removeWorktree()` resets `workspacePath = repoRootPath`, clears conversations + active session, triggers refresh.
6. **App restart with persisted worktree:** `loadWorktrees` validates the stored path. If valid, startup reconciliation calls `switchToWorktree(activeWorktreePath)` so `workspacePath` matches. If invalid/deleted, falls back to main.
7. **Worktree deleted from outside the app:** `loadWorktrees` validation catches the stale `activeWorktreePath` on next poll/mount and resets to main via `switchToWorktree`.
8. **Creating worktree from non-main worktree:** `CreateWorktreeDialog` uses `repoRootPath` for both path derivation and `gitWorktreeAdd`, so sibling dirs are always relative to the repo root.
9. **Rapid worktree switches:** `loadWorktrees` async results could arrive out of order. Mitigated by: `switchToWorktree` immediately clears conversations (no stale list shown), and `setConversations` optimistic merge self-corrects on next response. For full protection, add a request epoch guard to `loadWorktrees` (recommended improvement, not required for v1).
10. **Opening Project B after Project A:** `initializeWorkspace(pathB)` always resets `repoRootPath = pathB`, `activeWorktreePath = null`, and clears conversations. No stale state leaks from Project A. All 8 call sites use `initializeWorkspace` (not `switchToWorktree`).
11. **Sending message immediately after worktree switch:** `clearActiveSession()` runs synchronously after `switchToWorktree`. `handleSend` checks `activeSessionId` — if null, it creates a new session in the current workspace context. No cross-context contamination.
12. **Switching from git project to non-git project:** `initializeWorkspace` resets `repoRootPath` and `activeWorktreePath = null`. `loadWorktrees` returns empty list. `worktrees[]` empty, `repoRootPath === workspacePath`. Clean transition.

---

## Verification

1. `bun run typecheck` — zero errors
2. `bun run lint` — zero warnings
3. `bun run test` — all pass
4. Manual test:
   - Open a git project → sidebar shows conversations
   - Create worktree → auto-switches, empty conversation list
   - Start session on worktree → send message → conversation appears
   - Switch to main → main conversations shown, worktree conversation hidden
   - Switch back to worktree → worktree conversation restored
   - Header shows correct folder name per worktree
   - File explorer shows correct files per worktree
   - New terminal opens in correct worktree directory
   - **NEW:** Delete active worktree → resets to main, conversations update
   - **NEW:** Restart app with worktree selected → correct conversations on startup
   - **NEW:** Switch to worktree with zero sessions → empty list (no stale sessions)
   - **NEW:** Create worktree while on non-main worktree → path derives from repo root
   - **NEW:** Open Project B after Project A → `repoRootPath` points to B, not A
   - **NEW:** Switch worktree then immediately send message → new session created in new worktree context (not old session)
   - **NEW:** Switch from git project to non-git folder → no stale worktree state
5. **Unit tests to add:**
   - `initializeWorkspace` always resets `repoRootPath`, `activeWorktreePath`, and clears conversations
   - `initializeWorkspace` on second call overwrites first call's `repoRootPath` (no null guard)
   - `setWorkspace` shim delegates to `initializeWorkspace` (same behavior)
   - `switchToWorktree` sets `workspacePath`, `activeWorktreePath`, `workspaceName`, clears `conversations` + `activeConversationId`
   - `switchToWorktree(null)` restores `workspacePath = repoRootPath`
   - `removeWorktree` on active worktree resets `workspacePath` to `repoRootPath` and clears `activeConversationId`
   - Startup reconciliation: valid persisted worktree triggers `switchToWorktree`
6. **Existing test migration** (`ui-store.test.ts` — 4 occurrences at lines 210, 220, 230, 1001):
   - Update `setWorkspace` calls to `initializeWorkspace` in tests
   - Add assertions for `repoRootPath` being set on every `initializeWorkspace` call
7. **Cross-store integration tests to add** (audit recommended #3):
   - Switch worktree + send message → message uses new workspace context (not old session)
   - `clearActiveSession` nulls `activeSessionId` — verify `handleSend` creates new session
   - `initializeWorkspace` followed by `loadWorktrees` → `repoRootPath` updated to main worktree path
   - Remove active worktree + send message → new session in repo root context (not deleted worktree)
