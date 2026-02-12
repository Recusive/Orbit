# Plan: Background Chat Sessions (Terminal-Inspired Architecture)

## Context

Chat sessions currently die when switching between them. The root cause is that the message handling pipeline is entirely owned by React — when `ChatArea`'s `useTauri` hook unmounts on session switch, the handler is deleted from the global `messageHandlers` Set (`use-tauri.ts:96-98`), so streaming events from the old session have no receiver. The stream continues running in agent-bridge but events are silently dropped.

The terminal system already solves this exact problem: PTY processes and xterm.js instances live in module-level singletons that survive React lifecycle. Switching terminals is just a CSS visibility toggle — the backend never knows you switched. We replicate this pattern for chat sessions.

**Goal**: Switch between chat sessions freely while streaming continues in the background. Return to any session and see all accumulated messages.

**Key difference from terminals**: Terminal output is write-only (ephemeral PTY bytes), but chat messages are read-write with complex merge semantics (conversation:loaded merges backend + cache, rewind truncates and forks, system:init remaps IDs across 6 stores). The instance owns message state, but React-specific side effects (setSessionId, setActiveConversation, startTransition) stay in the subscriber hook.

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
  - Owns React-specific side effects via subscriber callbacks
```

### Responsibility Split (Instance vs Subscriber)

| Responsibility                          | Owner                   | Why                                     |
| --------------------------------------- | ----------------------- | --------------------------------------- |
| Message array (`_messages`)             | Instance                | Must survive unmount                    |
| RAF batchers (chunk, thinking, tool)    | Instance                | Must accumulate in background           |
| Epoch counters (rewind, load)           | Instance                | Guards stale loads for this session     |
| Message merging (backend + cache)       | Instance                | Pure data logic, no React deps          |
| `setSessionId`, `setActiveConversation` | Subscriber (React hook) | React state setters, trigger re-renders |
| `startTransition` wrapping              | Subscriber (React hook) | React 18+ concurrent API                |
| `switchSession` (ToolStore)             | Subscriber (React hook) | Cross-store side effect                 |
| Tool restoration                        | Subscriber (React hook) | Feeds ToolStore via globalCallbacks     |

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

```typescript
// Subscription (atomic — delivers current state immediately via callbacks)
subscribe(subscriber: ChatSessionSubscriber): () => void
getMessages(): readonly ChatMessage[]
getIsAgentRunning(): boolean
getIsStopPending(): boolean

// Message handling (called by manager)
handleMessage(message: ExtensionMessage): void
handleCheckpoint(oldFrontendId: string, sdkCheckpointId: string): void

// External mutation (called by chatActions)
setMessages(messages: ChatMessage[]): void
updateMessages(fn: (prev: ChatMessage[]) => ChatMessage[]): void
setIsAgentRunning(running: boolean): void
setIsStopPending(pending: boolean): void

// Lifecycle
updatePostMessage(fn: PostMessageFn): void
flush(): void
dispose(): void
```

**`subscribe()` is atomic** — it sets the subscriber reference AND immediately delivers current state via `onMessagesChanged` and `onStreamingStateChanged`. Because JS is single-threaded and we don't yield to the event loop between setting the subscriber and delivering state, no RAF batcher can fire during the gap. This eliminates the race condition where background messages could be lost between hydration and subscription.

```typescript
subscribe(subscriber: ChatSessionSubscriber): () => void {
  this._subscriber = subscriber;

  // Deliver current state immediately — atomic with subscription
  subscriber.onMessagesChanged(this._messages);
  subscriber.onStreamingStateChanged(this._isAgentRunning);

  return () => {
    if (this._subscriber === subscriber) {
      this._subscriber = null;
    }
  };
}
```

**`handleCheckpoint()` — ID reconciliation in `_messages`**: When `agent:checkpoint` arrives, the instance finds the user message with `oldFrontendId` in `_messages`, replaces its ID with `sdkCheckpointId`, and calls `notifySubscriber()`. This keeps `_messages` in sync with JSONL so rewind can match by ID.

```typescript
handleCheckpoint(oldFrontendId: string, sdkCheckpointId: string): void {
  const idx = this._messages.findIndex((m) => m.id === oldFrontendId);
  if (idx === -1) return;
  this._messages = this._messages.map((m, i) =>
    i === idx ? { ...m, id: sdkCheckpointId } : m
  );
  this.notifySubscriber();
}
```

**`handleAgentComplete()` — persistence dedup**: The instance must integrate with `conversation-persistence.ts` to avoid duplicate backend writes. When the window listener persists via `persistBufferedAssistantMessage` (startup-race fallback), it calls `markMessagePersisted()`. When the instance persists, it must check `wasMessagePersisted()` first:

```typescript
// Inside ChatSessionInstance.handleAgentComplete():
private handleAgentComplete(message: AgentCompleteMessage): void {
  // Flush all pending RAF batchers BEFORE marking complete
  this.batchedChunkHandler.cancel(FLUSH_PENDING);
  this.batchedThinkingHandler.cancel(FLUSH_PENDING);
  this.batchedToolHandler.cancel(FLUSH_PENDING);
  this.pendingChunkLengths.delete(message.message_id);

  // ... (finalize messages, calculate thinking duration — same as current handler)

  // Persist to backend — dedup with conversation-persistence tracker
  if (!wasMessagePersisted(this.sessionId, completedMsg.id)) {
    void conversationAddMessage(
      this.sessionId,
      { id: completedMsg.id, role: 'assistant', content: completedMsg.content, /* ... */ },
      this._manager.globalCallbacks.getWorkspacePath() ?? undefined,
      this._manager.globalCallbacks.getActiveWorktreePath() ?? undefined
    );
  }

  // ... (track usage, clear isAgentRunning, refresh conversation list)
}
```

**`dispose()` implementation**: Must cancel all 3 RAF batchers and release resources to prevent memory leaks from orphaned animation frame requests:

```typescript
dispose(): void {
  this._disposed = true;
  this.batchedChunkHandler.cancel();
  this.batchedThinkingHandler.cancel();
  this.batchedToolHandler.cancel();
  this.pendingChunkLengths.clear();
  this._subscriber = null;
}
```

The `_disposed` flag is checked by deferred callbacks (e.g., `handleConversationLoaded`'s `setTimeout(0)`) to prevent invoking subscriber methods on a disposed instance.

**Subscriber interface** (last-writer-wins — subscribing replaces any existing subscriber):

```typescript
interface ChatSessionSubscriber {
  onMessagesChanged(messages: readonly ChatMessage[]): void;
  onStreamingStateChanged(isAgentRunning: boolean): void;
  // Delegate React-specific side effects back to the hook
  onConversationLoaded(data: {
    messages: ChatMessage[];
    sessionId: string;
    title: string;
    sessionUsage?: SessionUsage;
    rawMessages: BackendMessage[]; // For tool restoration
  }): void;
  onConversationCreated(data: { sessionId: string; title: string }): void;
  onSessionRemapped(data: { oldSessionId: string; newSessionId: string }): void;
}
```

When no subscriber (background), messages still accumulate silently via RAF batchers. The `onConversationLoaded`, `onConversationCreated`, and `onSessionRemapped` callbacks are no-ops when no subscriber is present — these events are only meaningful when React is actively viewing the session.

**Message handling**: Extract the logic from `createMessageHandler` (message-handler.ts). The RAF batcher closures change from `setMessages((prev) => ...)` to `this._messages = mutated; this.notifySubscriber()`. The mutation logic itself is identical.

**conversation:loaded — responsibility split**:
The instance handles epoch guards, message merging (backend-backbone + live trailing), cache lookup, and usage aggregation. It does NOT call setSessionId, setActiveConversation, or startTransition. Instead, it prepares the merged data and invokes `subscriber.onConversationLoaded(data)`. The subscriber (React hook) wraps the side effects in startTransition.

**Critical: `setTimeout(0)` deferral must be preserved**. The current implementation (message-handler.ts:992-996) uses `setTimeout(0)` to break out of the IPC message event handler. Without this yield, data processing + React rendering blocks the main thread in a single ~1,097ms task (V3 profiling). Epoch bumps happen synchronously before the setTimeout; epoch checks happen inside the callback:

```typescript
// Inside ChatSessionInstance.handleConversationLoaded():
private handleConversationLoaded(message: ConversationLoadedMessage): void {
  // Skip stale responses for remapped Orbit IDs (synchronous guard)
  if (this.remappedOrbitIds.has(message.session_id)) return;

  // Cache current session's messages BEFORE the deferred callback
  // (matches current behavior at message-handler.ts:966-972)
  const managerCache = this._manager.getMessagesCache();
  if (this._messages.length > 0) {
    managerCache.set(this.sessionId, this._messages);
  }

  // Bump load epoch SYNCHRONOUSLY (before setTimeout)
  this.conversationLoadEpoch++;
  const loadEpochAtCapture = this.conversationLoadEpoch;
  const epochAtLoad = this.rewindEpoch;

  // CRITICAL: Break out of IPC message event handler with setTimeout(0)
  // Without this yield, data processing + React rendering blocks
  // the main thread in a single ~1,097ms task (V3 profiling)
  setTimeout(() => {
    // Stale epoch guards
    if (epochAtLoad !== this.rewindEpoch) return;
    if (loadEpochAtCapture !== this.conversationLoadEpoch) return;
    // Disposed guard — prevents invoking subscriber on a disposed instance
    if (this._disposed) return;

    const mergedMessages = this.mergeBackendAndCachedMessages(message);
    this._messages = mergedMessages;

    this._subscriber?.onConversationLoaded({
      messages: mergedMessages,
      sessionId: message.session_id,
      title: message.title,
      sessionUsage: message.session_usage,
      rawMessages: message.messages,
    });
    // If no subscriber (background), messages are in _messages for later
  }, 0);
}
```

**updateMessages — functional updater for chatActions**:

```typescript
updateMessages(fn: (prev: ChatMessage[]) => ChatMessage[]): void {
  const next = fn(this._messages);
  if (next !== this._messages) {
    this._messages = next;
    this.notifySubscriber();
  }
}
```

**Store actions** (ToolStore, UIStore, CheckpointStore, FileStore, FileViewerStore): Accessed via manager's `globalCallbacks`, same pattern as `TerminalInstanceManager.globalCallbacks`. Full list of required store accesses documented in Phase 2.

---

## Phase 2: Create ChatSessionManager

> Module-level singleton, analogous to `TerminalInstanceManager`

**New file: `apps/agent/src/services/chat/chat-session-manager.ts`**

Follows exact terminal singleton pattern:

```typescript
// Module-level state (persists across React lifecycle)
let globalPostMessage: PostMessageFn | null = null;
let globalCallbacks: ChatManagerCallbacks = {};
let instance: ChatSessionManager | null = null;

export function getChatSessionManager(): ChatSessionManager {
  instance ??= new ChatSessionManager();
  return instance;
}

// HMR: preserve instance state (unlike terminal, chat messages are NOT ephemeral)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Do NOT reset — preserve in-progress streaming messages
    // Only reset the initialized flag so the hook re-registers callbacks
    if (instance) {
      instance.markUninitialized();
    }
  });
}
```

Key API:

- `initialize(postMessage, callbacks)` — called once by React hook
- `markUninitialized()` — HMR only, preserves instances
- `updatePostMessage(fn)` — called on every React render cycle
- `updateCallbacks(callbacks)` — update store action refs
- `getOrCreate(sessionId)` → ChatSessionInstance
- `getInstance(sessionId)` → ChatSessionInstance | undefined
- `handleMessage(message)` — routes by `session_id` to correct instance (lazy-creates for `conversation:loaded`). See checkpoint routing below.
- `setActiveSession(sessionId)` — tracks which session React is viewing, increments `activeSessionEpoch`
- `getActiveSessionEpoch()` — for stale load suppression
- `destroyInstance(sessionId)` — explicit close only
- `remapSession(oldId, newId)` — for system:init session remap
- `cleanupOrphanedInstances(activeSessionIds)` — memory management
- `getMessagesCache()` — cross-session messages cache (replaces messagesCache useRef)

**Required globalCallbacks** (all stores accessed by message-handler.ts):

```typescript
interface ChatManagerCallbacks {
  // UIStore
  setWorkspace: (path: string) => void;
  setActiveConversation: (sessionId: string | null, title: string | null) => void;
  setConversationTransitioning: (transitioning: boolean) => void;
  setConversations: (conversations: Conversation[]) => void;

  // ToolStore
  setInputMode: (mode: 'default' | 'plan' | 'accept') => void;
  setModel: (model: Model) => void;
  startTool: (...) => void;
  completeTool: (...) => void;
  addPermissionRequest: (...) => void;
  addUsage: (...) => void;
  switchSession: (sessionId: string) => void;
  restoreSessionUsage: (...) => void;
  restoreToolsForMessage: (...) => void;
  clearSessionTools: (sessionId: string) => void;

  // CheckpointStore (reconciliation only — batching stays in window listener)
  reconcileUserMessageId: (sessionId: string, checkpointId: string) => string | null;
  consumePendingConversationFork: (sessionId: string) => string | null;
  setRewindForkPoint: (sessionId: string, messageId: string) => void;

  // FileStore
  switchSessionFiles: (sessionId: string) => void;
  clearSessionFiles: (sessionId: string) => void;

  // FileViewerStore
  setFileContent: (path: string, content: string, language: string) => void;

  // MessageBufferStore (pending loads only — buffering subsumed by instances)
  markLoadPending: (sessionId: string) => void;
  clearLoadPending: (sessionId: string) => void;
  hasLoadPending: (sessionId: string) => boolean;

  // UIStore (conversation management)
  removeConversation: (sessionId: string) => void;

  // UIStore (workspace paths — needed by agent:complete for persistence)
  getWorkspacePath: () => string | null;
  getActiveWorktreePath: () => string | null;

  // Session remap
  remapCreatedSession: (oldId: string, newId: string) => void;
}
```

**Checkpoint routing in `handleMessage()`**: The manager coordinates between CheckpointStore reconciliation and instance-level `_messages` update. The window listener handles checkpoint batching separately (100ms debounce → `onCheckpointReceived`). The manager handles ID reconciliation synchronously:

```typescript
// In ChatSessionManager.handleMessage():
case 'agent:checkpoint': {
  const { session_id, checkpoint_id } = message;
  // Step 1: Reconcile in CheckpointStore — returns the old frontend UUID if found
  const oldFrontendId = globalCallbacks.reconcileUserMessageId(session_id, checkpoint_id);
  // Step 2: Update _messages in the instance (replace frontend UUID with SDK UUID)
  if (oldFrontendId) {
    const instance = this.getInstance(session_id);
    instance?.handleCheckpoint(oldFrontendId, checkpoint_id);
  }
  break;
}
```

Note: This runs synchronously. The window listener's `batchedCheckpoint` (100ms debounce → `onCheckpointReceived` for turn boundary tracking) is completely independent and runs regardless. There is no ordering dependency between the two paths.

**`conversation:deleted` routing**: Explicitly destroy the instance on deletion rather than waiting for `cleanupOrphanedInstances`:

```typescript
case 'conversation:deleted': {
  globalCallbacks.clearSessionTools(message.session_id);
  globalCallbacks.clearSessionFiles(message.session_id);
  this.destroyInstance(message.session_id);
  break;
}
```

**New file: `apps/agent/src/services/chat/index.ts`** — barrel export

**Modify: `apps/agent/src/services/index.ts`** — add chat re-export

---

## Phase 3: Create React Hook Wrapper

> Initializes singleton, never cleans up, analogous to `use-terminal-instance-manager.ts`

**New file: `apps/agent/src/hooks/chat/use-chat-session-manager.ts`**

Pattern (from `use-terminal-instance-manager.ts:28-46`):

```typescript
let messageListenerRegistered = false;

function registerGlobalChatMessageListener(): void {
  if (messageListenerRegistered) return;
  messageListenerRegistered = true;
  // Route agent:/tool:/conversation:/system:/permission:/inputMode:/model: messages
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

The current `initWindowMessageListener` (line 198-329) broadcasts events to all registered `messageHandlers`. We add a branch: if `ChatSessionManager` is initialized and the message is a chat-type event, route to the manager instead of broadcasting.

The `messageHandlers` Set continues to work for non-chat events (terminal, browser, file). This preserves backward compatibility.

### Event Routing Table

| Event prefix                                                                                                       | Routed to manager?                   | Notes                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent:chunk`, `agent:thinking`, `agent:complete`, `agent:error`                                                   | Yes                                  | Core streaming events                                                                                                                                                     |
| `agent:checkpoint`                                                                                                 | **Dual-routed**                      | Window listener handles checkpoint batching (feeds CheckpointStore.onCheckpointReceived). Manager handles ID reconciliation (reconcileUserMessageId → update \_messages). |
| `agent:plan_mode`, `agent:accept_mode`                                                                             | Yes                                  | Input mode changes                                                                                                                                                        |
| `tool:start`, `tool:end`                                                                                           | Yes                                  | Tool execution                                                                                                                                                            |
| `permission:request`                                                                                               | Yes                                  | Permission modals                                                                                                                                                         |
| `conversation:created`, `conversation:loaded`, `conversation:rewound`, `conversation:list`, `conversation:deleted` | Yes                                  | Session lifecycle                                                                                                                                                         |
| `conversation:loading`                                                                                             | **Remove**                           | Orphaned — no code path sends this event. Its caching logic is subsumed by conversation:loaded handler's fallback cache.                                                  |
| `system:init`                                                                                                      | Yes                                  | Session remap                                                                                                                                                             |
| `inputMode:changed`, `model:changed`                                                                               | Yes                                  | State sync                                                                                                                                                                |
| `file:content`                                                                                                     | **No** — broadcast                   | FileViewerStore update, not session-specific                                                                                                                              |
| `file:changed`, `file:written`, `file:tree:*`                                                                      | No — broadcast                       | File system events                                                                                                                                                        |
| `terminal:*`                                                                                                       | No — broadcast (or terminal manager) | Terminal events                                                                                                                                                           |
| `browser:*`                                                                                                        | No — broadcast                       | Browser panel events                                                                                                                                                      |
| `layout`, `error`                                                                                                  | No — broadcast                       | UI events                                                                                                                                                                 |
| `thinking:changed`                                                                                                 | No — broadcast                       | Global setting                                                                                                                                                            |
| `subagents:*`, `commands:*`, `panel:*`                                                                             | No — broadcast                       | Non-chat features                                                                                                                                                         |

### Key change (around line 315-318):

```typescript
// Handle checkpoint events FIRST (global side effect)
if (result.data.type === 'agent:checkpoint') {
  const { session_id, checkpoint_id } = result.data;
  batchedCheckpoint(session_id, checkpoint_id); // → CheckpointStore (100ms debounce)
}

// Handle agent:complete bookkeeping BEFORE routing (global side effect)
if (result.data.type === 'agent:complete') {
  const completeMessage = result.data;
  const { session_id, message_id } = completeMessage;
  useCheckpointStore.getState().onMessageComplete(session_id);

  // Persistence boundary: instance handles persistence when initialized.
  // Legacy fallback only runs when manager isn't ready (startup race).
  const mgr = getChatSessionManager();
  if (!mgr.isInitialized() || !mgr.getInstance(session_id)) {
    // Startup race: manager not ready, use legacy persistence fallback
    void persistBufferedAssistantMessage(session_id, completeMessage).then((persisted) => {
      if (persisted) {
        useMessageBufferStore.getState().clearMessage(session_id, message_id);
      }
    });
  } else if (session_id) {
    // Manager has the instance — instance.handleAgentComplete() handles persistence.
    // Just clear any stale MessageBufferStore entries.
    useMessageBufferStore.getState().clearBuffer(session_id);
  }
}

// Route to manager or broadcast
const manager = getChatSessionManager();
if (manager.isInitialized() && isChatEvent(result.data.type)) {
  manager.handleMessage(result.data);
} else {
  for (const handler of messageHandlers) {
    handler(result.data);
  }
}
```

### MessageBufferStore integration

The `shouldBuffer` / `bufferMessage` path in use-tauri-message-listener.ts is **superseded** for sessions that have a ChatSessionInstance (the instance IS the buffer). Buffering remains as a fallback for edge cases where the manager isn't initialized yet.

The `pendingLoads` Map stays on MessageBufferStore — it's orthogonal to message buffering (tracks conversation:load dedup across components). The ChatSessionManager reads/writes it via globalCallbacks.

### `persistBufferedAssistantMessage` fate and persistence boundary

The `persistBufferedAssistantMessage` function (use-tauri-message-listener.ts:35-175) currently persists buffered messages on `agent:complete` for sessions without consumers. With instances subsuming buffering, the instance handles persistence directly in `handleAgentComplete()` using workspace paths from `globalCallbacks.getWorkspacePath()`.

**Persistence decision tree** (implemented in the `agent:complete` handler above):

| Condition                                         | Who persists                                          | Why                                                                      |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Manager initialized AND instance exists           | Instance's `handleAgentComplete()`                    | Instance has the complete message state                                  |
| Manager NOT initialized OR instance doesn't exist | `persistBufferedAssistantMessage()` (legacy fallback) | Startup race — agent:complete arrives before ChatSessionManager is ready |
| Both paths                                        | `wasMessagePersisted()` dedup prevents double-write   | `markMessagePersisted()` called after each successful persist            |

Keep `persistBufferedAssistantMessage` **only as a startup-race fallback** — when `agent:complete` arrives before the ChatSessionManager is initialized (rare but possible during app startup with auto-start agents). It already calls `markMessagePersisted()` (line 165), so the instance's `handleAgentComplete()` will correctly skip if the fallback already persisted.

### `file:content` handler note

The `file:content` handler at message-handler.ts:1511 lives in the file being deleted. This is **safe to drop** — `use-file-tree.ts:328` has a duplicate handler that survives the refactor and handles all `file:content` routing to FileViewerStore. The event routing table correctly marks `file:content` as "No — broadcast".

---

## Phase 5: Refactor useChatMessages

> Simplify from "owns everything" to "subscribes to instance"

**Modify: `apps/agent/src/hooks/chat/use-chat-messages.ts`**

Major changes:

1. **Remove** `useMemo(createMessageHandler)` (lines 235-278) — no longer needed
2. **Remove** `useEffect` cleanup for RAF batchers (lines 283-291) — instance manages lifecycle
3. **Remove** `useTauri({ onMessage })` (line 293) — events routed via manager now
4. **Add** `useChatSessionManager()` call
5. **Add** subscription `useEffect` (atomic — no separate hydration step):

   ```typescript
   useEffect(() => {
     const instance = manager.getOrCreate(sessionId);
     manager.setActiveSession(sessionId);

     // subscribe() atomically delivers current state via callbacks
     // No separate hydration step needed — eliminates race window where
     // RAF batchers could fire between getMessages() and subscribe()
     const unsub = instance.subscribe({
       onMessagesChanged: (msgs) => setMessages(msgs as ChatMessage[]),
       onStreamingStateChanged: (running) => setIsAgentRunning(running),
       onConversationLoaded: ({ messages, sessionId: sid, title, sessionUsage, rawMessages }) => {
         startTransition(() => {
           manager.getMessagesCache().set(sid, messages);
           setMessages(messages);
           setSessionId(sid);
           setActiveConversation(sid, title);
           // NOTE: switchSession is called here AND reactively by session-state.ts:62-69
           // when setSessionId triggers the useEffect. The guard in session-state.ts
           // (if toolState.currentSessionId !== sessionId) prevents actual double work.
           // This is intentional — the subscriber call is immediate, the useEffect is
           // a safety net for code paths that set sessionId without calling switchSession.
           switchSession(sid);
           // Restore tools
           for (const m of rawMessages) {
             if (m.toolUses.length > 0) {
               restoreToolsForMessage(m.id, m.toolUses);
             }
           }
         });
       },
       onConversationCreated: ({ sessionId: sid, title }) => {
         setMessages([]);
         setSessionId(sid);
         setActiveConversation(sid, title);
         switchSession(sid);
       },
       onSessionRemapped: ({ oldSessionId, newSessionId }) => {
         setSessionId(newSessionId);
         setActiveConversation(newSessionId, null);
         switchSession(newSessionId);
       },
     });

     // Cross-instance sync (Agent <-> Editor views)
     // Both views mount their own useChatMessages with separate useState.
     // Without this, a user message sent from one view is invisible to the other.
     const syncHandler = (e: Event): void => {
       const detail = (e as CustomEvent<{ sessionId: string; message: ChatMessage }>).detail;
       if (detail.sessionId !== sessionId) return;
       instance.updateMessages((prev) => {
         if (prev.some((m) => m.id === detail.message.id)) return prev;
         return [...prev, detail.message];
       });
     };
     window.addEventListener('orbit:user-message', syncHandler);

     return () => {
       unsub();
       window.removeEventListener('orbit:user-message', syncHandler);
     };
   }, [sessionId, manager]);
   ```

6. **Keep** `postMessage` from `useTauri({ debug: false })` (no onMessage handler needed)
7. **Keep** conversation list loading, usage restoration, pending message logic
8. **Remove** buffer hydration useLayoutEffect (lines 306-335) — instance handles this naturally

**Modify: `apps/agent/src/hooks/chat/state/message-state.ts`**

- Remove `messagesCache` useRef — moves to ChatSessionManager
- Simplify to just `[messages, setMessages] = useState<ChatMessage[]>([])`

**Modify: `apps/agent/src/hooks/chat/handlers/chat-actions.ts`**

- `handleStop`, `handleSend`, `handlePermissionDeny` currently call `setMessages()` directly
- Change to route through `ChatSessionInstance.updateMessages()` / `setIsAgentRunning()`
- The instance then notifies its subscriber
- chatActions calls `manager.getOrCreate(sessionId)` (not `getInstance`) to handle edge case where send fires before instance exists
- `handleRewind` (line 370) currently reads `isStopPendingRef.current` as a gate — change to `instance.getIsStopPending()` instead

**CRITICAL: Read state from instance, not closured React state**. After the refactor, `createChatActions` still receives `isAgentRunning` and `messages` as closure values from `useMemo` deps. But these can be stale during rapid interactions (e.g., send-stop-send). All chat actions must read from the instance:

- `handleSend`: Replace `if (isAgentRunning)` → `if (instance.getIsAgentRunning())`
- `handleRewind`: Replace `messages.find(...)` → `instance.getMessages().find(...)`, replace `isStopPendingRef.current` → `instance.getIsStopPending()`
- `handleStop`: Replace `if (!isAgentRunning)` guard → `if (!instance.getIsAgentRunning())`
- `handlePermissionDeny`: Same pattern as handleStop

This also means `messages` and `isAgentRunning` can be **removed from `createChatActions`' `useMemo` deps**, reducing unnecessary recreations. `chatActions` no longer needs to close over these values at all — the instance is the source of truth.

**Pending message useEffect** (use-chat-messages.ts:428-542): Currently calls `setMessages((prev) => [...prev, userMessage])` and `setIsAgentRunning(true)` directly. After the refactor, BOTH must route through the instance to prevent state divergence:

```typescript
// In pending message useEffect (refactored):
const instance = manager.getOrCreate(sessionId);
instance.updateMessages((prev) => [...prev, userMessage]);
instance.setIsAgentRunning(true);
// Then broadcast orbit:user-message and postMessage as before
```

Example — handleStop refactored:

```typescript
const handleStop = (): void => {
  const instance = getChatSessionManager().getOrCreate(sessionId);
  if (!sessionId || !instance.getIsAgentRunning()) return;

  postMessage({ type: 'agent:stop', uuid: crypto.randomUUID(), session_id: sessionId });
  instance.setIsAgentRunning(false);
  instance.setIsStopPending(true);
  clearPermissions();

  instance.updateMessages((prev) => {
    const lastMsg = prev[prev.length - 1];
    if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
      return [...prev.slice(0, -1), { ...lastMsg, isStreaming: false, isInterrupted: true }];
    }
    if (!lastMsg || lastMsg.role === 'user') {
      const parentUuid = lastMsg?.id ?? null;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          displayedContent: '',
          isStreaming: false,
          isInterrupted: true,
          parentUuid,
        },
      ];
    }
    return prev;
  });
};
```

Example — handleSend guard refactored:

```typescript
const handleSend = (text: string, ...): void => {
  if (!text) return;
  const instance = getChatSessionManager().getOrCreate(sessionId);

  // Read from instance, not closured React state
  if (instance.getIsAgentRunning()) {
    storeQueueMessage({ text, sessionId, ... });
    return;
  }
  // ... rest of send logic
};
```

Example — handleRewind refactored:

```typescript
const handleRewind = (messageId: string): void => {
  const instance = getChatSessionManager().getInstance(sessionId);
  if (!instance || !sessionId || instance.getIsAgentRunning() || instance.getIsStopPending()) {
    return;
  }
  // Read messages from instance, not closured React state
  const currentMessages = instance.getMessages();
  const clickedMessage = currentMessages.find((m) => m.id === messageId);
  if (!clickedMessage) return;
  // ... rest of rewind logic using currentMessages
};
```

---

## Phase 6: Confirm No key={sessionId} Remount

> Session switch = change subscription, not remount

**Confirmed via audit**: ChatArea and ChatContent do NOT use `key={sessionId}`. No remount pattern exists. The current remount behavior comes from `useMemo(createMessageHandler)` recreating on `sessionId` change via dependency array. After refactoring, the handler is owned by the instance, so this recreation doesn't happen.

No changes needed here — subscription swap in Phase 5's useEffect handles session transitions.

---

## Phase 7: Cleanup and Memory Management

> Prevent unbounded instance growth over long sessions

**Add to ChatSessionManager:**

```typescript
cleanupOrphanedInstances(activeSessionIds: Set<string>): void {
  for (const [sessionId, instance] of this.instances) {
    if (!activeSessionIds.has(sessionId) && !instance.getIsAgentRunning()) {
      instance.dispose();
      this.instances.delete(sessionId);
    }
  }
}
```

**Call site**: After conversation list refreshes (triggered by `agent:complete` → `conversationList()` response). The React hook passes the current conversation list IDs to the manager.

**Remove dead code**:

- Delete `conversation:loading` case from message-handler.ts (orphaned — no sender exists in codebase)
- Remove `createMessageHandler` export after all logic is extracted to ChatSessionInstance
- Clean up `message-handler.ts` file (can be deleted entirely once extraction is complete)

---

## Files Summary

### New Files (3)

| File                                                    | Purpose                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/agent/src/services/chat/chat-session-instance.ts` | Per-session state owner (messages, RAF batchers, streaming state, epoch guards) |
| `apps/agent/src/services/chat/chat-session-manager.ts`  | Module-level singleton (routes events, manages instances, cross-session cache)  |
| `apps/agent/src/hooks/chat/use-chat-session-manager.ts` | React hook wrapper (init, update, no cleanup)                                   |

### Modified Files (6)

| File                                                       | Change                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/agent/src/hooks/agent/use-tauri-message-listener.ts` | Route chat events to ChatSessionManager; dual-route agent:checkpoint                       |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`           | Subscribe to instance instead of owning state; subscriber callbacks for React side effects |
| `apps/agent/src/hooks/chat/state/message-state.ts`         | Remove messagesCache, simplify                                                             |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`       | Route state changes through instance.updateMessages()                                      |
| `apps/agent/src/services/chat/index.ts`                    | Barrel export (new)                                                                        |
| `apps/agent/src/services/index.ts`                         | Add chat re-export                                                                         |

### Deleted Files (1)

| File                                                    | Reason                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/agent/src/hooks/chat/handlers/message-handler.ts` | Logic fully extracted into ChatSessionInstance. File can be removed after extraction. |

### Existing Utilities Reused (no changes)

| File                                                  | What's Reused                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/agent/src/lib/utils/event-batcher.ts`           | `rafBatch`, `RafBatchHandler` — used inside ChatSessionInstance                          |
| `apps/agent/src/stores/agent/tool-store.ts`           | `switchSession()`, session LRU cache — already works                                     |
| `apps/agent/src/stores/agent/checkpoint-store.ts`     | Per-session queue design — already works                                                 |
| `apps/agent/src/stores/agent/message-buffer-store.ts` | `pendingLoads` Map retained for conversation:load dedup; buffering subsumed by instances |

### No Changes Needed

- Agent-bridge sidecar (already multi-session)
- Rust backend / SessionManager
- Protocol types (all include session_id)
- TauriProvider (global event listeners)
- ToolStore, CheckpointStore (already have per-session caching)

---

## Edge Cases

| Scenario                                                        | Handling                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Concurrent streaming** (2+ sessions)                          | Each has own ChatSessionInstance with own RAF batchers. Manager routes by session_id. No cross-contamination.                                                                                                                                                                                                                        |
| **Rewind**                                                      | Stays within ChatSessionInstance.handleMessage(). Bumps rewindEpoch, resets messages. Subscriber notified via onMessagesChanged.                                                                                                                                                                                                     |
| **system:init session remap**                                   | Manager.remapSession(oldId, newId) re-keys the instance in the Map. Subscriber notified via onSessionRemapped for React state. ToolStore/CheckpointStore/FileStore/MessageBufferStore remap via globalCallbacks.                                                                                                                     |
| **HMR during streaming**                                        | `import.meta.hot.dispose` does NOT reset instances (chat messages aren't ephemeral like PTY output). Only marks manager as uninitialized so the hook re-registers callbacks on next render. In-progress \_messages survive.                                                                                                          |
| **React Strict Mode**                                           | Subscribe in useEffect → unsubscribe → re-subscribe. Instance persists, state is consistent. Subscription is last-writer-wins (not additive).                                                                                                                                                                                        |
| **Auto-start agent** (Canvas review)                            | Manager.getOrCreate() creates instance on first event routed by window listener. Accumulates messages. ChatArea subscribes when mounted — hydrates from instance.getMessages(). Replaces MessageBufferStore buffering for this use case.                                                                                             |
| **Conversation loading from sidebar**                           | conversation:loaded routes to instance. Instance merges messages, invokes subscriber.onConversationLoaded(). Subscriber applies in startTransition. If no subscriber (background load), messages cached in \_messages for later.                                                                                                     |
| **handleSend before instance exists**                           | chatActions calls `manager.getOrCreate(sessionId)` — lazy-creates if needed.                                                                                                                                                                                                                                                         |
| **Rapid session switches** (<100ms)                             | Manager tracks `activeSessionEpoch`, incremented on setActiveSession(). Subscriber notification checks epoch match before applying — stale loads for previous sessions are suppressed.                                                                                                                                               |
| **conversation:loaded for destroyed instance**                  | Manager.handleMessage() calls getOrCreate() for conversation:loaded events — lazy-creates an instance rather than dropping the data.                                                                                                                                                                                                 |
| **Two ChatArea mounts briefly overlap**                         | Subscription is last-writer-wins. New subscriber replaces old; old onMessagesChanged stops firing silently (not an error).                                                                                                                                                                                                           |
| **Instance memory growth**                                      | cleanupOrphanedInstances(activeSessionIds) destroys instances not in the active conversation list AND not currently streaming. Called after conversation list refreshes.                                                                                                                                                             |
| **Pending message creates user message while instance streams** | Pending message useEffect routes user message creation through `instance.updateMessages()` — both user message and streaming messages live in the same `_messages` array with no divergence.                                                                                                                                         |
| **HMR during deferred conversation:loaded**                     | If `conversation:loaded`'s `setTimeout(0)` callback fires after HMR, the subscriber reference could point to a dead component tree. The `_disposed` guard short-circuits the callback. Epoch guards protect against stale data. Subscriber references are re-set by the new render's subscribe call.                                 |
| **Two ChatArea instances on same session (Agent + Editor)**     | Last-writer-wins subscription. Second subscriber replaces first; first view's `onMessagesChanged` stops firing silently. `orbit:user-message` sync mitigates for user messages, but assistant streaming only renders in the latest subscriber's view. Acceptable trade-off — future multi-subscriber support can be added if needed. |
| **cleanupOrphanedInstances during deferred callback**           | Instance disposed, but `setTimeout(0)` callback fires after disposal. The `_disposed` guard in `handleConversationLoaded` (and any other deferred methods) prevents invoking subscriber methods on a disposed instance.                                                                                                              |
| **loadedSessionsRef interaction with instance-managed loading** | `loadedSessionsRef` (use-chat-messages.ts:377) prevents duplicate `conversation:load` requests. After refactor, keep this ref in the React hook — instance manages buffer state, but the hook still controls when to request loads from the backend. The instance doesn't call `conversationLoad` directly.                          |
| **Rapid conversation creation** (3 "New" clicks in <500ms)      | Each click triggers `conversation:create` → `conversation:created`. Manager creates 3 instances, subscriber switches to each sequentially. `activeSessionEpoch` ensures only the last applies. 2 orphaned instances persist until `cleanupOrphanedInstances` runs on next `agent:complete`. Acceptable trade-off.                    |
| **conversation:deleted while instance has deferred callback**   | `conversation:deleted` now explicitly calls `manager.destroyInstance()`. If a `setTimeout(0)` callback is pending, the `_disposed` guard prevents invoking subscriber methods. Same pattern as `cleanupOrphanedInstances`.                                                                                                           |
| **Duplicate persistence from startup race + instance**          | `agent:complete` arrives before manager is initialized — `persistBufferedAssistantMessage` runs and calls `markMessagePersisted()`. Manager initializes, instance replays buffered events. Instance's `handleAgentComplete()` checks `wasMessagePersisted()` and skips. No double-write.                                             |
| **chatActions reads stale closured state**                      | All chat actions (`handleSend`, `handleStop`, `handleRewind`, `handlePermissionDeny`) read from `instance.getIsAgentRunning()` / `instance.getMessages()` instead of closured React state. This eliminates stale-state bugs during rapid interactions.                                                                               |

---

## Verification

1. **Basic flow**: Start a chat, send a message, verify streaming works as before
2. **Background streaming**: Send a message, switch to another conversation mid-stream, switch back — all messages should be present
3. **Concurrent sessions**: Start streaming in Session A, switch to Session B, send a message in B, switch back to A — both should have complete responses
4. **Rewind**: Verify rewind still works after the refactor (rewind within active session)
5. **Auto-start agent**: Canvas review agent should buffer messages and display when ChatArea mounts
6. **Session remap**: system:init should correctly remap session IDs across all stores
7. **HMR**: Vite hot reload should not lose chat state (including mid-stream messages)
8. **Rapid switching**: Click 3 sessions in <500ms — only the last should apply
9. **Memory**: Open 20 conversations, verify cleanupOrphanedInstances trims idle instances
10. **TypeScript**: `bun run typecheck` passes
11. **Lint**: `bun run lint` passes with zero warnings
12. **Tests**: `bun run test` passes (update existing tests as needed)
13. **Concurrent streaming test**: Start streams in 2 sessions simultaneously, verify no cross-contamination
14. **Cross-instance sync**: If Agent and Editor views are both open, send a message from one — verify it appears in the other via `orbit:user-message` event
15. **Disposed instance guard**: Start a conversation load, quickly switch away and trigger cleanup — verify no errors from deferred callbacks on disposed instances

---

## Audit Trail

- **2026-02-11**: Initial plan created
- **2026-02-11**: Updated per architectural audit Round 1 (`reviews/audit-plan.md`). Key changes:
  - Added responsibility split table (instance vs subscriber) for conversation:loaded
  - Added `onConversationLoaded`, `onConversationCreated`, `onSessionRemapped` subscriber callbacks
  - Added `updateMessages(fn)` API for chatActions functional updater pattern
  - Added dual-routing for `agent:checkpoint` (batching stays in window listener, reconciliation goes to manager)
  - Added full event routing table documenting all routed vs non-routed event types
  - Added `cleanupOrphanedInstances()` for memory management (Phase 7)
  - Changed HMR strategy: preserve instances instead of resetting (chat isn't ephemeral like PTY)
  - Removed `conversation:loading` handler (orphaned — no sender exists)
  - Added `activeSessionEpoch` for rapid session switch protection
  - Documented all 15+ globalCallbacks (full store access audit)
  - Added 5 new edge cases from audit findings
  - Confirmed Phase 6 (no key={sessionId} exists — verified via codebase search)
- **2026-02-12**: Updated per architectural audit Round 2 (`reviews/audit-plan.md`). Key changes:
  - **Critical #1**: Made `subscribe()` atomic — delivers current state immediately via callbacks, eliminating race window between hydration and subscription where RAF batchers could fire
  - **Critical #2**: Preserved `setTimeout(0)` yield in `handleConversationLoaded` — epoch bumps synchronous before setTimeout, epoch checks + `_disposed` guard inside callback
  - **Critical #3**: Added cross-instance `orbit:user-message` sync listener in Phase 5 subscription useEffect — required for Agent/Editor dual-view support
  - **Critical #4**: Added `getWorkspacePath`/`getActiveWorktreePath` to `globalCallbacks` — needed by `agent:complete` for `conversationAddMessage` and `conversationList`
  - Added `handleCheckpoint()` API for ID reconciliation (frontend UUID → SDK UUID) directly in `_messages`
  - Added `getIsStopPending()` / `setIsStopPending()` API; documented `handleRewind` must use instance getter
  - Detailed `dispose()` implementation: cancels 3 RAF batchers, clears pendingChunkLengths, nulls subscriber, sets `_disposed` flag
  - Added `_disposed` guard for deferred callbacks on disposed instances
  - Documented `persistBufferedAssistantMessage` fate (startup-race fallback only)
  - Documented `file:content` handler redundancy (safe to drop — duplicate in use-file-tree.ts survives)
  - Routed pending message user message creation through `instance.updateMessages()` to prevent state divergence
  - Added 6 new edge cases (pending message divergence, HMR during deferred load, dual ChatArea, disposed cleanup, loadedSessionsRef interaction, cross-instance sync)
  - Added 2 verification tests (cross-instance sync, disposed instance guard)
- **2026-02-12**: Updated per architectural audit Round 3 (`reviews/audit-plan.md`). Key changes:
  - **Critical #1**: Added explicit `agent:checkpoint` routing in `ChatSessionManager.handleMessage()` — manager calls `reconcileUserMessageId` first, passes both IDs to `instance.handleCheckpoint()`
  - **Critical #2**: All chat actions (`handleSend`, `handleStop`, `handleRewind`, `handlePermissionDeny`) now read from instance (`getIsAgentRunning()`, `getMessages()`, `getIsStopPending()`) instead of closured React state. `messages` and `isAgentRunning` removed from `createChatActions` useMemo deps.
  - **Critical #3**: Added persistence decision tree for `agent:complete` dual-handler boundary — instance persists when initialized, `persistBufferedAssistantMessage` only as startup-race fallback. Explicit gating in window listener: `!mgr.isInitialized() || !mgr.getInstance(session_id)`
  - **Critical #4**: Added `wasMessagePersisted()` / `markMessagePersisted()` integration to instance's `handleAgentComplete()` — prevents duplicate backend writes when startup-race fallback already persisted
  - Added `conversation:deleted` explicit instance destruction via `manager.destroyInstance()` (don't rely only on `cleanupOrphanedInstances`)
  - Documented `switchSession` double-call between subscriber callbacks and `session-state.ts:62-69` useEffect — guard prevents actual double work
  - Added pending message useEffect refactoring — both `updateMessages` and `setIsAgentRunning` route through instance
  - Added `handleSend` and `handleRewind` refactored examples showing instance state reads
  - Added 4 new edge cases (rapid conversation creation, conversation:deleted + deferred callback, duplicate persistence, stale closured state)
