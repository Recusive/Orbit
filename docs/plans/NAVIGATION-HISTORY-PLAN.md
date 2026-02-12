# Global Navigation History (Back/Forward) System

## Context

The header bar has back/forward arrow buttons that are currently non-functional. The goal is to build a browser-like navigation history that tracks meaningful UI state changes (except agent chat) so back/forward arrows navigate through user actions across the entire app: tab switches, file open/close, panel toggles, settings, conversation switches, etc.

## What Gets Tracked

| State                            | Store           | Field                   |
| -------------------------------- | --------------- | ----------------------- |
| Header tab (Agent/Editor/Canvas) | UIStore         | `activeTab`             |
| Active file                      | FileViewerStore | `activeTabPath`         |
| Open file tabs                   | FileViewerStore | `openTabs[].path`       |
| Left sidebar                     | UIStore         | `leftSidebarOpen`       |
| Activity panel                   | UIStore         | `reviewPanelOpen`       |
| Right sidebar                    | UIStore         | `rightSidebarOpen`      |
| Terminal panel                   | UIStore         | `bottomPanelOpen`       |
| Terminal panel tab               | UIStore         | `bottomPanelTab`        |
| Activity tab                     | UIStore         | `activityTab`           |
| Settings dialog                  | UIStore         | `settingsDialogOpen`    |
| Settings section                 | UIStore         | `settingsDialogSection` |
| Active conversation              | UIStore         | `activeConversationId`  |
| Vault page                       | UIStore         | `vaultOpen`             |
| Chat area detached               | UIStore         | `chatAreaDetached`      |

**NOT tracked:** agent messages, panel widths/resize, scroll positions, file content edits, container dimensions, conversation list data, loading states, worktree state, workspace transitions (destructive).

## Snapshot Type

```typescript
import type { ActivityTab, BottomPanelTab, HeaderTab } from '@/stores/ui/ui-store';
import type { SettingsSection } from '@/components/modals/settings';

interface NavigationSnapshot {
  // UIStore fields
  activeTab: HeaderTab;
  leftSidebarOpen: boolean;
  reviewPanelOpen: boolean;
  rightSidebarOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  activityTab: ActivityTab;
  settingsDialogOpen: boolean;
  settingsDialogSection: SettingsSection;
  activeConversationId: string | null;
  vaultOpen: boolean;
  chatAreaDetached: boolean;
  // FileViewerStore fields
  activeTabPath: string | null;
  openFilePaths: string[]; // derived from openTabs[].path
}
```

## Architecture

```
Zustand subscribe() on UIStore + FileViewerStore
        │ (field-level change detection — only tracked fields)
        ▼
  300ms debounce → captureSnapshot() → snapshotsEqual?
        │                                    │
        │ (different)                        │ (same → skip)
        ▼
  navigationStore.pushSnapshot(snapshot)
        │
        ▼
  history[] stack + currentIndex (browser-style)

  goBack() / goForward():
    1. isNavigating = true
    2. try { applySnapshot() → setState on UIStore + FileViewerStore }
    3. finally { rAF → rAF → microtask → isNavigating = false }
```

### Subscription Change Detection

Subscriptions use field-level comparison to avoid firing on unrelated state changes. UIStore has ~30+ fields but only ~14 are tracked. Without filtering, every `setContainerDimensions()`, `setConversations()`, `setLoadingConversation()`, etc. would trigger the snapshot pipeline.

```typescript
// UIStore subscription — only fires when tracked fields change
useUIStore.subscribe((state, prevState) => {
  if (
    state.activeTab !== prevState.activeTab ||
    state.leftSidebarOpen !== prevState.leftSidebarOpen ||
    state.reviewPanelOpen !== prevState.reviewPanelOpen ||
    state.rightSidebarOpen !== prevState.rightSidebarOpen ||
    state.bottomPanelOpen !== prevState.bottomPanelOpen ||
    state.bottomPanelTab !== prevState.bottomPanelTab ||
    state.activityTab !== prevState.activityTab ||
    state.settingsDialogOpen !== prevState.settingsDialogOpen ||
    state.settingsDialogSection !== prevState.settingsDialogSection ||
    state.activeConversationId !== prevState.activeConversationId ||
    state.vaultOpen !== prevState.vaultOpen ||
    state.chatAreaDetached !== prevState.chatAreaDetached
  ) {
    debouncedCapture();
  }
});

// FileViewerStore subscription — only fires when tab state changes
useFileViewerStore.subscribe((state, prevState) => {
  if (
    state.activeTabPath !== prevState.activeTabPath ||
    state.openTabs.length !== prevState.openTabs.length ||
    state.openTabs.some((tab, i) => tab.path !== prevState.openTabs[i]?.path)
  ) {
    debouncedCapture();
  }
});
```

## Files to Create

### 1. `apps/agent/src/stores/ui/navigation-store.ts` (NEW)

Zustand + Immer store with:

- `history: NavigationSnapshot[]` (max 100 entries)
- `currentIndex: number`
- `pushSnapshot(snapshot)` — truncates forward history, appends, caps at 100
- `goBack()` — decrements index, calls `applySnapshot(history[index - 1])`
- `goForward()` — increments index, calls `applySnapshot(history[index + 1])`
- Selector hooks: `useCanGoBack()`, `useCanGoForward()`
- Module-level `isNavigating` flag (NOT in store state — avoids triggering subscriptions)

```typescript
// Module-level flag — invisible to Zustand subscribers
let _isNavigating = false;
export const getIsNavigating = (): boolean => _isNavigating;
export const setIsNavigating = (value: boolean): void => {
  _isNavigating = value;
};

// Selector hooks (return primitives — Zustand's Object.is equality prevents re-renders)
export const useCanGoBack = (): boolean => useNavigationStore((s) => s.currentIndex > 0);
export const useCanGoForward = (): boolean =>
  useNavigationStore((s) => s.currentIndex < s.history.length - 1);
```

### 2. `apps/agent/src/lib/navigation/apply-snapshot.ts` (NEW)

Standalone function that restores a snapshot:

- Sets UIStore fields via `useUIStore.setState(draft => { ... })` (Immer wraps external `setState`)
- Sets FileViewerStore fields: restores `activeTabPath` and open tabs
- For file tabs that were closed: triggers content fetch via `file:read` Tauri command (async, best-effort)
- Resets FileViewerStore's internal `history` and `historyIndex` to prevent desync with global navigation
- For conversation changes: dispatches `navigate:loadConversation` custom DOM event
- Uses **try/finally** for `isNavigating` lifecycle — ensures the flag is always cleared even if restoration throws

```typescript
import { readFile } from '@/lib/api/files';

function applySnapshot(snapshot: NavigationSnapshot): void {
  setIsNavigating(true);
  try {
    // 1. Restore UIStore fields (direct setState bypasses side effects)
    useUIStore.setState((draft) => {
      draft.activeTab = snapshot.activeTab;
      draft.leftSidebarOpen = snapshot.leftSidebarOpen;
      draft.reviewPanelOpen = snapshot.reviewPanelOpen;
      draft.rightSidebarOpen = snapshot.rightSidebarOpen;
      draft.bottomPanelOpen = snapshot.bottomPanelOpen;
      draft.bottomPanelTab = snapshot.bottomPanelTab;
      draft.activityTab = snapshot.activityTab;
      draft.settingsDialogOpen = snapshot.settingsDialogOpen;
      draft.settingsDialogSection = snapshot.settingsDialogSection;
      draft.vaultOpen = snapshot.vaultOpen;
      draft.chatAreaDetached = snapshot.chatAreaDetached;
      // Conversation change handled via custom event below
    });

    // 2. Restore FileViewerStore tab state
    const fileState = useFileViewerStore.getState();
    const currentPaths = new Set(fileState.openTabs.map((t) => t.path));
    const snapshotPaths = new Set(snapshot.openFilePaths);

    // Close tabs not in snapshot
    for (const path of currentPaths) {
      if (!snapshotPaths.has(path)) {
        fileState.closeTab(path);
      }
    }

    // Open tabs that should exist (fetch content from disk if needed)
    for (const path of snapshot.openFilePaths) {
      if (!currentPaths.has(path)) {
        // Open with empty content, then fetch from disk async
        fileState.openFile(path);
        void readFile(path).then((content) => {
          useFileViewerStore.getState().setFileContent(path, content);
        });
      }
    }

    // Set active tab
    if (snapshot.activeTabPath !== null) {
      fileState.setActiveTab(snapshot.activeTabPath);
    }

    // Reset FileViewerStore's internal history to prevent desync
    useFileViewerStore.setState((draft) => {
      draft.history = snapshot.openFilePaths.filter(Boolean);
      draft.historyIndex = snapshot.activeTabPath
        ? draft.history.indexOf(snapshot.activeTabPath)
        : -1;
    });

    // 3. Handle conversation change
    if (snapshot.activeConversationId !== useUIStore.getState().activeConversationId) {
      window.dispatchEvent(
        new CustomEvent('navigate:loadConversation', {
          detail: { conversationId: snapshot.activeConversationId },
        })
      );
    }
  } finally {
    // ALWAYS schedule clear — even if apply throws
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        queueMicrotask(() => {
          setIsNavigating(false);
        });
      });
    });
  }
}
```

### 3. `apps/agent/src/lib/navigation/navigation-tracker.ts` (NEW)

Module-level Zustand subscriptions (not React hooks):

- `initNavigationTracker()` — subscribes to UIStore + FileViewerStore with field-level change detection, pushes initial snapshot
- `destroyNavigationTracker()` — cleanup
- `captureSnapshot()` — reads both stores, returns `NavigationSnapshot`
- `snapshotsEqual(a, b)` — shallow compare with array handling for `openFilePaths`
- 300ms debounced push (skips when `isNavigating` is true or snapshot unchanged)
- Double-init guard for HMR safety

```typescript
// HMR-safe double-init guard
let subscriptions: (() => void)[] | null = null;

function initNavigationTracker(): void {
  // Guard: clean up any existing subscriptions (HMR fast-refresh safety)
  if (subscriptions !== null) {
    destroyNavigationTracker();
  }

  // Push initial snapshot
  const initial = captureSnapshot();
  useNavigationStore.getState().pushSnapshot(initial);

  // Subscribe with field-level change detection
  const unsubUI = useUIStore.subscribe((state, prevState) => {
    if (
      state.activeTab !== prevState.activeTab ||
      state.leftSidebarOpen !== prevState.leftSidebarOpen ||
      state.reviewPanelOpen !== prevState.reviewPanelOpen ||
      state.rightSidebarOpen !== prevState.rightSidebarOpen ||
      state.bottomPanelOpen !== prevState.bottomPanelOpen ||
      state.bottomPanelTab !== prevState.bottomPanelTab ||
      state.activityTab !== prevState.activityTab ||
      state.settingsDialogOpen !== prevState.settingsDialogOpen ||
      state.settingsDialogSection !== prevState.settingsDialogSection ||
      state.activeConversationId !== prevState.activeConversationId ||
      state.vaultOpen !== prevState.vaultOpen ||
      state.chatAreaDetached !== prevState.chatAreaDetached
    ) {
      debouncedCapture();
    }
  });

  const unsubFiles = useFileViewerStore.subscribe((state, prevState) => {
    if (
      state.activeTabPath !== prevState.activeTabPath ||
      state.openTabs.length !== prevState.openTabs.length ||
      state.openTabs.some((tab, i) => tab.path !== prevState.openTabs[i]?.path)
    ) {
      debouncedCapture();
    }
  });

  subscriptions = [unsubUI, unsubFiles];
}

function destroyNavigationTracker(): void {
  subscriptions?.forEach((unsub) => unsub());
  subscriptions = null;
}

function captureSnapshot(): NavigationSnapshot {
  const ui = useUIStore.getState();
  const files = useFileViewerStore.getState();
  return {
    activeTab: ui.activeTab,
    leftSidebarOpen: ui.leftSidebarOpen,
    reviewPanelOpen: ui.reviewPanelOpen,
    rightSidebarOpen: ui.rightSidebarOpen,
    bottomPanelOpen: ui.bottomPanelOpen,
    bottomPanelTab: ui.bottomPanelTab,
    activityTab: ui.activityTab,
    settingsDialogOpen: ui.settingsDialogOpen,
    settingsDialogSection: ui.settingsDialogSection,
    activeConversationId: ui.activeConversationId,
    vaultOpen: ui.vaultOpen,
    chatAreaDetached: ui.chatAreaDetached,
    activeTabPath: files.activeTabPath,
    openFilePaths: files.openTabs.map((t) => t.path),
  };
}

function snapshotsEqual(a: NavigationSnapshot, b: NavigationSnapshot): boolean {
  // Primitive comparisons first (fast bailout)
  if (a.activeTab !== b.activeTab) return false;
  if (a.leftSidebarOpen !== b.leftSidebarOpen) return false;
  if (a.reviewPanelOpen !== b.reviewPanelOpen) return false;
  if (a.rightSidebarOpen !== b.rightSidebarOpen) return false;
  if (a.bottomPanelOpen !== b.bottomPanelOpen) return false;
  if (a.bottomPanelTab !== b.bottomPanelTab) return false;
  if (a.activityTab !== b.activityTab) return false;
  if (a.settingsDialogOpen !== b.settingsDialogOpen) return false;
  if (a.settingsDialogSection !== b.settingsDialogSection) return false;
  if (a.activeConversationId !== b.activeConversationId) return false;
  if (a.vaultOpen !== b.vaultOpen) return false;
  if (a.chatAreaDetached !== b.chatAreaDetached) return false;
  if (a.activeTabPath !== b.activeTabPath) return false;
  // Array comparison (openFilePaths)
  if (a.openFilePaths.length !== b.openFilePaths.length) return false;
  for (let i = 0; i < a.openFilePaths.length; i++) {
    if (a.openFilePaths[i] !== b.openFilePaths[i]) return false;
  }
  return true;
}
```

### 4. `apps/agent/src/lib/navigation/index.ts` (NEW)

Barrel export.

## Files to Modify

### 5. `apps/agent/src/lib/utils/constants.ts`

Add to `KEYBOARD_SHORTCUTS`:

```typescript
navigateBack: {
  key: 'ArrowLeft',
  alt: true,
  description: 'Navigate back',
  event: 'navigateBack',
},
navigateForward: {
  key: 'ArrowRight',
  alt: true,
  description: 'Navigate forward',
  event: 'navigateForward',
},
```

> **Why Alt+Arrow instead of Cmd+[/]?** CodeMirror 6 binds `Cmd+[` to "outdent" and `Cmd+]` to "indent". Using those for global navigation would break code editing. `Alt+Left` / `Alt+Right` matches VS Code's "Go Back" / "Go Forward" binding — the strongest precedent for a code editor.

### 6. `apps/agent/src/components/layout/header-bar.tsx`

- Import `useCanGoBack`, `useCanGoForward` from navigation store
- Import `useNavigationStore` for `goBack` / `goForward` actions
- Add `onClick` handlers to existing arrow buttons
- Add `disabled` prop and conditional styling when at history boundary
- Wrap buttons in `<Tooltip>` with shortcut hints (`Alt+←`, `Alt+→`)

```typescript
const canGoBack = useCanGoBack();
const canGoForward = useCanGoForward();
const goBack = useNavigationStore((s) => s.goBack);
const goForward = useNavigationStore((s) => s.goForward);

// Back button:
<Tooltip>
  <TooltipTrigger asChild>
    <button
      type="button"
      data-tauri-drag-region={false}
      aria-label="Navigate back"
      disabled={!canGoBack}
      onClick={goBack}
      className={cn(
        'h-6 w-6 flex items-center justify-center rounded-md',
        'transition-all duration-150',
        canGoBack
          ? 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 active:scale-[0.95]'
          : 'text-muted-foreground/20 cursor-default'
      )}
    >
      {/* existing SVG */}
    </button>
  </TooltipTrigger>
  <TooltipContent className="flex items-center gap-2">
    <span>Navigate Back</span>
    <Kbd className="bg-white/15 border-white/20">⌥←</Kbd>
  </TooltipContent>
</Tooltip>
```

### 7. `apps/agent/src/components/layout/root-layout.tsx`

Add event listeners in the existing useEffect block:

- `navigateBack` → calls `useNavigationStore.getState().goBack()`
- `navigateForward` → calls `useNavigationStore.getState().goForward()`
- `navigate:loadConversation` → calls the conversation loading pipeline (postMessage `conversation:load`)

### 8. `apps/agent/src/App.tsx`

Initialize tracker in App component, **guarded by workspace state** (navigation is meaningless on the welcome page):

```typescript
useEffect(() => {
  if (!hasWorkspace) return;
  initNavigationTracker();
  return () => destroyNavigationTracker();
}, [hasWorkspace]);
```

### 9. `apps/agent/src/stores/ui/index.ts`

Add exports: `useNavigationStore`, `useCanGoBack`, `useCanGoForward`.

## Key Design Decisions

1. **Zustand `subscribe()` with field-level change detection**: Subscriptions fire synchronously on `set()`, giving us precise change detection without React render batching issues. Field comparisons in the callback ensure we only process changes to tracked fields — avoiding noise from untracked fields like `containerWidth`, `conversations[]`, `isLoadingConversation`, etc. A 300ms debounce coalesces multi-field updates from a single user action.

2. **Module-level `isNavigating` flag**: NOT stored in Zustand state. Changing it would trigger subscriptions, creating a feedback loop. A simple module variable with getter/setter is synchronous and invisible to subscribers. This follows the existing pattern of module-level counters in `file-viewer-store.ts` (`gotoIdCounter`, `searchIdCounter`).

3. **`applySnapshot` uses direct `setState`**: Bypasses store action methods (which may have side effects like `setActivityTab` auto-opening the review panel at `ui-store.ts:491-496`) for clean restoration. Immer middleware wraps the external `setState`, so `draft => { draft.field = value }` works correctly.

4. **try/finally for `isNavigating` lifecycle**: If `applySnapshot` throws (e.g., Immer draft error, conversation load failure), the rAF chain for clearing `isNavigating` is still scheduled in the `finally` block. This prevents the flag from getting stuck at `true`, which would permanently disable the tracker.

5. **File restoration fetches content from disk**: Closed files that need to be reopened use `openFile(path)` to create the tab, then `readFile(path)` via Tauri to fetch content asynchronously. This matches the UX of clicking a file in the explorer. Content appears after a brief loading flash — acceptable for navigation.

6. **FileViewerStore internal history reset on restore**: FileViewerStore has its own `history[]` and `historyIndex` for file-level navigation. Global navigation restoration resets these to match the snapshot's open files, preventing desync between the two history systems.

7. **HMR-safe double-init guard**: `initNavigationTracker()` checks for existing subscriptions and cleans them up before creating new ones. This prevents subscription accumulation during Vite HMR fast-refresh.

8. **Alt+Arrow shortcuts (VS Code convention)**: `Cmd+[` / `Cmd+]` conflict with CodeMirror's indent/outdent bindings. `Alt+Left` / `Alt+Right` matches VS Code's "Go Back" / "Go Forward" — the strongest precedent for a code editor. These don't conflict with any existing shortcuts in `KEYBOARD_SHORTCUTS`, xterm.js, or CodeMirror.

9. **Workspace transitions excluded**: Going back from workspace to welcome page would destroy all runtime state (open files, terminals, conversations). Too destructive for nav history. Tracker only initializes when `hasWorkspace` is true.

## Edge Cases

| Scenario                                 | Behavior                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| User clicks back with 1 entry            | `currentIndex === 0` → button disabled → no-op                                                     |
| Toggle sidebar on/off/on within 300ms    | Debounce captures only final state (1 entry)                                                       |
| Toggle sidebar on/off/on with gaps       | Each toggle is a separate entry (standard browser behavior)                                        |
| File opened by agent tool                | Tracked (same as user opening a file)                                                              |
| Settings opened via keyboard vs. button  | Both trigger `setSettingsDialogOpen` → same snapshot                                               |
| Multiple `set()` calls in same microtask | Each fires subscription; 300ms debounce coalesces                                                  |
| Conversation switch + message loading    | Debounce coalesces multi-store changes into one entry                                              |
| Rapid back/forward clicking              | `isNavigating` stays true; each apply is synchronous; rAF chains stack harmlessly                  |
| Navigate back to deleted conversation    | `navigate:loadConversation` handler checks if conversation exists; shows error or skips gracefully |
| Navigate back to closed file             | File tab reopened, content fetched async from disk                                                 |

## Verification

1. Run `bun run typecheck` — zero errors
2. Run `bun run lint` — zero warnings
3. Manual testing in `bunx tauri dev`:
   - Open workspace → switch tabs → back arrow returns to previous tab
   - Open file → back arrow closes it → forward arrow reopens it
   - Toggle sidebar → back arrow restores previous state
   - Open settings → back arrow closes them
   - Open file A → open file B → back → back → both closed → forward → forward → both open
   - Alt+Left and Alt+Right work as keyboard shortcuts
   - Cmd+[ and Cmd+] still work for indent/outdent in CodeMirror
   - Arrows show disabled state when at history boundary
   - Rapid clicking of back/forward doesn't cause stuck state or phantom snapshots
   - Navigation works across conversation switches
   - Vault open/close is tracked in history
   - Terminal tab (terminal vs. problems) is tracked in history
