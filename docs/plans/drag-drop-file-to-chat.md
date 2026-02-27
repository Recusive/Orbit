# Plan: Drag & Drop Files from Explorer to Chat Context

## Context

Users currently add files to chat context via the `@` mention popover (type `@`, fuzzy-search, select). This works well for known filenames, but when browsing the file explorer, it's more natural to drag a file directly into the chat area. This feature adds that capability — dragging a file/folder from the explorer sidebar drops it as a context chip, identical to an `@` mention.

**No new dependencies.** Native HTML5 Drag and Drop API is sufficient (simple drag source → single drop target, no reordering).

---

## Files to Modify (8 files)

| #   | File                                                         | Change                                                                           |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1   | `apps/agent/src/lib/events/chat-context-events.ts`           | **NEW** — Shared event constants, payload type, and runtime guard                |
| 2   | `apps/agent/src/stores/chat/pending-context-store.ts`        | **NEW** — Zustand micro-store for queued file chips (survives ChatInput unmount) |
| 3   | `apps/agent/src/components/chat/input/use-chat-input.ts`     | Drain pending store on mount + reactive sync                                     |
| 4   | `apps/agent/src/components/files/file-explorer.tsx`          | Add `draggable` + `onDragStart` to FileTreeRow                                   |
| 5   | `apps/agent/src/components/layout/chat-area/ChatContent.tsx` | Add drop target handlers + visual overlay + scoped window cleanup                |
| 6   | `apps/agent/src/globals.css`                                 | Add drop zone fade-in animation                                                  |
| 7   | `apps/agent/src/components/files/file-context-menu.tsx`      | Add "Add to Chat" right-click menu item                                          |
| 8   | `apps/agent/src/__tests__/`                                  | **NEW** — Automated regression tests (5 files)                                   |

---

## Step 1 — Shared Event Module (NEW: `lib/events/chat-context-events.ts`)

Create `apps/agent/src/lib/events/chat-context-events.ts` — **neutral location** outside `chat/input/` since it's consumed by both `files/` and `chat/`. Lives in `lib/events/` to respect module boundaries.

```ts
/** Custom event name for adding a file/folder context chip */
export const ADD_FILE_CHIP_EVENT = 'addFileChip';

/** MIME type for internal file explorer drag data */
export const ORBIT_FILE_MIME = 'application/x-orbit-file';

/** Payload shape for the addFileChip custom event */
export interface AddFileChipDetail {
  /** Absolute file path */
  path: string;
  /** Display name (filename or folder name) */
  name: string;
  /** Whether this is a directory (determines ContextItem.type) */
  isDirectory: boolean;
}

/** Runtime type guard — validates payload before state mutation */
export function isAddFileChipDetail(value: unknown): value is AddFileChipDetail {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.path === 'string' &&
    v.path.length > 0 &&
    typeof v.name === 'string' &&
    v.name.length > 0 &&
    typeof v.isDirectory === 'boolean'
  );
}

/** Dispatch an addFileChip event (used by drop handler and context menu) */
export function dispatchAddFileChip(detail: AddFileChipDetail): void {
  window.dispatchEvent(new CustomEvent(ADD_FILE_CHIP_EVENT, { detail }));
}
```

Add `lib/events/index.ts` barrel re-exporting `chat-context-events`. Import as `@/lib/events/chat-context-events` in consumers.

---

## Step 2 — Pending Context Store (NEW: `stores/chat/pending-context-store.ts`)

**Problem**: When vault is open, `ChatInput` is unmounted (ChatContent.tsx line 82 renders `<VaultPage />` instead). The `addFileChip` event listener in `useChatInput` is unregistered. Right-clicking "Add to Chat" in the explorer silently does nothing.

**Solution**: A Zustand micro-store that holds pending file chips. Always-mounted code (the store itself) catches events regardless of ChatInput mount state. `useChatInput` drains pending chips on mount and whenever the queue changes.

```ts
import { create } from 'zustand';

import type { AddFileChipDetail } from '@/lib/events/chat-context-events';
import { ADD_FILE_CHIP_EVENT, isAddFileChipDetail } from '@/lib/events/chat-context-events';

interface PendingContextState {
  /** Queued file chips waiting for ChatInput to mount and drain */
  pending: AddFileChipDetail[];
  /** Add a chip to the queue */
  enqueue: (detail: AddFileChipDetail) => void;
  /** Drain and return all pending chips (clears the queue) */
  drain: () => AddFileChipDetail[];
}

export const usePendingContextStore = create<PendingContextState>()((set, get) => ({
  pending: [],
  enqueue: (detail) => {
    set((state) => {
      // Deduplicate by path within the pending queue
      if (state.pending.some((p) => p.path === detail.path)) return state;
      return { pending: [...state.pending, detail] };
    });
  },
  drain: () => {
    const items = get().pending;
    if (items.length === 0) return items;
    set({ pending: [] });
    return items;
  },
}));

// ── Module-level event listener ──────────────────────────────────────────
// Always active regardless of component mount state.
// This is the SOLE consumer of the addFileChip event. It enqueues into the
// store, and useChatInput drains the store reactively.

function handleAddFileEvent(e: Event): void {
  const detail = (e as CustomEvent<unknown>).detail;
  if (!isAddFileChipDetail(detail)) return;
  usePendingContextStore.getState().enqueue(detail);
}

// Guard: only register in browser environments.
// Protects against SSR, Vitest with non-jsdom env, or any non-browser module evaluation.
if (typeof window !== 'undefined') {
  window.addEventListener(ADD_FILE_CHIP_EVENT, handleAddFileEvent);

  // HMR cleanup — remove previous listener before module re-evaluation adds a new one.
  // Without this, each hot reload adds a duplicate listener → events are enqueued N times.
  // Follows the same pattern as chat-message-service.ts.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.removeEventListener(ADD_FILE_CHIP_EVENT, handleAddFileEvent);
    });
  }
}
```

**Key design**: The module-level `window.addEventListener` runs once at import time and persists for the app's lifetime. No React lifecycle dependency. The store is the single event consumer — `useChatInput` reads from the store, not from the event directly. Three guards protect the bootstrap: `typeof window` (non-browser safety), `import.meta.hot.dispose` (HMR dedup), and `isAddFileChipDetail` (payload validation).

Export from `stores/chat/index.ts` barrel.

---

## Step 3 — Event Consumer in `use-chat-input.ts`

Replace the event listener approach with a store drain. Add after the `addSkillChip` listener (line 119):

```ts
import { usePendingContextStore } from '@/stores/chat/pending-context-store';

// Drain pending file chips from the store (survives ChatInput unmount).
// Runs on mount and whenever new items are enqueued while mounted.
const pendingChips = usePendingContextStore((s) => s.pending);
const drainPendingChips = usePendingContextStore((s) => s.drain);

useEffect(() => {
  if (pendingChips.length === 0) return;
  const items = drainPendingChips();
  if (items.length === 0) return;

  setAttachedContext((prev) => {
    let next = prev;
    for (const detail of items) {
      // Deduplicate by path
      if (
        next.some(
          (item) => (item.type === 'file' || item.type === 'folder') && item.path === detail.path
        )
      ) {
        continue;
      }
      next = [
        ...next,
        {
          id: crypto.randomUUID(),
          type: detail.isDirectory ? 'folder' : 'file',
          name: detail.name,
          path: detail.path,
        },
      ];
    }
    return next;
  });
  inputRef.current?.focus();
}, [pendingChips, drainPendingChips]);
```

**Also apply path-based deduplication to `handleMentionSelect`** (lines 307-321) for consistency — currently `@` mentions don't deduplicate, which could confuse users when the same file is added via both paths.

---

## Step 4 — Drag Source in `file-explorer.tsx`

Inside `FileTreeRow` (after `handleDelete`, ~line 503):

**Add callback:**

```ts
import { ORBIT_FILE_MIME } from '@/lib/events/chat-context-events';

const handleDragStart = useCallback(
  (e: React.DragEvent<HTMLDivElement>): void => {
    if (isRenaming) {
      e.preventDefault();
      return;
    }
    const payload = JSON.stringify({ path, name: node.name, isDirectory: node.isDirectory });
    e.dataTransfer.setData(ORBIT_FILE_MIME, payload);
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'copy';
  },
  [path, node.name, node.isDirectory, isRenaming]
);
```

**Add attributes to the `rowButton` div (line 511):**

```ts
draggable={!isRenaming}
onDragStart={handleDragStart}
```

Why `!isRenaming`: when renaming inline, `draggable=true` intercepts mousedown and prevents text selection in the rename input.

The memo comparator does NOT need updating — `isRenaming` is local state, not a prop.

Note: `text/plain` is set as a **drag source fallback** (for dropping into external text fields), NOT used for drop detection.

---

## Step 5 — Drop Target in `ChatContent.tsx`

**Drop eligibility is strictly `application/x-orbit-file` only.** The overlay and all drag handlers only activate for our structured MIME type. This prevents false positives from text selections, URL drags, and other `text/plain`-carrying drags.

External file drops (e.g. from Finder) are out of scope for this feature. They require `e.dataTransfer.files` handling and platform-specific path resolution — a separate future enhancement.

**Add state + handlers inside the component:**

```ts
import {
  ORBIT_FILE_MIME,
  isAddFileChipDetail,
  dispatchAddFileChip,
} from '@/lib/events/chat-context-events';

const dragCounterRef = useRef(0);
const [isDragOver, setIsDragOver] = useState(false);

// Tag: track whether THIS component initiated the drag overlay,
// so window-level cleanup only resets our state (not other drag surfaces)
const isDragActiveRef = useRef(false);

// Helper: strictly check for our internal MIME type only.
// text/plain is NOT checked — it would trigger overlay on text selections,
// URL drags, and any content-editable drag, causing false positives.
const hasOrbitFile = (e: React.DragEvent): boolean =>
  e.dataTransfer.types.includes(ORBIT_FILE_MIME);

// Gate: only accept drops when chat is visible and interactive
const canAcceptDrop = !vaultOpen && !isTransitioning;

// Centralized reset for all exit paths
const resetDragState = useCallback((): void => {
  dragCounterRef.current = 0;
  isDragActiveRef.current = false;
  setIsDragOver(false);
}, []);
```

**Four handlers on the root `<div>`:**

```ts
const handleDragEnter = useCallback(
  (e: React.DragEvent<HTMLDivElement>): void => {
    if (!canAcceptDrop || !hasOrbitFile(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      isDragActiveRef.current = true;
      setIsDragOver(true);
    }
  },
  [canAcceptDrop]
);

const handleDragOver = useCallback(
  (e: React.DragEvent<HTMLDivElement>): void => {
    if (!canAcceptDrop || !hasOrbitFile(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    // No state updates here — onDragOver fires frequently
  },
  [canAcceptDrop]
);

const handleDragLeave = useCallback(
  (e: React.DragEvent<HTMLDivElement>): void => {
    if (!canAcceptDrop || !hasOrbitFile(e)) return;
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) resetDragState();
  },
  [canAcceptDrop, resetDragState]
);

const handleDrop = useCallback(
  (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    resetDragState();
    if (!canAcceptDrop) return;

    const raw = e.dataTransfer.getData(ORBIT_FILE_MIME);
    if (!raw) return;

    try {
      const data: unknown = JSON.parse(raw);
      if (!isAddFileChipDetail(data)) return;
      dispatchAddFileChip(data);
    } catch {
      // Malformed payload — silently ignore
    }
  },
  [canAcceptDrop, resetDragState]
);
```

**Scoped window-level drag cleanup** (only resets if THIS component's drag is active — prevents unrelated drags from affecting overlay state):

```ts
useEffect(() => {
  const onWindowDrop = (): void => {
    if (isDragActiveRef.current) resetDragState();
  };
  const onWindowDragEnd = (): void => {
    if (isDragActiveRef.current) resetDragState();
  };
  window.addEventListener('drop', onWindowDrop);
  window.addEventListener('dragend', onWindowDragEnd);
  return () => {
    window.removeEventListener('drop', onWindowDrop);
    window.removeEventListener('dragend', onWindowDragEnd);
  };
}, [resetDragState]);
```

**Add `relative` to root div className** (needed for absolute overlay positioning).

**Visual overlay** (rendered inside root div when `isDragOver && canAcceptDrop`):

```tsx
{
  isDragOver && canAcceptDrop ? (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center
    bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg
    pointer-events-none drop-zone-overlay"
    >
      <span className="text-sm font-medium text-primary/70">Drop to add as context</span>
    </div>
  ) : null;
}
```

`pointer-events-none` ensures the overlay doesn't intercept the drop event. `z-30` sits above the floating input (`z-20`).

---

## Step 6 — CSS Animation in `globals.css`

Near the existing `.chat-input-frost` section:

```css
/* ── File Drop Zone Overlay ───────────────────────────── */
@keyframes drop-zone-fade-in {
  from {
    opacity: 0;
    border-color: transparent;
  }
  to {
    opacity: 1;
  }
}
.drop-zone-overlay {
  animation: drop-zone-fade-in 150ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@media (prefers-reduced-motion: reduce) {
  .drop-zone-overlay {
    animation: none;
    opacity: 1;
  }
}
```

Follows project rules: animations under 300ms, custom cubic-bezier, respect `prefers-reduced-motion`.

---

## Step 7 — "Add to Chat" Context Menu in `file-context-menu.tsx`

Add after "Reveal in Finder" (line 116), before the edit actions separator:

```tsx
import { dispatchAddFileChip } from '@/lib/events/chat-context-events';

<ContextMenuItem
  onSelect={(): void => {
    dispatchAddFileChip({ path, name: fileName, isDirectory });
  }}
>
  <MessageSquarePlus />
  Add to Chat
</ContextMenuItem>;
```

Import `MessageSquarePlus` from `lucide-react`. Uses the shared `dispatchAddFileChip` helper — unified code path, no string duplication.

Works even when vault is open because the event is caught by the module-level listener in `pending-context-store.ts`, queued, and drained when ChatInput remounts after vault closes.

---

## Step 8 — Automated Regression Tests

### 8a. `apps/agent/src/__tests__/lib/events/chat-context-events.test.ts`

```
- isAddFileChipDetail accepts valid payload { path: "/a/b.ts", name: "b.ts", isDirectory: false }
- isAddFileChipDetail rejects missing path (empty string)
- isAddFileChipDetail rejects wrong types (path: 123, isDirectory: "yes")
- isAddFileChipDetail rejects null / undefined / non-object
- dispatchAddFileChip fires a CustomEvent with correct detail
```

### 8b. `apps/agent/src/__tests__/stores/chat/pending-context-store.test.ts`

```
- enqueue adds item to pending array
- enqueue deduplicates by path
- drain returns all items and clears queue
- drain returns empty array when queue is empty
- module-level listener enqueues valid addFileChip events
- module-level listener ignores invalid addFileChip events
```

### 8c. `apps/agent/src/__tests__/components/chat/input/use-chat-input-file-chip.test.tsx`

```
- draining pending store adds chips to attachedContext
- chips are deduplicated by path against existing attachedContext
- input receives focus after chips are added
- multiple queued chips are all added in one drain cycle
```

### 8d. `apps/agent/src/__tests__/components/layout/chat-area/chat-content-drop.test.tsx`

```
- dragEnter with ORBIT_FILE_MIME shows overlay
- dragEnter with only text/plain does NOT show overlay
- dragLeave decrements counter and hides overlay at zero
- drop with valid orbit payload dispatches addFileChip event
- drop with malformed JSON silently ignores
- canAcceptDrop=false (vaultOpen) prevents overlay and drop
- canAcceptDrop=false (isTransitioning) prevents overlay and drop
- window dragend resets overlay only when isDragActiveRef is true
- unrelated window drop does not reset overlay
```

### 8e. `apps/agent/src/__tests__/components/files/file-context-menu-add-to-chat.test.tsx`

```
- "Add to Chat" menu item is rendered
- clicking "Add to Chat" dispatches addFileChip event with correct path, name, isDirectory
- dispatched event payload passes isAddFileChipDetail guard
```

---

## Edge Cases

| Edge Case                                          | Handling                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate files                                    | Deduplicated by absolute path in `setAttachedContext` and in pending store                                                                                                                                                                                                              |
| Rename mode active                                 | `draggable={!isRenaming}` prevents drag during rename                                                                                                                                                                                                                                   |
| Enter/leave flicker                                | `dragCounterRef` counter pattern                                                                                                                                                                                                                                                        |
| Plain text drags (text selections, URLs)           | `hasOrbitFile` strictly checks `application/x-orbit-file` only — `text/plain` is NOT checked for overlay/eligibility. Text drags do not trigger overlay.                                                                                                                                |
| Text beginning with `/` (e.g. "/commands" in chat) | Not an issue — `text/plain` is never used for drop detection. Only `application/x-orbit-file` with JSON payload triggers chip creation.                                                                                                                                                 |
| Malformed/invalid JSON                             | `try/catch` + `isAddFileChipDetail` runtime guard                                                                                                                                                                                                                                       |
| Wrong payload types (e.g. `path: 123`)             | `isAddFileChipDetail` validates string types + non-empty                                                                                                                                                                                                                                |
| Vault page open (drop)                             | `canAcceptDrop` gate prevents overlay and drop                                                                                                                                                                                                                                          |
| Vault page open (context menu)                     | Event is caught by module-level listener in `pending-context-store.ts`, queued, and drained when ChatInput remounts after vault closes                                                                                                                                                  |
| Transitioning state                                | `canAcceptDrop` includes `!isTransitioning`                                                                                                                                                                                                                                             |
| Drag ends outside window                           | Window-level `drop`/`dragend` listeners reset state (scoped by `isDragActiveRef`)                                                                                                                                                                                                       |
| Drag canceled (ESC during drag)                    | `dragend` fires → cleanup via window listener                                                                                                                                                                                                                                           |
| Workspace switch during drag                       | Path was absolute at drag start; stale path is harmless (SDK resolves at send time)                                                                                                                                                                                                     |
| Same file via @ and drag                           | Path-based dedup added to both `handleMentionSelect` and `addFileChip`                                                                                                                                                                                                                  |
| Vault toggles mid-drag                             | `canAcceptDrop` is read at handler call time. If vault opens mid-drag: `handleDragOver` stops calling `preventDefault()` → browser rejects drop. Overlay clears via window `dragend`.                                                                                                   |
| Vault toggles mid-drag then returns before dragend | `canAcceptDrop` re-evaluates to true. `dragCounterRef` is still > 0, so overlay re-appears naturally on next `dragEnter`. If the user drops, it works. No stale state.                                                                                                                  |
| File deleted/renamed between drag and send         | Chip stores path at drag-start. SDK receives stale path → file-not-found error in agent response. Same behavior as `@` mentions.                                                                                                                                                        |
| Stale path sent without pre-send validation        | No pre-send file existence check — matches `@` mention behavior. SDK is authoritative; invalid paths produce clear agent errors.                                                                                                                                                        |
| Unrelated drags triggering window cleanup          | `isDragActiveRef` scopes window-level cleanup to drags that actually entered this drop zone. Unrelated drags (e.g. terminal text selection, other panels) don't set the ref → window handlers no-op.                                                                                    |
| HMR duplicate global listeners                     | `import.meta.hot.dispose` removes the previous module-level listener before re-evaluation adds a new one. Follows existing codebase pattern (`chat-message-service.ts`).                                                                                                                |
| Future multi-surface chat UIs (event fan-out)      | `addFileChip` dispatches to a single module-level listener in `pending-context-store.ts`. Only one store instance exists. Multiple ChatInput instances drain the same queue — first drain wins. If multi-surface needs independent queues, scope store per session ID (future work).    |
| Cross-platform external drag metadata              | Out of scope — external file drops (Finder, Windows Explorer) require `e.dataTransfer.files` handling with platform-specific path resolution. This feature only handles internal explorer drags via `application/x-orbit-file`. External drag support is a separate future enhancement. |
| Non-browser module evaluation                      | `typeof window !== 'undefined'` guard wraps the module-level listener bootstrap. Prevents crashes if the store module is imported during SSR, Vitest with non-jsdom env, or any headless context.                                                                                       |

---

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — no ESLint warnings
3. `bun run test` — all new tests pass (5 test files)
4. `bun run dev` — manual testing:
   - Drag file from explorer → overlay appears → drop → chip appears in input
   - Drag folder → same behavior with folder type
   - Drag same file twice → no duplicate chip
   - Right-click file → "Add to Chat" → chip appears
   - Right-click file while vault open → close vault → chip appears
   - Start rename → drag should not activate
   - Drag selected text from terminal/editor → **no overlay** (text/plain rejected)
   - Drag URL from browser → **no overlay** (no orbit MIME)
   - Send message with dragged file chip → verify `@filename` in message + `context.files` in payload
   - Drag file while vault is open → no overlay, no state change
   - Drag file outside window and release → overlay resets
   - Add same file via `@` then drag → no duplicate
   - Drag text in terminal → no overlay flicker on chat panel
   - HMR: edit ChatContent.tsx, save → verify no duplicate overlay triggers
