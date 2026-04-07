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

```typescript
remapSession: (oldId: string, newId: string) => {
  set((draft) => {
    if (draft.sessions[oldId]) {
      draft.sessions[newId] = draft.sessions[oldId];
      delete draft.sessions[oldId];
    }
    if (draft.activeSessionId === oldId) {
      draft.activeSessionId = newId;
    }
  });
},
```

### Step 1.5: Eviction policy (separate from keep-alive pool)

**Audit finding**: Keep-alive pool eviction is a view concern. ChatStore uses its own LRU with different rules (pins active session, protects active agents, clears heavy payloads while keeping the key).

ToolStore eviction follows ChatStore's pattern, NOT the keep-alive pool:

```typescript
const MAX_TOOL_SESSIONS = 20;  // Higher than keep-alive pool (10)

// Called from ChatStore's eviction hook or on explicit session delete
evictSession: (sessionId: string) => {
  set((draft) => {
    if (sessionId === draft.activeSessionId) return; // Never evict active
    delete draft.sessions[sessionId];
  });
},
```

- Sessions survive keep-alive pool eviction (sidebar revisit still finds tools)
- Sessions are evicted when ChatStore evicts them or on explicit conversation delete
- `clearSessionTools(sessionId)` at `use-sidebar-actions.ts:396` triggers eviction on delete

### Step 1.6: Delete the hook-level sync

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

**Temp-ID → SDK-ID remap**: `remapSession(oldId, newId)` moves the session bucket key. If `activeSessionId === oldId`, it updates to `newId`. No data loss.

**Rewind/fork inheriting tools**: Rewind at `chat-actions.ts:441` reads `sessions[sessionId].completedTools` for the current session. Fork creates a new session bucket via `remapSession`. Tools from the old session are available under the new key.

**Background file changes**: After Phase 2, `addFileChange(sessionId, change)` routes to the correct session bucket. Background streaming for session B while viewing A writes to `sessions["B"]` — no conflict.

**Session aging out of keep-alive but revisited later**: ToolStore keeps `sessions[id]` alive independently of the keep-alive pool (MAX_TOOL_SESSIONS = 20 > MAX_ALIVE_INSTANCES = 10). Sidebar click finds tools already in the store. Only evicted when ChatStore evicts or conversation is deleted.

**Persisted tool data growth**: ToolStore eviction mirrors ChatStore's LRU — oldest accessed sessions evicted beyond MAX_TOOL_SESSIONS. Active session and sessions with running agents are pinned.

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
