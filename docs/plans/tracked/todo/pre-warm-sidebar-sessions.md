# Pre-Warm Sidebar Sessions on App Launch

**Status:** TODO
**Priority:** P0
**Dependencies:** TanStack Virtual migration (in progress)
**Revision:** v3 (post-audit rework)

## Problem

`PrefetchSidebar` loads data + stale IDB cache sizes on launch, but the first user click still pays 200-665ms for real DOM measurement because TanStack's `measureElement` only fires when items actually render in the DOM.

| Switch | Msgs | First Visit | Second Visit |
| ------ | ---- | ----------- | ------------ |
| 518d87 | 4    | 192ms       | 45ms         |
| 7447e4 | 10   | 618ms       | 87ms         |
| c7fdb6 | 8    | 329ms       | 101ms        |

The `visible-preseed-mismatch` pattern shows hidden scrollHeight diverging from visible scrollHeight by up to 2x because IDB cache has stale sizes.

## Solution

After the active session commits, sequentially hydrate and mount each sidebar session as a hidden instance, run hidden verification to get real DOM measurements, snapshot to the render cache, and park. Every first click then gets `cache-match-instant` on both verification phases.

```
Current:  Launch → PrefetchSidebar (Query + IDB) → Click → hydrate → mount → measure → 400-665ms
New:      Launch → PrefetchSidebar (Query + IDB) → Active commits
            → Pre-warm queue (background, sequential, ~150ms each)
              → Hydrate into ChatStore → mount hidden → verify → snapshot real sizes → park
            → Click → instance alive + real cache → hidden cache-match-instant → visible snapshot-match-instant → ~80ms
```

## Data Flow: Why Hydration is Required

PrefetchSidebar puts data into two caches, neither of which ChatMessages reads from directly:

```
TanStack Query cache ──→ ConversationDetailResult (messages, usage, title)
IDB render cache     ──→ ChatMeasurementCache (old sizes from prior session)

ChatMessages reads from:
  useChatStore((s) => s.sessions[sessionId]?.messages)   ← Zustand, NOT Query
```

The bridge is `hydrateConversationSnapshot()` (hydrate-conversation-snapshot.ts:239), which:

1. Reads persisted messages from the Query result
2. Calls `chatStore.setMessages(sessionId, messages, scrollIntent)` → writes to Zustand
3. Marks session as hydrated and loaded

Currently this only runs during `claude-ui-bridge.select()`. Pre-warm must call it explicitly.

## Why readyInstances Fast-Path Cannot Be Used

`hasCurrentReadyInstance()` (session-switch-coordinator.ts:371) enforces:

```
if (readyRecord?.phase !== 'visible') return false;
```

Pre-warm only performs hidden verification. A hidden-phase `ReadyInstanceRecord` is always rejected. The visible fast-path requires the session to have been rendered ON-SCREEN with proven scroll geometry — hidden instances can't provide this.

**Actual pre-warm switch path** (when user clicks a pre-warmed session):

1. Instance is already mounted (keep-alive) with real measurements in virtualizer
2. Messages already in ChatStore (hydrated during pre-warm)
3. `beginSessionSwitch` → sets `pendingSessionId` → `verificationPhase='hidden'`
4. Hidden verification: sizes match virtualizer cache → `cache-match-instant` (~16ms)
5. Promote to visible: geometry matches hidden snapshot → `snapshot-match-instant` (~30ms)
6. Commit: ~80ms total

This is not a commit-skip. It's the full pipeline running fast because all measurements are real.

## File Changes

### 1. `apps/agent/src/stores/chat/session-switch-store.ts`

New state fields:

- `preWarmCandidates: string[]` — durable list of sessions eligible for pre-warm (survives interrupt)
- `preWarmQueue: string[]` — active queue being processed (cleared on interrupt)
- `preWarmSessionId: string | null` — currently being pre-warmed (queue[0])
- `preWarmRequestId: number` — dedicated request counter (starts at -1, decrements)
- `preWarmWorkspaceEpoch: number` — workspace epoch captured at queue start
- `preWarmedSessions: Set<string>` — sessions that completed pre-warm (for resume filtering)

New actions:

- `startPreWarm(sessionIds: string[], workspaceEpoch: number)` — set candidates, filter already-mounted and already-warmed, populate queue, set `preWarmSessionId = queue[0]`, capture epoch
- `advancePreWarm()` — add current to `preWarmedSessions`, pop queue[0], set `preWarmSessionId = queue[1]` or null, decrement requestId. Check `preWarmWorkspaceEpoch` matches current epoch — if stale, `clearPreWarm()` instead.
- `clearPreWarm()` — empty queue + null `preWarmSessionId`. Keep `preWarmCandidates` and `preWarmedSessions` intact for resume.
- `resumePreWarm(workspaceEpoch: number)` — rebuild queue from `preWarmCandidates` minus `preWarmedSessions` minus already-mounted, restart.
- `resetPreWarmState()` — full wipe of all pre-warm state (workspace change, unmount).

Design decisions:

- **Negative request IDs** (-1, -2, -3...) prevent collision with positive `pendingRequestId`
- **Separate from `preMountSessionId`** — no conflict with hover prefetch
- **Durable candidates vs transient queue** — `clearPreWarm()` stops processing but `resumePreWarm()` can restart from where we left off
- **Workspace epoch** — stale completions from a previous workspace are rejected in `advancePreWarm()`

### 2. `apps/agent/src/components/layout/chat-area/SessionInstanceManager.tsx`

**Mount list** — `useMountedSessions` hook:

- Add `preWarmSessionId` as fourth input to session set (alongside shown, pending, preMount)
- Protect `preWarmSessionId` in `protectedSessions`
- Raise `MAX_ALIVE_INSTANCES` from 10 to 12

**Verification assignment:**

```
if sid === pendingSessionId && pendingPhase === 'hidden-priming' → verificationPhase = 'hidden'
if sid === pendingSessionId && pendingPhase === 'visible-verifying' → verificationPhase = 'visible'
if sid === preWarmSessionId → verificationPhase = 'hidden'          ← NEW
else → verificationPhase = null
```

When `sid === preWarmSessionId`:

- `verificationPhase = 'hidden'`
- `verificationRequestId = preWarmRequestId` (negative number)

**Result routing** — `handleVerificationResult`:

```
if result.sessionId === pendingSessionId → onPendingVerificationResult(result)
if result.sessionId === preWarmSessionId → onPreWarmVerificationResult(result)   ← NEW
else → drop silently
```

New prop: `onPreWarmVerificationResult: (result) => void`

### 3. `apps/agent/src/components/layout/chat-area/ChatContent.tsx`

**New handler: `handlePreWarmVerificationResult`**

- On `hidden-ready`: log timing, call `advancePreWarm()`. Do NOT promote to visible.
- On `timeout` or `aborted`: log, call `advancePreWarm()` (skip this session, move on).

Pass to SessionInstanceManager as `onPreWarmVerificationResult`.

**Cleanup**: `useEffect` returns `() => resetPreWarmState()` on unmount (full wipe, not just queue clear).

### 4. `apps/agent/src/lib/query/prefetch-sidebar-sessions.ts`

**New function: `preWarmSidebarSessions(sessionIds: string[])`**

Called after `prefetchSidebarSessions()` completes. For each session in the queue (driven by store, not by this function):

The pre-warm driver runs as a reactive `useEffect` in ChatContent (or a new `usePreWarmDriver` hook):

```
When preWarmSessionId changes to a non-null value:
  1. Read conversation from Query cache: getFreshConversationDetail(preWarmSessionId)
  2. If cache miss: skip this session (advancePreWarm), it will be hydrated on click
  3. If cache hit: call hydrateConversationSnapshot({
       sessionId: preWarmSessionId,
       persistedMessages: result.conversation.messages,
       scrollIntent: 'pending-verify',
       source: 'query-fast-path',
       title: result.conversation.title,
       activateToolSession: false,
     })
  4. SessionInstanceManager mounts the instance (reacts to preWarmSessionId change)
  5. Hidden verification runs → snapshot → advancePreWarm
```

**Trigger**: At end of `prefetchSidebarSessions()`, call `startPreWarm(sessionIds, workspaceEpoch)`.

**Guard**: `startPreWarm` is a no-op if `preWarmQueue` is already non-empty.

### 5. `apps/agent/src/services/conversations/session-switch-coordinator.ts`

In `beginSessionSwitch()`:

```
clearPreWarm();     // NEW — interrupt pre-warm queue immediately
clearPreMount();    // existing
```

In `commitSessionReveal()`:

```
// After commit, resume pre-warm with remaining candidates
const { preWarmCandidates, preWarmedSessions } = useSessionSwitchStore.getState();
if (preWarmCandidates.length > 0) {
  resumePreWarm(getWorkspaceEpoch());
}
```

### 6. `apps/agent/src/services/conversations/session-switch-trace.ts`

New trace events:

- `pre_warm_queue_start` — queue populated with N sessions, workspace epoch
- `pre_warm_session_hydrate` — session hydrated into ChatStore
- `pre_warm_session_done` — individual session hidden-ready (with ms timing)
- `pre_warm_session_skip` — session skipped (no Query data, 0 messages, epoch stale)
- `pre_warm_interrupted` — user click cleared queue, N remaining
- `pre_warm_resumed` — queue restarted after commit, N remaining
- `pre_warm_queue_done` — entire queue exhausted

### 7. New hook: `apps/agent/src/hooks/chat/use-pre-warm-driver.ts`

Reactive driver that watches `preWarmSessionId` and performs hydration:

```
useEffect: when preWarmSessionId changes
  → read from Query cache
  → hydrate into ChatStore
  → (SessionInstanceManager reacts to mount + verify)

useEffect: cleanup → resetPreWarmState()
```

This hook lives in ChatContent or ChatArea, NOT in prefetch-sidebar-sessions (which is a one-shot function, not a React component).

## Edge Cases

| Scenario                                          | Handling                                                                                                                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Query-prefetched but never-hydrated**           | Pre-warm driver explicitly calls `hydrateConversationSnapshot()` before mounting. If Query cache miss, session is skipped (`advancePreWarm`).                                                                                     |
| **User clicks during pre-warm**                   | `beginSessionSwitch` calls `clearPreWarm()`. Normal switch proceeds. After `commitSessionReveal()`, `resumePreWarm()` restarts from `preWarmCandidates` minus `preWarmedSessions`.                                                |
| **User clicks the session being pre-warmed**      | `clearPreWarm()` nulls `preWarmSessionId`. `beginSessionSwitch(B)` sets `pendingSessionId=B`. Instance already mounted and hydrated — reassigned from pre-warm to pending. Messages already in ChatStore. Verification continues. |
| **User hovers sidebar during pre-warm**           | `preMountSessionId` is completely separate. Both coexist.                                                                                                                                                                         |
| **LRU evicts a pre-warmed session**               | Instance unmounts, but measurement cache persists in render cache store (memory + IDB) with real DOM sizes. User click re-mounts with EXACT cache → `cache-match-instant` → ~100ms.                                               |
| **Workspace switch during pre-warm**              | ChatContent unmount → `resetPreWarmState()` full wipe. New workspace triggers fresh `prefetchSidebarSessions()` → fresh `startPreWarm()`.                                                                                         |
| **Stale async completion after workspace switch** | `advancePreWarm()` checks `preWarmWorkspaceEpoch` against current `getWorkspaceEpoch()`. Stale epoch → `clearPreWarm()` instead of advancing.                                                                                     |
| **Sidebar list churn (deletion, new sessions)**   | Best-effort: pre-warm runs once at launch from the initial sidebar snapshot. Deleted sessions skip (0 messages gate). New sessions aren't retroactively added — they use the normal first-visit path or hover prefetch.           |
| **Pre-warm session has 0 messages**               | SessionInstance gates verification on `messages.length > 0`. Pre-warm driver detects empty conversation from Query result and calls `advancePreWarm()` without mounting.                                                          |
| **ChatStore session limit / LRU**                 | ChatStore has no session cap — sessions accumulate. But hydrating 10 sessions adds ~10 session entries to Zustand. Each is lightweight (messages array + metadata). Memory: ~50-200KB per session depending on message count.     |
| **PrefetchSidebar reruns (sidebar reorder)**      | `snapshotKey` dedup prevents re-run. `startPreWarm` is separately guarded: no-op if queue non-empty.                                                                                                                              |

## Performance Budget

| Metric                             | Value                                     |
| ---------------------------------- | ----------------------------------------- |
| Hydration per session              | ~1-3ms (parse + setMessages into Zustand) |
| Mount cost per session             | ~15-30ms sync JS                          |
| Hidden verification per session    | ~48ms (stable window)                     |
| Total per session                  | ~65-80ms                                  |
| Total background work (9 sessions) | ~600ms-720ms                              |
| DOM at rest (parked)               | 5 nodes per instance (45 total for 9)     |
| ResizeObservers at rest            | 12 total (velocity disabled for parked)   |
| Memory per parked instance         | ~200-400KB heap                           |
| IDB writes                         | 9 sequential, ~1-5ms each                 |
| User-visible impact                | Zero — after active session committed     |

## Expected Results

The pre-warm value comes from two layers:

**Layer 1 — Instance alive (best case):** The virtualizer has real measurements in its internal cache. When `beginSessionSwitch` fires, the instance is already mounted with real sizes. Hidden verification runs the full pipeline but finds everything matches → `cache-match-instant`. Visible promotion finds geometry matches → `snapshot-match-instant`.

**Layer 2 — Instance evicted but cache survives (fallback):** The render cache store has real DOM measurements persisted from the pre-warm snapshot. A fresh mount seeds `initialMeasurementsCache` with exact sizes → `cache-match-instant` on both phases. Re-mount adds ~50ms.

| Scenario                      | Before    | After                                       |
| ----------------------------- | --------- | ------------------------------------------- |
| First visit, instance alive   | 400-665ms | **~80ms** (full pipeline, all instant)      |
| First visit, instance evicted | 400-665ms | **~130ms** (re-mount + cache-match-instant) |
| Second visit                  | 45-101ms  | 45-101ms (unchanged)                        |
| App launch overhead           | ~0ms      | ~700ms background (invisible to user)       |

## Verification

```bash
bun run check   # must pass
```

Manual test in `bunx tauri dev`:

1. Launch app — active session loads normally
2. Wait ~1s for pre-warm to complete (console: `pre_warm_queue_done`)
3. Click through all sidebar sessions — each should show `cache-match-instant` in trace
4. Verify timing: first visits should be under 100ms for alive instances, under 150ms for evicted
5. Rapidly click sessions during pre-warm — no stuck states, no blank screens, queue resumes after commit
6. Switch workspace and back — pre-warm state fully cleared and restarted
7. Check console: no "empty hidden instance" warnings, all sessions hydrated before mount
