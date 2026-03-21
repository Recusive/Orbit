# Plan: Global Navigation History (Back/Forward Arrows)

## Context

The header bar has back/forward arrow buttons (in `content-top-bar.tsx:398-428`) that are currently non-functional globally. The back button only closes Settings/Vault when open. The forward button has no handler at all. The goal is browser-like navigation history that tracks **layout and navigation state** (tabs, panels, sidebars, settings, conversations, files) so these arrows navigate through user actions across all three modes (Agent, Canvas, Editor). Content-level state (scroll positions, markdown preview, active terminal session, unsaved edits) is explicitly out of scope.

**Source plan**: `docs/plans/others/navigation/NAVIGATION-HISTORY-PLAN.md` — architecturally sound core, but required corrections for dual-backend support, global scope, rich tab snapshots, and workspace boundaries.

**Audit history**: 6 audit rounds. All critical findings addressed.

---

## Architecture

```
Zustand subscribe() on UIStore + FileViewerStore + OcSessionStore + BackendStore
        │ (field-level change detection — only tracked fields)
        ▼
  300ms debounce → captureSnapshot() → snapshotsEqual?
        │                                    │
        │ (different)                        │ (same → skip)
        ▼
  navigationStore.pushSnapshot(snapshot)
        │
        ▼
  history[] stack + currentIndex (browser-style, max 100)

  goBack() / goForward():
    1. _restoreGeneration++
    2. isNavigating = true
    3. try { applySnapshot() → setState on UIStore + FileViewerStore + bridge.select() }
    4. finally { clearTimeout(prev); setTimeout(50ms) → isNavigating = false }

  Keyboard: Ctrl+- / Ctrl+Shift+- (self-contained in tracker, NOT in KEYBOARD_SHORTCUTS)
```

---

## What Gets Tracked

| State                            | Store           | Field                                                |
| -------------------------------- | --------------- | ---------------------------------------------------- |
| Header tab (Agent/Editor/Canvas) | UIStore         | `activeTab`                                          |
| Active file (with viewMode)      | FileViewerStore | `activeTabPath` + tab metadata                       |
| Open file tabs (with types)      | FileViewerStore | `openTabs[]` (path, viewMode, fileType)              |
| Left sidebar collapsed           | UIStore         | derived: `leftSidebarWidth` ≤ `SIDEBAR.collapsed`    |
| Activity panel                   | UIStore         | `reviewPanelOpen`                                    |
| Right sidebar                    | UIStore         | `rightSidebarOpen`                                   |
| Terminal panel                   | UIStore         | `bottomPanelOpen`                                    |
| Terminal panel tab               | UIStore         | `bottomPanelTab`                                     |
| Activity tab                     | UIStore         | `activityTab`                                        |
| Settings page                    | UIStore         | `settingsOpen`                                       |
| Settings section                 | UIStore         | `settingsSection`                                    |
| Active conversation              | Bridge          | `getConversationUiBridge().getActiveSessionId()`     |
| Active backend (boundary)        | BackendStore    | `activeBackend` — clears + reseeds history on change |
| Vault page                       | UIStore         | `vaultOpen`                                          |
| Chat area detached               | UIStore         | `chatAreaDetached`                                   |
| Terminal position                | UIStore         | `terminalPosition`                                   |
| Terminal collapsed               | UIStore         | `terminalCollapsed`                                  |
| Editor chat panel                | UIStore         | `editorChatPanelOpen`                                |

**NOT tracked (by design):** agent messages, panel widths/resize, scroll positions, file content edits, container dimensions, conversation list data, loading states, worktree state, workspace transitions (destructive), active terminal session, markdown preview toggle, diff tab data (ephemeral — skipped on restore), unsaved modifications (re-fetched from disk). Backend switches and workspace changes are **history boundaries** (clear + reseed).

---

## Snapshot Type

```typescript
interface TabSnapshot {
  path: string;
  viewMode: FileViewMode; // 'file' | 'diff'
  fileType: 'text' | 'image';
}

interface NavigationSnapshot {
  // UIStore fields
  activeTab: HeaderTab;
  leftSidebarCollapsed: boolean;
  reviewPanelOpen: boolean;
  rightSidebarOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  activityTab: ActivityTab;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  vaultOpen: boolean;
  chatAreaDetached: boolean;
  terminalPosition: TerminalPosition;
  terminalCollapsed: boolean;
  editorChatPanelOpen: boolean;
  // Conversation (backend-agnostic — backend switches clear history, see design decision)
  activeConversationId: string | null;
  // FileViewerStore fields (rich tab descriptors)
  activeTabPath: string | null;
  openTabs: TabSnapshot[];
}
```

> **Why `TabSnapshot` instead of `string[]`?** Path-only snapshots lose tab type information. A diff tab restored as a plain file tab shows wrong content. An image tab needs the file opener's image detection path, not `readFile()`. Storing `viewMode` and `fileType` enables faithful restoration for file/image tabs and graceful skip for diff tabs (ephemeral data).

---

## Files to CREATE (4 files)

| #   | File                                                  | Purpose                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/agent/src/stores/ui/navigation-store.ts`        | Zustand + Immer store: `history[]`, `currentIndex`, `pushSnapshot`, `goBack`, `goForward`, `clearHistory`, selector hooks. Module-level `isNavigating` flag + `_navigatingTimeoutId` (clearTimeout before re-scheduling). Module-level `_restoreGeneration` counter for stale async protection.      |
| 2   | `apps/agent/src/lib/navigation/apply-snapshot.ts`     | Restore snapshot → UIStore setState + FileViewerStore rich tab restore + `getConversationUiBridge().select()`. Generation-checked async callbacks.                                                                                                                                                   |
| 3   | `apps/agent/src/lib/navigation/navigation-tracker.ts` | Module-level subscriptions to UIStore + FileViewerStore + OcSessionStore + BackendStore. Self-contained `Ctrl+-` / `Ctrl+Shift+-` keyboard listener. `initNavigationTracker()`, `destroyNavigationTracker()`, `captureSnapshot()`, `snapshotsEqual()`. Workspace change → `clearHistory()` + reseed. |
| 4   | `apps/agent/src/lib/navigation/index.ts`              | Barrel export                                                                                                                                                                                                                                                                                        |

## Files to MODIFY (3 files)

| #   | File                                                   | Change                                                                             |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 5   | `apps/agent/src/components/layout/content-top-bar.tsx` | Wire buttons to `goBack`/`goForward`, add disabled state + tooltip (lines 398-428) |
| 6   | `apps/agent/src/App.tsx`                               | Initialize tracker in `useEffect` guarded by `hasWorkspace`                        |
| 7   | `apps/agent/src/stores/ui/index.ts`                    | Export `useNavigationStore`, `useCanGoBack`, `useCanGoForward`                     |

**REMOVED from source plan:**

- `lib/navigation/load-conversation.ts` — replaced by existing `getConversationUiBridge().select()`
- `lib/utils/constants.ts` changes — keyboard shortcuts are self-contained in tracker (see rationale below)
- `root-layout.tsx` changes — RootLayout is Agent-only; shortcuts handled in tracker

---

## Key Implementation Details

### 1. Self-contained keyboard shortcuts (NOT in KEYBOARD_SHORTCUTS)

`useDefaultKeyboardShortcuts()` is called in `RootLayout` (root-layout.tsx:48), which only mounts in **Agent mode**. Shortcuts defined via `KEYBOARD_SHORTCUTS` + that hook would NOT fire in Canvas or Editor modes — breaking the "global" requirement.

Instead, `initNavigationTracker()` registers its own `window.addEventListener('keydown')` directly. This listener is:

- **Global**: fires regardless of which mode is active
- **Self-contained**: created and cleaned up with the tracker lifecycle
- **No `isInput` concern**: `Ctrl+-` has no text-editing function, so it's safe to fire in all contexts

```typescript
function initNavigationTracker(): void {
  // ... subscriptions ...

  // Use e.code (physical key) not e.key (rendered character).
  // Shift+Minus reports e.key === '_' on US keyboards, so e.key === '-' would never match.
  // e.code === 'Minus' is the physical minus key regardless of shift/layout.
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey && e.code === 'Minus' && !e.metaKey && !e.altKey) {
      if (!e.shiftKey) {
        e.preventDefault();
        useNavigationStore.getState().goBack();
      } else {
        e.preventDefault();
        useNavigationStore.getState().goForward();
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  cleanups.push(() => window.removeEventListener('keydown', handleKeyDown));
}
```

### 2. Backend-aware capture (3 subscriptions + bridge)

The tracker subscribes to **4 stores**, but `captureSnapshot()` reads the active conversation via the backend-agnostic bridge:

```typescript
// Subscriptions (field-level change detection)
const unsubUI = useUIStore.subscribe((state, prev) => {
  /* 15 tracked UIStore fields:
  activeTab, leftSidebarWidth (collapsed threshold), reviewPanelOpen, rightSidebarOpen,
  bottomPanelOpen, bottomPanelTab, activityTab, settingsOpen, settingsSection,
  activeConversationId, vaultOpen, chatAreaDetached,
  terminalPosition, terminalCollapsed, editorChatPanelOpen */
});
const unsubFiles = useFileViewerStore.subscribe((state, prev) => {
  /* tab state */
});
const unsubOc = useOcSessionStore.subscribe((state, prev) => {
  if (state.activeSessionId !== prev.activeSessionId) {
    debouncedCapture();
  }
});
// Backend switch = history boundary (same treatment as workspace change).
// OpenCode startup is async (sidecar spawn, health check, lifecycle hook).
// Attempting to replay across backends would race useOpencodeLifecycle()'s
// restoreSelection() and fail while the sidecar is cold.
const unsubBackend = useBackendStore.subscribe((state, prev) => {
  if (state.activeBackend !== prev.activeBackend) {
    useNavigationStore.getState().clearHistory();
    // Reseed via debounced capture — lands after lifecycle hooks settle
    debouncedCapture();
  }
});

// captureSnapshot reads conversation ID via bridge (backend-agnostic)
function captureSnapshot(): NavigationSnapshot {
  const ui = useUIStore.getState();
  const files = useFileViewerStore.getState();
  return {
    activeTab: ui.activeTab,
    leftSidebarCollapsed: ui.leftSidebarWidth <= SIDEBAR.collapsed,
    reviewPanelOpen: ui.reviewPanelOpen,
    rightSidebarOpen: ui.rightSidebarOpen,
    bottomPanelOpen: ui.bottomPanelOpen,
    bottomPanelTab: ui.bottomPanelTab,
    activityTab: ui.activityTab,
    settingsOpen: ui.settingsOpen,
    settingsSection: ui.settingsSection,
    vaultOpen: ui.vaultOpen,
    chatAreaDetached: ui.chatAreaDetached,
    terminalPosition: ui.terminalPosition,
    terminalCollapsed: ui.terminalCollapsed,
    editorChatPanelOpen: ui.editorChatPanelOpen,
    activeConversationId: getConversationUiBridge().getActiveSessionId(),
    activeTabPath: files.activeTabPath,
    openTabs: files.openTabs.map((t) => ({
      path: t.path,
      viewMode: t.viewMode,
      fileType: t.fileType,
    })),
  };
}
```

> **Why subscribe to OcSessionStore separately instead of just using the bridge in captureSnapshot?** The bridge reads from the correct store, but Zustand subscriptions only fire on state changes in the subscribed store. Without subscribing to `useOcSessionStore`, an OpenCode session switch wouldn't trigger any subscription → `debouncedCapture()` would never fire → the history entry would be silently missed.

### 3. Rich tab restore with generation guard

```typescript
let _restoreGeneration = 0;

function applySnapshot(snapshot: NavigationSnapshot): void {
  const generation = ++_restoreGeneration;
  setIsNavigating(true);

  // Clear previous timeout to prevent rapid-click stacking
  if (_navigatingTimeoutId !== null) clearTimeout(_navigatingTimeoutId);

  try {
    // Backend switches clear history (boundary), so all snapshots in history
    // are guaranteed to be from the current backend. No backend restore needed.
    const prevConversationId = getConversationUiBridge().getActiveSessionId();

    // 1. Restore UIStore fields
    useUIStore.setState((draft) => {
      draft.activeTab = snapshot.activeTab;
      draft.leftSidebarWidth = snapshot.leftSidebarCollapsed
        ? SIDEBAR.collapsed
        : draft.lastExpandedSidebarWidth;
      draft.reviewPanelOpen = snapshot.reviewPanelOpen;
      draft.rightSidebarOpen = snapshot.rightSidebarOpen;
      draft.bottomPanelOpen = snapshot.bottomPanelOpen;
      draft.bottomPanelTab = snapshot.bottomPanelTab;
      draft.activityTab = snapshot.activityTab;
      draft.settingsOpen = snapshot.settingsOpen;
      draft.settingsSection = snapshot.settingsSection;
      draft.vaultOpen = snapshot.vaultOpen;
      draft.chatAreaDetached = snapshot.chatAreaDetached;
      draft.terminalPosition = snapshot.terminalPosition;
      draft.terminalCollapsed = snapshot.terminalCollapsed;
      draft.editorChatPanelOpen = snapshot.editorChatPanelOpen;
    });

    // 2. Restore FileViewerStore (close all + reopen in order)
    const fileState = useFileViewerStore.getState();
    fileState.closeAllTabs();

    for (const tab of snapshot.openTabs) {
      if (tab.viewMode === 'diff') {
        // Diff data is ephemeral (from git status) — cannot restore.
        // Skip silently. User can re-open from Changes tab.
        continue;
      }
      fileState.openFile(tab.path);

      if (tab.fileType === 'image' && isImageFile(tab.path)) {
        // Image restore: must go through the real image pipeline.
        // openFile() only creates a text tab. The actual image detection
        // happens in file-handlers.ts:148 via convertFileSrc + getFileInfo + setImageFile.
        const currentTab = useFileViewerStore.getState().openTabs.find((t) => t.path === tab.path);
        if (currentTab) {
          void Promise.all([
            import('@tauri-apps/api/core').then((m) => m.convertFileSrc(tab.path)),
            getFileInfo(tab.path),
          ])
            .then(([assetUrl, fileInfo]) => {
              if (_restoreGeneration !== generation) return;
              useFileViewerStore.getState().setImageFile(tab.path, currentTab.instanceId, {
                assetUrl,
                mimeType: getImageMimeType(tab.path),
                fileSize: fileInfo.size,
              });
            })
            .catch(() => {
              if (_restoreGeneration !== generation) return;
              useFileViewerStore.getState().closeTab(tab.path);
            });
        }
      } else if (tab.fileType === 'text') {
        // Text file: async content fetch with generation guard
        void readFile(tab.path)
          .then((content) => {
            if (_restoreGeneration !== generation) return;
            useFileViewerStore.getState().setFileContent(tab.path, content);
          })
          .catch(() => {
            if (_restoreGeneration !== generation) return;
            useFileViewerStore.getState().closeTab(tab.path);
          });
      }
    }

    if (snapshot.activeTabPath !== null) {
      fileState.setActiveTab(snapshot.activeTabPath);
    }

    // Reset FileViewerStore's internal history
    useFileViewerStore.setState((draft) => {
      const paths = snapshot.openTabs.filter((t) => t.viewMode !== 'diff').map((t) => t.path);
      draft.history = paths;
      draft.historyIndex = snapshot.activeTabPath ? paths.indexOf(snapshot.activeTabPath) : -1;
    });

    // 3. Conversation change (bridge now resolves against restored backend)
    if (
      snapshot.activeConversationId !== null &&
      snapshot.activeConversationId !== prevConversationId
    ) {
      getConversationUiBridge()
        .select(snapshot.activeConversationId)
        .catch((error) => {
          logger.warn('Navigation: conversation restore failed', {
            error,
            sessionId: snapshot.activeConversationId,
          });
        });
    }
  } finally {
    _navigatingTimeoutId = setTimeout(() => {
      setIsNavigating(false);
      _navigatingTimeoutId = null;
    }, 50);
  }
}
```

### 4. Workspace boundary reset

```typescript
// In navigation-tracker.ts — subscribe to workspace changes
// (added to the UIStore subscription's field-level filter, NOT a separate subscription)
// When workspacePath changes, clear history and reseed.
// Uses the debounced capture (300ms) to reseed — same pipeline as normal snapshots,
// so the reseed lands AFTER other workspace-init state changes settle (conversation
// hydration, file tree load, etc.), not at a fixed 100ms timeout.
//
// Inside the UIStore subscription callback:
if (state.workspacePath !== prev.workspacePath) {
  useNavigationStore.getState().clearHistory();
  // The workspace change also fires debouncedCapture() (below), which reseeds
  // history with the post-init state after the 300ms debounce settles.
}
// debouncedCapture() fires for ALL tracked field changes including workspacePath
```

### 5. snapshotsEqual with rich tab comparison

```typescript
function snapshotsEqual(a: NavigationSnapshot, b: NavigationSnapshot): boolean {
  // Primitives (fast bailout)
  if (a.activeTab !== b.activeTab) return false;
  if (a.leftSidebarCollapsed !== b.leftSidebarCollapsed) return false;
  if (a.reviewPanelOpen !== b.reviewPanelOpen) return false;
  if (a.rightSidebarOpen !== b.rightSidebarOpen) return false;
  if (a.bottomPanelOpen !== b.bottomPanelOpen) return false;
  if (a.bottomPanelTab !== b.bottomPanelTab) return false;
  if (a.activityTab !== b.activityTab) return false;
  if (a.settingsOpen !== b.settingsOpen) return false;
  if (a.settingsSection !== b.settingsSection) return false;
  if (a.activeConversationId !== b.activeConversationId) return false;
  if (a.vaultOpen !== b.vaultOpen) return false;
  if (a.chatAreaDetached !== b.chatAreaDetached) return false;
  if (a.terminalPosition !== b.terminalPosition) return false;
  if (a.terminalCollapsed !== b.terminalCollapsed) return false;
  if (a.editorChatPanelOpen !== b.editorChatPanelOpen) return false;
  if (a.activeTabPath !== b.activeTabPath) return false;
  // Rich tab comparison
  if (a.openTabs.length !== b.openTabs.length) return false;
  for (let i = 0; i < a.openTabs.length; i++) {
    const ta = a.openTabs[i];
    const tb = b.openTabs[i];
    if (ta.path !== tb.path || ta.viewMode !== tb.viewMode || ta.fileType !== tb.fileType) {
      return false;
    }
  }
  return true;
}
```

---

## Edge Cases

| Scenario                            | Behavior                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend switch                      | History boundary — `clearHistory()` + reseed via debounced capture. All snapshots in history are guaranteed same-backend. No cross-backend replay. Avoids racing `useOpencodeLifecycle()` and cold sidecar startup. |
| `applySnapshot` partially fails     | UI layout restores. Conversation may fail via `.catch()` logger. Partial state acceptable — matches browser behavior.                                                                                               |
| Diff tab in history                 | Skipped on restore (diff data is ephemeral from git status). User can re-open from Changes tab.                                                                                                                     |
| Image tab in history                | Restored via `openFile()` + explicit `convertFileSrc()` + `getFileInfo()` + `setImageFile()` pipeline (mirrors `file-handlers.ts:148-163`). Generation-guarded async.                                               |
| Stale async file read               | Generation counter prevents stale reads from reopening tabs after subsequent navigation.                                                                                                                            |
| Workspace change                    | `clearHistory()` called, reseed via 300ms debounced capture (same pipeline as normal snapshots — settles after workspace-init state changes). No stale entries leak.                                                |
| OpenCode conversation switch        | `useOcSessionStore` subscription fires → `debouncedCapture()` → snapshot includes bridge's `getActiveSessionId()`.                                                                                                  |
| Ctrl+- in CodeMirror/inputs         | `Ctrl+-` has no text-editing function. Global `keydown` listener uses `e.code === 'Minus'` (physical key, not rendered character). Fires regardless of focus. No conflict.                                          |
| Ctrl+Shift+- key detection          | `Shift+Minus` renders `_` on US keyboards (`e.key === '_'`). Using `e.code === 'Minus'` matches the physical key regardless of shift state or keyboard layout.                                                      |
| Rapid clicks                        | `clearTimeout(prev)` before re-scheduling. Generation counter invalidates in-flight async work.                                                                                                                     |
| Shortcuts in Canvas/Editor mode     | Global `window.addEventListener('keydown')` in tracker — fires in all modes. Not dependent on `useDefaultKeyboardShortcuts()` (Agent-only).                                                                         |
| FileViewerStore persist rehydration | Not a concern — `partialize` only persists `{ wordWrap }`, not tab state.                                                                                                                                           |
| `startTransition` race              | Unlikely at 300ms debounce. Worst case: one extra snapshot entry.                                                                                                                                                   |

---

## Verification

1. `bun run typecheck` — zero errors
2. `bun run lint` — zero warnings
3. Manual testing in `bunx tauri dev`:
   - Switch tabs (Agent → Canvas → Editor) → back returns to previous tab
   - **Back/forward work in Canvas and Editor modes** (not just Agent)
   - Open file → back closes it → forward reopens it
   - Open diff tab → navigate away → back → diff tab skipped, file tabs restored
   - Open image file → navigate away → back → image tab restored
   - Toggle sidebar → back restores state
   - Open settings → back closes them
   - Open vault → back closes it
   - Ctrl+- / Ctrl+Shift+- keyboard shortcuts work
   - **Ctrl+- works while CodeMirror has focus**
   - Option+Left/Right still work for word navigation (no conflict)
   - Disabled state shown when at history boundary
   - Rapid clicking doesn't cause stuck state or phantom snapshots
   - **OpenCode conversation switch tracked** (switch backend, open conversations, verify history)
   - **Claude conversation switch tracked**
   - **Backend switch clears history**: switch Claude→OpenCode, verify back button disabled (fresh history)
   - **Ctrl+Shift+- fires correctly** (not blocked by Shift producing `_`)
   - **Image tab restore**: open .png, navigate away, back → image renders (not empty text tab)
   - **Terminal position/collapsed restored**: toggle terminal position, press back
   - **Editor chat panel restored**: toggle chat panel in editor mode, press back
   - Terminal tab (terminal vs problems) tracked
   - Sidebar drag resize does NOT create entries (only threshold crossing)
   - Navigating back to deleted file closes tab gracefully
   - **Workspace switch clears history** (worktree or new folder)
   - Tab order preserved with multiple open files
   - Failed conversation restore logs warning, doesn't break navigation
