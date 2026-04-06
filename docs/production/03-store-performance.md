# Mission 03: Store Performance

> Split god stores, fix batching, fix Immer bugs.

---

## Why This Matters

Zustand stores are the nervous system of the frontend. When a store has 10+ responsibilities and 1000+ lines, every subscriber re-evaluates on every update -- even if the update touches a completely unrelated slice of state. Two stores in Orbit (tool-store at 1254 lines, ui-store at 1111 lines) have grown into god objects. Worse, the tool-store has a documented Immer stale-get() bug where `persist(immer(...))` middleware causes `get()` inside `set()` callbacks to return stale state. Multiple consecutive `set()` calls per action compound the problem by forcing multiple React commit phases where one would suffice.

---

## Current State

### God Stores

**tool-store.ts (1254 lines, 10+ responsibilities):**

- Tool lifecycle management (start, output, complete)
- Tool state tracking per message
- Tool output buffering
- Tool expansion/collapse UI state
- Tool error handling
- Tool retry logic
- Checkpoint tracking
- File operation tracking
- Permission state
- Tool event batching

**ui-store.ts (1111 lines, 10+ responsibilities):**

- Panel visibility (sidebar, terminal, browser, editor)
- Panel sizing and layout
- Active panel tracking
- Theme management
- Modal/dialog state
- Toast notifications
- Keyboard shortcut state
- Onboarding state
- Window focus state
- Drag-and-drop state

### Stale get() Bug (tool-store.ts:1-24)

Documented at the top of the file:

```typescript
// WARNING: persist(immer(...)) middleware combination causes get()
// inside set() callbacks to return STALE state.
//
// WRONG:
//   set((state) => {
//     const current = get(); // STALE! Returns pre-set snapshot
//     state.foo = current.bar + 1; // Reads old bar
//   });
//
// RIGHT:
//   set((state) => {
//     state.foo = state.bar + 1; // Use the draft directly
//   });
```

This bug has caused real issues. The `persist` middleware wraps `set()`, meaning `get()` returns the last persisted state, not the current Immer draft.

### Multiple set() Calls Per Action (terminal-store.ts:188-217)

```typescript
// Current: 3 separate set() calls = 3 React commits
const createTerminal = (id: string): void => {
  set((state) => {
    state.terminals[id] = {
      /* ... */
    };
  });
  set((state) => {
    state.activeTerminalId = id;
  });
  set((state) => {
    state.terminalOrder.push(id);
  });
};
```

### Tool Lifecycle Set Scatter

Each tool lifecycle event (start, output, complete) calls `set()` separately:

```typescript
// Tool start: set() to add tool to active list
// Tool output: set() to append output
// Tool complete: set() to move to completed, set() to update stats
// = 4 set() calls for one tool execution = 4 React commits
```

---

## What To Replace

### Split tool-store into 3 Focused Stores

```typescript
// stores/tool/tool-lifecycle-store.ts (~300 lines)
// Owns: tool start, output, complete, error, retry
interface ToolLifecycleStore {
  readonly activeTools: ReadonlyMap<string, ToolState>;
  readonly completedTools: ReadonlyMap<string, ToolResult>;
  startTool: (id: string, type: string) => void;
  appendOutput: (id: string, output: string) => void;
  completeTool: (id: string, result: ToolResult) => void;
}

// stores/tool/tool-ui-store.ts (~200 lines)
// Owns: expansion, collapse, scroll position, selected tool
interface ToolUIStore {
  readonly expandedTools: ReadonlySet<string>;
  readonly selectedToolId: string | null;
  toggleExpanded: (id: string) => void;
  selectTool: (id: string) => void;
}

// stores/tool/tool-tracking-store.ts (~200 lines)
// Owns: checkpoints, file operations, permissions
interface ToolTrackingStore {
  readonly checkpoints: ReadonlyMap<string, Checkpoint>;
  readonly fileOps: ReadonlyMap<string, FileOperation>;
  addCheckpoint: (toolId: string, checkpoint: Checkpoint) => void;
}
```

### Split ui-store into 3 Focused Stores

```typescript
// stores/ui/layout-store.ts (~300 lines)
// Owns: panel visibility, sizing, active panel
interface LayoutStore {
  readonly panels: PanelState;
  readonly activePanel: PanelId;
  togglePanel: (id: PanelId) => void;
  resizePanel: (id: PanelId, size: number) => void;
}

// stores/ui/appearance-store.ts (~200 lines)
// Owns: theme, reduced motion, font size
interface AppearanceStore {
  readonly theme: 'light' | 'dark' | 'system';
  readonly reducedMotion: boolean;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

// stores/ui/overlay-store.ts (~200 lines)
// Owns: modals, toasts, dialogs, drag state
interface OverlayStore {
  readonly modals: ReadonlyMap<string, ModalState>;
  readonly toasts: readonly Toast[];
  showModal: (id: string, props: ModalProps) => void;
  addToast: (toast: Toast) => void;
}
```

### Remove persist from tool-store

```typescript
// Before: persist(immer(...)) -- causes stale get() bug
export const useToolStore = create<ToolStore>()(
  persist(
    immer((set, get) => ({
      /* ... */
    })),
    { name: 'tool-store' }
  )
);

// After: immer only -- tool state is ephemeral per session anyway
export const useToolLifecycleStore = create<ToolLifecycleStore>()(
  immer((set) => ({
    /* ... */
  }))
);
```

### Batch set() Calls

```typescript
// Before: 3 set() calls = 3 React commits
const createTerminal = (id: string): void => {
  set((state) => {
    state.terminals[id] = {
      /* ... */
    };
  });
  set((state) => {
    state.activeTerminalId = id;
  });
  set((state) => {
    state.terminalOrder.push(id);
  });
};

// After: 1 set() call = 1 React commit
const createTerminal = (id: string): void => {
  set((state) => {
    state.terminals[id] = {
      /* ... */
    };
    state.activeTerminalId = id;
    state.terminalOrder.push(id);
  });
};
```

---

## What We Get

| Metric                                         | Before                                | After                        |
| ---------------------------------------------- | ------------------------------------- | ---------------------------- |
| tool-store subscribers notified per tool event | All subscribers (10+ slices)          | Only lifecycle subscribers   |
| React commits per tool execution               | 4 (start + output + complete + stats) | 1-2 (batched)                |
| React commits per terminal create              | 3                                     | 1                            |
| Stale state bugs from persist+immer            | Active (documented workaround)        | Eliminated (persist removed) |
| Lines per store file                           | 1254 / 1111                           | ~200-300 each                |
| Cognitive load for contributors                | High (god object)                     | Low (single responsibility)  |

---

## Estimated Complexity

**Medium (2-3 days)**

- Day 1: Split tool-store into 3 stores, remove persist, update all imports
- Day 2: Split ui-store into 3 stores, batch set() calls across all stores
- Day 3: Update tests, verify no regressions, check selector usage

---

## Dependencies

- None blocking. Can start immediately.
- Mission #04 (Component Memoization) benefits from reduced re-render count.
- Mission #02 (Streaming Backpressure) reduces set() frequency, compounding the gains.

---

## Risks

| Risk                                                             | Mitigation                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-store coordination (tool UI needs lifecycle data)          | Use Zustand's subscribe() for cross-store sync, or co-locate in the same file with separate create() calls                                            |
| Migration breaks existing selectors                              | Search for all useToolStore / useUIStore usages; update import paths. Barrel re-exports ease transition.                                              |
| Removing persist loses tool state on refresh                     | Tool state is session-scoped anyway. Conversation reload reconstructs it. If persistence is truly needed, add it back to only the specific sub-store. |
| Batching set() changes behavior if middleware runs between calls | With Immer-only middleware, batching is safe. Each set() produces one Immer patch.                                                                    |
| Large diff touching many files                                   | Split into 3 PRs: tool-store split, ui-store split, batch fixes. Each independently shippable.                                                        |
