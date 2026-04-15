# Fix: VirtuosoMessageList Cold-Mount Performance

## Context

After implementing chat virtualization with `@virtuoso.dev/message-list` (v1.16.2) and a Discord/Slack-style keep-alive system, the app is **visually perfect** (no blank screens, no scrollbar jitter, no ghost text) but **too slow**:

- First visit to any session drops FPS from 120 to 2-3
- Session switching has noticeable latency (~300-500ms)
- The app feels heavier than before virtualization

Three root causes: (1) hidden instances run 45 observers + 9 RAF loops doing nothing, (2) `increaseViewportBy={10000}` renders 50-100+ items on cold mount, (3) RAF-polling readiness protocol adds 150ms+ latency.

Merged approach: Codex's event-driven architecture (three-phase overscan, message-based identity, size caching) with conservative buffer values to avoid ghost text regression. Plan revised after two audit rounds to fix readiness sequencing, overscan promotion triggers, size-cache invalidation, test baseline, and the `isActive` vs `shouldPrime` signal split.

### Two-Signal Architecture

**Critical distinction:** `SessionInstanceManager` (line 235) computes `isActive = (isTargetActive && isStabilized) || isShownAsHoldover`. During first-visit handoff, the incoming target session is `isTargetActive=true` but `isStabilized=false`, so `isActive=false`. If we use `isActive` alone for overscan and readiness, the incoming session gets `parked=0` overscan and readiness can't start — deadlocking the handoff.

**Solution — two props from `SessionInstanceManager`:**

| Prop          | Meaning                                                               | Drives                                                                      |
| ------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `isVisible`   | Session is currently shown to the user (current `isActive` semantics) | CSS position, scroll preservation, wheel damping (`useVelocityScroll`)      |
| `shouldPrime` | Session is the selected target (= `isTargetActive` from line 232)     | `entry` overscan, readiness start/cancel, observer attachment for readiness |

**File**: `apps/agent/src/components/layout/chat-area/SessionInstanceManager.tsx` (line 237-249)

```typescript
<SessionInstance
  key={sid}
  sessionId={sid}
  isVisible={isActive}          // renamed from isActive — current visible semantics
  shouldPrime={isTargetActive}  // NEW — selected target, may be hidden during warm-up
  queuedMessage={isTargetActive ? queuedMessage : null}
  ...
/>
```

**In `ChatMessages`:**

```typescript
// Wheel damping: only when visible (user can interact)
const velocityScrollRef = useVelocityScroll({
  enabled: isVisible,
  onUserScrollStart: () => setHasUserScrolled(true),
});

// Overscan: parked only when neither visible nor priming.
// Holdover (isVisible=true, shouldPrime=false) keeps steady — user can still scroll it.
// Hidden incoming target (shouldPrime=true, isVisible=false) gets entry for warm-up.
const overscan =
  !shouldPrime && !isVisible
    ? OVERSCAN_PARKED
    : isReadyForSteady || hasUserScrolled
      ? OVERSCAN_STEADY
      : shouldPrime
        ? OVERSCAN_ENTRY
        : OVERSCAN_STEADY; // visible holdover — already promoted from a prior session

// Readiness: starts when shouldPrime, cancels when shouldPrime drops
// (not when visibility changes — hidden warm-up is intentional)
useEffect(() => {
  if (!shouldPrime && restorePhaseRef.current !== 'done') {
    cancelReadinessWork();
    restorePhaseRef.current = 'idle';
  }
}, [shouldPrime]);
```

This means:

- **Hidden incoming target** (shouldPrime=true, isVisible=false): gets `entry` overscan, readiness runs, wheel damping off
- **Holdover session** (shouldPrime=false, isVisible=true): keeps its current `steady` overscan, wheel damping on
- **Fully inactive session** (shouldPrime=false, isVisible=false): `parked` overscan, no observers
- **Active visible session** (shouldPrime=true, isVisible=true): `steady` overscan, wheel damping on

---

## Phase 0: Fix Test Baseline

**Impact**: Required gate. **Risk**: None.

The following tests are stale and must pass before any refactor work:

- `apps/agent/src/__tests__/services/conversations/claude-ui-bridge.test.ts:75-83` — expects hydrated session to call `load()` and set `session-restore`, but `claude-ui-bridge.ts:43-55` now skips that path.
- `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx:611` — no longer matches per-session tool selector behavior.

Fix these tests so `bun run test` passes clean, then add new coverage alongside each phase.

---

## Phase 1: Gate Observers on Visibility

**Impact**: Highest (eliminates 45 observers + 9 RAF loops). **Risk**: Very low.

### 1A. Add `enabled` and `onUserScrollStart` to `useVelocityScroll`

**File**: `apps/agent/src/hooks/ui/use-velocity-scroll.ts`

```typescript
// Add to VelocityScrollOptions (line 64-73):
enabled?: boolean;          // default true — when false, all observers/listeners torn down
onUserScrollStart?: () => void;  // fired on first real wheel event (after warmup)

// Extract at top of hook (line 113):
const enabled = options?.enabled ?? true;
const onUserScrollStartRef = useRef(options?.onUserScrollStart);
onUserScrollStartRef.current = options?.onUserScrollStart;

// In setRef callback (line 121), after cleanup, early-return:
if (!node || !enabled) return;

// In the wheel handler, after warmup completes (first preventDefault call):
// Fire onUserScrollStartRef.current?.() exactly once per attach cycle.
// Use a local `hasFiredUserScroll` boolean, reset on each setRef call.

// Add enabled to useCallback deps (line 274):
[maxPx, friction, sensitivity, warmupEvents, enabled]
```

When `enabled` flips, React re-calls `setRef` (dep changed) → `cleanupRef.current()` runs → if now disabled, early return. If now enabled, re-attaches everything. Uses existing cleanup pattern.

### 1B. Two-signal prop threading

**File**: `apps/agent/src/components/layout/chat-area/SessionInstanceManager.tsx`

- Line 238-241: Pass `isVisible={isActive}` (renamed) and `shouldPrime={isTargetActive}` (new)

**File**: `apps/agent/src/components/layout/chat-area/SessionInstance.tsx`

- Rename `isActive` prop to `isVisible`, add `shouldPrime` prop
- Pass both to `<ChatMessages>`: `isVisible={isVisible} shouldPrime={shouldPrime}`
- Use `isVisible` for CSS toggle and scroll preservation (replacing current `isActive` usage)

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

- Add `readonly isVisible?: boolean;` and `readonly shouldPrime?: boolean;` to `ChatMessagesProps` (both default true)
- Wheel damping keyed to visibility: `const velocityScrollRef = useVelocityScroll({ enabled: isVisible });`
- Overscan and readiness keyed to `shouldPrime` (see Phase 2 and Phase 3)

### 1C. Memoize `SessionInstance`

**File**: `apps/agent/src/components/layout/chat-area/SessionInstance.tsx`

- Wrap export with `React.memo(SessionInstance)` so inactive instances skip re-renders when the active session's props change (e.g., `queuedMessage` changing for a different session).

### Verification

- Visit 3+ sessions → DevTools Performance: no observer/RAF from fully inactive instances (`shouldPrime=false, isVisible=false`)
- Hidden incoming target (`shouldPrime=true, isVisible=false`): velocity scroll OFF, but readiness work runs
- Switch back to cached session: scroll works, position preserved
- Active streaming: auto-scroll unchanged

### New Test Coverage

- Fully inactive instance: assert velocity scroll cleanup runs
- Re-activation: assert observers re-attach when `isVisible` flips true
- Hidden warm-up: assert incoming target with `shouldPrime=true, isVisible=false` does NOT have velocity scroll attached but DOES have readiness capability
- Three-state handoff integration test: previous visible → incoming hidden warming → handoff on ready

---

## Phase 2: Three-Phase Adaptive Overscan

**Impact**: High (cold mount renders 3-5 items instead of 50-100). **Risk**: Low-medium.

### Overscan Phases

| Phase    | Value  | When                                           |
| -------- | ------ | ---------------------------------------------- |
| `parked` | `0`    | Fully inactive (`!shouldPrime && !isVisible`)  |
| `entry`  | `800`  | Newly shown, readiness not yet signaled        |
| `steady` | `8000` | After ready OR first explicit user wheel input |

Why `8000` not 3200: velocity scroll caps at 50px/frame. At 120fps max speed = 6000px/sec. 8000px = 1.33s headroom per direction — safe margin against ghost text. Original 10000 was 1.67s — minimal practical difference.

Why `parked=0`: hidden instances are 200vw offscreen. Zero overscan = zero unnecessary DOM nodes for hidden sessions.

### Changes

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

Add overscan constants and derive phase from `shouldPrime` + readiness:

```typescript
const OVERSCAN_PARKED = 0;
const OVERSCAN_ENTRY = 800;
const OVERSCAN_STEADY = 8000;

const [isReadyForSteady, setIsReadyForSteady] = useState(false);
const [hasUserScrolled, setHasUserScrolled] = useState(false);

// Parked only when fully inactive (not visible AND not priming).
// Holdover keeps steady; hidden incoming target gets entry for warm-up.
const overscan =
  !shouldPrime && !isVisible
    ? OVERSCAN_PARKED
    : isReadyForSteady || hasUserScrolled
      ? OVERSCAN_STEADY
      : shouldPrime
        ? OVERSCAN_ENTRY
        : OVERSCAN_STEADY; // visible holdover
```

**Promotion to `steady` — explicit user input only (audit fix #2):**

Do NOT use `onScroll` — programmatic restore/auto-scroll fires it too, immediately erasing the cold-mount benefit. Instead, use the `onUserScrollStart` callback from `useVelocityScroll` (added in Phase 1A):

```typescript
// Wheel damping keyed to isVisible (only when user can interact)
const velocityScrollRef = useVelocityScroll({
  enabled: isVisible,
  onUserScrollStart: () => setHasUserScrolled(true),
});
```

Also promote on readiness signal:

```typescript
// After onReadyRef.current?.():
setIsReadyForSteady(true);
```

Demote back to `parked` automatically via the ternary (`!shouldPrime && !isVisible` → `OVERSCAN_PARKED`). Holdover session keeps `steady` since `isVisible=true`.

Update JSX:

```typescript
<VirtuosoMessageList
  ...
  increaseViewportBy={overscan}  // was: 10000
  ...
/>
```

### 2B. Message-Based Identity

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

Change `computeItemKey` (line 432-434):

```typescript
// Was: ({ index }) => `${sessionKey}:${String(index)}`
const computeItemKey = useCallback(
  ({ data }: { data: ChatMessage }): string => `${sessionKey}:${data.id}`,
  [sessionKey]
);
```

Add `itemIdentity` prop to VirtuosoMessageList:

```typescript
<VirtuosoMessageList
  ...
  itemIdentity={(message) => message.id}
  computeItemKey={computeItemKey}
  ...
/>
```

**Note on `reconcileMessageId`**: `chat-store.ts:438-448` mutates `message.id` in place during checkpoint flows. Since `itemIdentity` returns `message.id`, a reconciled ID will cause Virtuoso to treat it as a new item. This is acceptable — reconciliation happens once per checkpoint, and the list will re-measure that single item. Add a targeted regression test (see verification).

### Verification

- Cold mount: Performance trace shows 3-5 `MessageItemContent` renders on first frame
- After ready: rapid scroll up/down in long conversation — no ghost text
- Hidden instances: React DevTools shows 0 rendered items in overscan
- Short conversations (1-3 messages): readiness still fires
- Programmatic restore scroll does NOT promote `entry` → `steady`

### New Test Coverage

- Assert overscan phase transitions: `parked → entry → steady`
- Assert programmatic scroll does not trigger `hasUserScrolled`
- Assert `reconcileMessageId` + message-based identity: list re-renders the reconciled item correctly

---

## Phase 3: Event-Driven Readiness

**Impact**: Medium (~200ms latency reduction). **Risk**: Medium.

Replaces the current two-phase RAF polling (`waiting-for-content` → `waiting-for-stable` with STABLE_MS=150 and MAX_WAIT_MS=3000) with Virtuoso's own signals.

### Readiness State Machine (audit fix #1)

The current plan's original sequencing was wrong: it waited for `onRenderedDataChange` to include the last message _before_ issuing the bottom-placement scroll. For long sessions on hydrated remount (messages present but no `session-restore` intent), the last item is not initially rendered — causing a deadlock.

**Fix: position first, then stabilize.** Three-phase state machine:

```typescript
type RestorePhase = 'idle' | 'positioning' | 'stabilizing' | 'done';

const restorePhaseRef = useRef<RestorePhase>('idle');
```

**Sequence:**

1. **`idle` → `positioning`**: When `needsRestoreRef.current` is consumed (same trigger as today — covers both `session-restore` intent AND hydrated remounts without intent via `hasEverHadMessagesRef`).
   - Immediately call `scrollToItem({ index: 'LAST', align: 'end' })` to force bottom placement.
   - This causes Virtuoso to render items around the bottom, which will include the last message.

2. **`positioning` → `stabilizing`**: When `onRenderedDataChange` fires with the last message present.
   - The bottom-placement scroll has taken effect and Virtuoso has rendered the target range.
   - Attach a **temporary** `ResizeObserver` to `[data-testid="virtuoso-list"]`.
   - Start a `READY_STABLE_MS = 48ms` timer (3 frames at 60fps).
   - Reset timer on each ResizeObserver callback (content still settling).

3. **`stabilizing` → `done`**: When timer expires without ResizeObserver firing.
   - Final `scrollToItem({ index: 'LAST', align: 'end' })`.
   - Disconnect the temporary ResizeObserver.
   - Signal `onReady`.
   - Promote overscan to `steady`.

**Safety timeout**: `READY_TIMEOUT_MS = 1500ms` from phase `positioning` or `stabilizing` — whichever started. On timeout: signal ready regardless, promote overscan, disconnect observer.

**Cleanup on rapid switching**: If `shouldPrime` flips false (session is no longer the target) or component unmounts while in `positioning` or `stabilizing`, cancel the timeout, disconnect the temporary ResizeObserver, and reset to `idle`. This prevents stale timers/observers from A leaking into B during rapid A→B→C switching. Note: do NOT cancel on `isVisible` flipping false — hidden warm-up behind the holdover is intentional.

```typescript
useEffect(() => {
  if (!shouldPrime && restorePhaseRef.current !== 'done') {
    cancelReadinessWork();
    restorePhaseRef.current = 'idle';
  }
}, [shouldPrime]);
```

**Short conversations**: The `scrollHeight > clientHeight` gate is removed entirely. Short conversations (1-3 messages fitting in viewport) become ready as soon as `onRenderedDataChange` fires with the last message and 48ms passes without resize.

### Changes

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

Replace the readiness polling effect (lines 437-559) with the state machine above.

Add `onRenderedDataChange` callback:

```typescript
const handleRenderedDataChange = useCallback((rendered: ChatMessage[]): void => {
  if (restorePhaseRef.current !== 'positioning') return;
  const targetId = lastMessageIdRef.current;
  if (targetId === null || !rendered.some((item) => item.id === targetId)) return;
  restorePhaseRef.current = 'stabilizing';
  startTemporaryResizeStabilityWindow(); // attach ResizeObserver + timer
}, []);
```

Pass to VirtuosoMessageList:

```typescript
onRenderedDataChange = { handleRenderedDataChange };
```

### Constants

```typescript
const READY_STABLE_MS = 48; // was: STABLE_MS = 150
const READY_TIMEOUT_MS = 1500; // was: MAX_WAIT_MS = 3000
```

### Verification

- Measure switch-to-visible time: expect < 100ms (was 300-500ms)
- Session with 100+ messages: no blank screen on reveal
- Short conversation (2 messages): readiness fires immediately, no 3s wait
- Rapid session switching (A→B→C): no stale timers, no observers from A leaking
- Hydrated remount after LRU eviction: readiness fires correctly (position-first sequence)
- Active streaming: auto-scroll resumes without gap

### New Test Coverage

- First-visit holdover: previous session stays visible until new one signals ready
- Cached revisit: instant swap, no readiness wait
- Hydrated remount without `session-restore`: readiness completes via position-first path
- Rapid A→B→C: cleanup runs for intermediate sessions

---

## Phase 4: Per-Session Size Caching

**Impact**: Low-medium (smoother revisits). **Risk**: Low.

Uses the already-patched `getSizeRanges()`/`setSizeRanges()` API on VirtuosoMessageListMethods.

### Typed Cache Contract (audit fix #3)

**File**: `apps/agent/src/stores/chat/chat-store.ts`

```typescript
/** Opaque Virtuoso item measurement ranges — shape from getSizeRanges(). */
type VirtuosoSizeRange = ReadonlyArray<{ k: number; v: number }>;

interface VirtuosoSizeCache {
  ranges: VirtuosoSizeRange;
  messageCount: number;
  lastMessageId: string | null;
  /** Monotonic counter bumped on every height-affecting mutation.
   *  Cache is only valid when layoutVersion matches current session value. */
  layoutVersion: number;
}
```

Add `layoutVersion` and `virtuosoSizeCache` to `ChatSessionData`:

```typescript
export interface ChatSessionData {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  isStopPending: boolean;
  scrollIntent?: ScrollIntent | null;
  hydrationState: SessionHydrationState;
  layoutVersion: number; // NEW — starts at 0
  virtuosoSizeCache: VirtuosoSizeCache | null; // NEW
}
```

### Store Actions

```typescript
// New actions:
setVirtuosoSizeCache: (id: string, cache: VirtuosoSizeCache | null) => void;
clearVirtuosoSizeCache: (id: string) => void;
bumpLayoutVersion: (id: string) => void;
```

### Invalidation — `bumpLayoutVersion` Calls (audit fix #3)

Every height-affecting mutation must bump `layoutVersion`, which makes any previously-snapshotted cache stale:

| Action                   | File:Line            | Why heights change                         |
| ------------------------ | -------------------- | ------------------------------------------ |
| `setMessages`            | `chat-store.ts:~250` | Full message replacement                   |
| `appendToLastMessage`    | `chat-store.ts:336`  | Streaming grows message content            |
| `appendThinking`         | `chat-store.ts:360`  | Thinking block grows                       |
| `updateMessage`          | `chat-store.ts:386`  | Arbitrary message mutation                 |
| `patchImagePreviewUrl`   | `chat-store.ts:403`  | Image loads change message height          |
| `removeImageFromMessage` | `chat-store.ts:~425` | Image removal changes height               |
| `reconcileMessageId`     | `chat-store.ts:438`  | ID change invalidates identity-keyed sizes |

Each of these actions adds one line:

```typescript
draft.sessions[id].layoutVersion += 1;
```

### Cleanup Paths

- `createEmptySession()`: initialize `layoutVersion: 0, virtuosoSizeCache: null`
- `destroySession()`: no action needed (whole object is deleted)
- `remapSession()`: carry `layoutVersion` and `virtuosoSizeCache` to new key
- LRU eviction (`evictIfNeeded`): clear `virtuosoSizeCache` when clearing messages (set to `null`)

### Snapshot and Restore

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

**Getter** — read directly from store (no dedicated action needed):

```typescript
const cache = useChatStore.getState().sessions[sessionId]?.virtuosoSizeCache ?? null;
```

**Snapshot** (save sizes at three points):

```typescript
function snapshotSizeCache(): void {
  const handle = listRef.current;
  if (!handle || !sessionId) return;
  const store = useChatStore.getState();
  const session = store.sessions[sessionId];
  if (!session) return;
  store.setVirtuosoSizeCache(sessionId, {
    ranges: handle.getSizeRanges(),
    messageCount: session.messages.length,
    lastMessageId: session.messages.at(-1)?.id ?? null,
    layoutVersion: session.layoutVersion,
  });
}
```

- After readiness fires (`restorePhaseRef.current = 'done'`)
- When `shouldPrime` transitions false (via effect — session is no longer the target)
- On unmount (cleanup return)

**Restore** (seed measurements on mount):

```typescript
useLayoutEffect(() => {
  const cache = useChatStore.getState().sessions[sessionId]?.virtuosoSizeCache ?? null;
  const session = useChatStore.getState().sessions[sessionId];
  if (!cache || !session) return;
  // Only restore if layout hasn't changed since snapshot
  if (cache.layoutVersion !== session.layoutVersion) return;
  if (cache.messageCount !== session.messages.length) return;
  if (cache.lastMessageId !== (session.messages.at(-1)?.id ?? null)) return;
  listRef.current?.setSizeRanges(cache.ranges);
}, [sessionId]); // only on mount
```

### Verification

- Visit session A → switch to B → switch back to A: no ResizeObserver burst
- Agent adds messages to cached session while hidden: cache invalidated (`layoutVersion` bumped), fresh measurement on revisit
- Streaming on hidden session: `appendToLastMessage` bumps `layoutVersion`, cache not restored on re-show
- `reconcileMessageId`: cache invalidated by version bump

### New Test Coverage

- Size cache snapshot/restore round-trip
- Invalidation: `appendToLastMessage` / `updateMessage` / `patchImagePreviewUrl` bump `layoutVersion`
- Eviction clears cache
- Remap carries cache to new key

---

## Dev-Only Performance Marks

Add `performance.mark()` / `performance.measure()` gated behind `import.meta.env.DEV`:

| Mark                     | Location                                                |
| ------------------------ | ------------------------------------------------------- |
| `session-switch-start`   | `SessionInstanceManager` on activeSessionId change      |
| `session-ready`          | `ChatMessages` when onReady fires                       |
| `overscan-phase-change`  | `ChatMessages` on `parked→entry→steady` transitions     |
| `rendered-item-count`    | `onRenderedDataChange` during `entry` phase (log count) |
| `velocity-scroll-attach` | `useVelocityScroll` on attach                           |
| `velocity-scroll-detach` | `useVelocityScroll` on cleanup                          |
| `readiness-duration`     | `ChatMessages` measure from `positioning` to `done`     |

---

## Files Modified (Summary)

| File                                                        | Phase   | Changes                                                                                                                             |
| ----------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/services/conversations/claude-ui-bridge.test.ts` | 0       | Fix stale hydration test                                                                                                            |
| `__tests__/unit/components/chat/chat-messages.test.tsx`     | 0       | Fix stale tool selector test                                                                                                        |
| `hooks/ui/use-velocity-scroll.ts`                           | 1       | `enabled`, `onUserScrollStart`, early-return in `setRef`                                                                            |
| `components/layout/chat-area/SessionInstanceManager.tsx`    | 1       | Pass `isVisible` (renamed) + `shouldPrime` (new) to SessionInstance                                                                 |
| `components/layout/chat-area/SessionInstance.tsx`           | 1       | Accept `isVisible`+`shouldPrime`, thread to ChatMessages, wrap with `React.memo`                                                    |
| `components/chat/chat-messages.tsx`                         | 1,2,3,4 | `isVisible`+`shouldPrime` props, three-phase overscan, message-based identity, readiness state machine, size cache snapshot/restore |
| `stores/chat/chat-store.ts`                                 | 4       | `layoutVersion`, `virtuosoSizeCache` on `ChatSessionData`, set/clear/bump actions, cleanup in eviction/remap                        |

## Ship Order

```
Phase 0 (tests)  →  Phase 1 (observers)  →  Phase 2 (overscan)  →  Phase 3 (readiness)  →  Phase 4 (cache)
  prerequisite        very low risk            low-medium risk         medium risk              low risk
  test gate           biggest CPU win          biggest FPS win         latency win              polish
```

Each phase is independently shippable and testable. Phase 3 touches the same code region as Phase 2, so ship Phase 2 first.

## End-to-End Verification

1. `bun run check` — typecheck + lint + tests pass (including fixed baseline)
2. `bunx tauri dev` — launch app
3. Cold mount 5+ conversations with Performance recording
4. Cold mount FPS > 60 (was 2-3)
5. Switch latency < 100ms (was 300-500ms)
6. No visual regressions: no blank screens, no ghost text, no scrollbar jitter
7. Rapid scroll in long conversation: smooth, no ghost items
8. Cached revisits: instant, scroll position preserved
9. Active streaming: auto-scroll works, shimmer visible
10. Short conversations (1-3 messages): instant readiness, no timeout wait
11. Hydrated remount after LRU eviction: readiness fires correctly
12. Rapid A→B→C switching: no stale timers or observers leaked
