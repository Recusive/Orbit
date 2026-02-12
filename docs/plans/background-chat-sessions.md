# Background Chat Sessions — Centralized Store Architecture

## Context

The current chat system stores messages in React `useState` inside the `useChatMessages` hook. A 1629-line `createMessageHandler` closure captures React state setters (`setMessages`, `setIsAgentRunning`, `setSessionId`) and is recreated every time its dependencies change. This architecture is fundamentally single-session — only one agent can run at a time because there's only one set of React state to write to.

The user wants to start a chat, create a new session, and have both agents run concurrently in the background. Switching between them should be instant and lossless — no dropped messages, no lost streaming state, no lifecycle bugs.

**Root cause of all previous bugs**: Backend events route by `session_id`, but React state exists per-component-lifecycle. Session transitions (create, load, remap) break the coupling between event routing and state ownership.

**Solution**: Replace React useState with a Zustand store keyed by sessionId. Backend events write directly to the store. React reads reactively. No lifecycle coupling.

---

## Architecture Change

```
BEFORE:
  Backend Event → window listener → messageHandlers Set → useTauri callback
    → createMessageHandler closure (captures React setState)
      → setMessages() / setIsAgentRunning() / setSessionId()
        → React re-renders

AFTER:
  Backend Event → window listener → ChatMessageService (singleton)
    → Writes to ChatStore by session_id from event
      → React reads via Zustand selectors → re-renders
```

---

## Phase 1: Create ChatStore

**New file**: `apps/agent/src/stores/chat/chat-store.ts`

A Zustand store with `immer` middleware, keyed by sessionId:

```typescript
interface ChatSessionData {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  isStopPending: boolean;
}

interface ChatStoreState {
  sessions: Record<string, ChatSessionData>; // per-session data
  activeSessionId: string | null; // what UI displays
  lastCreatedSessionId: string | null; // set by conversation:created, hooks subscribe to react
  pendingMessage: PendingMessage | null; // queued for new session
  remappedOrbitIds: Record<string, true>; // stale ID filter (Record, not Set — immer can't structurally share Sets)
  rewindEpoch: number; // staleness counter
  conversationLoadEpoch: number; // staleness counter

  // Actions (all take sessionId — not coupled to "active")
  getOrCreateSession(id: string): ChatSessionData;
  setActiveSession(id: string): void;
  setMessages(id: string, msgs: ChatMessage[]): void;
  appendToLastMessage(id: string, messageId: string, content: string): void;
  appendThinking(id: string, messageId: string, thinking: string): void;
  addMessage(id: string, msg: ChatMessage): void;
  updateMessage(id: string, messageId: string, updater: (m: ChatMessage) => ChatMessage): void;
  reconcileMessageId(id: string, oldId: string, newId: string): void;
  setAgentRunning(id: string, running: boolean): void;
  setStopPending(id: string, pending: boolean): void;
  remapSession(oldId: string, newId: string): void;
  destroySession(id: string): void;
  bumpRewindEpoch(): number;
  bumpConversationLoadEpoch(): number;
}
```

**Design decisions**:

- `Record<string, ChatSessionData>` not `Map` — immer works with plain objects, Zustand selectors work naturally
- `remappedOrbitIds` uses `Record<string, true>` not `Set<string>` — immer's structural sharing doesn't work with Sets (every mutation creates a new Set reference, triggering unnecessary re-renders). Check membership with `id in remappedOrbitIds`. Matches CheckpointStore's `rewindForkPoints` pattern.
- `activeSessionId` persisted to localStorage via a manual `subscribe()` listener (NOT the `persist` middleware — serializing the entire sessions Record on every change would be catastrophic). Read initial value in store creation, write on change via subscriber.
- Epoch counters move from closure variables into store state (accessible to both service and components)
- Stable empty constant `EMPTY_MESSAGES: ChatMessage[] = []` prevents selector re-allocation
- Export selector helpers: `useActiveMessages()`, `useActiveSession()` for common access patterns. Use Zustand's `useShallow` or `===` equality on the messages array to prevent re-renders when unrelated sessions change: `useChatStore((s) => s.sessions[s.activeSessionId]?.messages ?? EMPTY_MESSAGES)`. Verify with React DevTools Profiler during implementation.
- **Zustand devtools**: Name the store `'chat-store'` in devtools middleware for Redux DevTools inspection during development.
- **Session eviction**: `MAX_IN_MEMORY_SESSIONS = 20`. When exceeded, evict least-recently-active session (clear messages array but keep key so `isAgentRunning` is still tracked). Eviction runs inside `getOrCreateSession` when creating new entries. **Eviction clears `loadedSessions[id]`** so that switching back to an evicted session triggers a fresh `conversation:load` from backend. The active session is pinned and never evicted.
- **Duplicate-load prevention**: `loadedSessions: Record<string, boolean>` tracks sessions that have been loaded from backend. Replaces `loadedSessionsRef` from the hook. Cleared when messages are reset to empty (allows reload after rewind). Also cleared on eviction (see above).

**localStorage persistence** (manual subscriber, not persist middleware):

```typescript
const STORAGE_KEY = 'orbit-sessionId';

// Read initial value synchronously
const initialActiveSessionId = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
})();

// After store creation, subscribe to activeSessionId changes only
useChatStore.subscribe((state, prevState) => {
  if (state.activeSessionId !== prevState.activeSessionId) {
    try {
      if (state.activeSessionId) {
        localStorage.setItem(STORAGE_KEY, state.activeSessionId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore storage errors */
    }
  }
});
```

**Barrel export**: `apps/agent/src/stores/chat/index.ts`

---

## Phase 2: Create ChatMessageService

**New file**: `apps/agent/src/services/chat/chat-message-service.ts`

A module-level singleton class that handles ALL chat backend events. This is the refactored `createMessageHandler` — same logic, but writes to ChatStore instead of React setState.

```typescript
class ChatMessageService {
  // Per-session RAF batchers (key = sessionId)
  private chunkBatchers = new Map<string, ReturnType<typeof rafBatch>>();
  private thinkingBatchers = new Map<string, ReturnType<typeof rafBatch>>();
  private toolBatchers = new Map<string, ReturnType<typeof rafBatch>>();

  // Per-message tracking (same as current closure vars)
  private pendingChunkLengths = new Map<string, number>();
  private thinkingStartTimes = new Map<string, number>();

  handleMessage(message: ExtensionMessage): void {
    /* routes by type */
  }
  flushSession(sessionId: string): void {
    /* flush batchers on agent:complete */
  }
  cancelSession(sessionId: string): void {
    /* cancel batchers on rewind */
  }
  destroySession(sessionId: string): void {
    /* cleanup on delete */
  }
  private cleanupBatchers(sessionId: string): void {
    /* delete batcher Map entries */
  }
}

export const chatMessageService = new ChatMessageService();

// HMR cleanup — cancel all batchers when module is replaced
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    chatMessageService.destroyAll();
  });
}
```

**Key architectural decisions**:

1. **RAF batchers are per-session** — Rewind on session A cancels only A's batchers, not B's active stream. `agent:complete` on B flushes only B's. No batcher recreation on React mount/unmount. **Cleanup**: Batcher Map entries are deleted on `agent:complete` (flush + delete from Map) and on `destroySession`, not just on destroy. This prevents memory leaks from accumulated batcher closures across many sessions. Batchers are recreated lazily if the session streams again.

2. **Store interactions via `getState()`** — The service reads/writes ChatStore, ToolStore, CheckpointStore, FileStore, UIStore via `.getState()` (same pattern as current message-handler.ts).

3. **Minimal React import** — The service imports only `startTransition` from `react` (needed for `conversation:loaded` merge). No useState, no useRef, no Dispatch. `startTransition` works outside React components — it marks any synchronous Zustand `set()` calls as non-urgent via `useSyncExternalStore` integration, so React can interrupt the resulting re-renders.

4. **conversation:loaded merge logic** — Moves verbatim (170 lines). **CRITICAL**: `cachedMessages` must be snapshot from `chatStore.getState().sessions[sessionId]?.messages` synchronously BEFORE the `setTimeout(0)` deferral — the store may change between event receipt and callback execution (e.g., another session's `agent:chunk` writes). This mirrors how the current code captures `messagesRef.current` before deferring. The `startTransition` wrapper is preserved for same performance reasons.

```typescript
// Snapshot BEFORE setTimeout(0) — store state may change during deferral
const store = useChatStore.getState();
const cachedMessages = store.sessions[message.session_id]?.messages ?? null;
// ... cache current session's messages

setTimeout(() => {
  // Use the SNAPSHOT cachedMessages captured above, not a live store read
  startTransition(() => {
    // merge logic using cachedMessages (already captured)
  });
}, 0);
```

5. **system:init remap** — `chatStore.remapSession(oldId, newId)` atomically moves session data under new key, adds oldId to `remappedOrbitIds`. **CRITICAL**: Only updates `activeSessionId` if the remapped session IS the active one. Background session remaps must NOT steal focus from the foreground session. External stores (ToolStore, CheckpointStore, FileStore) remapped as before.

```typescript
// In ChatStore.remapSession():
remapSession: (oldId, newId) => {
  set((state) => {
    if (state.sessions[oldId]) {
      state.sessions[newId] = state.sessions[oldId];
      delete state.sessions[oldId];
    }
    state.remappedOrbitIds[oldId] = true;
    // ONLY update activeSessionId if THIS session is active
    if (state.activeSessionId === oldId) {
      state.activeSessionId = newId;
    }
  });
},
```

6. **tool:start contentOffset calculation** — The service reads displayed message content from `useChatStore.getState().sessions[sid].messages` (not a React ref). Combined with `pendingChunkLengths` tracking (same as current code), this provides accurate tool widget placement. Fast path checks last message first.

```typescript
// In ChatMessageService.handleToolStart():
const store = useChatStore.getState();
const session = store.sessions[message.session_id];
const messages = session?.messages ?? [];
const lastMsg = messages.at(-1);
const currentMsg =
  lastMsg?.id === message.message_id ? lastMsg : messages.find((m) => m.id === message.message_id);
const displayedLength = currentMsg?.content.length ?? 0;
const pendingLength = this.pendingChunkLengths.get(message.message_id) ?? 0;
const maxKnownLength = displayedLength + pendingLength;
```

**What moves from message-handler.ts to ChatMessageService**:

| Handler                | Notes                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `agent:chunk`          | Batches via per-session RAF, writes to `chatStore.appendToLastMessage()`                                            |
| `agent:thinking`       | Batches via per-session RAF, writes to `chatStore.appendThinking()`                                                 |
| `agent:complete`       | Flushes batchers, sets `isAgentRunning=false`, clears `isStopPending` for this session, persists, refreshes sidebar |
| `agent:error`          | Flushes batchers, appends error message, clears `isStopPending` for this session                                    |
| `agent:checkpoint`     | Reconciles message IDs in ChatStore + CheckpointStore                                                               |
| `conversation:created` | Creates new session, sets `activeSessionId`                                                                         |
| `conversation:loaded`  | Merge logic, populates session, sets `activeSessionId`                                                              |
| `conversation:rewound` | Cancels batchers, bumps epoch, replaces messages                                                                    |
| `conversation:list`    | Updates UIStore conversations                                                                                       |
| `system:init`          | Remaps session, sets workspace                                                                                      |
| `tool:start/end`       | Delegates to ToolStore (unchanged)                                                                                  |
| `permission:request`   | Flushes chunks, adds to ToolStore                                                                                   |
| `inputMode:changed`    | Updates ToolStore                                                                                                   |
| `model:changed`        | Updates ToolStore                                                                                                   |

**Barrel export**: `apps/agent/src/services/chat/index.ts`

---

## Phase 3: Refactor Existing Files

### 3a. `use-tauri-message-listener.ts` — Route chat events to service

**Change**: Instead of dispatching ALL events to the `messageHandlers` Set, chat events go to `chatMessageService.handleMessage()`. Non-chat events (terminal, file, browser) still dispatch to the Set.

```typescript
// Add a type check for chat events
const CHAT_EVENT_TYPES = new Set([
  'system:init',
  'agent:chunk',
  'agent:thinking',
  'agent:complete',
  'agent:error',
  'agent:checkpoint',
  'conversation:created',
  'conversation:list',
  'conversation:loaded',
  'conversation:rewound',
  'conversation:deleted',
  'tool:start',
  'tool:end',
  'permission:request',
  'inputMode:changed',
  'model:changed',
]);

// In handleWindowMessage:
if (CHAT_EVENT_TYPES.has(result.data.type)) {
  chatMessageService.handleMessage(result.data);
} else {
  for (const handler of messageHandlers) {
    handler(result.data);
  }
}
```

The `agent:checkpoint` batching and `agent:complete` persistence logic that currently lives in this file moves into `ChatMessageService` (they're chat concerns, not listener concerns).

The buffering logic (`shouldBuffer`/`bufferMessage`) simplifies — the store always accepts writes, so buffering is only needed for the case where ChatMessageService hasn't initialized yet (app startup race). In practice, the service is a module-level singleton, so it's always available.

### 3b. `use-chat-messages.ts` — Thin reader (~150 lines)

**Massive simplification**. The hook becomes a thin wrapper that reads from ChatStore and exposes actions.

**Removed**:

- `useSessionState()` hook call — replaced by `chatStore.activeSessionId`
- `useMessageState(sessionId)` hook call — replaced by `chatStore.sessions[activeSessionId]`
- `messageHandler` useMemo + useEffect lifecycle — singleton service handles it
- Buffer hydration `useLayoutEffect` — store always accepts writes
- `loadedSessionsRef` tracking — replaced by `ChatStore.loadedSessions: Record<string, boolean>` to prevent duplicate `conversation:load` requests
- The 12-item dependency array that caused handler recreation

**Kept**:

- Usage restore on mount (reads backend, populates ToolStore)
- Cross-instance sync (`orbit:user-message` window event)
- Conversation list request on workspace change
- Pending message sending — triggered by `useChatStore.subscribe()` on `pendingMessage` changes, or simpler: `handleSend` calls `sendPendingMessage()` directly after `conversation:created` fires
- chatActions creation (now reads from store instead of React state)

**Return type unchanged** — ChatArea doesn't need any changes:

```typescript
interface UseChatMessagesReturn {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  sessionId: string;
  // ... all same handlers
}
```

### 3c. `chat-actions.ts` — Read from ChatStore at call time

**Change**: Dependencies shrink from 20+ React state values to ~5 stable values. Actions read current state from `useChatStore.getState()` at the moment each action is invoked, not from captured React state.

Remove from deps: `messages`, `isAgentRunning`, `setMessages`, `setIsAgentRunning`, `setSessionId`, `messagesRef`, `messagesCache`, `isStopPendingRef`, `conversations`
Keep: `postMessage`, `workspacePath`, `activeWorktreePath`

**Critical**: `handleSend` checks `isAgentRunning` (to decide queueing) and `messages.length` (to decide conversation creation). These must read from `chatStore.getState()` at call time, not from React selector values passed as deps (which could be one render stale):

```typescript
const handleSend = (text: string): void => {
  const store = useChatStore.getState();
  const sessionId = store.activeSessionId;
  const session = sessionId ? store.sessions[sessionId] : undefined;
  if (session?.isAgentRunning) {
    /* queue */
  } // always fresh
  if (!session || session.messages.length === 0) {
    /* create */
  } // always fresh
};
```

### 3d. DELETE `message-state.ts`

Entirely replaced by `ChatStore.sessions`. The `messagesCache` Map ref, session-switch detection useEffect, and `messagesRef` are all unnecessary.

### 3e. DELETE `session-state.ts`

Replaced by `ChatStore.activeSessionId`. The localStorage persistence of sessionId moves to ChatStore's initialization (read on create) and a store subscriber (write on change).

### 3f. SIMPLIFY `message-buffer-store.ts`

With a centralized store that always accepts writes, `shouldBuffer`/`bufferMessage`/`startConsuming`/`stopConsuming` are no longer needed. The `pendingLoads` tracking (preventing duplicate `conversation:load`) moves into ChatStore or stays as a minimal utility.

---

## Phase 4: Integration & Verification

### 4a. Sidebar flow (no changes needed)

`use-sidebar-actions.ts` still calls `postMessage({ type: 'conversation:load' })`. The `conversation:loaded` handler in ChatMessageService writes to ChatStore and sets `activeSessionId`. React selectors pick up the change. No sidebar code changes.

### 4b. ChatArea (no changes needed)

Still calls `useChatMessages()` which returns the same interface. The hook just reads from ChatStore selectors now.

### 4c. Demo mode compatibility

`demo-conversation.ts` posts events via `window.postMessage()` which flow through the global listener in `use-tauri-message-listener.ts`. After the route split, these demo events will be routed to `chatMessageService.handleMessage()` via the `CHAT_EVENT_TYPES` set — verify that `conversation:created`, `conversation:loaded`, `agent:chunk`, `tool:start`, `tool:end`, and `agent:complete` are all in the set (they are). No changes to `demo-conversation.ts` itself — it posts the same messages and the service processes them identically to real backend messages.

---

## Files Summary

| File                                              | Action       | Lines (est.)                                              |
| ------------------------------------------------- | ------------ | --------------------------------------------------------- |
| `stores/chat/chat-store.ts`                       | **CREATE**   | ~200                                                      |
| `stores/chat/index.ts`                            | **CREATE**   | ~5                                                        |
| `services/chat/chat-message-service.ts`           | **CREATE**   | ~400 (routing, lifecycle, batchers)                       |
| `services/chat/handlers/streaming-handlers.ts`    | **CREATE**   | ~300 (chunk, thinking, complete, error)                   |
| `services/chat/handlers/conversation-handlers.ts` | **CREATE**   | ~400 (created, loaded, rewound, list)                     |
| `services/chat/handlers/tool-handlers.ts`         | **CREATE**   | ~200 (tool:start/end, permission, inputMode)              |
| `services/chat/handlers/system-handlers.ts`       | **CREATE**   | ~100 (system:init remap)                                  |
| `services/chat/merge-messages.ts`                 | **CREATE**   | ~170 (pure merge function)                                |
| `services/chat/index.ts`                          | **CREATE**   | ~5                                                        |
| `hooks/chat/handlers/message-handler.ts`          | **DELETE**   | -1629                                                     |
| `hooks/chat/state/message-state.ts`               | **DELETE**   | -80                                                       |
| `hooks/chat/state/session-state.ts`               | **DELETE**   | -79                                                       |
| `hooks/chat/use-chat-messages.ts`                 | **REWRITE**  | ~150 (was 628)                                            |
| `hooks/chat/handlers/chat-actions.ts`             | **MODIFY**   | deps change                                               |
| `hooks/agent/use-tauri-message-listener.ts`       | **MODIFY**   | route split                                               |
| `stores/agent/message-buffer-store.ts`            | **SIMPLIFY** | remove buffer logic                                       |
| `hooks/agent/demo-conversation.ts`                | **MODIFY**   | write to store                                            |
| `services/index.ts`                               | **MODIFY**   | add `export * from './chat'`                              |
| `__tests__/integration/chat/rewind-e2e.test.ts`   | **MODIFY**   | update to use service/store instead of handler simulation |

**Net effect**: ~1800 lines deleted, ~1600 created. The new code is structurally cleaner (service class vs closure) and the store eliminates the lifecycle coupling that caused all previous bugs.

**Implementation note — service decomposition**: The service class targets ~1400 lines. To keep it maintainable, split handlers into domain-grouped private methods with clear section markers, or extract into delegate modules:

```
services/chat/
├── chat-message-service.ts        # Main service: routing, lifecycle, batcher management (~400 lines)
├── handlers/
│   ├── streaming-handlers.ts      # agent:chunk, agent:thinking, agent:complete, agent:error (~300 lines)
│   ├── conversation-handlers.ts   # conversation:created, loaded, rewound, list, deleted (~400 lines)
│   ├── tool-handlers.ts           # tool:start, tool:end, permission:request, inputMode/model (~200 lines)
│   └── system-handlers.ts         # system:init remap (~100 lines)
├── merge-messages.ts              # Pure function: mergeBackendAndCachedMessages (~170 lines)
└── index.ts                       # Barrel export
```

Start with a single file and extract when it exceeds readability. The routing `handleMessage()` switch stays in the main service; handlers are called as `this.handleChunk(msg)` or as imported pure functions. Also extract a `ChatStore` unit test file (`__tests__/stores/chat/chat-store.test.ts`) for `getOrCreateSession`, `remapSession`, `destroySession`, and eviction logic — these are pure store tests with no DOM or service dependencies.

---

## Risk Mitigation

1. **conversation:loaded merge** (170 lines) — Move verbatim with no behavior changes. Preserve epoch guards, setTimeout(0), startTransition. Note: `startTransition` must be imported from `react` in the service — it works outside React components via `useSyncExternalStore` integration.

2. **RAF batcher lifecycle** — Per-session batchers created lazily, deleted from Map on `agent:complete` (flush + cleanup) and on `destroySession`. This prevents accumulation of batcher closures. Test: two sessions streaming simultaneously, then complete one and verify its batcher Map entries are gone.

3. **Session remap atomicity** — `remapSession` must move data + conditionally update activeSessionId + add to `remappedOrbitIds` in a single immer `set()` call. `activeSessionId` is ONLY updated when the remapped session is the active one (background remaps must not steal focus). Multiple concurrent remaps (two sessions remap in quick succession) must not interfere — each operates on different keys in the sessions Record.

4. **Zustand selector stability** — Use `EMPTY_MESSAGES` constant for empty sessions. Immer's structural sharing ensures same-reference when data doesn't change. Export selector helpers (`useActiveMessages`, `useActiveSession`) that encapsulate the `?? EMPTY_MESSAGES` fallback.

5. **Memory management** — `MAX_IN_MEMORY_SESSIONS = 20` with LRU eviction. Eviction clears messages but keeps session key (preserves `isAgentRunning` state). Without this, long sessions accumulate unbounded message arrays.

6. **HMR cleanup** — `import.meta.hot?.dispose(() => chatMessageService.destroyAll())` cancels all batchers when module is hot-replaced. Without this, stale batcher closures from old module versions fire into dead code.

7. **Background session deletion** — `destroySession` must: (a) cancel batchers via `cleanupBatchers`, (b) remove session from store, (c) clean up per-message tracking Maps. If the session has `isAgentRunning=true`, the caller (sidebar delete handler) should send `agent:stop` first.

8. **Background session error** — `agent:error` handler writes the error message to `sessions[errorSessionId]`, not `sessions[activeSessionId]`. This is naturally correct because the handler reads `session_id` from the event, but must be verified in testing.

9. **Session switch during deferred merge** — The `conversation:loaded` merge's `setTimeout(0)` callback captures `sessionId` from the event, not from `activeSessionId`. Changes to `activeSessionId` between the event and the deferred callback don't affect the merge target. `cachedMessages` is also snapshot synchronously before the deferral (see Phase 2 decision #4).

10. **Existing tests** — `rewind-e2e.test.ts` simulates the `conversation:rewound` handler from `message-handler.ts`. After deletion, update the test to call `chatMessageService.handleMessage()` directly or simulate the equivalent store operations.

11. **Per-session `isStopPending` clearing** — `agent:complete` and `agent:error` must call `chatStore.setStopPending(message.session_id, false)` — clearing only the completing session's flag, NOT a global clear. In the multi-session world, a global clear would unblock rewind on session A when session B completes.

12. **Session deletion during active RAF batcher** — `destroySession` cancels batchers, but a queued RAF callback may have already been scheduled. The batcher processors read from `chatStore.getState().sessions[sessionId]` — after deletion this returns `undefined`. All batcher processors must handle `undefined` session data gracefully (bail early, no-op).

13. **Sidebar refresh deduplication** — Two sessions completing `agent:complete` in the same RAF frame both trigger `conversationList()` for sidebar refresh. Use a dirty flag + `requestIdleCallback` coalescing: `agent:complete` sets `sidebarDirty = true` and schedules `requestIdleCallback(() => { if (sidebarDirty) { sidebarDirty = false; conversationList(); } })`. Multiple completions within the same idle period coalesce into one disk read. Falls back to `setTimeout(100)` if `requestIdleCallback` is unavailable.

14. **LRU cache thrashing** — Users rapidly switching across 21+ sessions would repeatedly evict and recreate session data. `MAX_IN_MEMORY_SESSIONS = 20` is acceptable for v1 but monitor for thrashing patterns. Active session is pinned and never evicted (see Phase 1 eviction design).

15. **HMR mid-stream** — When the service module is hot-replaced during an active stream, the new service instance starts with empty `pendingChunkLengths` and `thinkingStartTimes` Maps. Tool placement for the remainder of that stream may be inaccurate. Acceptable for dev-only; document this limitation.

16. **`onSessionCreated` callback** — Do NOT use a mutable callback (`chatMessageService.onSessionCreated = cb`) — hook remounts would overwrite it. Instead, the service writes `lastCreatedSessionId` to ChatStore on `conversation:created`. The hook reacts via `useChatStore.subscribe((s) => s.lastCreatedSessionId)` and triggers any side effects (e.g., sending pending message). This keeps data flow unidirectional: service → store → hook subscription.

17. **Service error isolation** — `handleMessage()` wraps the entire dispatch in a try-catch with structured error logging per session: `logger.error('ChatMessageService: unhandled error', { sessionId: message.session_id, type: message.type, error })`. Without this, a throw during a background session's event processing would silently swallow the error (no React error boundary wraps the service). Errors should never propagate to the caller (use-tauri-message-listener) — they're logged and the service continues processing other events.

18. **startTransition outside React** — `startTransition` imported from `react` works in non-component code because Zustand v4+ uses `useSyncExternalStore` internally. The service code must include a comment confirming this Zustand version dependency so future devs don't break the assumption by downgrading. Example: `// IMPORTANT: startTransition works here because Zustand v4+ uses useSyncExternalStore internally.`

---

## Verification

1. **TypeScript**: `bun run typecheck` — must pass clean
2. **ESLint**: `bun run lint` — zero warnings
3. **Tests**: `bun run test` — all tests pass (update `rewind-e2e.test.ts` to work with service)
4. **Manual testing — core flow**:
   - Start a chat → send message → agent streams response
   - Create new session → send message → agent streams in new session
   - Switch back to first session → messages intact, agent still running if not complete
   - Create third session while two are running → all three maintain independent state
   - Sidebar click loads past conversation → messages display with tools
   - Rewind in active session → works correctly, doesn't affect background sessions
   - Close and reopen app → last session restored from localStorage
5. **Manual testing — edge cases**:
   - Delete a conversation while its agent is still running → agent stops, session removed
   - Background session errors → error message appears in correct session, not active session
   - Send message in session A → quickly switch to session B → send message → both remap correctly
   - Stop agent in active session → immediately try rewind → blocked (isStopPending)
   - Stop agent in background session → foreground session's isStopPending unaffected
   - Background session's system:init remap → foreground session stays active (no focus steal)
   - Demo mode (`?view=demo`) still plays correctly through the service
   - Cross-instance sync: send message in one view → other view shows it (orbit:user-message event)
   - Two sessions complete agent:complete simultaneously → sidebar refreshes once (debounced)
   - Tool widget placement accurate during background streaming (contentOffset correct)
