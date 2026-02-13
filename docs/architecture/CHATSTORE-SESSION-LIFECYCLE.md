# ChatStore Session Lifecycle & Architecture

> **Last Updated:** February 12, 2026 (v2)
> **Branch:** `refactor/chatstore-zustand-migration`
> **Status:** Production — Zustand-based architecture with non-destructive rewind
> **Claude Session:** `72d722f8-4c21-498c-a652-ef479218dde8` (non-destructive rewind implementation)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [The Dual-ID Problem](#the-dual-id-problem)
4. [Session Lifecycle Timeline](#session-lifecycle-timeline)
5. [ChatStore Deep Dive](#chatstore-deep-dive)
6. [ChatMessageService Deep Dive](#chatmessageservice-deep-dive)
7. [useChatMessages Hook](#usechatmessages-hook)
8. [Rewind System](#rewind-system)
9. [File Checkpointing](#file-checkpointing)
10. [Sidebar Synchronization Bugs (Historical)](#sidebar-synchronization-bugs-historical)
11. [Store Relationships & Data Flow](#store-relationships--data-flow)
12. [Key Actions & Their Responsibilities](#key-actions--their-responsibilities)
13. [Race Conditions & Timing Windows](#race-conditions--timing-windows)
14. [Gotchas & Footguns](#gotchas--footguns)
15. [Test Scenarios](#test-scenarios)

---

## Executive Summary

The chat system uses a **three-layer architecture** that cleanly separates concerns:

| Layer                  | File                                    | Responsibility                               |
| ---------------------- | --------------------------------------- | -------------------------------------------- |
| **ChatStore**          | `stores/chat/chat-store.ts`             | Session-keyed state (messages, running, LRU) |
| **ChatMessageService** | `services/chat/chat-message-service.ts` | Event dispatch, RAF batching, store writes   |
| **useChatMessages**    | `hooks/chat/use-chat-messages.ts`       | React integration, effects, compat wrappers  |

This replaces the previous `message-handler.ts` + `message-state.ts` + `session-state.ts` architecture which used React `useState` and a 1629-line closure. The new architecture:

- Writes backend events directly to Zustand (no `setState` callback chains)
- Uses per-session RAF batchers for streaming (created lazily, destroyed on `agent:complete`)
- Implements LRU eviction at 20 sessions to bound memory
- Persists only `activeSessionId` to localStorage (not the full store)

### Two Separate Rewind Systems

| System                  | Purpose                            | Mechanism                             | JSONL Behavior                      | Status               |
| ----------------------- | ---------------------------------- | ------------------------------------- | ----------------------------------- | -------------------- |
| **Conversation Rewind** | Rewind to earlier message in chat  | `forkSessionAt` + `parentUuid` chains | Non-destructive: old branches kept  | **DONE & WORKING**   |
| **File Checkpointing**  | Restore file state before AI edits | SDK `rewindFiles(checkpointId)`       | N/A (operates on working directory) | **FIXED (Feb 2026)** |

These are **independent systems**. Do NOT conflate them.

**Non-destructive approach:** When rewinding, the original JSONL is preserved on disk (matching Claude Code). Old branches appear as separate sidebar entries and can be browsed. The `parentUuid` chain handles filtering dead branches at load time — no file deletion needed.

---

## Architecture Overview

### Three Sources of Truth

```
┌──────────────────────────────────────────────────────────────────────┐
│  ChatStore (Zustand — devtools + immer)                              │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  sessions: Record<string, ChatSessionData>                     │  │
│  │    - messages: ChatMessage[]                                   │  │
│  │    - isAgentRunning: boolean                                   │  │
│  │    - isStopPending: boolean                                    │  │
│  │  activeSessionId: string | null  (persisted to localStorage)   │  │
│  │  lastCreatedSessionId: string | null                           │  │
│  │  pendingMessage: PendingMessage | null                         │  │
│  │  remappedOrbitIds: Record<string, true>                        │  │
│  │  rewindEpoch: number                                           │  │
│  │  conversationLoadEpoch: number                                 │  │
│  │  loadedSessions: Record<string, boolean>                       │  │
│  │  lruOrder: string[]                                            │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  Purpose: In-memory message data, streaming state, active session    │
│  File: apps/agent/src/stores/chat/chat-store.ts (503 lines)         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  UIStore (Zustand + persist)                                         │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  conversations: ConversationSummary[]                          │  │
│  │    - sessionId, title, updatedAt, messageCount                 │  │
│  │    - workspacePath?, worktreePath?                              │  │
│  │  activeConversationId: string | null                           │  │
│  │  activeConversationTitle: string | null                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  Purpose: Sidebar display list, conversation metadata                │
│  File: apps/agent/src/stores/ui/ui-store.ts                         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  CheckpointStore (Zustand — devtools + immer)                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  currentTurnStartCheckpoint: Record<sid, checkpointId>         │  │
│  │  turnCheckpoints: Record<sid, Record<msgId, checkpoint>>       │  │
│  │  currentUserMessageId: Record<sid, { messageId, reconciled }>  │  │
│  │  pendingConversationFork: Record<sid, forkId>                  │  │
│  │  rewindForkPoints: Record<sid, messageId>                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  Purpose: File rewind checkpoints, message ID reconciliation         │
│  File: apps/agent/src/stores/agent/checkpoint-store.ts               │
└──────────────────────────────────────────────────────────────────────┘
```

**Critical insight:** These stores are NOT automatically synchronized. ChatStore knows about session data (messages, running state). UIStore knows about the sidebar list (titles, counts, ordering). CheckpointStore knows about rewind checkpoints. When a session is created or remapped, ALL stores must be updated in the correct order.

### The Orchestrator: ChatMessageService

`ChatMessageService` is a **module-level singleton** (not a React component) that receives all backend events and dispatches updates to all stores.

```
Backend Events → ChatMessageService → ChatStore        (session data)
                                    → UIStore          (sidebar list)
                                    → ToolStore        (token tracking)
                                    → CheckpointStore  (rewind data)
                                    → FileStore        (file tree per session)
                                    → FileViewerStore  (file content cache)
```

**File:** `apps/agent/src/services/chat/chat-message-service.ts` (1398 lines)

---

## The Dual-ID Problem

Every conversation has **two session IDs** during its lifetime:

```
Timeline:
────────────────────────────────────────────────────────────────────

1. User clicks "New Session" or sends first message
   → Frontend generates: crypto.randomUUID()
   → e.g., "dd43566e-1234-5678-abcd-ef0123456789"

2. Backend creates SDK session (~50-200ms later)
   → SDK generates its own ID: "18173e82-77bd-40fd-8906-68ee2ef79d00"
   → Arrives via system:init event

3. Session remap: frontend UUID → SDK UUID
   → All stores must switch from dd43566e → 18173e82
   → Sidebar entry must survive this transition
```

The remap happens in `handleSystemInit` (chat-message-service.ts:303-371). It must update:

| Store               | Action                                   | Line |
| ------------------- | ---------------------------------------- | ---- |
| ChatStore           | `remapSession(frontendId, sdkId)`        | 324  |
| CreatedSessions set | `remapCreatedSession(frontendId, sdkId)` | 327  |
| ToolStore           | `remapSession(frontendId, sdkId)`        | 330  |
| CheckpointStore     | `remapSession(frontendId, sdkId)`        | 331  |
| CheckpointStore     | `consumePendingConversationFork(sdkId)`  | 334  |
| MessageBufferStore  | `markLoadPending(sdkId)`                 | 337  |
| UIStore             | `remapConversation(frontendId, sdkId)`   | 342  |

**Note on `consumePendingConversationFork`:** Must use `sdkSessionId` (not `frontendSessionId`) because `remapSession()` above already moved the data. This was a bug fixed in February 2026.

---

## Session Lifecycle Timeline

### Phase 1: User Clicks "New Session"

```
User clicks "+" button
  ↓
useSidebarActions.handleStartConversation()
  ↓
postMessage({ type: 'conversation:create', uuid, title: 'Untitled' })
  ↓
handleConversationCreate() (conversation-handlers.ts:18-37)
  → Generates temp sessionId via crypto.randomUUID()
  → Posts conversation:created back via window.postMessage
  ↓
ChatMessageService.handleConversationCreated(message)    (line 646-690)
  │
  ├── FileStore.switchSession(sid)                        // Prepare file tree
  ├── ChatStore.getOrCreateSession(sid)                   // Create session data
  ├── ChatStore.setMessages(sid, [])                      // Empty messages
  ├── ChatStore.setActiveSession(sid)                     // Set as active
  ├── ChatStore.markSessionLoaded(sid)                    // Prevent duplicate load
  ├── ChatStore.bumpConversationLoadEpoch()                // Invalidate stale loads
  ├── ChatStore.setState({ lastCreatedSessionId })        // For Effect 4
  ├── UIStore.addConversation({                           // Add to sidebar
  │     sessionId: sid,
  │     title, updatedAt: Date.now(),
  │     messageCount: 0,                                  // ← Optimistic marker
  │   })
  ├── UIStore.setActiveConversation(sid, title)           // Highlight in sidebar
  └── ToolStore.switchSession(sid)                        // Prepare token tracking
```

**Key:** `messageCount: 0` marks this as an optimistic entry. It's in the sidebar before any JSONL with messages exists on disk.

### Phase 2: User Types and Sends Message

```
User types "hello" and presses Enter
  ↓
chat-actions.ts createChatActions().handleSend(text)     (line 54-217)
  │
  ├── Reads ChatStore.activeSessionId, sessions[sid], messages
  ├── If isAgentRunning → queue in QueuedMessageStore (line 82-91)
  │
  ├── Checks conversationExists:                          (line 100-102)
  │     session !== undefined (ChatStore — primary authority)
  │     OR conversations.some(c => c.sessionId === sid)   (UIStore — fallback)
  │
  ├── If !conversationExists OR no sessionId:
  │     → "Pending path": stores in pendingMessage, creates conversation
  │     → ChatStore.setPendingMessage({ text })
  │     → postMessage({ type: 'conversation:create', ... })
  │     → Effect 4 in use-chat-messages.ts sends the message when
  │       lastCreatedSessionId updates
  │
  └── If conversationExists:
        → "Direct path"
        ├── If first message (messages.length === 0):
        │     Update title from "Untitled" to text
        ├── Send thinking:set, model:set, effort:set
        ├── Get parentUuid (forkPoint OR lastMessage.id)
        ├── ChatStore.addMessage(sid, userMessage)
        ├── ChatStore.setAgentRunning(sid, true)
        ├── Persist via conversationAddMessage()
        └── postMessage({ type: 'message:send', ... })
```

### Phase 3: System Init (Session Remap)

```
~50-200ms after message:send
  ↓
Backend fires system:init with sdk_session_id
  ↓
ChatMessageService.handleSystemInit(message)             (line 303-371)
  │
  ├── Determines frontendSessionId:
  │     Prefer message.session_id if ≠ sdkSessionId
  │     Fallback: chatStore.activeSessionId
  │
  ├── ChatStore.remapSession(frontendId, sdkId)           // Atomic data move
  ├── remapCreatedSession(frontendId, sdkId)               // Track created sessions
  ├── ToolStore.remapSession(frontendId, sdkId)            // Token data
  ├── CheckpointStore.remapSession(frontendId, sdkId)      // Checkpoint data
  ├── CheckpointStore.consumePendingConversationFork(sdkId) // Clear fork state
  ├── MessageBufferStore.markLoadPending(sdkId)            // Prevent duplicate load
  ├── UIStore.remapConversation(frontendId, sdkId)         // Swap sidebar entry
  │
  └── if isStillActive:
        ToolStore.switchSession(sdkId)
```

### Phase 4: Streaming & Completion

```
Backend sends agent:chunk events (streaming)
  ↓
ChatMessageService.handleAgentChunk()                    (line 378-410)
  → RAF-batched: accumulates chunks per-session, flushes at animation frame
  → Creates assistant message on first chunk (with parentUuid linkage)

Backend sends agent:complete                             (line 424-571)
  ↓
ChatMessageService.handleAgentComplete()
  ├── Flush all pending batchers (chunks, thinking, tools)
  ├── Clean up batcher Map entries
  ├── Finalize thinking duration
  ├── Build completedMsg (isStreaming: false)
  ├── Persist to backend via conversationAddMessage()
  ├── Track usage in ToolStore
  ├── Mark checkpoint complete: CheckpointStore.onMessageComplete()
  ├── Clear isAgentRunning + isStopPending
  └── Schedule coalesced sidebar refresh (requestIdleCallback)
```

### Phase 5: Sidebar Refresh

```
scheduleSidebarRefresh() (line 89-116)
  → Coalesced via requestIdleCallback (fires once even after multiple agent:complete)
  ↓
conversationList(workspacePath)
  ↓
UIStore.setConversations(backendList)
  ├── Filter optimistic: messageCount===0 AND not in backend AND <60s old
  ├── Merge: [...optimistic, ...backendList]
  └── Result: sidebar reflects disk state + fresh optimistic entries
```

---

## ChatStore Deep Dive

**File:** `apps/agent/src/stores/chat/chat-store.ts` (503 lines)

### Middleware Stack

```typescript
create<ChatStoreState>()(
  devtools(        // Redux DevTools integration (development only)
    immer(         // Immutable updates via mutable syntax
      (set, get) => ({ ... })
    ),
    { name: 'chat-store' }
  )
);
```

### Design Decisions

| Decision                                                | Why                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Record<string, ChatSessionData>` not Map               | Immer works with plain objects; Maps require custom serialization                  |
| `remappedOrbitIds` as `Record<string, true>` not Set    | Immer's structural sharing doesn't work with Sets (every mutation creates new Set) |
| Manual localStorage subscriber (not persist middleware) | Serializing entire sessions Record on every `agent:chunk` would be catastrophic    |
| LRU eviction at 20 sessions                             | Bounds memory; active session pinned; evicted sessions reload on switch-back       |

### LRU Eviction System

```typescript
const MAX_IN_MEMORY_SESSIONS = 20;

function evictIfNeeded(sessions, lruOrder, loadedSessions, activeSessionId):
  while lruOrder.length > MAX_IN_MEMORY_SESSIONS:
    candidate = lruOrder[0]  // Oldest access
    if candidate === activeSessionId → skip (pinned)
    if session.isAgentRunning → skip (active streaming)
    session.messages = []    // Clear messages (keep session key)
    delete loadedSessions[candidate]  // Will reload on switch-back
    lruOrder.splice(0, 1)   // Remove from LRU
```

**Key:** Eviction clears messages but keeps the session key in `sessions`. This preserves `isAgentRunning` state for background sessions. Clearing `loadedSessions` ensures `Effect 3` will fire a `conversation:load` when the user switches back.

### localStorage Subscriber

```typescript
useChatStore.subscribe((state, prevState) => {
  if (state.activeSessionId !== prevState.activeSessionId) {
    localStorage.setItem(STORAGE_KEY, state.activeSessionId);
  }
});
```

Only `activeSessionId` survives app restarts. Messages are reloaded from JSONL via `conversation:load`.

### Selector Helpers

Pre-built selectors prevent unnecessary re-renders:

```typescript
useActiveMessages(); // → ChatMessage[] (stable EMPTY_MESSAGES when no session)
useActiveSession(); // → ChatSessionData | undefined
useActiveSessionId(); // → string | null
useIsAgentRunning(); // → boolean
useIsStopPending(); // → boolean
```

### Key Actions

| Action                              | What It Does                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `getOrCreateSession(id)`            | Creates session if missing, touches LRU, runs eviction                                        |
| `setActiveSession(id)`              | Sets activeSessionId, ensures session exists, touches LRU                                     |
| `remapSession(old, new)`            | Atomic move: sessions, activeSessionId (if match), loadedSessions, lruOrder, remappedOrbitIds |
| `destroySession(id)`                | Deletes from sessions, loadedSessions, lruOrder; clears activeSessionId if match              |
| `bumpRewindEpoch()`                 | Invalidates in-flight `conversation:loaded` after rewind                                      |
| `bumpConversationLoadEpoch()`       | Invalidates stale `conversation:loaded` after new session creation                            |
| `reconcileMessageId(sid, old, new)` | Swaps user message ID from frontend UUID to SDK checkpoint UUID                               |

---

## ChatMessageService Deep Dive

**File:** `apps/agent/src/services/chat/chat-message-service.ts` (1398 lines)

### Per-Session RAF Batchers

The service uses `requestAnimationFrame`-based batching to coalesce rapid events into single store updates per frame:

```
agent:chunk events (10-50/second)
       │
       ▼
  chunkBatcher[sessionId]    ← Created lazily on first chunk
       │
       ▼ (at next animation frame)
  Accumulate chunks by messageId
       │
       ▼
  Single ChatStore.updateMessage() call per messageId
```

Three batcher types per session:

| Batcher            | Events Batched                     | Store Action                               |
| ------------------ | ---------------------------------- | ------------------------------------------ |
| `chunkBatchers`    | `agent:chunk` text content         | `updateMessage()` / `addMessage()`         |
| `thinkingBatchers` | `agent:thinking` extended thinking | `updateMessage()` with thinkingBlocks      |
| `toolBatchers`     | `tool:start` / `tool:end`          | ToolStore (currently called synchronously) |

**Lifecycle:**

- Created lazily on first event for a session
- Flushed with `cancel(true)` on `agent:complete` (processes pending items)
- Cancelled without flush on rewind (`cancel()` — discards stale chunks)
- Deleted from Map after flush/cancel (recreated if session streams again)

### Checkpoint Debouncing

```typescript
private batchedCheckpoint = createCheckpointBatcher((sessionId, checkpointId) => {
  useCheckpointStore.getState().onCheckpointReceived(sessionId, checkpointId);
}, 100);  // 100ms debounce window
```

Reduces ~30 checkpoint state updates per agent run to ~2-3. The last checkpoint in each debounce window wins.

**Known risk:** For fast responses (queued messages), the debounced callback can fire AFTER `onMessageComplete`, misattributing `currentTurnStartCheckpoint`. This is a suspected cause of intermittent file checkpoint failures with queued messages.

### Sidebar Refresh Coalescing

```typescript
let sidebarDirty = false;
let sidebarIdleCallbackId: number | null = null;

function scheduleSidebarRefresh(): void {
  sidebarDirty = true;
  if (sidebarIdleCallbackId !== null) return; // Already scheduled
  sidebarIdleCallbackId = requestIdleCallback(() => {
    if (!sidebarDirty) return;
    sidebarDirty = false;
    conversationList(workspacePath).then(setConversations);
  });
}
```

Multiple `agent:complete` events (e.g., from parallel background sessions) only trigger one sidebar refresh.

### Event Dispatch Table

| Event                  | Handler                     | Stores Modified                                                    |
| ---------------------- | --------------------------- | ------------------------------------------------------------------ |
| `system:init`          | `handleSystemInit`          | ChatStore, ToolStore, CheckpointStore, UIStore, MessageBufferStore |
| `agent:chunk`          | `handleAgentChunk`          | ChatStore (via RAF batcher)                                        |
| `agent:thinking`       | `handleAgentThinking`       | ChatStore (via RAF batcher)                                        |
| `agent:complete`       | `handleAgentComplete`       | ChatStore, ToolStore, CheckpointStore, UIStore (sidebar refresh)   |
| `agent:error`          | `handleAgentError`          | ChatStore                                                          |
| `agent:checkpoint`     | `handleAgentCheckpoint`     | CheckpointStore, ChatStore (reconcileMessageId)                    |
| `conversation:created` | `handleConversationCreated` | ChatStore, UIStore, ToolStore, FileStore                           |
| `conversation:list`    | `handleConversationList`    | UIStore                                                            |
| `conversation:loaded`  | `handleConversationLoaded`  | ChatStore, UIStore, ToolStore, FileStore                           |
| `conversation:rewound` | `handleConversationRewound` | ChatStore, ToolStore, FileStore, UIStore, CheckpointStore          |
| `conversation:deleted` | `handleConversationDeleted` | ChatStore, ToolStore, FileStore                                    |
| `tool:start`           | `handleToolStart`           | ToolStore, ChatStore                                               |
| `tool:end`             | `handleToolEnd`             | ToolStore, FileStore                                               |
| `permission:request`   | `handlePermissionRequest`   | ToolStore                                                          |

### conversation:loaded Merge Logic

The most complex handler — merges backend JSONL messages with in-memory cache:

```
conversation:loaded arrives
  ↓
1. Skip if session_id in remappedOrbitIds (stale remap)
2. Snapshot cached messages BEFORE setTimeout(0)
3. Capture rewindEpoch + bump conversationLoadEpoch
4. setTimeout(0) → defer to avoid blocking
5. Staleness guards:
   - rewindEpoch changed → skip (rewind happened)
   - conversationLoadEpoch changed → skip (new session created)
6. Streaming guard:
   - If target session isAgentRunning AND hasLiveMessages → skip merge
     (cache is authoritative during streaming; disk has different IDs)
7. Merge:
   a. Both empty → empty
   b. Only backend → backend
   c. Only cache → cache
   d. Both exist:
      - Count user messages in each
      - cachedUserCount ≤ backendUserCount → use backend + trailing
      - cachedUserCount > backendUserCount → backend + live trailing
8. Enrich with client-only fields (interruptReason) from cache
9. Write to ChatStore, restore tools for active chain
```

---

## useChatMessages Hook

**File:** `apps/agent/src/hooks/chat/use-chat-messages.ts` (452 lines)

This is a **thin reader hook** — it doesn't process events (that's ChatMessageService). It:

1. Reads reactive state via ChatStore selectors
2. Provides compatibility wrappers for legacy consumers
3. Runs 7 effects
4. Creates chat actions

### Effects

| #   | Purpose                         | Dependencies                                     | What It Does                                                     |
| --- | ------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | Restore usage on mount          | `[]` (mount-only)                                | Loads persisted usage from JSONL for sessionId from localStorage |
| 2   | Request conversation list       | `[sessionId, workspacePath, activeWorktreePath]` | Fires `conversation:list` on any change                          |
| 3   | Load messages on session change | `[sessionId]`                                    | Fires `conversation:load` for unloaded sessions                  |
| 4   | Send pending message            | `[lastCreatedSessionId, pendingMessage]`         | After `conversation:created`, sends the queued message           |
| 5   | Cross-instance sync             | `[sessionId]`                                    | Listens for `orbit:user-message` CustomEvent (Agent ↔ Editor)    |
| 6   | Sync ToolStore session          | `[sessionId]`                                    | Ensures token usage follows active session                       |
| 7   | Dev debug interface             | `[postMessage]`                                  | Exposes `window.__orbit_debug` with stress test runners          |

### Compat Wrappers

```typescript
const setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> = useCallback((updater) => {
  const store = useChatStore.getState();
  const sid = store.activeSessionId;
  const current = store.sessions[sid]?.messages ?? [];
  const next = typeof updater === 'function' ? updater(current) : updater;
  store.setMessages(sid, next);
}, []);
```

These exist because `useQueuedMessageHandler` still expects `React.Dispatch`-style setters. They delegate to ChatStore internally.

---

## Rewind System

**Status:** DONE AND WORKING. Validated by Mega Stress Test (18 steps, 4 consecutive rewinds, all pass).

### Overview

Conversation rewind uses Claude Code's `forkSessionAt` approach for **all** rewinds (first and repeat). This is a **non-destructive** system: original JSONL branch files are preserved on disk. The `parentUuid` chain handles filtering dead branches at load time — no file deletion needed.

```
User clicks rewind button on message
  ↓
chat-actions.ts handleRewind(messageId)                  (line 297-355)
  ├── Find user message (if assistant clicked, walk back)
  ├── Build truncatedMessages with IDs, roles, content, parentUuid
  └── postMessage({ type: 'conversation:rewind', ..., current_messages })
  ↓
conversation-handlers.ts handleConversationRewind()      (line 184-402)
  │
  ├── Step 1: Get checkpoints for the target user message
  │     CheckpointStore.getRewindCheckpoints(session_id, userMessageId)
  │
  ├── Step 2: File rewind (if checkpoints available)
  │     await agentRewindFiles(session_id, checkpointId)
  │     Best-effort — failure doesn't block conversation rewind
  │
  ├── Step 3: Find target message in disk JSONL
  │     Priority chain:
  │     1. Direct SDK UUID match in JSONL
  │     2. Content-validated position match (role+content of disk vs frontend)
  │     3. Frontend messages fallback (stale disk on rewind 2+)
  │     4. Unvalidated position fallback (last resort)
  │
  ├── Step 4: Fork session at target message
  │     if (sdkMessageId && !useFrontendMessages):
  │       await agentForkSessionAt(session_id, sdkMessageId)
  │       CheckpointStore.setPendingConversationFork(session_id, sdkMessageId)
  │     Bridge calls are awaited directly — no Promise.race timeouts
  │
  └── Step 5: Post conversation:rewound
        window.postMessage({ type: 'conversation:rewound', messages, new_session_id })
  ↓
ChatMessageService.handleConversationRewound()           (line 985-1050)
  ├── Cancel RAF batchers (discard pre-rewind chunks)
  ├── Bump rewindEpoch (invalidate stale conversation:loaded)
  ├── If new session → switch all stores to new_session_id
  ├── Write rewound messages to ChatStore
  ├── Set rewindForkPoint in CheckpointStore
  └── Restore tool executions for rewound messages
```

### Non-Destructive JSONL Preservation

When `forkSessionAt` runs in the agent-bridge:

1. **Truncate** — Writes a truncated copy of the original JSONL (messages up to the fork point)
2. **Copy** — Copies the truncated file to a new intermediate session ID
3. **SDK Fork** — Creates a new SDK session with `forkSession: true` which reads the intermediate, creates a self-contained fork JSONL, and deletes the intermediate
4. **Cleanup** — Only the intermediate JSONL is deleted. The **original** JSONL stays on disk

This matches Claude Code's behavior: old branches remain browsable via the sidebar. The `parentUuid` chain in each JSONL + `build_active_uuid_set()` in Rust handles filtering dead branches when loading. Old branches coexist safely — they're historical data, not garbage.

### parentUuid Chain

Every message has a `parentUuid` field linking to its predecessor. After rewind, the new user message's `parentUuid` points to the last surviving message. Dead branches are filtered by `getActiveChain()` which walks the `parentUuid` chain backwards from the last message.

### Content-Validated Position Matching

On first rewind, direct UUID match always fails (frontend UUID ≠ SDK UUID). Position-based matching validates by comparing content+role of the disk message vs the frontend message at the same position:

- **Content match** = fresh disk (first rewind) → proceed with `forkSessionAt`
- **Content mismatch** = stale disk (rewind 2+) → use frontend messages, skip fork

### Removed Workarounds (Historical)

The following workarounds were removed as part of the unified non-destructive rewind system:

| Removed Code                   | Location                                              | Why It Existed                                                   | Why It's Gone                                                          |
| ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `forkedSessions` Set           | `conversation-handlers.ts`                            | Tracked sessions already forked to skip repeat forks             | Always fork now — non-destructive, no IPC blocking                     |
| `isRepeatRewind` guard         | `conversation-handlers.ts`                            | Detected repeat rewinds to skip bridge calls                     | All rewinds go through same code path                                  |
| `Promise.race` timeouts        | `conversation-handlers.ts`                            | Prevented IPC blocking from slow bridge calls                    | Bridge calls are `await`-ed directly; async file I/O prevents blocking |
| `propagateForkedSession()`     | `conversation-handlers.ts`, `chat-message-service.ts` | Propagated forked status through session remap chain             | No forked session tracking needed                                      |
| `.rewinds.json` sidecar        | `conversations/src/lib.rs`                            | `apply_self_rewinds()` filtered dead branches for repeat rewinds | `parentUuid` chain handles all branching natively                      |
| `pendingJsonlDeletions` Map    | `session-manager.ts`                                  | Fallback cleanup when copy-then-delete failed in `forkSessionAt` | No more copy-then-delete — originals are preserved                     |
| `conversationRecordSelfRewind` | `conversations.rs`, `lib/api`                         | Rust command to write `.rewinds.json` sidecar                    | Self-rewind system fully removed                                       |

---

## File Checkpointing

**Status:** FIXED (February 2026). Root cause: post-fork sessions missing `forkSession: true`.

### How It Works

1. **Enable:** `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` (set in agent-bridge `index.ts`)
2. **Track:** Each user message replay emits a checkpoint UUID via `--replay-user-messages` CLI flag
3. **Store:** `CheckpointStore.onCheckpointReceived()` debounced at 100ms
4. **Associate:** `CheckpointStore.onMessageComplete()` links checkpoint to the preceding user message
5. **Rewind:** `agentRewindFiles(sessionId, checkpointId)` restores file state

### The Root Cause Bug (Fixed)

In `forkSessionAt` (session-manager.ts), the post-fork session was created with `resumeSessionId` but **without** `forkSession: true`:

```typescript
// BEFORE (broken):
await this.createSession(sessionId, {
  resumeSessionId: newSdkSessionId,
  // forkSession missing → shouldEnableReplay = false → no checkpoints
});

// AFTER (fixed):
await this.createSession(sessionId, {
  resumeSessionId: newSdkSessionId,
  forkSession: true, // ← CRITICAL: enables replay-user-messages
});
```

Without `forkSession: true`, `_createOptions()` in agent.ts computed `shouldEnableReplay = false` → `--replay-user-messages` omitted from CLI → no checkpoint UUIDs emitted → `getRewindCheckpoints()` returned `undefined` → file rewind silently skipped.

The fix also simplified `shouldEnableReplay`:

```typescript
// BEFORE: Only enabled for new sessions OR SDK forks with resumeAt
const shouldEnableReplay =
  this._resumeSessionId === undefined || (this._forkSession && this._resumeSessionAt !== undefined);

// AFTER: Enabled for new sessions OR any fork
const shouldEnableReplay = this._resumeSessionId === undefined || this._forkSession;
```

### Checkpoint Flow Diagram

```
User sends message (user message UUID = "abc-123")
  ↓
ChatStore.addMessage(sid, { id: "abc-123", ... })
CheckpointStore.onUserMessageSent(sid, "abc-123")
  → currentUserMessageId[sid] = { messageId: "abc-123", reconciled: false }
  ↓
agent-bridge replays messages → emits agent:checkpoint events
  ↓
ChatMessageService.handleAgentCheckpoint()
  ├── batchedCheckpoint(sid, checkpointId)     // Debounced 100ms
  │     → CheckpointStore.onCheckpointReceived(sid, checkpointId)
  │       → currentTurnStartCheckpoint[sid] = checkpointId
  │
  └── CheckpointStore.reconcileUserMessageId(sid, checkpointId)
        // Frontend UUID "abc-123" → SDK checkpoint UUID
        // Sets reconciled: true (prevents stale overwrite)
        → ChatStore.reconcileMessageId(sid, "abc-123", checkpointId)
  ↓
agent:complete arrives
  ↓
CheckpointStore.onMessageComplete(sid)
  → turnCheckpoints[sid]["abc-123"] = {
      rewindFiles: currentTurnStartCheckpoint[sid],
      forkSession: currentTurnStartCheckpoint[sid]
    }
```

### Key Constraint

"Checkpoints are tied to the session that created them." After `forkSessionAt`, old session's checkpoint data may be inaccessible from the new session. The `forkSession: true` fix ensures new post-fork sessions emit their own checkpoints.

---

## Sidebar Synchronization Bugs (Historical)

Three bugs were discovered and fixed in the `fix/feedback` branch. They are documented here for reference.

### Bug #1: Welcome Page Stuck on New Chat

**Symptom:** User clicks "New Session" → types message → UI stays on welcome page.

**Root cause:** `setConversations` full-array replacement wiped optimistic sidebar entries. `handleSend` fell back to the pending message path, creating a second session.

**Fix:** `setConversations` now preserves optimistic entries (`messageCount === 0`, not in incoming list, created within 60 seconds). `handleSend` uses ChatStore session as primary authority for `conversationExists`.

### Bug #2: Sidebar Entry Disappears During Streaming

**Symptom:** Sidebar entry vanishes after session remap, reappears after streaming.

**Root cause:** `handleSystemInit` called `removeConversation(frontendId)` then `setActiveConversation(sdkId)` — but `setActiveConversation` only sets the pointer, doesn't add an array entry.

**Fix:** New `remapConversation(oldId, newId)` action swaps `sessionId` in-place, atomically updates `activeConversationId`, and migrates `sessionWorktreeMap`.

### Bug #3: Stale Ghost Entry at Top of Sidebar

**Symptom:** Old conversations (hours old) appear at position 0 above time-sorted list.

**Root cause:** Optimistic entries with `messageCount === 0` had no expiry. Stale entries from hours ago were perpetually prepended.

**Fix:** 60-second TTL guard on optimistic entries in `setConversations`:

```typescript
const OPTIMISTIC_TTL_MS = 60_000;
const optimistic = state.conversations.filter(
  (c) =>
    c.messageCount === 0 && !incomingIds.has(c.sessionId) && now - c.updatedAt < OPTIMISTIC_TTL_MS
);
state.conversations = [...optimistic, ...conversations];
```

---

## Store Relationships & Data Flow

### Creation Flow

```
conversation:create (postMessage)
         │
         ▼
conversation:created (via window.postMessage)
         │
         ▼
ChatMessageService.handleConversationCreated
         │
         ├─► FileStore.switchSession(sid)
         ├─► ChatStore.getOrCreateSession(sid)     sessions[sid] = { messages: [], ... }
         ├─► ChatStore.setActiveSession(sid)        activeSessionId = sid
         ├─► ChatStore.markSessionLoaded(sid)       loadedSessions[sid] = true
         ├─► ChatStore.bumpConversationLoadEpoch()  epoch++
         ├─► UIStore.addConversation(...)           conversations = [newEntry, ...rest]
         ├─► UIStore.setActiveConversation(sid)     activeConversationId = sid
         └─► ToolStore.switchSession(sid)
```

### Remap Flow

```
system:init (backend event, ~50-200ms after message:send)
         │
         ▼
ChatMessageService.handleSystemInit
         │
         ├─► ChatStore.remapSession(old, new)          sessions[new] = sessions[old]; delete old
         ├─► remapCreatedSession(old, new)              update created sessions tracker
         ├─► ToolStore.remapSession(old, new)           token data migrated
         ├─► CheckpointStore.remapSession(old, new)     checkpoint data migrated
         ├─► CheckpointStore.consumePendingFork(new)    clear fork state (uses NEW id!)
         ├─► MessageBufferStore.markLoadPending(new)    prevent duplicate load
         ├─► UIStore.remapConversation(old, new)        conversations[i].sessionId = new
         └─► ToolStore.switchSession(new)               if still active
```

### Rewind Flow (Non-Destructive)

```
conversation:rewind (postMessage from handleRewind)
         │
         ▼
handleConversationRewind (conversation-handlers.ts)
  ├── Get checkpoints from CheckpointStore
  ├── await agentRewindFiles() — restore file state (best-effort)
  ├── Find target in JSONL (4-step priority chain)
  ├── await agentForkSessionAt() — create SDK branch (no timeouts)
  │     └── Original JSONL preserved on disk (non-destructive)
  └── conversation:rewound (via window.postMessage)
         │
         ▼
ChatMessageService.handleConversationRewound
  ├── Cancel RAF batchers (discard stale chunks)
  ├── ChatStore.bumpRewindEpoch()
  ├── Switch stores to new session (if different)
  ├── ChatStore.setMessages(targetId, rewoundMessages)
  ├── CheckpointStore.setRewindForkPoint(targetId, lastMsg.id)
  └── Restore tool executions
```

---

## Key Actions & Their Responsibilities

### UIStore Actions (Conversation Management)

| Action                            | What It Does                                                                     | When Used                                  |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `addConversation(summary)`        | Prepends to `conversations[]` with duplicate check                               | `handleConversationCreated`                |
| `removeConversation(sid)`         | Filters out from array, clears active if match, cleans up worktree + checkpoints | Manual delete, `handleConversationDeleted` |
| `remapConversation(oldId, newId)` | Swaps sessionId in-place, updates activeConversationId, migrates worktree map    | `handleSystemInit` — session remap         |
| `setConversations(list)`          | Full merge with optimistic preservation (60s TTL)                                | `handleConversationList` — backend refresh |
| `updateConversationTitle(sid, t)` | Updates title in array + activeConversationTitle                                 | `handleSend` first message, rename dialog  |
| `setActiveConversation(id, t)`    | Sets `activeConversationId` + title only (does NOT add to array)                 | Navigation, session creation               |

### ChatStore Actions (Session Data)

| Action                          | What It Does                                                                | When Used                             |
| ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| `getOrCreateSession(sid)`       | Creates session entry if missing, touches LRU, runs eviction                | Conversation creation, chunk handling |
| `setActiveSession(sid)`         | Sets `activeSessionId`, ensures session exists, touches LRU                 | Navigation, creation                  |
| `remapSession(oldId, newId)`    | Atomic move: sessions, activeSessionId (if match), loadedSessions, lruOrder | `handleSystemInit`                    |
| `setMessages(sid, msgs)`        | Replaces messages array for session                                         | Conversation load, rewind             |
| `addMessage(sid, msg)`          | Appends message to session                                                  | `handleSend`, chunk batcher           |
| `updateMessage(sid, id, fn)`    | Functional update of specific message by ID                                 | Chunk append, thinking, complete      |
| `reconcileMessageId(sid, o, n)` | Swaps user message ID from frontend UUID to SDK checkpoint UUID             | `handleAgentCheckpoint`               |
| `setAgentRunning(sid, running)` | Sets streaming state                                                        | `handleSend`, `handleAgentComplete`   |
| `setStopPending(sid, pending)`  | Blocks rewind while SDK flushes after Stop                                  | `handleStop`, `handleAgentComplete`   |
| `destroySession(sid)`           | Full cleanup: sessions, loadedSessions, lruOrder, activeSessionId           | `handleConversationDeleted`           |
| `bumpRewindEpoch()`             | Invalidates in-flight `conversation:loaded`                                 | Rewind                                |
| `bumpConversationLoadEpoch()`   | Invalidates stale `conversation:loaded`                                     | New session creation                  |
| `markSessionLoaded(sid)`        | Prevents duplicate `conversation:load` requests                             | Effect 3, `handleConversationCreated` |

---

## Race Conditions & Timing Windows

### Race 1: conversation:list vs Optimistic Entry

```
T0: handleConversationCreated → addConversation({sid: "abc", messageCount: 0})
T1: Effect 2 fires → postMessage({ type: 'conversation:list' })
T2: Backend scans disk — "abc" JSONL has 0 messages or doesn't exist yet
T3: conversation:list response → setConversations(backendList)
    backendList doesn't include "abc"

    WITHOUT FIX: conversations = backendList  →  "abc" GONE
    WITH FIX:    conversations = [abc_optimistic, ...backendList]  (TTL: 60s)

T4: handleSend checks conversationExists
    WITHOUT FIX: false → pending path → duplicate session
    WITH FIX:    true (ChatStore session exists as primary authority)
```

### Race 2: Session Remap vs Sidebar Display

```
T0: handleConversationCreated({sid: "frontend-uuid"})  →  Sidebar shows entry
T1: User sends message, title updated
T2: system:init arrives (sdk_session_id: "sdk-uuid")

    WITHOUT FIX: removeConversation("frontend-uuid") → sidebar empty during streaming
    WITH FIX:    remapConversation("frontend-uuid", "sdk-uuid") → entry stays visible

T3-T99: Streaming (sidebar entry visible throughout)
T100: agent:complete → sidebar refresh replaces optimistic with backend entry
```

### Race 3: conversation:loaded vs New Session Creation

```
T0: App starts, restores sessionId from localStorage
T1: Effect 3 fires conversation:load for old session
T2: User clicks "+" and sends message → handleConversationCreated bumps epoch
T3: conversation:loaded arrives for old session
    Guard: newLoadEpoch !== currentStore.conversationLoadEpoch → SKIP
    Without guard: stale response hijacks activeSessionId
```

### Race 4: Checkpoint Debounce vs Message Complete

```
T0: agent:checkpoint arrives  → batchedCheckpoint queued (100ms debounce)
T1: agent:complete arrives     → CheckpointStore.onMessageComplete(sid)
    onMessageComplete reads currentTurnStartCheckpoint — may be STALE
T2: Debounced callback fires   → updates currentTurnStartCheckpoint (TOO LATE)

Impact: Intermittent file checkpoint misattribution with queued messages
Status: Known issue, separate from the forkSession fix
```

---

## Gotchas & Footguns

### 1. `setActiveConversation` Does NOT Add to Array

```typescript
// This ONLY sets the pointer — does NOT create a sidebar entry
uiStore.setActiveConversation(sdkSessionId, title);

// You MUST also call one of:
uiStore.addConversation({...})        // for new entries
uiStore.remapConversation(old, new)   // for remap
```

### 2. Optimistic Entries Are Identified by `messageCount === 0`

Any conversation with `messageCount: 0` is treated as optimistic by `setConversations`. Creating entries with `messageCount: 0` for other purposes will subject them to optimistic preservation logic.

### 3. `consumePendingConversationFork` Must Use SDK ID

After `remapSession(frontendId, sdkId)`, the data lives under `sdkId`. Calling `consumePendingConversationFork(frontendId)` finds nothing:

```typescript
// ❌ Wrong: data already moved by remapSession
useCheckpointStore.getState().consumePendingConversationFork(frontendSessionId);

// ✅ Correct: use the remapped ID
useCheckpointStore.getState().consumePendingConversationFork(sdkSessionId);
```

### 4. Immer Nested Property Mutation — Silently Dropped

In `create()(immer((set, get) => ...))`, mutating a nested property on an existing object can be silently dropped:

```typescript
// ❌ May not produce new state reference
set((state) => {
  state.obj.prop = newValue; // Silent no-op
});

// ✅ Replace entire object
set((state) => {
  state.obj = { ...state.obj, prop: newValue };
});
```

The `get()` call immediately after `set()` may appear correct (reading the draft) but the committed state is unchanged. Only detectable via `useChatStore.subscribe()` monitoring.

### 5. `removeConversation` Clears Checkpoints

```typescript
removeConversation: (sessionId: string): void => {
  // ... filters array ...
  useCheckpointStore.getState().clearSessionCheckpoints(sessionId);
};
```

Correct for user-initiated deletes but WRONG for remap. `remapConversation` does NOT clear checkpoints — they're handled by `CheckpointStore.remapSession`.

### 6. Effect 2 Triggers on `sessionId` Change

```typescript
useEffect(() => {
  if (sessionId || workspacePath) {
    postMessage({ type: 'conversation:list', ... });
  }
}, [sessionId, workspacePath, activeWorktreePath, postMessage]);
```

When `remapSession` changes `activeSessionId` in ChatStore, this effect fires a new `conversation:list`. If the remap isn't complete when the response arrives, the optimistic preservation logic handles it.

### 7. `forkSession: true` Is Critical for File Checkpointing

Post-fork sessions MUST set `forkSession: true` in `createSession` options. Without it:

- `shouldEnableReplay` = false
- `--replay-user-messages` not added to CLI args
- No checkpoint UUIDs emitted during replay
- `getRewindCheckpoints()` returns `undefined`
- File rewind silently skips

### 8. `forkSessionAt` Is Non-Destructive — Original JONLs Stay on Disk

After a rewind, the original JSONL branch is **not deleted**. This is intentional — it matches Claude Code's approach. Consequences:

- **Sidebar shows old branches:** Each rewind creates a new SDK session → new JSONL on disk → new sidebar entry. Users can browse old branches.
- **Disk usage grows:** Each rewind adds a JSONL file. This is bounded by the fork chain mechanism (`.fork.json` sidecars) which links branches together.
- **`build_active_uuid_set` handles filtering:** When loading a session, Rust walks the `parentUuid` chain to determine the active branch. Dead branches on disk are harmless — they're filtered at load time.
- **Intermediate JONLs are cleaned up:** Only the temporary intermediate file (used between truncate and SDK fork) is deleted. The SDK fork process often deletes it first; our cleanup is a best-effort fallback.

### 9. `startTransition` Works Outside React Components

`ChatMessageService` imports `startTransition` from `react` and uses it in `handleConversationLoaded`. This works because Zustand v4+ uses `useSyncExternalStore` internally. Do NOT downgrade Zustand below v4 without verifying this still works.

### 10. RAF Batchers Are Per-Session

Rewinding session A cancels only A's batchers. Session B's streaming continues unaffected. This prevents cross-session interference in multi-session scenarios.

### 11. Reconciliation `reconciled` Flag Prevents Stale Overwrites

`currentUserMessageId` has a `reconciled: boolean` field. `onUserMessageSent` sets it to `false`; first successful `reconcileUserMessageId` sets it to `true`. Subsequent reconciliation attempts are rejected. Epoch-based guards don't work because JS is single-threaded (get/set are atomic).

---

## Test Scenarios

### Scenario 1: New Session → First Message (Happy Path)

1. Click "+" to create new session
2. Type "hello" and press Enter
3. **Expected:** Message appears in chat, sidebar shows "hello", agent starts streaming
4. **Verify:** No duplicate sidebar entries, no welcome page flash

### Scenario 2: Session Remap During Streaming

1. Create new session and send message
2. Watch sidebar during streaming
3. **Expected:** Sidebar entry stays visible continuously (no disappear/reappear)
4. **Verify:** Title remains correct, entry doesn't jump positions

### Scenario 3: Rapid Session Creation

1. Click "+" to create new session
2. Immediately send a message before conversation:created arrives
3. **Expected:** Message queued via pendingMessage, sent after conversation:created
4. **Verify:** Only one sidebar entry, no duplicates

### Scenario 4: Stale Entry Cleanup

1. Create session, send message, let it complete
2. Wait 2+ minutes
3. Create another session and send message
4. **Expected:** No ghost entries from old sessions at position 0
5. **Verify:** Sidebar sorted by time (most recent at top)

### Scenario 5: Switch Sessions During Remap

1. Create session A and send message
2. Before streaming completes, click a different session B
3. **Expected:** Session B loads correctly, session A continues in background
4. **Verify:** `remapConversation` updates A's entry, doesn't hijack focus to A

### Scenario 6: Single Rewind (Non-Destructive)

1. Send 3 messages, let each complete
2. Rewind to after message 1
3. **Expected:** Messages 2-3 disappear, file state restores
4. Send new message → agent responds
5. Switch to another chat, switch back
6. **Verify:** Active branch visible (parentUuid chain), old branch visible in sidebar as separate entry
7. **Verify:** Clicking the old sidebar entry shows pre-rewind messages

### Scenario 7: Multi-Rewind (Stress Test)

1. Send 3 messages → rewind to after msg 1 → send new msg
2. Rewind again to after msg 1 → send another new msg
3. Rewind a third time → send another msg
4. Switch away and back between each step
5. **Expected:** Only newest branch visible in active chat
6. **Verify:** No duplicate messages, file checkpoints work
7. **Verify:** Old branches persist as separate sidebar entries (non-destructive)
8. **Verify:** No IPC blocking — each rewind completes without timeout

### Scenario 8: LRU Eviction

1. Open 25+ different conversations (switch between them)
2. Switch back to the first conversation
3. **Expected:** Messages reload from backend (evicted from memory)
4. **Verify:** Tool widgets and usage data restored correctly

---

## Appendix: Key Type Definitions

### ChatSessionData

```typescript
// apps/agent/src/stores/chat/chat-store.ts:57-61
export interface ChatSessionData {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  isStopPending: boolean;
}
```

### PendingMessage

```typescript
// apps/agent/src/stores/chat/chat-store.ts:50-55
export interface PendingMessage {
  text: string;
  contextFiles?: string[] | undefined;
  images?: ImageAttachment[] | undefined;
  elements?: ReactElementContext[] | undefined;
}
```

### ConversationSummary (Sidebar)

```typescript
// apps/agent/src/types/protocol/protocol.ts
export const StoredConversationSummarySchema = z
  .object({
    sessionId: z.string(),
    title: z.string(),
    updatedAt: z.number(), // Unix timestamp (ms) — used for TTL guard
    messageCount: z.number(), // 0 = optimistic (not yet on disk)
    workspacePath: z.string().optional(),
    worktreePath: z.string().optional(),
  })
  .strict();
```

### ChatStore remapSession (Atomic)

```typescript
// apps/agent/src/stores/chat/chat-store.ts:350-378
remapSession: (oldId: string, newId: string): void => {
  set((draft) => {
    // Move session data from old key to new key
    if (draft.sessions[oldId]) {
      draft.sessions[newId] = draft.sessions[oldId];
      Reflect.deleteProperty(draft.sessions, oldId);
    }
    // Track old ID as remapped (stale ID filter)
    draft.remappedOrbitIds[oldId] = true;
    // ONLY update activeSessionId if THIS session is active
    if (draft.activeSessionId === oldId) {
      draft.activeSessionId = newId;
    }
    // Migrate loadedSessions
    if (draft.loadedSessions[oldId] !== undefined) {
      draft.loadedSessions[newId] = draft.loadedSessions[oldId];
      Reflect.deleteProperty(draft.loadedSessions, oldId);
    }
    // Update LRU order
    const lruIdx = draft.lruOrder.indexOf(oldId);
    if (lruIdx >= 0) {
      draft.lruOrder[lruIdx] = newId;
    }
  });
},
```

---

## Files Reference

### Core Files

| File                                                   | Lines | Purpose                                                       |
| ------------------------------------------------------ | ----- | ------------------------------------------------------------- |
| `apps/agent/src/stores/chat/chat-store.ts`             | 503   | Zustand store: session-keyed state, LRU, selectors            |
| `apps/agent/src/services/chat/chat-message-service.ts` | 1398  | Singleton event dispatcher, RAF batchers, checkpoint debounce |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`       | 452   | Thin reader hook, 7 effects, compat wrappers                  |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`   | 553   | handleSend, handleStop, handleRewind, permissions             |

### Supporting Files

| File                                                           | Purpose                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts` | Rewind flow (Steps 1-5), conversation CRUD                |
| `apps/agent/src/stores/agent/checkpoint-store.ts`              | File checkpoints, message ID reconciliation               |
| `apps/agent/src/stores/ui/ui-store.ts`                         | Sidebar list, optimistic preservation, remapConversation  |
| `apps/agent/src/stores/agent/tool-store.ts`                    | Tool execution, token tracking, session usage             |
| `agent-bridge/src/agent/session/session-manager.ts`            | forkSessionAt (non-destructive), createSession, JSONL I/O |
| `agent-bridge/src/agent/core/agent.ts`                         | shouldEnableReplay, \_createOptions                       |

### Deleted Files (Historical)

| File                                           | Replaced By        |
| ---------------------------------------------- | ------------------ |
| `apps/agent/src/hooks/chat/message-handler.ts` | ChatMessageService |
| `apps/agent/src/hooks/chat/message-state.ts`   | ChatStore          |
| `apps/agent/src/hooks/chat/session-state.ts`   | ChatStore          |
