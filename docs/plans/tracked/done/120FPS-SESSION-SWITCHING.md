# Plan: 120fps Session Switching — Production Architecture (v5)

## Context

Session switching drops from 120fps to ~20fps. The root cause is architectural: ToolStore uses flat storage with a serialize/deserialize cycle on every switch. `toolStore.switchSession()` costs **5-15ms** cloning 500+ objects inside an Immer `produce()` call. FileStore's `switchSession()` adds **2-8ms**.

**Corrected impact** (from v4 audit): Per-session selectors (`useSessionCompletedTools`, `useSessionActiveTools`) already exist at `chat-messages.tsx:486` and `todo-bar.tsx:164`. These prevent cascade re-renders across keep-alive instances. The primary bottleneck is the `switchSession()` clone cost itself, not a cascade.

**Research basis**: 6 parallel agents studied VS Code, Discord, Linear, Slack, React 19.2 Activity API, Zustand structural sharing, Immer internals, and WKWebView compositor behavior.

**The universal pattern**: Pool instances, swap data not DOM, make the switch near-zero-cost. The fix is a data model change, not scheduling.

**Audit history**: v1-v3 tried deferral/workers (rejected — hook at `use-chat-messages.ts:504` forces sync). v4 proposed session-keyed stores (approved architecturally, needed completeness fixes). This v5 addresses all v4 audit findings.

---

## The Architecture Change

**Principle**: The store is a database. The active session is a query parameter.

ChatStore already implements this: `sessions: Record<string, ChatSessionData>` + `activeSessionId`. ToolStore and FileStore adopt the same pattern.

```
Current ToolStore:                          Target ToolStore:
  activeTools: { flat }                       sessions: {
  completedTools: [ flat ]                      "A": { activeTools, completedTools, usage, ... },
  sessionUsage: { flat }                        "B": { activeTools, completedTools, usage, ... },
  processedMessageIds: Set (flat)             }
  sessionCache: { serialized snapshots }      activeSessionId: "A"

  switchSession(): O(N) clone                 switchSession(): O(1) pointer swap
```

---

## Phase 1: ToolStore Session-Keyed Migration

**Impact**: Eliminates 5-15ms `switchSession()`. Simplifies hybrid selectors. Deletes ~200 lines of clone/partition/restore logic.

### Complete migration surface (29 files, verified by exploration)

**Core store** (rewrite):

- `apps/agent/src/stores/agent/tool-store.ts` — new data model, O(1) switch, session-routed writes

**Callers requiring sessionId injection** (5 callsites, highest risk):

- `apps/agent/src/services/chat/chat-message-service.ts` — 16 callsites:
  - Line 665: `remapSession(oldId, newId)` — rename key in `sessions`
  - Line 700, 1511: `switchSession()` — becomes O(1)
  - Line 891: reads `completedTools` for persistence — read from `sessions[sid]`
  - Line 972: hybrid read `currentSessionId === sid ? usage : cache[sid].usage` — simplifies to `sessions[sid].usage`
  - Line 1612: `startTool()` — sessionId already optional param, make required
  - Line 1671, 1724: `completeTool()` — currently no sessionId, derives from `activeTools` lookup. After migration: look up tool in `sessions[activeSessionId].activeTools`
  - Line 1778: force-complete orphaned tools — iterate `sessions[sid].activeTools` directly
- `apps/agent/src/hooks/chat/handlers/chat-actions.ts` — 11 callsites:
  - Line 441: **rewind serialization** reads flat `completedTools`. After migration: `sessions[sessionId].completedTools`
  - Line 213: same pattern for tool extraction
- `apps/agent/src/hooks/chat/use-chat-messages.ts` — 9 callsites:
  - Lines 218-258: `restoreSessionUsage()` + `switchSession()` — already pass sessionId
  - Line 264: `restoreToolsForMessage()` — already has session context
  - **Line 504-511: DELETE** — the `useEffect` that calls `switchSession` on `activeSessionId` change
- `apps/agent/src/services/chat/hydrate-conversation-snapshot.ts` — 4 callsites, all already session-aware

**Selectors to simplify** (22 hooks in tool-store.ts):

- `useSessionCompletedTools(sessionId)` — currently hybrid: checks `currentSessionId`, falls back to cache. After: `s.sessions[sessionId]?.completedTools`
- `useSessionActiveTools(sessionId)` — same hybrid → direct read
- `useActiveTools()` — becomes `s.sessions[s.activeSessionId]?.activeTools`
- `useCompletedTools()` — becomes `s.sessions[s.activeSessionId]?.completedTools`
- `useSessionUsage()` — becomes `s.sessions[s.activeSessionId]?.usage`
- Global selectors (`useInputMode`, `useModel`, etc.) — unchanged, not per-session

**Tests** (18 files): Update assertions for session-keyed shape.

### Step 1.1: New data model

```typescript
interface PerSessionToolData {
  activeTools: Record<string, ToolExecution>;
  completedTools: ToolExecution[];
  usage: UsageData;
  processedIds: string[]; // Array, not Set — Sets break Immer structural sharing
  contextWindow: number | null;
  sessionModel: string | null;
  sessionTools: string[] | null;
  sessionMcpServers: SessionMcpServer[] | null;
  metadataState: SessionMetadataState | null;
  toolRevision: number;
}
```

Add `sessions: Record<string, PerSessionToolData>` + `activeSessionId: string | null` to ToolState. Remove top-level `activeTools`, `completedTools`, `sessionUsage`, `processedMessageIds`, `sessionCache`, `currentSessionId`.

### Step 1.2: O(1) switchSession

```typescript
switchSession: (newSessionId: string) => {
  const state = get();
  if (state.activeSessionId === newSessionId) return;
  if (!state.sessions[newSessionId]) {
    set((draft) => {
      draft.sessions[newSessionId] = createEmptySessionToolData();
      draft.activeSessionId = newSessionId;
    });
    return;
  }
  // O(1) pointer swap — bypasses Immer produce() entirely
  set({ activeSessionId: newSessionId });
},
```

### Step 1.3: Session-routed writes

All tool events write to `sessions[sessionId]` at the point of entry. The `sessionId` is already available on most events from the backend.

```typescript
startTool: (sessionId: string, toolId: string, execution: ToolExecution) => {
  set((draft) => {
    draft.sessions[sessionId] ??= createEmptySessionToolData();
    draft.sessions[sessionId].activeTools[toolId] = execution;
    draft.sessions[sessionId].toolRevision += 1;
  });
},

completeTool: (sessionId: string, toolId: string, output, success) => {
  set((draft) => {
    const session = draft.sessions[sessionId];
    if (!session) return;
    const tool = session.activeTools[toolId];
    if (!tool) return;
    delete session.activeTools[toolId];
    session.completedTools.push({ ...tool, output, success });
    session.toolRevision += 1;
  });
},
```

**`completeTool` sessionId**: Currently derived implicitly by scanning `activeTools`. After migration, the caller (`chat-message-service.ts:1724`) must pass the sessionId. The tool's `sessionId` field (already present on `ToolExecution`) provides this.

### Step 1.4: remapSession for SDK session forks

The current `remapSession` at `tool-store.ts:874-908` does three things: (a) moves the `sessionCache` key, (b) updates `currentSessionId`, and (c) **rewrites embedded `tool.sessionId` on every tool** (lines 899-908). This rewrite is necessary because consumers like `todo-bar.tsx:181` filter tools by `tool.sessionId`. After migration, the same three operations apply to session buckets:

```typescript
remapSession: (oldId: string, newId: string) => {
  set((draft) => {
    const bucket = draft.sessions[oldId];
    if (!bucket) return;

    // Rewrite embedded sessionId on all tools in the bucket
    for (const tool of Object.values(bucket.activeTools)) {
      if (tool.sessionId === oldId) tool.sessionId = newId;
    }
    for (const tool of bucket.completedTools) {
      if (tool.sessionId === oldId) tool.sessionId = newId;
    }

    // Move the bucket key
    draft.sessions[newId] = bucket;
    delete draft.sessions[oldId];

    // Update pointer if active
    if (draft.activeSessionId === oldId) {
      draft.activeSessionId = newId;
    }
  });
},
```

### Step 1.5: Eviction policy (separate from keep-alive pool)

**Audit finding**: Keep-alive pool eviction is a view concern. ChatStore uses its own LRU with different rules (pins active session, protects active agents, clears heavy payloads while keeping the key at `chat-store.ts:269`).

ToolStore eviction is triggered by **two concrete events**, not a generic hook:

**Event 1 — Conversation delete** (`use-sidebar-actions.ts:396`): Already calls `clearSessionTools(sessionId)`. After migration this becomes `evictSession(sessionId)`.

**Event 2 — ToolStore self-eviction on bucket growth**: When a new session bucket is created and `Object.keys(sessions).length > MAX_TOOL_SESSIONS`, evict the least-recently-switched session (tracked by an `accessOrder` array, same LRU pattern as `render-cache-store.ts`).

```typescript
const MAX_TOOL_SESSIONS = 20;

// Internal LRU tracking
accessOrder: string[],  // Most recent at end

// Called internally when creating a new session bucket
function touchToolLru(draft: ToolState, sessionId: string): void {
  const idx = draft.accessOrder.indexOf(sessionId);
  if (idx >= 0) draft.accessOrder.splice(idx, 1);
  draft.accessOrder.push(sessionId);

  // Evict oldest if over limit — single pass, bounded by accessOrder length
  if (draft.accessOrder.length > MAX_TOOL_SESSIONS) {
    const candidates = [...draft.accessOrder];
    for (const candidate of candidates) {
      if (draft.accessOrder.length <= MAX_TOOL_SESSIONS) break;
      if (candidate === draft.activeSessionId || isSessionRunning(candidate)) continue;
      const idx = draft.accessOrder.indexOf(candidate);
      if (idx >= 0) draft.accessOrder.splice(idx, 1);
      delete draft.sessions[candidate];
    }
    // If still over limit, all remaining are protected — accept the overflow.
    // They'll be evicted when their agents complete and the next touch triggers LRU.
  }
}

// Check running state from ChatStore — the source of truth for agent activity.
// ToolStore's activeTools is NOT reliable: text-only streaming sessions have
// zero tools but are still running.
function isSessionRunning(sessionId: string): boolean {
  const session = useChatStore.getState().sessions[sessionId];
  return session?.isAgentRunning === true;
}

// Explicit eviction (conversation delete) — always succeeds, even for active session.
// The delete flow in use-sidebar-actions.ts switches to another session BEFORE calling
// this, but if the caller deletes the active session without switching first, we still
// clean up. The next switchSession call will set a new activeSessionId.
evictSession: (sessionId: string) => {
  set((draft) => {
    delete draft.sessions[sessionId];
    const idx = draft.accessOrder.indexOf(sessionId);
    if (idx >= 0) draft.accessOrder.splice(idx, 1);
    if (draft.activeSessionId === sessionId) {
      draft.activeSessionId = null;
    }
  });
},
```

**Guards**: Active session is never evicted. Sessions where `ChatStore.sessions[id].isAgentRunning === true` are skipped — this covers text-only streaming sessions with zero tools. Skipped sessions are moved to the end of the LRU (protected until the agent completes).

**No ChatStore hook needed**: ToolStore manages its own lifecycle. ChatStore's eviction of heavy payloads (clearing messages while keeping the session key) is a separate concern — ToolStore doesn't need to mirror it.

### Step 1.6: Metadata selectors migration

Active-session metadata selectors (`useSessionModel`, `useSessionTools`, `useSessionMcpServers`, `useSessionMetadataState`) currently read from top-level state. After migration they read through the pointer:

```typescript
// Before: useToolStore((s) => s.sessionModel)
// After:
export function useSessionModel(): string | null {
  return useToolStore((s) => s.sessions[s.activeSessionId ?? '']?.sessionModel ?? null);
}
```

Same pattern for `useSessionTools`, `useSessionMcpServers`, `useSessionMetadataState`. Consumers like `context-detail-dialog.tsx:103` don't change — they call the same hook, the hook internals change.

### Step 1.7: Persistence migration

The current `partialize` at `tool-store.ts:1113` persists flat `completedTools` + `currentSessionId`. After migration:

```typescript
partialize: (state) => {
  // Persist only the active session's recent tools (same cap as before)
  const activeSession = state.sessions[state.activeSessionId ?? ''];
  const toolsToProcess = activeSession?.completedTools ?? [];
  const capped = toolsToProcess.length > MAX_PERSISTED_TOOLS
    ? toolsToProcess.slice(-MAX_PERSISTED_TOOLS)
    : toolsToProcess;
  return {
    completedTools: capped.map(sanitizeToolForPersistence),
    activeSessionId: state.activeSessionId,
  };
},

merge: (persistedState, currentState) => {
  // Validate + restore into session bucket
  const persisted = persistedState as Partial<{ completedTools: unknown[]; activeSessionId: string }>;
  const validated = validatePersistedTools(persisted.completedTools);
  const sessionId = typeof persisted.activeSessionId === 'string' ? persisted.activeSessionId : null;

  // Always restore the pointer — even when no tools were persisted.
  // Without this, consumers like ChatInput and context-detail-dialog read
  // null session data until an explicit switch. The session bucket is created
  // empty if needed — usage/metadata arrive later via system:init.
  if (sessionId) {
    return {
      ...currentState,
      activeSessionId: sessionId,
      sessions: {
        ...currentState.sessions,
        [sessionId]: {
          ...createEmptySessionToolData(),
          ...(validated.length > 0 ? { completedTools: validated } : {}),
        },
      },
    };
  }
  return currentState;
},
```

**What survives app reload**: The active session's most recent tools (capped at `MAX_PERSISTED_TOOLS`). Same as today. Other sessions' tools are restored from the backend on conversation load via `restoreToolsForMessage`.

**STORE_VERSION**: Bump to trigger migration. Old persisted shape (flat `completedTools`) is handled by the `merge` function — tools land in `sessions[persistedSessionId]`.

### Step 1.8: Delete the hook-level sync

Remove `use-chat-messages.ts:504-511`. With session-keyed data, there's nothing to propagate to ToolStore when `activeSessionId` changes.

---

## Phase 2: FileStore Session-Keyed Migration

**Impact**: Eliminates 2-8ms `switchSession()`.

**Audit finding**: `addFileChange(change)` at `file-store.ts:166` has no `sessionId` parameter. The main caller at `chat-message-service.ts:1675` writes with no session context.

**Fix**: Add `sessionId` parameter to `addFileChange`. Route writes to `sessions[sessionId].filesById`. The file tree (`rootPath`, `treeNodes`, `expandedFolders`) stays global (workspace-scoped). Only per-session data moves to session buckets:

```typescript
interface SessionFileData {
  filesById: Record<string, FileChange>;
  pathToId: Record<string, string>;
  selectedFile: string | null;
}
```

**Write API change**:

```typescript
// Before:
addFileChange(change: FileChange): void
// After:
addFileChange(sessionId: string, change: FileChange): void
```

Callers that need updating:

- `chat-message-service.ts:1675` — session ID available from message context
- Any component that calls `addFileChange` directly

---

## Phase 3: Compositor-Only CSS Transitions

**File**: `apps/agent/src/components/layout/chat-area/SessionInstance.tsx`

All instances `position: absolute, inset: 0` at all times. Add `contain: strict` (Safari 15.4+). Cache `findInheritedBackgroundColor` keyed by `isDarkMode`.

```typescript
const BASE_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
  contain: 'strict',
};
```

Must verify Virtuoso scroller computes height from absolute parent. Fallback: keep `position: relative` for shown only.

---

## Phase 4: Guarded alignScrollerToBottom

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

Cheap single-read scroll position check before the 6-DOM-round-trip alignment. Only skip when `restoredSizeCacheRef.current === true` AND scroller is already at bottom.

---

## Phase 5: Warm Hydration Skip

**File**: `apps/agent/src/services/chat/hydrate-conversation-snapshot.ts`

Active-chain fingerprint on session record, updated on every `layoutVersion` bump. Early exit preserves lifecycle calls (`markSessionLoaded`, `bumpConversationLoadEpoch`, `seedConversationDetailCache`).

---

## Phase 6 (Future): React 19.2 Activity API

Track for adoption once Virtuoso compatibility is confirmed. Does NOT replace the verification pipeline.

---

## Implementation Order

| Phase | What                          | Impact                   | Risk   | Effort |
| ----- | ----------------------------- | ------------------------ | ------ | ------ |
| **1** | ToolStore session-keyed       | **5-15ms eliminated**    | Medium | 4-6hr  |
| **2** | FileStore session-keyed       | **2-8ms eliminated**     | Medium | 2-3hr  |
| **3** | Compositor CSS                | **1-3ms eliminated**     | Low    | 1hr    |
| **4** | Guarded alignScrollerToBottom | **1.5-3.5ms eliminated** | Low    | 15min  |
| **5** | Warm hydration skip           | **3-8ms eliminated**     | Medium | 1hr    |

## Expected Results

| Scenario                  | Before  | After Phase 1 | After All |
| ------------------------- | ------- | ------------- | --------- |
| Warm switch (main thread) | 18-42ms | **<8ms**      | **<3ms**  |
| Cold switch (peak frame)  | 30-50ms | **<20ms**     | **<8ms**  |
| FPS during warm switch    | 20-40   | **90-120**    | **120**   |

## Edge Cases

**Temp-ID → SDK-ID remap**: `remapSession(oldId, newId)` moves the bucket key AND rewrites embedded `tool.sessionId` on all tools in the bucket. Consumers like `todo-bar.tsx:181` that filter by `tool.sessionId` continue to work.

**Rewind/fork inheriting tools**: Rewind at `chat-actions.ts:441` reads `sessions[sessionId].completedTools` for the current session. Fork creates a new session bucket via `remapSession`. Tools from the old session are available under the new key with updated embedded IDs.

**Background file changes**: After Phase 2, `addFileChange(sessionId, change)` routes to the correct session bucket. Background streaming for session B while viewing A writes to `sessions["B"]` — no conflict.

**Session aging out of keep-alive but revisited later**: ToolStore keeps `sessions[id]` alive via its own LRU (MAX_TOOL_SESSIONS = 20 > MAX_ALIVE_INSTANCES = 10). Sidebar click finds tools already in the store. Evicted only by LRU overflow or conversation delete.

**Sessions with running agents**: LRU eviction checks `ChatStore.sessions[id].isAgentRunning` (the source of truth for agent activity), NOT `ToolStore.sessions[id].activeTools`. This covers text-only streaming sessions that have zero tools but are actively generating. Skipped sessions move to the end of the LRU and are re-evaluated on the next eviction cycle.

**LRU access order touched on**: session switch (`switchSession`), bucket creation (new session started), and remap (`remapSession`). NOT touched on background writes (tool events from non-active sessions) — background sessions shouldn't climb the LRU just because they're streaming.

**App reload + immediate revisit**: Only the active session's tools survive reload. If the user immediately revisits another session, `restoreToolsForMessage` (called from `hydrateConversationSnapshot`) populates the bucket from persisted conversation data. This is the same behavior as today — no regression.

**Transitional `activeSessionId` fallback in FileStore**: During the gap between Phase 1 (ToolStore) and Phase 2 (FileStore), `addFileChange` callers without `sessionId` use `activeSessionId` as fallback. This is identical to today's implicit routing. The fallback is removed when Phase 2 makes `sessionId` required.

**App reload persistence**: Only the active session's recent completed tools survive reload (same as today, capped at `MAX_PERSISTED_TOOLS`). Other sessions are restored from the backend via `restoreToolsForMessage` on conversation load. STORE_VERSION is bumped to trigger migration from the flat persisted shape.

**Metadata before restore**: On fresh app load, selectors like `useSessionModel()` return `null` until the backend sends `system:init` with the session model. This is the same behavior as today — no regression.

**Partial FileStore migration**: If Phase 2 is delayed, `addFileChange` callers that don't pass `sessionId` fall back to `activeSessionId`. This is the same implicit routing as today. Session-keyed reads work immediately; session-routed writes are an incremental improvement.

## Verification

1. `bun run typecheck && bun run lint` — zero errors
2. `bun run test` — all tests pass (tool-store tests rewritten for session-keyed shape)
3. `bunx tauri dev` — Safari Performance panel:
   - `switchSession` < 1ms in Performance panel
   - No long tasks during session switching
4. Session switch traces: warm `cache-match-instant` < 35ms, no FPS dip
5. Tool correctness: tools display per-session after rapid switching
6. Streaming: background tool events route to correct session buckets
7. Rewind: tools serialize from correct session bucket
8. Remap: `system:init` fork preserves tools under new session ID
9. Eviction: sessions beyond MAX_TOOL_SESSIONS are cleaned up, active session is pinned
10. 50+ rapid switches: zero stale tools in React Profiler
