# ChatStore Session Lifecycle & Sidebar Synchronization

> **Last Updated:** February 12, 2026
> **Branch:** `fix/feedback`
> **Status:** Production fix — Three bugs resolved across UIStore, ChatStore, and ChatMessageService

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [The Dual-ID Problem](#the-dual-id-problem)
4. [Session Lifecycle Timeline](#session-lifecycle-timeline)
5. [Bug #1: Welcome Page Stuck on New Chat](#bug-1-welcome-page-stuck-on-new-chat)
6. [Bug #2: Sidebar Entry Disappears During Streaming](#bug-2-sidebar-entry-disappears-during-streaming)
7. [Bug #3: Stale Ghost Entry Appears at Top of Sidebar](#bug-3-stale-ghost-entry-appears-at-top-of-sidebar)
8. [Files Modified](#files-modified)
9. [Store Relationships & Data Flow](#store-relationships--data-flow)
10. [Key Actions & Their Responsibilities](#key-actions--their-responsibilities)
11. [Race Conditions & Timing Windows](#race-conditions--timing-windows)
12. [Debugging Guide](#debugging-guide)
13. [Gotchas & Footguns](#gotchas--footguns)
14. [Test Scenarios](#test-scenarios)

---

## Executive Summary

Three interconnected bugs were caused by the interaction between **two stores** (ChatStore and UIStore) and the **session remap** flow where frontend-generated UUIDs are replaced by SDK-generated session IDs.

| Bug | Symptom                                   | Root Cause                                                           | Fix Location                  |
| --- | ----------------------------------------- | -------------------------------------------------------------------- | ----------------------------- |
| #1  | New chat message stuck on welcome page    | `setConversations` full array replacement wiped optimistic entries   | `ui-store.ts:347`             |
| #2  | Sidebar entry disappears during streaming | `removeConversation(frontendId)` deleted entry without adding SDK ID | `chat-message-service.ts:354` |
| #3  | Stale conversation appears at position 0  | Optimistic entries with `messageCount: 0` preserved forever          | `ui-store.ts:360`             |

---

## Architecture Overview

### Two Sources of Truth

The system has **two separate representations** of conversations:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ChatStore (Zustand)                                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  sessions: Record<string, ChatSessionData>                     │  │
│  │    - messages: ChatMessage[]                                   │  │
│  │    - isAgentRunning: boolean                                   │  │
│  │    - isStopPending: boolean                                    │  │
│  │  activeSessionId: string | null  (persisted to localStorage)   │  │
│  │  loadedSessions: Record<string, true>                          │  │
│  │  remappedOrbitIds: Record<string, true>                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  Purpose: In-memory message data, streaming state, active session    │
│  File: apps/agent/src/stores/chat/chat-store.ts                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  UIStore (Zustand + persist)                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  conversations: ConversationSummary[]                          │  │
│  │    - sessionId: string                                         │  │
│  │    - title: string                                             │  │
│  │    - updatedAt: number                                         │  │
│  │    - messageCount: number                                      │  │
│  │    - workspacePath?: string                                    │  │
│  │    - worktreePath?: string                                     │  │
│  │  activeConversationId: string | null                           │  │
│  │  activeConversationTitle: string | null                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  Purpose: Sidebar display list, conversation metadata                │
│  File: apps/agent/src/stores/ui/ui-store.ts                          │
└──────────────────────────────────────────────────────────────────────┘
```

**Critical insight:** These two stores are NOT automatically synchronized. ChatStore knows about session data (messages, running state). UIStore knows about the sidebar list (titles, message counts, ordering). When a session is created or remapped, BOTH stores must be updated in the correct order.

### The Orchestrator: ChatMessageService

`ChatMessageService` is a **module-level singleton** (not a React component) that receives all backend events via a window listener and dispatches updates to both stores.

```
File: apps/agent/src/services/chat/chat-message-service.ts

Backend Events → ChatMessageService → ChatStore (session data)
                                    → UIStore (sidebar list)
                                    → ToolStore (token tracking)
                                    → CheckpointStore (rewind data)
                                    → FileStore (file tree per session)
```

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

The remap happens in `handleSystemInit` (chat-message-service.ts:306-366). It must update:

| Store               | Action                                   | Line |
| ------------------- | ---------------------------------------- | ---- |
| ChatStore           | `remapSession(frontendId, sdkId)`        | 327  |
| CreatedSessions set | `remapCreatedSession(frontendId, sdkId)` | 330  |
| ToolStore           | `remapSession(frontendId, sdkId)`        | 333  |
| CheckpointStore     | `remapSession(frontendId, sdkId)`        | 334  |
| MessageBufferStore  | `markLoadPending(sdkId)`                 | 349  |
| UIStore             | `remapConversation(frontendId, sdkId)`   | 354  |

---

## Session Lifecycle Timeline

This is the complete timeline for creating a new conversation and sending the first message.

### Phase 1: User Clicks "New Session"

```
User clicks "+" button
  ↓
useSidebarActions.handleStartConversation()
  ↓
postMessage({ type: 'conversation:create', uuid, title: 'Untitled' })
  ↓
Backend creates JSONL file, responds with conversation:created
  ↓
ChatMessageService.handleConversationCreated(message)
  │
  ├── ChatStore.getOrCreateSession(sid)           // Create session data
  ├── ChatStore.setMessages(sid, [])               // Empty messages
  ├── ChatStore.setActiveSession(sid)              // Set as active
  ├── ChatStore.markSessionLoaded(sid)             // Prevent duplicate load
  ├── ChatStore.bumpConversationLoadEpoch()         // Invalidate stale loads
  ├── ChatStore.setState({ lastCreatedSessionId })  // For Effect 4
  ├── UIStore.addConversation({                    // Add to sidebar
  │     sessionId: sid,
  │     title: 'Untitled',
  │     updatedAt: Date.now(),
  │     messageCount: 0,                           // ← Optimistic marker
  │   })
  └── UIStore.setActiveConversation(sid, title)    // Highlight in sidebar
```

**Key:** `messageCount: 0` marks this as an optimistic entry. It's in the sidebar before any JSONL with messages exists on disk.

### Phase 2: User Types and Sends Message

```
User types "hello love" and presses Enter
  ↓
chat-actions.ts createChatActions().handleSend(text)
  │
  ├── Reads ChatStore.activeSessionId, sessions[sid], messages
  ├── Checks conversationExists:
  │     session !== undefined (ChatStore — primary authority)
  │     OR conversations.some(c => c.sessionId === sid) (UIStore — fallback)
  │
  ├── If conversationExists AND messages.length === 0:
  │     → "Direct path": updates title, builds message, sends message:send
  │     → UIStore.updateConversationTitle(sid, "hello love")
  │     → ChatStore.addMessage(sid, userMessage)
  │     → ChatStore.setAgentRunning(sid, true)
  │     → postMessage({ type: 'message:send', ... })
  │
  └── If !conversationExists:
        → "Pending path": stores in pendingMessage, creates conversation
        → ChatStore.setPendingMessage({ text })
        → postMessage({ type: 'conversation:create', ... })
        → Effect 4 in use-chat-messages.ts sends the message when
          lastCreatedSessionId updates
```

### Phase 3: System Init (Session Remap)

```
~50-200ms after message:send
  ↓
Backend fires system:init with sdk_session_id
  ↓
ChatMessageService.handleSystemInit(message)
  │
  ├── Determines frontendSessionId (message.session_id or activeSessionId)
  ├── ChatStore.remapSession(frontendId, sdkId)       // Move session data
  ├── remapCreatedSession(frontendId, sdkId)           // Track created sessions
  ├── ToolStore.remapSession(frontendId, sdkId)        // Migrate token data
  ├── CheckpointStore.remapSession(frontendId, sdkId)  // Migrate checkpoints
  ├── MessageBufferStore.markLoadPending(sdkId)        // Prevent duplicate load
  ├── UIStore.remapConversation(frontendId, sdkId)     // ← KEY FIX: swap sidebar ID
  │     Swaps sessionId in-place, updates activeConversationId,
  │     migrates sessionWorktreeMap entry
  │
  └── if isStillActive:
        ToolStore.switchSession(sdkId)
```

### Phase 4: Streaming & Completion

```
Backend sends agent:chunk events (streaming)
  ↓
ChatMessageService.handleAgentChunk()
  → Appends content to ChatStore session messages
  → Sidebar entry stays visible (remapped to SDK ID)

Backend sends agent:complete
  ↓
ChatMessageService.handleAgentComplete()
  → Sets isAgentRunning = false
  → Triggers conversation:list refresh
  → UIStore.setConversations() merges backend list
    → Remapped entry has SDK UUID → matches incoming, gets replaced
    → Correct position in time-sorted list
```

### Phase 5: Conversation List Refresh

```
Effect 2 in use-chat-messages.ts fires on sessionId change
  ↓
postMessage({ type: 'conversation:list' })
  ↓
Backend scans JSONL files on disk, returns list
  ↓
ChatMessageService.handleConversationList()
  ↓
UIStore.setConversations(incomingList)
  │
  ├── Build incomingIds Set (all session IDs from backend)
  ├── Filter optimistic entries from current state:
  │     messageCount === 0
  │     AND sessionId NOT in incomingIds
  │     AND updatedAt within last 60 seconds (TTL guard)
  ├── Merge: [...optimistic, ...incoming]
  │
  └── Result: optimistic entries prepended, backend entries follow
```

---

## Bug #1: Welcome Page Stuck on New Chat

### Symptom

User clicks "New Session" → types a message → hits Enter → UI stays on the welcome page (centered input) instead of transitioning to the chat view with the message visible. Backend chunks stream in the background but the UI shows the empty state.

### Root Cause

`ChatContent.tsx:48` determines the view:

```typescript
const isEmptyState = messages.length === 0 && !isLoadingConversation;
```

The `messages` array was empty because `handleSend` took the **wrong code path**. Here's why:

1. `handleConversationCreated` adds `{sessionId: frontendUUID, messageCount: 0}` to UIStore sidebar
2. Effect 2 fires `conversation:list` because `sessionId` changed
3. Backend response arrives → `setConversations` **replaced the entire array**
4. The backend list doesn't include the new conversation (JSONL has 0 messages on disk yet)
5. The optimistic sidebar entry is **wiped**
6. When user sends message, `handleSend` checks `conversationExists`:
   - ChatStore `session` was `undefined` (stale read or not yet created)
   - UIStore `conversations.some()` returns `false` (entry was wiped)
7. `handleSend` takes the "pending message" path → creates ANOTHER session
8. The message ends up in the wrong session

### Fix Applied

**File: `apps/agent/src/stores/ui/ui-store.ts` (line 347-371)**

Changed `setConversations` from full replacement to **merge with optimistic preservation**:

```typescript
setConversations: (conversations: ConversationSummary[]): void => {
  set((state) => {
    const OPTIMISTIC_TTL_MS = 60_000;
    const now = Date.now();
    const incomingIds = new Set(conversations.map((c) => c.sessionId));
    const optimistic = state.conversations.filter(
      (c) =>
        c.messageCount === 0 &&
        !incomingIds.has(c.sessionId) &&
        now - c.updatedAt < OPTIMISTIC_TTL_MS
    );
    state.conversations = [...optimistic, ...conversations];
  });
},
```

**File: `apps/agent/src/hooks/chat/handlers/chat-actions.ts` (line 96-103)**

Changed `conversationExists` to use ChatStore as **primary authority**:

```typescript
const conversationExists =
  sessionId !== '' &&
  (session !== undefined || conversations.some((c) => c.sessionId === sessionId));
```

Before this fix, it only checked `conversations.some()` (UIStore), which was stale after the wipe.

---

## Bug #2: Sidebar Entry Disappears During Streaming

### Symptom

User sends message → sidebar shows the conversation → streaming starts → sidebar entry **vanishes** → streaming completes → entry **reappears**.

### Root Cause

In `handleSystemInit` (the session remap handler), the old code did:

```typescript
// OLD CODE (removed)
useUIStore.getState().setActiveConversation(sdkSessionId, null);
// ...
useUIStore.getState().removeConversation(frontendSessionId);
```

This **removed** the sidebar entry for the frontend UUID but never **added** one for the SDK UUID. The `setActiveConversation` only sets `activeConversationId` and `activeConversationTitle` — it does NOT add an entry to the `conversations[]` array. So:

1. `removeConversation('dd43566e...')` → entry gone from sidebar
2. No `addConversation('18173e82...')` → no entry in sidebar
3. Sidebar shows nothing for this session during entire streaming phase
4. After `agent:complete` → `conversation:list` refreshes → backend now has JSONL → entry reappears

### Fix Applied

**File: `apps/agent/src/stores/ui/ui-store.ts` (line 399-418)**

Added new `remapConversation` action that swaps the sessionId **in-place**:

```typescript
remapConversation: (oldSessionId: string, newSessionId: string): void => {
  set((state) => {
    const conversation = state.conversations.find(
      (c) => c.sessionId === oldSessionId
    );
    if (conversation) {
      conversation.sessionId = newSessionId;
      conversation.updatedAt = Date.now();
    }
    if (state.activeConversationId === oldSessionId) {
      state.activeConversationId = newSessionId;
    }
    const worktreePath = state.sessionWorktreeMap.get(oldSessionId);
    if (worktreePath !== undefined) {
      state.sessionWorktreeMap.delete(oldSessionId);
      state.sessionWorktreeMap.set(newSessionId, worktreePath);
    }
  });
},
```

**File: `apps/agent/src/services/chat/chat-message-service.ts` (line 351-362)**

Replaced `removeConversation` + `setActiveConversation` with single `remapConversation`:

```typescript
// Remap the sidebar entry in-place: swap sessionId from frontendId → sdkId.
useUIStore.getState().remapConversation(frontendSessionId, sdkSessionId);

const isStillActive = useChatStore.getState().activeSessionId === sdkSessionId;
if (isStillActive) {
  useToolStore.getState().switchSession(sdkSessionId);
}
```

Note: `setActiveConversation(sdkSessionId, null)` was also removed because:

- `remapConversation` already updates `activeConversationId`
- The `null` title parameter was **clearing** the title that was already correctly set by `updateConversationTitle`

---

## Bug #3: Stale Ghost Entry Appears at Top of Sidebar

### Symptom

After Bug #1 fix, stale conversations from hours ago (e.g., "whats up ??" from 2h ago) would appear at **position 0** in the sidebar, above the current conversation and all time-sorted backend entries.

### Root Cause

The optimistic preservation in `setConversations` had **no expiry**:

```typescript
// OLD: preserved ALL entries with messageCount === 0 forever
const optimistic = state.conversations.filter(
  (c) => c.messageCount === 0 && !incomingIds.has(c.sessionId)
);
state.conversations = [...optimistic, ...conversations];
```

A conversation from a previous session (hours ago) could still have `messageCount: 0` if:

- It was created but never had a message persisted to disk
- Its frontend UUID was remapped but the old entry wasn't properly cleaned up
- The backend `conversation:list` uses the SDK UUID (which doesn't match the stale frontend UUID)

Since optimistic entries are **prepended** (`[...optimistic, ...conversations]`), they always appeared at position 0, before the time-sorted backend list.

### Fix Applied

**File: `apps/agent/src/stores/ui/ui-store.ts` (line 356-368)**

Added a 60-second TTL to the optimistic filter:

```typescript
const OPTIMISTIC_TTL_MS = 60_000;
const now = Date.now();
const optimistic = state.conversations.filter(
  (c) =>
    c.messageCount === 0 && !incomingIds.has(c.sessionId) && now - c.updatedAt < OPTIMISTIC_TTL_MS // ← TTL guard
);
```

This ensures:

- Fresh optimistic entries (just created, SDK hasn't written JSONL yet) are preserved
- Stale entries from minutes/hours ago are dropped during the next `conversation:list` merge
- The `updatedAt` field from `handleConversationCreated` (set to `Date.now()`) provides the timestamp

---

## Files Modified

### Changed Files

| File                                                   | Lines Changed         | What Changed                                                                             |
| ------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------- |
| `apps/agent/src/stores/ui/ui-store.ts`                 | 148, 347-371, 399-418 | Added `remapConversation` to interface + implementation; TTL guard in `setConversations` |
| `apps/agent/src/services/chat/chat-message-service.ts` | 351-362               | Replaced `removeConversation` + `setActiveConversation` with `remapConversation`         |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`   | 96-103                | `conversationExists` uses ChatStore session as primary authority                         |

### Key Files (Read-Only Reference)

| File                                                                            | Purpose                  | Relevant Lines                                                                                                              |
| ------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/stores/chat/chat-store.ts`                                      | Session data store       | `remapSession` (346-375), `setActiveSession`, `getOrCreateSession`                                                          |
| `apps/agent/src/services/chat/chat-message-service.ts`                          | Event dispatcher         | `handleSystemInit` (306-366), `handleConversationCreated` (651-693), `handleConversationList` (695-707)                     |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`                                | React hook with effects  | Effect 2 (181-190): `conversation:list` trigger; Effect 3 (196-218): session load; Effect 4 (228-337): pending message send |
| `apps/agent/src/components/layout/chat-area/ChatContent.tsx`                    | View rendering           | `isEmptyState` (line 48): `messages.length === 0 && !isLoadingConversation`                                                 |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`                            | Send/stop/rewind actions | `handleSend` (67-200+): two code paths (direct vs pending)                                                                  |
| `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` | Sidebar handlers         | `handleStartConversation` (202-228), `handleLoadConversation` (230-271)                                                     |
| `apps/agent/src/types/protocol/protocol.ts`                                     | Type definitions         | `StoredConversationSummarySchema` (126-135): sessionId, title, updatedAt, messageCount                                      |

---

## Store Relationships & Data Flow

### Creation Flow

```
conversation:create (postMessage)
         │
         ▼
conversation:created (backend response)
         │
         ▼
ChatMessageService.handleConversationCreated
         │
         ├─► ChatStore.getOrCreateSession(sid)     sessions[sid] = { messages: [], ... }
         ├─► ChatStore.setActiveSession(sid)        activeSessionId = sid
         ├─► UIStore.addConversation(...)           conversations = [newEntry, ...rest]
         └─► UIStore.setActiveConversation(sid)     activeConversationId = sid
```

### Remap Flow

```
system:init (backend event, ~50-200ms after message:send)
         │
         ▼
ChatMessageService.handleSystemInit
         │
         ├─► ChatStore.remapSession(old, new)       sessions[new] = sessions[old]; delete old
         ├─► UIStore.remapConversation(old, new)     conversations[i].sessionId = new
         ├─► ToolStore.remapSession(old, new)        token data migrated
         └─► CheckpointStore.remapSession(old, new)  checkpoint data migrated
```

### Refresh Flow

```
conversation:list (backend event, triggered by Effect 2 or agent:complete)
         │
         ▼
ChatMessageService.handleConversationList
         │
         └─► UIStore.setConversations(backendList)
               │
               ├── Filter optimistic: messageCount===0 AND not in backend AND <60s old
               ├── Merge: [...optimistic, ...backendList]
               └── Result: sidebar reflects disk state + fresh optimistic entries
```

---

## Key Actions & Their Responsibilities

### UIStore Actions (Conversation Management)

| Action                                | What It Does                                                                         | When Used                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `addConversation(summary)`            | Prepends to `conversations[]` with duplicate check                                   | `handleConversationCreated` — optimistic sidebar add |
| `removeConversation(sid)`             | Filters out from array, clears active if match, cleans up worktree map + checkpoints | Manual delete, `handleConversationDeleted`           |
| `remapConversation(oldId, newId)`     | Swaps sessionId in-place, updates activeConversationId, migrates worktree map        | `handleSystemInit` — session remap                   |
| `setConversations(list)`              | Full merge with optimistic preservation (TTL-guarded)                                | `handleConversationList` — backend refresh           |
| `updateConversationTitle(sid, title)` | Updates title in array + activeConversationTitle                                     | `handleSend` first message, rename dialog            |
| `setActiveConversation(id, title)`    | Sets `activeConversationId` + `activeConversationTitle` only (does NOT add to array) | Navigation, session creation                         |

### ChatStore Actions (Session Data)

| Action                          | What It Does                                                                          | When Used                             |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| `getOrCreateSession(sid)`       | Creates session entry if missing, returns it                                          | Conversation creation, chunk handling |
| `setActiveSession(sid)`         | Sets `activeSessionId`, pins in LRU                                                   | Navigation, creation                  |
| `remapSession(oldId, newId)`    | Moves session data atomically, updates active if match, migrates LRU + loadedSessions | `handleSystemInit`                    |
| `setMessages(sid, msgs)`        | Replaces messages array for session                                                   | Conversation load, creation           |
| `addMessage(sid, msg)`          | Appends message to session                                                            | `handleSend`, `handleAgentChunk`      |
| `setAgentRunning(sid, running)` | Sets streaming state                                                                  | `handleSend`, `handleAgentComplete`   |
| `markSessionLoaded(sid)`        | Prevents duplicate conversation:load                                                  | Effect 3, `handleConversationCreated` |
| `isSessionLoaded(sid)`          | Check if session was already loaded                                                   | Effect 3 guard                        |

---

## Race Conditions & Timing Windows

### Race 1: conversation:list vs Optimistic Entry

```
Time ──────────────────────────────────────────────────►

T0: handleConversationCreated
    → addConversation({sid: "abc", messageCount: 0})

T1: Effect 2 fires (sessionId changed)
    → postMessage({ type: 'conversation:list' })

T2: Backend scans disk — "abc" JSONL has 0 messages or doesn't exist yet

T3: conversation:list response arrives
    → setConversations(backendList)  // backendList doesn't include "abc"

    WITHOUT FIX: conversations = backendList  →  "abc" entry GONE
    WITH FIX:    conversations = [abc_optimistic, ...backendList]

T4: User sends message → handleSend checks conversationExists
    WITHOUT FIX: false → wrong code path → duplicate session
    WITH FIX:    true (ChatStore session exists OR UIStore has entry)
```

### Race 2: Session Remap vs Sidebar Display

```
Time ──────────────────────────────────────────────────►

T0: handleConversationCreated({sid: "frontend-uuid"})
    → Sidebar shows "frontend-uuid" entry

T1: User sends message, title updated to "hello love"

T2: system:init arrives (sdk_session_id: "sdk-uuid")
    → handleSystemInit fires

    WITHOUT FIX:
      removeConversation("frontend-uuid")  →  Sidebar entry GONE
      setActiveConversation("sdk-uuid", null)  →  Only sets pointer, no array entry
      → Sidebar empty during entire streaming phase

    WITH FIX:
      remapConversation("frontend-uuid", "sdk-uuid")
      → Entry stays visible, sessionId swapped in-place
      → activeConversationId updated atomically

T3-T99: Streaming (agent:chunk events)
    WITHOUT FIX: No sidebar entry visible
    WITH FIX:    Entry visible with correct title

T100: agent:complete → conversation:list refreshes
    → Backend list includes "sdk-uuid" (JSONL now on disk)
    → setConversations replaces optimistic with backend version
```

### Race 3: Stale Optimistic Entry Resurrection

```
Time ──────────────────────────────────────────────────►

T0 (2 hours ago): Session "old-uuid" created, messageCount: 0
T1 (2 hours ago): Remapped to "old-sdk-uuid", but old entry not cleaned up
T2 (2 hours ago): setConversations → old entry preserved (messageCount: 0, not in incoming)

... 2 hours pass ...

T3 (now): New conversation:list arrives
    WITHOUT TTL: "old-uuid" still has messageCount: 0, not in incoming
                 → preserved and PREPENDED at position 0
    WITH TTL:    updatedAt is 2 hours old, exceeds 60s TTL
                 → DROPPED from optimistic list
```

---

## Debugging Guide

### How to Identify Which Bug is Occurring

| Symptom                                 | Bug # | What to Check                                                                                                         |
| --------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| Welcome page won't transition to chat   | #1    | `messages.length` in ChatStore for active session. If 0, check `handleSend` code path (pending vs direct).            |
| Sidebar entry vanishes during streaming | #2    | Check if `remapConversation` is being called. Look for `removeConversation` calls that should be `remapConversation`. |
| Wrong conversation at top of sidebar    | #3    | Check `updatedAt` of the stale entry. If old, TTL should catch it. If recent, might be a different issue.             |
| Duplicate sidebar entries               | All   | Check if both frontend UUID and SDK UUID entries exist. `remapConversation` should prevent this.                      |

### Console Log Markers

Key log lines to look for in DevTools:

```
[ChatMessageService] handleConversationCreated { sid: "..." }
  → Sidebar entry added

[ChatMessageService] Remapped created session { oldId: "...", newId: "..." }
  → Session remap happened

[ChatStore] remapSession { oldId: "...", newId: "..." }
  → ChatStore data migrated

[UIStore] setConversations { incoming: N, optimistic: M }
  → Conversation list refreshed (add logging if needed)
```

### Adding Diagnostic Logging

If bugs recur, add temporary logging to `setConversations`:

```typescript
setConversations: (conversations: ConversationSummary[]): void => {
  set((state) => {
    const OPTIMISTIC_TTL_MS = 60_000;
    const now = Date.now();
    const incomingIds = new Set(conversations.map((c) => c.sessionId));
    const optimistic = state.conversations.filter(
      (c) =>
        c.messageCount === 0 &&
        !incomingIds.has(c.sessionId) &&
        now - c.updatedAt < OPTIMISTIC_TTL_MS
    );
    // DIAGNOSTIC: uncomment to trace merge behavior
    // logger.warn('setConversations merge', {
    //   incoming: conversations.length,
    //   optimistic: optimistic.length,
    //   optimisticIds: optimistic.map(c => c.sessionId.slice(0, 8)),
    //   droppedStale: state.conversations.filter(
    //     c => c.messageCount === 0 && !incomingIds.has(c.sessionId) && now - c.updatedAt >= OPTIMISTIC_TTL_MS
    //   ).length,
    // });
    state.conversations = [...optimistic, ...conversations];
  });
},
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

Any conversation with `messageCount: 0` is treated as optimistic by `setConversations`. If you create entries with `messageCount: 0` for other purposes, they'll be subject to the optimistic preservation logic.

### 3. Optimistic Entries Are Prepended (Position 0)

```typescript
state.conversations = [...optimistic, ...conversations];
```

This means optimistic entries always appear ABOVE the time-sorted backend list. This is intentional (new conversation should be at top) but can look wrong for stale entries — hence the TTL guard.

### 4. `removeConversation` Clears Checkpoints

```typescript
removeConversation: (sessionId: string): void => {
  // ... filters array ...
  useCheckpointStore.getState().clearSessionCheckpoints(sessionId);
};
```

This is correct for user-initiated deletes but was WRONG for remap (Bug #2). `remapConversation` does NOT clear checkpoints — they're handled separately by `CheckpointStore.remapSession`.

### 5. Effect 2 Triggers on `sessionId` Change

```typescript
// use-chat-messages.ts:181-190
useEffect(() => {
  if (sessionId || workspacePath) {
    postMessage({ type: 'conversation:list', ... });
  }
}, [sessionId, workspacePath, activeWorktreePath, postMessage]);
```

When `remapSession` changes `activeSessionId` in ChatStore, this effect fires a new `conversation:list`. The response arrives asynchronously and calls `setConversations`. If the remap isn't complete when the response arrives, the optimistic preservation logic handles it.

### 6. ChatStore `session` vs UIStore `conversations`

```typescript
// ChatStore: session data (messages, running state)
const session = chatStore.sessions[sessionId]; // Can be undefined

// UIStore: sidebar list (titles, message counts)
const exists = conversations.some((c) => c.sessionId === sid); // Can be stale
```

`handleSend` uses ChatStore as **primary authority** because:

- ChatStore is updated synchronously by `handleConversationCreated`
- UIStore can be wiped by `setConversations` (conversation:list response)
- ChatStore's `sessions` Record is never replaced wholesale

### 7. Immer Mutation in `remapConversation`

```typescript
const conversation = state.conversations.find((c) => c.sessionId === oldSessionId);
if (conversation) {
  conversation.sessionId = newSessionId; // Direct mutation OK inside immer set()
  conversation.updatedAt = Date.now();
}
```

This works because we're inside `set((state) => {...})` with immer. The `find()` returns a draft proxy, and mutations are tracked. However, remember the general gotcha: mutating NESTED properties on objects in Maps or top-level state can be silently dropped. Always replace entire objects when in doubt.

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
4. **Verify:** `remapConversation` updates the entry for A, doesn't hijack focus to A

---

## Appendix: ConversationSummary Schema

```typescript
// apps/agent/src/types/protocol/protocol.ts:126-135
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

## Appendix: ChatStore Session Remap (Atomic)

```typescript
// apps/agent/src/stores/chat/chat-store.ts:346-375
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
