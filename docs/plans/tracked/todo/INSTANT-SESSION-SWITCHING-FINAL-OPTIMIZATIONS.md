# Plan: Instant Session Switching — Four Targeted Optimizations

## Context

Session switching shipped three fixes today (commit on `v0.0.9`):

- `restoreVersion` counter — fixes React effect ordering dead zone
- Instant preseed match — skips 200ms visible quiet window when hidden-ready snapshot matches
- Coordinator safety timeout + image lazy-load fix + diff overflow fixes

Current performance: **~166ms warm, 450-1260ms cold**. The visible phase is 0ms. The remaining bottleneck is the hidden verification phase (104ms warm, 300-1200ms cold).

## Architecture Constraints (from audit)

These constraints shape every optimization below:

1. **`isLiveReadyInstance()` rejects hidden instances** — coordinator.ts:334 checks `data-instance-visible !== 'true'`. Hidden sessions (translateX 200vw) have `instanceVisible='false'`. The ready-instance fast path at claude-ui-bridge.ts:109 **cannot fire for hidden sessions** without modifying this check, which is risky (scroll measurements unreliable off-screen).

2. **Re-selecting the shown session aborts** — claude-ui-bridge.ts:74 returns early when `sessionId === activeConversationId`. The A→B→A bounce-back while B is pending takes this abort path, not the ready-instance path.

3. **Size cache restore is synchronous** — chat-messages.tsx:504 is a `useLayoutEffect` that runs on mount. The premeasure-skip at line 1523 depends on `restoredSizeCacheRef.current` being `true` synchronously. An async IDB fallback arriving after verification starts would mutate scroll metrics mid-pass.

4. **SessionInstance reads from ChatStore, not TanStack Query** — Pre-mounting a hidden instance requires messages to be hydrated in ChatStore, not just cached in the query client.

---

## Optimization 1: Instant Hidden Verification for Warm Instances (166ms → ~40ms)

**Problem**: The hidden phase runs a 48ms ResizeObserver quiet window (`HIDDEN_READY_STABLE_MS`) + overhead even when the keep-alive instance hasn't changed. For warm instances with matching size caches and signatures, this is pure waste.

**Approach**: Add an instant-match fast path to the hidden verification, mirroring the instant preseed that already works for the visible phase. When the hidden phase starts and the instance has a restored size cache + matching snapshot from a previous verification, skip the 48ms quiet window and signal hidden-ready immediately.

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

In `scheduleHiddenVerificationCheck` (line 1192), add a single-frame stability check before the 48ms window. The key insight: `hiddenCandidateSnapshotRef` is reset on every verification start (line 1733), so there's no "previous hidden-ready snapshot" to compare against. Instead, take a snapshot now, wait one rAF tick, take another, and compare. One frame of layout stability is sufficient for warm instances with restored size caches because there are no pending measurements.

```typescript
// Fast path: for warm instances with restored size caches, verify layout
// stability across one animation frame instead of the full 48ms quiet window.
// This works because restored caches give Virtuoso accurate heights — no
// ResizeObserver measurements are pending, so one frame of stability proves
// the layout is settled.
if (
  restoredSizeCacheRef.current &&
  layoutPendingCount === 0 &&
  restorePhaseRef.current === 'stabilizing' &&
  effectiveVerificationPhase === 'hidden'
) {
  const handle = listRef.current;
  const immediateRendered = handle?.data.getCurrentlyRendered() ?? [];
  const immediateMetrics = getRenderSurfaceMetrics(immediateRendered);
  if (
    immediateMetrics?.tailSentinelRendered === true &&
    immediateMetrics.isAtBottom &&
    !isHiddenPlaceholderShortSurface(immediateMetrics) &&
    hasObservedPostProbeSurface(immediateMetrics)
  ) {
    const firstSnapshot = buildReadinessSurfaceSnapshot(immediateMetrics, layoutSettledVersion);

    // Wait one frame, re-snapshot, compare. If geometry is identical across
    // one rAF, the layout is stable — no need for the full 48ms window.
    requestAnimationFrame(() => {
      if (restorePhaseRef.current !== 'stabilizing' ||
          effectiveVerificationPhase !== 'hidden') {
        return; // Phase changed, fall through to normal path
      }
      const recheckRendered = handle?.data.getCurrentlyRendered() ?? [];
      const recheckMetrics = getRenderSurfaceMetrics(recheckRendered);
      if (!recheckMetrics) return;
      const secondSnapshot = buildReadinessSurfaceSnapshot(recheckMetrics, layoutSettledVersion);
      if (isSameReadinessSurfaceSnapshot(firstSnapshot, secondSnapshot)) {
        hiddenCandidateSnapshotRef.current = secondSnapshot;
        markSwitchTimeline('hidden-ready', 'cache-match-instant');
        signalReady('stabilized');
      }
      // If snapshots differ, the slow path's ResizeObserver is already
      // running (started below) and will handle it normally.
    });
  }
}
// Slow path runs concurrently — if the rAF fast path fires first,
// signalReady sets hasResolvedVerificationRef and the slow path no-ops.
startTemporaryResizeStabilityWindow('stabilizing', HIDDEN_READY_STABLE_MS, () => { ... });
```

**Why this is safe**:

- `restoredSizeCacheRef.current` ensures Virtuoso has real cached heights (not estimates)
- `layoutPendingCount === 0` ensures no pending mutations
- All existing geometry checks (tail sentinel, at-bottom, short surface, post-probe) still run
- Two-snapshot comparison across one rAF confirms no layout change in progress
- `hiddenCandidateSnapshotRef` is set to the verified snapshot (not stale data from a prior verification)
- The slow path runs concurrently as a fallback — whichever resolves first wins via `hasResolvedVerificationRef`
- Falls through entirely if any check fails (no regression for cold or unstable instances)

**Invalidation**: The snapshot is taken fresh on each verification run. No stale or placeholder-derived snapshots are reused. If the instance's layout changed while hidden (e.g., font loaded, viewport resized), the rAF snapshots will differ and the slow path handles it.

**Expected timing**: ~45ms total (React render ~30ms + one rAF tick ~8ms + instant visible preseed + commit ~7ms). Down from ~166ms.

**Verification**: Warm A→B→A switch should show `hidden-ready cache-match-instant` + `visible-preseed snapshot-match-instant` in timeline. Total < 50ms.

---

## Optimization 2: Persist Size Cache to IndexedDB (450-1260ms → ~166ms cold)

**Problem**: `render-cache-store.ts` uses an in-memory `Map`. App restart loses all cached heights.

**Approach**: Two-layer strategy — startup batch preload + hover-time promotion. The sync restore path at chat-messages.tsx:504 stays unchanged. IDB data is loaded into the in-memory cache BEFORE any switch starts.

**Files to modify**:

### `apps/agent/src/stores/chat/render-cache-store.ts`

Add IndexedDB persistence layer:

```typescript
const DB_NAME = 'orbit-render-cache';
const DB_VERSION = 1;
const STORE_NAME = 'size-caches';
const SCHEMA_VERSION = 1; // Bump on VirtuosoSizeCache shape changes

interface PersistedEntry {
  schemaVersion: number;
  cache: VirtuosoSizeCache;
  accessedAt: number;
}
```

New functions:

- `openDb()` — lazy singleton, `onupgradeneeded` clears store on version bump
- `persistToIdb(sessionId, cache)` — fire-and-forget write wrapped in try/catch
- `removeFromIdb(sessionId)` — fire-and-forget delete
- `preloadRenderCacheFromIdb(sessionId)` — async read, promotes to memory on hit, rejects stale `schemaVersion`. Validates payload shape: `ranges` is an array of `{k: number, v: number}` (may be empty for zero-message sessions), `messageCount` is a non-negative integer (0 is valid — empty conversations are hydrated via the `query-fast-empty` path at claude-ui-bridge.ts:153), `layoutVersion` is a non-negative integer. Corrupted entries (wrong types, missing fields, non-array ranges) are deleted from IDB and return null.
- `warmMemoryCacheFromIdb()` — **called once on app startup**. Reads all IDB entries, populates memory cache. Returns a `Promise<void>`.
- `ensureWarmedUp()` — returns the startup preload promise. Callers can `await` it to guarantee memory cache is populated.

Modify existing functions:

- `saveRenderCache()` — also calls `persistToIdb()` (fire-and-forget)
- `removeRenderCache()` — also calls `removeFromIdb()` (fire-and-forget)
- `getRenderCache(sessionId)` — unchanged (sync, memory-only)
- **NEW** `getRenderCacheAsync(sessionId)` — tries memory first, then `await ensureWarmedUp()` + retry memory, then per-session IDB read. This is the cold-start fallback.

IDB garbage collection: `warmMemoryCacheFromIdb()` prunes entries where `accessedAt` is older than 30 days or count exceeds `MAX_CACHED_SESSIONS`.

Viewport width guard: Persist the chat area `clientWidth` alongside the cache entry. On restore, reject if the current chat area width differs by more than 16px (one scrollbar). This prevents stale heights from a different window size being applied — `layoutVersion` alone doesn't catch viewport changes because it only increments on message/layout mutations, not window resizes.

Race protection: `removeFromIdb` is fire-and-forget but ordered after `persistToIdb` on the same session via a per-session promise chain, preventing stale resurrections.

### `apps/agent/src/main.tsx` (or app initialization)

Call `warmMemoryCacheFromIdb()` during app startup, before the first session switch. This fires early and typically completes within 50-100ms (IDB getAll for ~50 small entries).

### Closing the first-click race

The sync `useLayoutEffect` at chat-messages.tsx:504 calls `getRenderCache(sessionId)` (memory-only). If the startup preload hasn't finished, this misses. To close this gap:

Add a **new `useEffect`** in chat-messages.tsx that fires when the sync path found no cache AND `restoredSizeCacheRef.current` is still false:

```typescript
useEffect(() => {
  if (restoredSizeCacheRef.current || !sessionId) return;
  let cancelled = false;

  void getRenderCacheAsync(sessionId).then((idbCache) => {
    if (cancelled || restoredSizeCacheRef.current || !idbCache) return;
    // Same validation as the sync path
    const session = useChatStore.getState().sessions[sessionId];
    if (!session) return;
    if (idbCache.layoutVersion !== session.layoutVersion) return;
    if (idbCache.messageCount !== session.messages.length) return;
    if (idbCache.lastMessageId !== (session.messages.at(-1)?.id ?? null)) return;

    listRef.current?.setSizeRanges([...idbCache.ranges]);
    restoredSizeCacheRef.current = true;
    // The verification loop is already running — the next stabilization
    // check will see that sizes are now populated and converge faster.
    // No mid-pass mutation risk: setSizeRanges triggers a Virtuoso re-render
    // which fires ResizeObserver, resetting the quiet window naturally.
  });

  return () => {
    cancelled = true;
  };
}, [sessionId]);
```

**Why this is safe**: `setSizeRanges` triggers a Virtuoso internal re-render, which fires ResizeObserver events. The in-progress stabilization window (48ms or 200ms) gets its timer reset by the ResizeObserver callback — it doesn't corrupt mid-pass, it restarts the stability check with better data. The net effect is: the verification takes a few extra frames but uses accurate heights, converging to stable layout faster than measuring from scratch.

**Performance claim adjustment**: Cold-after-restart target is **~166ms when preload completes before click** (typical), **~250ms when preload races the click** (async fallback kicks in mid-verification). Both are significantly better than 450-1260ms without IDB. The plan table reflects the typical case.

**Interaction with premeasure**: The `startPremeasureIfNeeded()` guard at line 1523 checks `restoredSizeCacheRef` and prevents premeasure from **starting**. But `continuePremeasure()` (line 1484) does not check this flag — an **in-flight** premeasure cycle runs to completion regardless. If the async IDB cache hit arrives mid-premeasure, `setSizeRanges()` gives Virtuoso better heights and `restoredSizeCacheRef` becomes true. The premeasure loop continues scrolling (harmless — it's refining measurements that are now mostly accurate) and finishes normally via `finishPremeasure()`. After premeasure ends, `finishPremeasure` transitions to positioning, which converges faster thanks to the cached sizes. No explicit cancellation or restart logic needed.

### `apps/agent/src/lib/query/use-conversation-prefetch.ts`

Add `preloadRenderCacheFromIdb(sessionId)` alongside query prefetch. This is the second chance — if startup preload missed this session, hover promotes it to memory before click.

### chat-messages.tsx — summary of restore layers

Three layers, checked in order. First hit wins:

1. **Sync `useLayoutEffect`** (line 504) — checks `session.virtuosoSizeCache` then `getRenderCache()` (memory). Handles warm switches and cold switches where IDB preload already completed. Sets `restoredSizeCacheRef = true`.
2. **Async `useEffect`** (new) — fires only when layer 1 missed. Calls `getRenderCacheAsync()` which awaits `ensureWarmedUp()` then retries memory, then per-session IDB read. Sets `restoredSizeCacheRef = true` on hit. Resets the in-progress stability window naturally via `setSizeRanges`.
3. **Estimated heights** (Opt 3) — fires in layer 1's `useLayoutEffect` when no real cache exists. Does NOT set `restoredSizeCacheRef`. Premeasure still runs.

**Verification**: Close app, reopen, switch to previously visited conversation. Timeline should show `restoredSizeCacheRef=true` (from layer 1 or 2) and no premeasure phase. Switch time ~166ms (layer 1) or ~250ms (layer 2).

---

## Optimization 3: Estimated Item Heights (first-ever visit 450-1260ms → ~300ms)

**Problem**: `VirtuosoMessageList` has no `defaultItemSize` prop. Brand-new sessions measure every row from scratch.

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

In the size cache `useLayoutEffect` (line 504), add fallback after the cache-miss early return:

```typescript
useLayoutEffect(() => {
  restoredSizeCacheRef.current = false;
  if (!sessionId) return;

  const store = useChatStore.getState();
  const session = store.sessions[sessionId];
  let cache = session?.virtuosoSizeCache ?? null;
  cache ??= getRenderCache(sessionId);

  // Existing: restore from real cache
  if (cache && session && /* validation checks */) {
    listRef.current?.setSizeRanges([...cache.ranges]);
    restoredSizeCacheRef.current = true;
    return;
  }

  // NEW: estimated heights for uncached sessions
  if (session && session.messages.length > 0) {
    const estimated = buildEstimatedSizeRanges(session.messages);
    if (estimated.length > 0) {
      listRef.current?.setSizeRanges(estimated);
      // Do NOT set restoredSizeCacheRef — real measurements replace estimates
      // Premeasure still runs (line 1523 checks restoredSizeCacheRef)
    }
  }
}, [sessionId]);
```

Helper function:

```typescript
const EST_USER = 80;
const EST_ASSISTANT = 200;
const EST_SENTINEL = 1;

function buildEstimatedSizeRanges(messages: ChatMessage[]): Array<{ k: number; v: number }> {
  // Group consecutive same-role messages into ranges
  // Each range: { k: startIndex, v: estimatedHeight }
  // Virtuoso uses these for initial scroll position calculation
}
```

**Why `restoredSizeCacheRef` stays false**: The premeasure system at line 1523 checks this flag. With estimates (not real measurements), premeasure should still run to get accurate heights. The estimates only help with initial scroll positioning — they reduce the "blank flash" on first render.

**Viewport width sensitivity**: Estimates are based on typical content at the current viewport width. If the user resized the window since last visit, real measurements correct the estimates. No persistent risk.

**Verification**: New conversation with 10+ messages. First visit shows content at approximately correct positions. Measurement still runs but starts from better initial state. Target: ~300ms.

---

## Optimization 4: Sidebar Hover Pre-Mount (cold → warm on hover, ~166ms)

**Problem**: Cold sessions aren't mounted until click. Hover time is wasted.

**Design constraint**: Pre-mounted instances render with `verificationPhase: null` — no verification runs, no readyInstance created. Benefit is limited to: instance mounts, Virtuoso measures rows, size cache populates. Subsequent click starts full verification but with cached sizes (warm path, ~166ms instead of 450-1260ms).

**Hydration requirement**: `SessionInstance` reads messages from `ChatStore.sessions[id].messages`. For sessions evicted from the keep-alive pool, messages are cleared. Pre-mount only works for sessions that are **still hydrated** in ChatStore (messages present). The `requestPreMount` guard must check `session.hydrationState === 'hydrated'`.

### Files to modify

**`apps/agent/src/stores/chat/session-switch-store.ts`**:

- Add `preMountSessionId: string | null`
- `requestPreMount(sessionId)` — guards: hydrated in ChatStore, not currently shown/pending, no active switch
- `clearPreMount(sessionId?)` — clear on switch start or explicit cancel

**`apps/agent/src/components/layout/chat-area/SessionInstanceManager.tsx`**:

- Read `preMountSessionId` from store
- Add to `useMountedSessions` touch + protected sets
- Display mode: `'hidden'` (off-screen, no verification)
- Respects `MAX_ALIVE_INSTANCES` — can trigger LRU eviction

**`apps/agent/src/lib/query/use-conversation-prefetch.ts`**:

- Return `{ prefetch, cancel }` instead of bare function
- `prefetch(sessionId)`: fires query prefetch + `preloadRenderCacheFromIdb(sessionId)` + delayed `requestPreMount(sessionId)` (100ms)
- `cancel()`: clears the 100ms timer + calls `clearPreMount()`

**`apps/agent/src/components/layout/primary-sidebar/components/ConversationItem.tsx`**:

- Wire `cancel` to both `onPointerLeave` AND `onBlur` to prevent abandoned pre-mounts from both rapid hovering and rapid keyboard tabbing (ConversationItem.tsx:154 also fires prefetch on `onFocus`)

**`apps/agent/src/services/conversations/session-switch-coordinator.ts`**:

- In `beginSessionSwitch`, call `clearPreMount()` to prevent race

**NOT doing**: `hydrateConversationSnapshot()` during hover. This mutates ToolStore, FileStore, UIStore — side effects inappropriate for a session the user hasn't opened. Pre-mount only benefits already-hydrated sessions.

**Verification**: Hover over previously-visited conversation for 500ms, then click. DOM should show hidden SessionInstance mounted during hover. Switch time ~166ms instead of 450-1260ms.

---

## Implementation Order

| #   | Optimization                | Effort  | Impact                        | Dependencies      |
| --- | --------------------------- | ------- | ----------------------------- | ----------------- |
| 1   | Instant hidden verification | 1 hour  | Warm: 166ms → **~40ms**       | None              |
| 2   | IndexedDB size cache        | 2 hours | Cold (returning): **~166ms**  | None              |
| 3   | Estimated item heights      | 1 hour  | Cold (first-ever): **~300ms** | None              |
| 4   | Hover pre-mount             | 3 hours | Cold (hovered): **~166ms**    | Opt 2 recommended |

Opts 1-3 are independent. Opt 4 benefits from Opt 2 (IDB cache provides heights for pre-mounted instances).

## Expected Performance

| Scenario                             | Current    | After      | Notes                                  |
| ------------------------------------ | ---------- | ---------- | -------------------------------------- |
| Warm (back-switch)                   | 166ms      | **~45ms**  | Opt 1: rAF hidden + instant visible    |
| Cold (app restarted, preload done)   | 450-1260ms | **~166ms** | Opt 2: IDB → memory before click       |
| Cold (app restarted, preload racing) | 450-1260ms | **~250ms** | Opt 2: async fallback mid-verification |
| Cold (hovered 500ms before click)    | 450-1260ms | **~166ms** | Opt 4: pre-mounted + sized             |
| Cold (never visited, no hover)       | 450-1260ms | **~300ms** | Opt 3: estimated heights               |

## Verification (end-to-end)

1. `bun run typecheck && bun run lint` — zero errors
2. `bun run test` — session switch tests pass
3. `bunx tauri dev` — manual switching through 10+ conversations:
   - Warm: trace shows `cache-match-instant` + `snapshot-match-instant`, total < 50ms
   - Cold (IDB, preload done): size cache restores synchronously from memory, total < 200ms
   - Cold (IDB, first-click race): async fallback fires, sizes arrive mid-verification, total < 300ms
   - Cold (estimated): estimates applied, premeasure still runs, total < 350ms
   - Hover pre-mount: hidden instance appears on hover, click runs warm path
4. No aborts, no timeouts across 50+ switches
5. IDB survives app restart: close, reopen, verify sync restore path finds cached heights
6. Rapid hover test: hover 5 sessions quickly, verify only last one pre-mounts, no abandoned mounts linger
7. Rapid tab test: keyboard-tab through 5 items quickly, verify `onBlur` cancels abandoned pre-mounts
8. Viewport resize test: resize window, switch to IDB-cached session, verify stale heights are rejected (width guard)
