# Plan: Background Chat Sessions (Terminal-Inspired Architecture)

## Context

Chat sessions currently die when switching between them. The root cause is that the message handling pipeline is entirely owned by React — when `ChatArea`'s `useTauri` hook unmounts on session switch, the handler is deleted from the global `messageHandlers` Set (`use-tauri.ts:96-98`), so streaming events from the old session have no receiver. The stream continues running in agent-bridge but events are silently dropped.

The terminal system already solves this exact problem: PTY processes and xterm.js instances live in module-level singletons that survive React lifecycle. Switching terminals is just a CSS visibility toggle — the backend never knows you switched. We replicate this pattern for chat sessions.

**Goal**: Switch between chat sessions freely while streaming continues in the background. Return to any session and see all accumulated messages.

---

## Architecture: Three-Layer Model

```
Layer 1: Agent-Bridge (already multi-session capable — NO CHANGES)
  ↕ Tauri events with session_id
Layer 2: ChatSessionManager (NEW — module-level singleton)
  - Routes events by session_id to ChatSessionInstance
  - Each instance owns messages, RAF batchers, streaming state
  - Survives React mount/unmount
  ↕ Subscribe/unsubscribe
Layer 3: React Components (REFACTORED — view-only)
  - Subscribes to active ChatSessionInstance
  - Session switch = change subscription, NOT remount
```

---

## Phase 1: Create ChatSessionInstance

> Per-session message state owner, analogous to `TerminalInstance`

**New file: `apps/agent/src/services/chat/chat-session-instance.ts`**

This class owns everything that currently lives in `createMessageHandler` closures and React state:

| Currently in React/closure                                  | Moves to ChatSessionInstance field        |
| ----------------------------------------------------------- | ----------------------------------------- |
| `useState<ChatMessage[]>` (message-state.ts:17)             | `_messages: ChatMessage[]`                |
| `useState(false)` isAgentRunning (use-chat-messages.ts:129) | `_isAgentRunning: boolean`                |
| `useRef(false)` isStopPending (use-chat-messages.ts:139)    | `_isStopPending: boolean`                 |
| `batchedChunkHandler` RAF batcher (message-handler.ts)      | `batchedChunkHandler: RafBatchHandler`    |
| `batchedThinkingHandler` RAF batcher (message-handler.ts)   | `batchedThinkingHandler: RafBatchHandler` |
| `batchedToolHandler` RAF batcher (message-handler.ts)       | `batchedToolHandler: RafBatchHandler`     |
| `pendingChunkLengths` Map (message-handler.ts)              | `pendingChunkLengths: Map`                |
| `thinkingStartTimes` Map (use-chat-messages.ts:142)         | `thinkingStartTimes: Map`                 |
| `remappedOrbitIds` Set (message-handler.ts)                 | `remappedOrbitIds: Set`                   |
| `rewindEpoch` (message-handler.ts)                          | `rewindEpoch: number`                     |
| `conversationLoadEpoch` (message-handler.ts)                | `conversationLoadEpoch: number`           |
| `messagesCache` per-component Map (message-state.ts:20)     | Stays on manager (cross-session)          |

Key API:

```
subscribe(subscriber) → unsubscribe function
getMessages() → readonly ChatMessage[]
getIsAgentRunning() → boolean
handleMessage(message: ExtensionMessage) → void
setMessages(messages | updater) → void  (for external callers like chat-actions)
updatePostMessage(fn) → void  (on React remount)
flush() → void  (force-flush RAF batchers)
dispose() → void
```

**Subscriber pattern** (only one at a time — the active ChatArea):

- `onMessagesChanged(messages: ChatMessage[])` — called when `_messages` mutates
- `onStreamingStateChanged(isAgentRunning: boolean)` — called on state change

When no subscriber (background), messages still accumulate silently via RAF batchers.

**Message handling**: Extract the logic from `createMessageHandler` (message-handler.ts). The RAF batcher closures change from `setMessages((prev) => ...)` to `this._messages = mutated; this.notifySubscriber()`. The mutation logic itself is identical.

**Store actions** (ToolStore, UIStore, CheckpointStore): Accessed via manager's `globalCallbacks`, same pattern as `TerminalInstanceManager.globalCallbacks`.

---

## Phase 2: Create ChatSessionManager

> Module-level singleton, analogous to `TerminalInstanceManager`

**New file: `apps/agent/src/services/chat/chat-session-manager.ts`**

Follows exact terminal singleton pattern:

```
// Module-level state (persists across React lifecycle)
let globalPostMessage = null;
let globalCallbacks = {};
let instance = null;

export function getChatSessionManager() {
  instance ??= new ChatSessionManager();
  return instance;
}
```

Key API:

- `initialize(postMessage, callbacks)` — called once by React hook
- `updatePostMessage(fn)` — called on every React render cycle
- `updateCallbacks(callbacks)` — update store action refs
- `getOrCreate(sessionId)` → ChatSessionInstance
- `getInstance(sessionId)` → ChatSessionInstance | undefined
- `handleMessage(message)` — routes by `session_id` to correct instance
- `setActiveSession(sessionId)` — tracks which session React is viewing
- `destroyInstance(sessionId)` — explicit close only
- `remapSession(oldId, newId)` — for system:init session remap

**New file: `apps/agent/src/services/chat/index.ts`** — barrel export

**Modify: `apps/agent/src/services/index.ts`** — add chat re-export

---

## Phase 3: Create React Hook Wrapper

> Initializes singleton, never cleans up, analogous to `use-terminal-instance-manager.ts`

**New file: `apps/agent/src/hooks/chat/use-chat-session-manager.ts`**

Pattern (from `use-terminal-instance-manager.ts:28-46`):

```
let messageListenerRegistered = false;

function registerGlobalChatMessageListener() {
  if (messageListenerRegistered) return;
  messageListenerRegistered = true;
  // Route agent:/tool:/conversation:/system:/permission: messages
  // to ChatSessionManager.handleMessage()
  // NO CLEANUP — intentionally never removed
}
```

Hook responsibilities:

1. Call `registerGlobalChatMessageListener()` once (empty deps useEffect)
2. Initialize/update manager with latest `postMessage` and callbacks
3. Return manager reference
4. **NO cleanup** — manager persists across React lifecycle

---

## Phase 4: Refactor Message Routing

> Route chat events through ChatSessionManager instead of broadcast

**Modify: `apps/agent/src/hooks/agent/use-tauri-message-listener.ts`**

The current `initWindowMessageListener` (line 198-329) broadcasts events to all registered `messageHandlers`. We add a branch: if `ChatSessionManager` is initialized and the message is a chat-type event (`agent:*`, `tool:*`, `conversation:*`, `system:*`, `permission:*`), route to the manager instead of broadcasting.

The `messageHandlers` Set continues to work for non-chat events (terminal, browser, file). This preserves backward compatibility.

**Key change** (around line 315-318):

```
// BEFORE: broadcast to all handlers
for (const handler of messageHandlers) {
  handler(result.data);
}

// AFTER: route chat events to manager, broadcast the rest
const manager = getChatSessionManager();
if (manager.isInitialized() && isChatEvent(result.data.type)) {
  manager.handleMessage(result.data);
} else {
  for (const handler of messageHandlers) {
    handler(result.data);
  }
}
```

The `MessageBufferStore` buffering logic (lines 307-313) integrates with the manager: when `ChatSessionInstance` exists for a session, no buffering needed (the instance IS the buffer). When no instance exists (shouldn't happen after init), fall back to current buffering.

---

## Phase 5: Refactor useChatMessages

> Simplify from "owns everything" to "subscribes to instance"

**Modify: `apps/agent/src/hooks/chat/use-chat-messages.ts`**

Major changes:

1. **Remove** `useMemo(createMessageHandler)` (lines 235-278) — no longer needed
2. **Remove** `useEffect` cleanup for RAF batchers (lines 283-291) — instance manages lifecycle
3. **Remove** `useTauri({ onMessage })` (line 293) — events routed via manager now
4. **Add** `useChatSessionManager()` call
5. **Add** subscription `useEffect`:
   ```
   useEffect(() => {
     const instance = manager.getOrCreate(sessionId);
     manager.setActiveSession(sessionId);
     setMessages([...instance.getMessages()]);
     setIsAgentRunning(instance.getIsAgentRunning());
     const unsub = instance.subscribe({
       onMessagesChanged: (msgs) => setMessages([...msgs]),
       onStreamingStateChanged: (running) => setIsAgentRunning(running),
     });
     return unsub;
   }, [sessionId, manager]);
   ```
6. **Keep** `postMessage` from `useTauri({ debug: false })` (no onMessage handler needed)
7. **Keep** conversation list loading, usage restoration, pending message logic
8. **Simplify** buffer hydration (lines 306-335) — instance handles this naturally

**Modify: `apps/agent/src/hooks/chat/state/message-state.ts`**

- Remove `messagesCache` useRef — moves to ChatSessionManager
- Simplify to just `[messages, setMessages] = useState<ChatMessage[]>([])`

**Modify: `apps/agent/src/hooks/chat/handlers/chat-actions.ts`**

- `handleStop`, `handleSend` currently call `setMessages()` directly
- Change to route through `ChatSessionInstance.setMessages()` / `setIsAgentRunning()`
- The instance then notifies its subscriber

---

## Phase 6: Remove key={sessionId} Remount Pattern

> Session switch = change subscription, not remount

**Investigate**: Check if `key={sessionId}` exists on ChatArea or ChatContent. Based on exploration, the remount is triggered by `useMemo(createMessageHandler)` recreating on `sessionId` change (via `setSessionId`), not a React key. After refactoring, the handler is owned by the instance, so this recreation doesn't happen.

**Modify ChatArea/ChatContent if needed**: Replace any `key={sessionId}` with a controlled `scrollToBottom()` call in the subscription effect. The virtualizer can reset scroll position without remounting.

---

## Files Summary

### New Files (3)

| File                                                    | Purpose                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/agent/src/services/chat/chat-session-instance.ts` | Per-session state owner (messages, RAF batchers, streaming state) |
| `apps/agent/src/services/chat/chat-session-manager.ts`  | Module-level singleton (routes events, manages instances)         |
| `apps/agent/src/hooks/chat/use-chat-session-manager.ts` | React hook wrapper (init, update, no cleanup)                     |

### Modified Files (6)

| File                                                       | Change                                        |
| ---------------------------------------------------------- | --------------------------------------------- |
| `apps/agent/src/hooks/agent/use-tauri-message-listener.ts` | Route chat events to ChatSessionManager       |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`           | Subscribe to instance instead of owning state |
| `apps/agent/src/hooks/chat/state/message-state.ts`         | Remove messagesCache, simplify                |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`       | Route state changes through instance          |
| `apps/agent/src/services/chat/index.ts`                    | Barrel export (new)                           |
| `apps/agent/src/services/index.ts`                         | Add chat re-export                            |

### Existing Utilities Reused (no changes)

| File                                                    | What's Reused                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/agent/src/lib/utils/event-batcher.ts`             | `rafBatch`, `RafBatchHandler` — used inside ChatSessionInstance |
| `apps/agent/src/stores/agent/tool-store.ts`             | `switchSession()`, session LRU cache — already works            |
| `apps/agent/src/stores/agent/checkpoint-store.ts`       | Per-session queue design — already works                        |
| `apps/agent/src/hooks/chat/handlers/message-handler.ts` | Message handling logic extracted into ChatSessionInstance       |

### No Changes Needed

- Agent-bridge sidecar (already multi-session)
- Rust backend / SessionManager
- Protocol types (all include session_id)
- TauriProvider (global event listeners)
- ToolStore, CheckpointStore (already have per-session caching)

---

## Edge Cases

| Scenario                               | Handling                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Concurrent streaming** (2+ sessions) | Each has own ChatSessionInstance with own RAF batchers. Manager routes by session_id. No cross-contamination.                                                 |
| **Rewind**                             | Stays within ChatSessionInstance.handleMessage(). Bumps rewindEpoch, resets messages. Subscriber notified.                                                    |
| **system:init session remap**          | Manager.remapSession(oldId, newId) re-keys the instance in the Map. ToolStore/CheckpointStore remap unchanged.                                                |
| **HMR**                                | `import.meta.hot.dispose(() => resetChatSessionManager())` — same pattern as terminal.                                                                        |
| **React Strict Mode**                  | Subscribe in useEffect → unsubscribe → re-subscribe. Instance persists, state is consistent.                                                                  |
| **Auto-start agent** (Canvas review)   | Manager.getOrCreate() creates instance on first event. Accumulates messages. ChatArea subscribes when mounted. Replaces MessageBufferStore for this use case. |
| **Conversation loading from sidebar**  | conversation:loaded handler routes to instance. Instance sets messages directly, notifies subscriber.                                                         |

---

## Verification

1. **Basic flow**: Start a chat, send a message, verify streaming works as before
2. **Background streaming**: Send a message, switch to another conversation mid-stream, switch back — all messages should be present
3. **Concurrent sessions**: Start streaming in Session A, switch to Session B, send a message in B, switch back to A — both should have complete responses
4. **Rewind**: Verify rewind still works after the refactor (rewind within active session)
5. **Auto-start agent**: Canvas review agent should buffer messages and display when ChatArea mounts
6. **Session remap**: system:init should correctly remap session IDs
7. **HMR**: Vite hot reload should not lose chat state
8. **TypeScript**: `bun run typecheck` passes
9. **Lint**: `bun run lint` passes with zero warnings
10. **Tests**: `bun run test` passes (update existing tests as needed)
