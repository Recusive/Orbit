# Pre-Warm Sidebar Sessions on App Launch

**Status:** TODO
**Priority:** P0
**Dependencies:** TanStack Virtual migration (in progress)
**Revision:** v5 (active chain parity, hydration state flag)

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
              → Lightweight hydrate → mount hidden → verify → snapshot real sizes → park
            → Click → full hydrate (tools/epoch/loaded) → verify → cache-match-instant → ~80ms
```

## Data Flow: The Two-Phase Hydration Model

### The gap

PrefetchSidebar puts data into two caches, neither of which ChatMessages reads directly:

```
TanStack Query cache ──→ ConversationDetailResult (messages, usage, title)
IDB render cache     ──→ ChatMeasurementCache (old sizes from prior session)

ChatMessages reads from:
  useChatStore((s) => s.sessions[sessionId]?.messages)   ← Zustand, NOT Query
```

The bridge is `hydrateConversationSnapshot()` (hydrate-conversation-snapshot.ts:239). Currently it only runs during `claude-ui-bridge.select()`.

### Why pre-warm CANNOT call `hydrateConversationSnapshot()`

That function performs 12 store mutations (hydrate-conversation-snapshot.ts:239-315):

| Mutation                        | Store       | Dangerous for background?                                                                                                             |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `setMessages()`                 | ChatStore   | Safe — needed for rendering                                                                                                           |
| `markSessionHydrated()`         | ChatStore   | Safe                                                                                                                                  |
| `markSessionLoaded()`           | ChatStore   | **Dangerous** — sets `loadedSessions[id]=true`, skips re-load on click                                                                |
| `bumpConversationLoadEpoch()`   | ChatStore   | **Dangerous** — increments staleness counter, rejects in-flight `conversation:load` deferred callbacks (chat-message-service.ts:1294) |
| `restoreSessionUsage()`         | ToolStore   | **Unnecessary** — token/cost state not needed for measurement                                                                         |
| `restoreToolsForMessage()`      | ToolStore   | **Unnecessary** — tool invocation state not needed for measurement                                                                    |
| `switchSession()`               | ToolStore   | **Dangerous** — moves active tool entries to pre-warm session bucket                                                                  |
| `seedConversationDetailCache()` | React Query | Unnecessary — data already in Query cache                                                                                             |

### The solution: lightweight hydration with full parity

Pre-warm must produce an IDENTICAL message set to the real path, or the click will invalidate the measurements.

**Required transformations (must match hydrate-conversation-snapshot.ts exactly):**

1. **Role filter**: `role === 'user' || role === 'assistant'` (exclude system messages)
2. **Per-message mapping** via `mapPersistedMessage()` (thinking blocks, images, interrupted state)
3. **Active chain extraction** via `getActiveChain()` — walks parentUuid tree from latest leaf to select only the active rewind branch. Sessions with rewind branches have orphaned messages that must not render.
4. **Client-only field enrichment** (`interruptReason` merge from cached state, if any)

This is the same pipeline `buildActiveChainMessages()` (hydrate-conversation-snapshot.ts:105-116) runs. **Action: export `buildActiveChainMessages` so the pre-warm driver shares the identical helper.**

**Required store mutations (two calls, not one):**

```
chatStore.setMessages(sessionId, activeChainMessages, 'pending-verify')
chatStore.markSessionHydrated(sessionId)   ← CRITICAL for layout-equivalence guard
```

**Why `markSessionHydrated()` is non-negotiable:**

The layout-equivalence guard in `hydrateConversationSnapshot()` (lines 261-275) is:

```
const isLayoutEquivalent =
  existingSession?.hydrationState === 'hydrated' &&   ← MUST be 'hydrated'
  existingSession.messages.length === messages.length &&
  existingSession.messages.length > 0 &&
  existingSession.messages.every((existing, i) => {
    // id match, content.length, thinking.length,
    // thinkingBlocks.length, attachedImages.length
  })
```

If `hydrationState !== 'hydrated'`, the guard fails and the click path re-runs `setMessages()`, bumping `layoutVersion` and invalidating every measurement pre-warm captured. The entire value of pre-warm is lost.

Without `markSessionHydrated()`: click → `setMessages()` → `layoutVersion++` → cache invalid → remeasure (back to 400ms).

With `markSessionHydrated()`: click → layout equivalent → skip `setMessages()` → `layoutVersion` preserved → `cache-match-instant`.

**What pre-warm still skips (intentional):**

- `bumpConversationLoadEpoch()` — would reject in-flight `conversation:load` deferred callbacks
- `restoreSessionUsage()` / `restoreToolsForMessage()` — ToolStore churn, unnecessary for measurement
- `switchSession()` — dangerous, moves active tool bucket
- `seedConversationDetailCache()` — data already in Query cache
- `markSessionLoaded()` — the `loadedSessions[id]=true` flag is checked by `chat-message-service.ts` for different logic. Safer to leave it until real click.

The real `hydrateConversationSnapshot()` call on user click handles all of these. Pre-warm provides measurements + the hydration flag for layout equivalence.

## Why readyInstances Fast-Path Cannot Be Used

`hasCurrentReadyInstance()` (session-switch-coordinator.ts:371) enforces:

```
if (readyRecord?.phase !== 'visible') return false;
```

Pre-warm only performs hidden verification. A hidden-phase record is always rejected. The visible fast-path requires proven on-screen scroll geometry.

**Actual pre-warm switch path** (when user clicks a pre-warmed session):

1. Instance is already mounted (keep-alive) with real measurements in virtualizer
2. Messages already in ChatStore (lightweight hydration from pre-warm)
3. `claude-ui-bridge.select()` calls full `hydrateConversationSnapshot()` → layout-equivalent → no re-render
4. `beginSessionSwitch` → sets `pendingSessionId` → `verificationPhase='hidden'`
5. Hidden verification: sizes match virtualizer cache → `cache-match-instant` (~16ms)
6. Promote to visible: geometry matches hidden snapshot → `snapshot-match-instant` (~30ms)
7. Commit: ~80ms total

## ChatStore Session Cap and Eviction

`MAX_IN_MEMORY_SESSIONS = 20` (chat-store.ts:37). Eviction clears messages and measurement cache from the LRU-oldest session (chat-store.ts:288-340). Protected: active session, sessions with running agents.

### Impact on pre-warm

Each `setMessages()` call touches LRU, moving the pre-warm session to the end (most recent). If pre-warming 10 sessions pushes total count above 20, the oldest non-active, non-agent sessions get evicted. Those are old sessions with no mounted instances — acceptable.

### Guard: capacity-aware pre-warm sizing

Before starting the queue, compute available slots:

```
availableSlots = MAX_IN_MEMORY_SESSIONS - currentLruCount - 2 (buffer for active + pending)
actualQueueSize = min(candidateCount, availableSlots, 10)
```

If `availableSlots <= 0`, defer pre-warm (sessions are already well-cached from recent use).

### Eviction of a pre-warmed session's messages

If a pre-warmed session later gets evicted (e.g., user visits 20+ other sessions), its ChatStore messages are cleared. But:

1. The measurement cache persists in render-cache-store (memory + IDB) — eviction calls `saveRenderCache()` before clearing (chat-store.ts:325-326)
2. The mounted instance (if still alive) re-renders with 0 messages → overscan parked → dormant
3. On user click: full hydration restores messages → cache restore finds EXACT match → `cache-match-instant`

The pre-warm value survives ChatStore eviction because the value is in the measurement cache, not the messages.

## Stale-Work Protection: Check Before Mutate

The pre-warm driver must validate epoch BEFORE any store mutation, not after.

```
Driver sequence for each preWarmSessionId:
  1. ── EPOCH CHECK ── if preWarmWorkspaceEpoch !== getWorkspaceEpoch() → clearPreWarm(), return
  2. ── QUERY READ ── getFreshConversationDetail(sessionId) (sync from Query cache)
  3. ── CACHE MISS ── if no data in Query cache → advancePreWarm(), return (skip this session)
  4. ── EPOCH RECHECK ── if epoch changed during read → clearPreWarm(), return
  5. ── LIGHTWEIGHT HYDRATE ── chatStore.setMessages(sessionId, messages, 'pending-verify')
  6. ── MOUNT ── SessionInstanceManager reacts to preWarmSessionId → mounts hidden instance
  7. ── VERIFY ── Hidden verification runs → snapshot → advancePreWarm on hidden-ready
```

The epoch check at steps 1 and 4 ensures no store mutation happens after a workspace change. Step 2 is synchronous (reading from in-memory Query cache populated by PrefetchSidebar), so there's no async gap between check and mutate.

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

- `startPreWarm(sessionIds: string[], workspaceEpoch: number)` — set candidates, compute capacity-aware queue size, filter already-mounted and already-warmed, populate queue, set `preWarmSessionId = queue[0]`, capture epoch
- `advancePreWarm()` — add current to `preWarmedSessions`, pop queue[0], set `preWarmSessionId = queue[1]` or null, decrement requestId
- `clearPreWarm()` — empty queue + null `preWarmSessionId`. Keep `preWarmCandidates` and `preWarmedSessions` intact for resume
- `resumePreWarm(workspaceEpoch: number)` — **recompute capacity from current ChatStore LRU state**, rebuild queue from `preWarmCandidates` minus `preWarmedSessions` minus already-mounted, restart. Capacity is NOT cached from `startPreWarm` — it's recomputed every time because ChatStore state changes between interrupt and resume.
- `resetPreWarmState()` — full wipe of all pre-warm state (workspace change, unmount)

Design decisions:

- **Negative request IDs** (-1, -2, -3...) prevent collision with positive `pendingRequestId`
- **Separate from `preMountSessionId`** — no conflict with hover prefetch
- **Durable candidates vs transient queue** — `clearPreWarm()` stops processing but `resumePreWarm()` can restart
- **Workspace epoch** — captured at start, validated before every store mutation
- **Capacity-aware sizing** — respects `MAX_IN_MEMORY_SESSIONS` to avoid cascade eviction

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

New handler: `handlePreWarmVerificationResult`

- On `hidden-ready`: log timing, call `advancePreWarm()`. Do NOT promote to visible.
- On `timeout` or `aborted`: log, call `advancePreWarm()` (skip, move on).

Pass to SessionInstanceManager as `onPreWarmVerificationResult`.

Cleanup: `useEffect` returns `() => resetPreWarmState()` on unmount (full wipe).

### 4. `apps/agent/src/services/chat/hydrate-conversation-snapshot.ts`

**Export `buildActiveChainMessages`** so the pre-warm driver can use the identical transformation pipeline:

```
export function buildActiveChainMessages(
  persistedMessages: readonly ConversationMessageDto[]
): ChatMessage[]
```

The function is already defined (lines 105-116). Just add the `export` keyword. This is the ONLY change to this file.

### 5. New hook: `apps/agent/src/hooks/chat/use-pre-warm-driver.ts`

Reactive driver that watches `preWarmSessionId` and performs lightweight hydration with epoch safety and active-chain parity.

```
useEffect([preWarmSessionId, preWarmWorkspaceEpoch]):
  if preWarmSessionId === null → return

  // GUARD 1: epoch check before any work
  if preWarmWorkspaceEpoch !== getWorkspaceEpoch() → clearPreWarm(), return

  // READ: sync Query cache (populated by PrefetchSidebar)
  const result = getFreshConversationDetail(preWarmSessionId)
  if result === null || result.kind !== 'data' → advancePreWarm(), return

  // GUARD 2: re-check epoch after read (paranoia — read could theoretically yield)
  if preWarmWorkspaceEpoch !== getWorkspaceEpoch() → clearPreWarm(), return

  // GUARD 3: skip if already hydrated by another path
  const existingSession = useChatStore.getState().sessions[preWarmSessionId]
  if existingSession?.hydrationState === 'hydrated' && existingSession.messages.length > 0:
    advancePreWarm()   // Already done, move on
    return

  // TRANSFORM: identical pipeline to hydrateConversationSnapshot
  const activeChain = buildActiveChainMessages(result.conversation.messages)

  if activeChain.length === 0:
    advancePreWarm()   // 0 messages → verification would skip anyway
    return

  // MUTATE: two calls, in order
  const chatStore = useChatStore.getState()
  chatStore.setMessages(preWarmSessionId, activeChain, 'pending-verify')
  chatStore.markSessionHydrated(preWarmSessionId)

  // SessionInstanceManager reacts to preWarmSessionId → mounts + verifies → calls advancePreWarm on hidden-ready

cleanup:
  resetPreWarmState()
```

This hook lives in ChatContent. It does NOT call `hydrateConversationSnapshot()`.

**Why not call `hydrateConversationSnapshot()` with a `preWarm: true` flag?** Because the full function has entangled side effects (tool restoration, epoch bump, tool session switching) that are structurally dangerous in background. Factoring them out would require refactoring the real path. Sharing only `buildActiveChainMessages()` keeps the boundary clean.

### 6. `apps/agent/src/lib/query/prefetch-sidebar-sessions.ts`

At end of `prefetchSidebarSessions()`, after all batches complete:

```
const { preWarmSessionId } = useSessionSwitchStore.getState();
if (preWarmSessionId === null) {
  useSessionSwitchStore.getState().startPreWarm(prefetchedSessionIds, getWorkspaceEpoch());
}
```

### 7. `apps/agent/src/services/conversations/session-switch-coordinator.ts`

In `beginSessionSwitch()`:

```
clearPreWarm();     // NEW — interrupt pre-warm queue immediately
clearPreMount();    // existing
```

In `commitSessionReveal()`:

```
const { preWarmCandidates, preWarmedSessions } = useSessionSwitchStore.getState();
if (preWarmCandidates.length > 0) {
  resumePreWarm(getWorkspaceEpoch());   // Recomputes capacity internally
}
```

### 8. `apps/agent/src/services/conversations/session-switch-trace.ts`

New trace events:

- `pre_warm_queue_start` — queue populated with N sessions, workspace epoch, capacity
- `pre_warm_session_hydrate` — session lightweight-hydrated into ChatStore (messages only)
- `pre_warm_session_done` — individual session hidden-ready (with ms timing)
- `pre_warm_session_skip` — session skipped (no Query data, 0 messages, epoch stale)
- `pre_warm_interrupted` — user click cleared queue, N remaining
- `pre_warm_resumed` — queue restarted after commit, N remaining
- `pre_warm_queue_done` — entire queue exhausted

## Edge Cases

| Scenario                                                           | Handling                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------- |
| **In-flight `conversation:load` during pre-warm**                  | Pre-warm does NOT call `bumpConversationLoadEpoch()`. Only `setMessages()` + `markSessionHydrated()`. In-flight loads' deferred callbacks check their own epoch against the store's — pre-warm doesn't interfere because it doesn't touch the epoch counter.                                                                                                                                                                     |
| **Rewind branches (active chain smaller than raw list)**           | Pre-warm uses `buildActiveChainMessages()` (shared with real path) which calls `getActiveChain()` to walk the parentUuid tree and select only the active branch. Orphaned messages from old rewind branches are excluded. Measurement matches click path exactly.                                                                                                                                                                |
| **Persisted `system` messages in DTO**                             | `buildActiveChainMessages()` filters to `role === 'user'                                                                                                                                                                                                                                                                                                                                                                         |     | 'assistant'`. System messages are dropped before mapping. Render set matches real path. |
| **Session double-hydrated before click (e.g., another code path)** | Driver checks `existingSession?.hydrationState === 'hydrated' && messages.length > 0` before mutating. If already hydrated, skips and calls `advancePreWarm()`.                                                                                                                                                                                                                                                                  |
| **Click on pre-warmed session: layout-equivalence must pass**      | Pre-warm calls `markSessionHydrated()` AFTER `setMessages()`. On click, `hydrateConversationSnapshot()` checks `hydrationState === 'hydrated'` AND element-wise equality (id, content.length, thinking.length, thinkingBlocks.length, attachedImages.length). Since pre-warm used the same `buildActiveChainMessages()` + `mapPersistedMessage()`, all lengths match exactly → skip `setMessages()` → `layoutVersion` preserved. |
| **Resume after long interrupt (LRU changed)**                      | `resumePreWarm()` recomputes capacity from current `ChatStore.lruOrder.length`, not from cached value at `startPreWarm` time. Queue rebuilt with fresh capacity math.                                                                                                                                                                                                                                                            |
| **Workspace changes mid-hydration**                                | Driver checks epoch BEFORE `setMessages()` (step 1 + step 4 in driver sequence). If stale, `clearPreWarm()` fires without any store mutation. ChatContent unmount also calls `resetPreWarmState()`.                                                                                                                                                                                                                              |
| **ChatStore eviction from pre-warm pressure**                      | Capacity-aware sizing: `min(candidates, availableSlots, 10)`. Each `setMessages` touches LRU so pre-warmed sessions are at the end (protected). Oldest non-mounted sessions are evicted — acceptable. Even if a pre-warmed session is later evicted, `saveRenderCache()` persists measurements before clearing (chat-store.ts:325).                                                                                              |
| **Mounted instance sees evicted (empty) session**                  | Instance re-renders with 0 messages → overscan parked → dormant. On click: full hydration restores messages → cache-match-instant from persisted measurements.                                                                                                                                                                                                                                                                   |
| **Tool/usage state not restored during pre-warm**                  | Intentional. Pre-warm only provides DOM measurements. Full `hydrateConversationSnapshot()` runs on actual click, restoring tools/usage/epoch/loaded. Layout-equivalence check detects messages match → skips re-render → preserves measurement cache.                                                                                                                                                                            |
| **User clicks during pre-warm**                                    | `beginSessionSwitch` calls `clearPreWarm()`. Normal switch proceeds. After `commitSessionReveal()`, `resumePreWarm()` restarts from `preWarmCandidates` minus `preWarmedSessions`.                                                                                                                                                                                                                                               |
| **User clicks the session being pre-warmed**                       | `clearPreWarm()` nulls `preWarmSessionId`. Instance already mounted and has messages. `beginSessionSwitch(B)` sets `pendingSessionId=B`. Instance reassigned from pre-warm to pending. Verification continues with real measurements.                                                                                                                                                                                            |
| **User hovers sidebar during pre-warm**                            | `preMountSessionId` is completely separate. Both coexist.                                                                                                                                                                                                                                                                                                                                                                        |
| **Rapid workspace switches**                                       | Each `resetPreWarmState()` on ChatContent unmount fully wipes all state. New workspace triggers fresh `prefetchSidebarSessions()` → fresh `startPreWarm()` with new epoch. Stale completions from old workspace are gated by epoch check before every mutation.                                                                                                                                                                  |
| **Pre-warm session has 0 messages**                                | Driver reads from Query cache, sees empty conversation → `advancePreWarm()` without mounting.                                                                                                                                                                                                                                                                                                                                    |
| **PrefetchSidebar reruns (sidebar reorder)**                       | `snapshotKey` dedup prevents re-run. `startPreWarm` is separately guarded: no-op if queue non-empty.                                                                                                                                                                                                                                                                                                                             |
| **Sidebar list churn (deletion, new sessions)**                    | Best-effort: pre-warm runs once from launch snapshot. Deleted sessions hit 0-messages gate. New sessions use normal first-visit path or hover prefetch.                                                                                                                                                                                                                                                                          |

## Performance Budget

| Metric                             | Value                                   |
| ---------------------------------- | --------------------------------------- |
| Lightweight hydration per session  | ~1-2ms (map messages + setMessages)     |
| Mount cost per session             | ~15-30ms sync JS                        |
| Hidden verification per session    | ~48ms (stable window)                   |
| Total per session                  | ~65-80ms                                |
| Total background work (9 sessions) | ~600-720ms                              |
| DOM at rest (parked)               | 5 nodes per instance (45 total for 9)   |
| ResizeObservers at rest            | 12 total (velocity disabled for parked) |
| Memory per parked instance         | ~200-400KB heap                         |
| IDB writes                         | 9 sequential, ~1-5ms each               |
| User-visible impact                | Zero — after active session committed   |

## Expected Results

**Layer 1 — Instance alive (best case):** Virtualizer has real measurements. Click triggers full `hydrateConversationSnapshot()` (layout-equivalent → no re-render). `beginSessionSwitch` → hidden `cache-match-instant` → visible `snapshot-match-instant`.

**Layer 2 — Instance evicted but cache survives (fallback):** Measurement cache persisted to render-cache-store before eviction. Fresh mount seeds `initialMeasurementsCache` with exact sizes.

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
4. Verify timing: first visits under 100ms for alive instances, under 150ms for evicted
5. Rapidly click sessions during pre-warm — no stuck states, queue resumes after commit
6. Switch workspace and back — pre-warm state fully cleared and restarted
7. Open a session with running agent, verify pre-warm didn't interfere with tool state
8. Check console: no `conversationLoadEpoch` warnings, no stale load rejections from pre-warm
9. **Critical parity test**: Open a conversation with a rewind branch. Pre-warm it. Click it. Verify `layoutVersion` is NOT bumped on click (check trace for `setMessages` calls — should be 0 from click path). If `layoutVersion` bumped, pre-warm used wrong message set.
10. **Hydration flag test**: After pre-warm, inspect `useChatStore.getState().sessions[sessionId].hydrationState` — must be `'hydrated'`, not `'unloaded'`. If unloaded, click path will re-run `setMessages`.
