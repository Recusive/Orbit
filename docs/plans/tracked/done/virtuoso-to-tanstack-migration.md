# Migration Plan: Virtuoso → TanStack Virtual for Chat Message List

## Context

The current chat message list uses `@virtuoso.dev/message-list` — a commercial, opinionated chat virtualizer. It has three fundamental issues that workarounds haven't fully resolved:

1. **Async ResizeObserver causes scroll jitter** on first scroll — measurements settle after paint, causing visible jumps
2. **Scroll modifiers inflate the last data item's cached size** — all `DataWithScrollModifier` types accumulate stale height data on the final item
3. **`items-change` doesn't follow growing content** at the bottom during streaming — only `auto-scroll-to-bottom` works, but it has its own quirks

Commit `f00d27f9` moved the sentinel and shimmer to Virtuoso's Footer as a workaround, but jitter persists. The reference implementation at `/reference/t3code/` proves `@tanstack/react-virtual` works for this exact use case with synchronous measurement and direct scroll control.

**Goal:** Replace the virtualizer engine while preserving all production systems: session-switch verification, render cache persistence, multi-instance keep-alive, velocity scroll damping, and the 34 existing test behaviors.

---

## API Mapping: Virtuoso → TanStack Virtual

| Virtuoso API                                   | TanStack Virtual Equivalent                                 | Notes                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `<VirtuosoMessageList>` component              | `useVirtualizer()` hook + manual DOM                        | Headless — we own the scroll container and item positioning                                  |
| `<VirtuosoMessageListLicense>`                 | _(eliminated)_                                              | No license wrapper needed                                                                    |
| `ref={listRef}` / `VirtuosoMessageListMethods` | `rowVirtualizer` instance                                   | Direct access, no ref indirection                                                            |
| `data.replace(rows, opts)`                     | Reactive `count` + `scrollToIndex()`                        | Data changes via props; positioning via imperative scroll                                    |
| `data.getCurrentlyRendered()`                  | `rowVirtualizer.getVirtualItems()` + `nonVirtualizedRows`   | Tail rows always rendered — sentinel detection trivial                                       |
| `scrollToItem({index, align, behavior})`       | `rowVirtualizer.scrollToIndex()` or native `scrollTo()`     | Native `scrollTo()` preferred for bottom-targeting                                           |
| `scrollerElement()`                            | Direct `scrollContainerRef.current`                         | We own the scroller element                                                                  |
| `getSizeRanges()`                              | `rowVirtualizer.measurementsCache` (public `VirtualItem[]`) | Extract `{key, index, start, size, end, lane}` per item                                      |
| `setSizeRanges(ranges)`                        | `initialMeasurementsCache` + `estimateSize()` fallback      | Dual restore: full VirtualItem[] for exact fast path, key→size map for estimateSize fallback |
| `DataWithScrollModifier`                       | Native `scrollTo()` + `shouldAutoScrollRef`                 | See Scroll Management section                                                                |
| `increaseViewportBy` (pixels)                  | `overscan` (item count)                                     | See Overscan Budget section for height-aware conversion                                      |
| `Footer` component                             | Non-virtualized tail section                                | Sentinel + shimmer rendered after all rows                                                   |
| `itemIdentity` / `computeItemKey`              | `getItemKey` with width-scoped prefix                       | `width:${px}:${sessionKey}:${rowId}`                                                         |
| `ItemContent` render callback                  | Direct JSX in virtualizer map loop                          | `ref={measureElement}` on each item wrapper                                                  |
| `onRenderedDataChange`                         | `onChange` callback on virtualizer                          | Or reactive `useEffect` on `rowVirtualizer.range`                                            |

**API contract notes** (verified against `@tanstack/virtual-core@3.13.18` installed types + runtime source + official docs at `reference/tanstack-virtual/`):

- `measurementsCache` and `initialMeasurementsCache` are **public**. `itemSizeCache` is **private** and must NOT be accessed. Cache persistence uses the public `measurementsCache` → `initialMeasurementsCache` round-trip path. Note: `initialMeasurementsCache` is not yet in the official docs but is in the public type definitions and actively used by the runtime to seed both `measurementsCache` and `itemSizeCache` (virtual-core `index.js:438-441`). The documented alternative `resizeItem(index, size)` is available as a fallback if the option is ever removed.
- **`useFlushSync: false` required for React 19.** The default is `true`, which triggers: `flushSync was called from inside a lifecycle method` warnings. Official docs recommend `false` for React 19 (see `reference/tanstack-virtual/react-virtual.md`).
- **`useAnimationFrameWithResizeObserver` should default to `false`.** The official docs explicitly warn against enabling it — ResizeObserver callbacks already fire at optimal timing (after layout, before paint), and deferring adds ~16ms delay with no batching benefit. The t3code reference uses `true` but the docs say this is rarely warranted. We should start with `false` and only enable as a WKWebView workaround if the "undelivered notifications" error appears.
- `resizeItem(index, size)` is a documented public method for manually setting item sizes. This could serve as an alternative to `initialMeasurementsCache` for the warm-path restore (seeding sizes per-index after mount).

---

## New Cache Format

Replaces `VirtuosoSizeCache` (sparse index-based ranges) with a virtualizer-independent `ChatMeasurementCache` interface that decouples store/persistence code from any one virtualizer implementation.

```typescript
import type { VirtualItem } from '@tanstack/react-virtual';

/** Serializable measurement for a single row. */
interface PersistedMeasurement {
  key: string;
  index: number;
  start: number;
  size: number;
  end: number;
  lane: number;
}

/** Virtualizer-independent cache interface used by stores and persistence. */
interface ChatMeasurementCache {
  measurements: PersistedMeasurement[];
  messageCount: number;
  lastMessageId: string | null;
  layoutVersion: number;
  viewportWidth: number | null;
}
```

### Restore Strategy (Dual-Path)

**Path A — Exact restore via `initialMeasurementsCache`** (fast path):
When the persisted cache passes full validation (see `isExactMeasurementCache` below), cast `measurements` to `VirtualItem[]` and pass as `initialMeasurementsCache` to `useVirtualizer`. This pre-populates the internal measurement array with pixel-perfect positions — no ResizeObserver re-measurement needed.

**Path B — Estimate fallback via `estimateSize`** (warm path):
When the cache is present but fails exact validation (partial, stale layoutVersion, width mismatch), build a `Map<string, number>` from `measurements` keyed by `key` → `size`. The `estimateSize(index)` callback checks this map before falling back to content-aware `estimateMessageHeight()`.

**Path C — Cold estimate** (cold path):
No cache available. `estimateSize` uses `estimateMessageHeight()` exclusively.

### Exact Cache Validation (`isExactMeasurementCache`)

Replaces the current `isUsableRenderCache()` with a stricter contract that distinguishes "exact" (skip stabilization) from "warm" (use as estimates only):

```typescript
function isExactMeasurementCache(
  session: ChatSessionData,
  cache: ChatMeasurementCache,
  virtualizedRowCount: number,
  viewportWidth: number | null
): boolean {
  // Guard: when virtualizedRowCount === 0 (short conversations), there are no
  // virtualized rows to restore, so exact cache is inapplicable — return false
  // to avoid vacuously satisfying `measurements.length >= 0`.
  if (virtualizedRowCount === 0) return false;

  return (
    cache.layoutVersion === session.layoutVersion &&
    cache.messageCount === session.messages.length &&
    cache.lastMessageId === (session.messages.at(-1)?.id ?? null) &&
    cache.measurements.length >= virtualizedRowCount &&
    isViewportWidthCompatible(cache.viewportWidth, viewportWidth)
  );
}
```

The `restoredExactMeasurementsRef` boolean (replacing `restoredSizeCacheRef`) is set to `true` ONLY when Path A succeeds. Hidden/visible fast paths gate on this ref:

```typescript
const canUseInstantReadyPath = restoredExactMeasurementsRef.current && layoutPendingCount === 0;
```

### Partial Cache Rejection

A warm cache that covers fewer rows than `virtualizedRowCount` fails the exact check (`cache.measurements.length >= virtualizedRowCount`). It is still usable as Path B estimates but does NOT gate hidden/visible fast paths. This prevents partial caches from producing incorrect geometry during verification.

### Snapshotting

```typescript
function snapshotMeasurementCache(): ChatMeasurementCache {
  return {
    measurements: rowVirtualizer.measurementsCache.slice(0, virtualizedRowCount).map((item) => ({
      key: String(item.key),
      index: item.index,
      start: item.start,
      size: item.size,
      end: item.end,
      lane: item.lane,
    })),
    messageCount: rows.length,
    lastMessageId: rows.at(-1)?.id ?? null,
    layoutVersion,
    viewportWidth,
  };
}
```

### Persistence (Staged Rollout)

Same IndexedDB database (`orbit-render-cache`), same memory LRU (50 sessions), same 30-day expiry. The DB schema migration is deferred until Phase 3 when the TanStack renderer is active, because the current Virtuoso renderer consumes the old cache format on startup warmup (`main.tsx:78`), hover prefetch (`use-conversation-prefetch.ts:64`), background prefetch (`prefetch-sidebar-sessions.ts:76`), and live restore (`chat-messages.tsx:677-718`) — all of which keep running through Phase 1 and Phase 2.

#### Migration Topology: Single Store with Tagged Entries

We use **one IDB object store** (`size-caches`) with tagged entries throughout the rollout. This avoids the complexity of two stores (separate lookup order, cross-store warmup, stale-entry pruning). The `kind` discriminant is added to the persisted entry; the current untagged v1 shape is handled as "no `kind` field = legacy v1."

**Rollout stages:**

| Phase | DB_VERSION    | Parser behavior                                                 | Write behavior                                   |
| ----- | ------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| 1-2   | 1 (unchanged) | Accepts today's untagged v1 shape (current behavior, untouched) | Writes untagged v1 (current behavior, untouched) |
| 3     | 2 (bumped)    | Accepts untagged v1 OR tagged `tanstack-v2`                     | Writes tagged `tanstack-v2` only                 |
| 5     | 2             | Accepts tagged `tanstack-v2` only (v1 reader removed)           | Writes tagged `tanstack-v2` only                 |

**Critical Phase 1 constraint**: The live `parsePersistedEntry()` in `render-cache-store.ts:113-170` is NOT touched in Phase 1. It continues to parse the current untagged `{ sessionId, schemaVersion: 1, cache: VirtuosoSizeCache, accessedAt }` shape exactly as it does today. Phase 1 only adds type definitions and offline helpers — no runtime parser changes.

**Phase 3 parser** (replaces the live parser when the TanStack renderer activates):

```typescript
type LegacyPersistedEntryV1 = {
  sessionId: string;
  schemaVersion: 1;
  cache: VirtuosoSizeCache;
  accessedAt: number;
  // No `kind` field — this is today's shape
};

type TaggedPersistedEntryV2 = {
  kind: 'tanstack-v2';
  sessionId: string;
  cache: ChatMeasurementCache;
  accessedAt: number;
};

type PersistedRenderCache =
  | { kind: 'virtuoso-v1'; entry: LegacyPersistedEntryV1 }
  | { kind: 'tanstack-v2'; entry: TaggedPersistedEntryV2 };

function parsePersistedEntry(raw: unknown): PersistedRenderCache | null {
  // Try tagged v2 first (has explicit `kind` field)
  const v2 = parseTaggedV2(raw);
  if (v2) return { kind: 'tanstack-v2', entry: v2 };
  // Fall back to untagged v1 (today's shape — no `kind` field)
  const v1 = parseCurrentUntaggedV1(raw);
  if (v1) return { kind: 'virtuoso-v1', entry: v1 };
  return null;
}
```

**What DB_VERSION=2 `onupgradeneeded` does**: The handler checks `event.oldVersion` and, when upgrading from 1→2, does nothing structural — the existing `size-caches` object store is preserved with all its entries intact. The version bump is purely a signal: "this app instance now writes tagged v2 entries." No store creation, no store deletion, no data migration. Existing untagged v1 entries remain until overwritten or expired.

**Same-session conflict resolution**: When a session has a v1 entry and later gets re-saved as v2, the single store means the v2 write overwrites the v1 entry (same `sessionId` key). No conflict — v2 always wins by recency. Warmup (`loadAll()`) returns whichever entry exists; the `kind` discriminant tells the renderer which restore path to use.

**Stale v1 cleanup**: No explicit pruning needed. Once a session is visited after Phase 3, its cache is re-saved as v2, overwriting the v1 entry. Un-visited sessions retain v1 entries until they age out via the existing 30-day expiry or LRU eviction. In Phase 5, the v1 parser branch is removed — any remaining v1 entries fail to parse and are treated as cache misses (cold restore).

**Legacy v1 → v2 conversion** happens in the chat renderer (Phase 3) when row identity is available, NOT in the warmup/prefetch paths which lack conversation context:

```typescript
function buildLegacyEstimateMap(
  rows: ChatRenderRow[],
  legacy: VirtuosoSizeCache,
  widthScope: string
): Map<string, number> {
  const map = new Map<string, number>();
  let currentHeight = 0;
  for (let index = 0; index < rows.length; index++) {
    const nextRange = legacy.ranges.find((entry) => entry.k === index);
    if (nextRange) currentHeight = nextRange.v;
    const rowId = rows[index]?.id;
    if (!rowId || currentHeight <= 0) continue;
    map.set(`${widthScope}:${rowId}`, currentHeight);
  }
  return map;
}
```

This means: on first launch after Phase 3, existing users with v1 caches get Path B (warm estimates from legacy height data) rather than Path C (cold). The conversion requires rows to be loaded, so it runs in `chat-messages.tsx` during cache restore, not in the startup warmup or prefetch paths.

#### Prefetch API Stability

The current `preloadRenderCacheFromIdb()` and `getRenderCacheAsync()` callers in `use-conversation-prefetch.ts` and `prefetch-sidebar-sessions.ts` ignore the return value — they just warm the in-memory LRU. The external API signatures do NOT change. The format discrimination stays internal to `render-cache-store.ts`. When the renderer calls `getRenderCache(sessionId)`, it receives the raw `PersistedRenderCache` union and branches on `kind` locally.

### Late Async Cache Arrival

When `getRenderCacheAsync()` completes after verification has already started on fallback estimates, the late cache is **ignored for the current verification cycle**. It is stored in memory for the next session switch. Applying a late cache mid-verification would invalidate in-progress geometry snapshots.

---

## Scroll Management Replacement

Replaces `DataWithScrollModifier` with direct scroll control:

**Shared primitives:**

- `shouldAutoScrollRef` — tracks if user is near bottom (64px threshold, up from 4px)
- `lastScrollTopRef` — detects scroll direction
- `scheduleStickToBottom()` — RAF-debounced `scrollTo({top: scrollHeight})`
- Pointer/touch/wheel intent tracking (following t3code ChatView.tsx pattern)

**Per-intent mapping:**

| ScrollIntent      | Implementation                                                                 | Timing                  |
| ----------------- | ------------------------------------------------------------------------------ | ----------------------- |
| `history-load`    | `scrollToIndex(0, {align: 'start'})` or `scrollTo({top: 0})`                   | `useLayoutEffect`       |
| `compact-reload`  | Snapshot `isNearBottom`, RAF → `scrollToBottom()` if was at bottom             | `useLayoutEffect`       |
| `pending-verify`  | No action (position preserved by default)                                      | —                       |
| `session-restore` | `scrollToIndex(last, {align: 'end'})` + RAF `scrollToBottom()`                 | `useLayoutEffect`       |
| `session-refresh` | No action                                                                      | —                       |
| `rewind`          | RAF → `scrollToBottom()` if near bottom (200px threshold)                      | `useLayoutEffect`       |
| streaming         | `scheduleStickToBottom()` when `shouldAutoScrollRef && isAgentRunning`         | `useEffect` on messages |
| new-message       | `scrollToBottom('smooth')` for user msgs; `scheduleStickToBottom()` for others | `useEffect` on messages |

**`shouldAdjustScrollPositionOnItemSizeChange`** (from t3code MessagesTimeline.tsx:235-250):

- Returns `false` for items intersecting the viewport (streaming content grows in place)
- Returns `false` when remaining distance to bottom ≤ threshold (user at bottom)
- Returns `true` for above-viewport items when user scrolled up (preserves reading position)

---

## Overscan Budget

Virtuoso uses pixel-based `increaseViewportBy`; TanStack uses item-count-based `overscan`. Chat row heights are highly variable (48px short user → 400px+ code/tool widget). A fixed item count doesn't provide equivalent buffer across content types.

**Approach**: Derive overscan from a height budget divided by estimated average row height, clamped to reasonable bounds. Compute once per overscan phase transition:

```typescript
const AVG_ROW_HEIGHT_ESTIMATE = 160; // empirical median across mixed content
const OVERSCAN_ENTRY_BUDGET_PX = 800;
const OVERSCAN_STEADY_BUDGET_PX = 8000;

const overscan =
  overscanPhase === 'parked'
    ? 0
    : overscanPhase === 'entry'
      ? Math.max(4, Math.ceil(OVERSCAN_ENTRY_BUDGET_PX / AVG_ROW_HEIGHT_ESTIMATE)) // ~5
      : Math.max(8, Math.ceil(OVERSCAN_STEADY_BUDGET_PX / AVG_ROW_HEIGHT_ESTIMATE)); // ~50
```

The `AVG_ROW_HEIGHT_ESTIMATE` should be empirically validated with image/code/tool-widget conversations, not just plain text. During implementation, log actual `measurementsCache` sizes to calibrate.

---

## Unvirtualized Tail Rows

Adopts t3code's `ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 8` pattern:

```
virtualizedRowCount = max(0, rows.length - 8)
nonVirtualizedRows = rows.slice(virtualizedRowCount)
```

- During streaming (`isAgentRunning`), the unvirtualized range expands to include the entire active turn
- Sessions with ≤8 messages render entirely without the virtualizer (performance win)
- Tail sentinel and thinking shimmer render after non-virtualized rows (always in DOM)
- **Key win**: Eliminates "sentinel not yet rendered" positioning stalls entirely

### Edge Case: Tail Boundary Movement During Streaming

When the active turn grows and the unvirtualized boundary moves upward (more rows become non-virtualized), the virtualizer's `count` decreases. This causes:

1. Items at the boundary leave the virtualizer's measurement domain and enter the non-virtualized tail
2. Their positions are no longer managed by `measurementsCache`

**Handling**: Width-scoped keys ensure measurements are stable across the boundary. When a row exits the virtualizer, its DOM element is unmounted from the absolute-positioned region and re-mounted in the flow tail. Since `shouldAutoScrollRef` is true during streaming, `scheduleStickToBottom()` absorbs any transient scroll offset from the layout shift. The `shouldAdjustScrollPositionOnItemSizeChange` callback is not involved (the count decreased, it didn't resize).

### Edge Case: Short Conversations (≤8 messages)

When `renderRows.length <= ALWAYS_UNVIRTUALIZED_TAIL_ROWS`:

- `virtualizedRowCount = 0`, `nonVirtualizedRows = renderRows`
- The virtualizer wrapper div is not rendered (guard: `{virtualizedRowCount > 0 && ...}`)
- No virtualizer overhead — all rows render as plain React
- **Verification shortcut**: `ensureListSurfaceReady()` skips waiting for the virtualizer wrapper entirely. The "list surface" is the non-virtualized tail container itself. Verification goes directly to stabilization with `tailSentinelRendered: true` (sentinel is always in DOM).

### Edge Case: 8↔9 Row Threshold Crossing

When a conversation crosses the short-list threshold (8→9 rows or 9→8 rows via rewind), the rendering mode switches:

- **8→9 rows**: The virtualizer activates. `virtualizedRowCount` goes from 0 to 1. The list surface switches from the tail container to the virtualized wrapper div. The `data-testid="chat-list-inner"` attribute must transfer to the new wrapper. Velocity-scroll's observer target changes.
- **9→8 rows**: The virtualizer deactivates. `virtualizedRowCount` goes from 1 to 0. The wrapper unmounts. The tail container becomes the list surface again.

**Handling**: `findChatListSurface()` always queries `[data-testid="chat-list-inner"]` — it doesn't care whether the element is the virtualizer wrapper or the tail container. The `data-testid` is assigned conditionally in the render:

- When `virtualizedRowCount > 0`: the relative-positioned virtualizer wrapper carries `data-testid="chat-list-inner"`
- When `virtualizedRowCount === 0`: the tail container carries `data-testid="chat-list-inner"`

The velocity-scroll hook reattaches its observer via a `useEffect` that depends on the scroll container ref — when the inner list surface changes, the observer disconnects and reconnects to the new target on the next render cycle. This is the same lifecycle as the current Virtuoso implementation where the observer re-attaches after any mount change.

A dedicated regression test verifies this transition (see New Test Cases).

### Edge Case: Post-Hidden-Ready Tail Mutations

Images, code blocks, and tool widgets in non-virtualized tail rows can resize after hidden-ready but before visible commit. These are not covered by `shouldAdjustScrollPositionOnItemSizeChange` (which only fires for virtualized items).

**Handling**: A `ResizeObserver` on the non-virtualized tail container detects height changes. If a mutation occurs between hidden-ready and visible-ready:

- If `shouldAutoScrollRef` is true: `scheduleStickToBottom()` absorbs the shift
- If the user has scrolled up: the mutation does not affect viewport (it's below viewport)
- The visible-ready snapshot comparison catches the geometry change and either retries or uses the slow stabilization path (200ms quiet window)

---

## Phased Implementation

### Phase 1: Foundation Layer _(types and utilities only — no runtime changes)_

**Goal:** Introduce new types, shared selector constants, and utilities alongside existing ones. The IDB schema is NOT bumped here — the current Virtuoso cache format continues to be read and written by all live paths (startup warmup, prefetch, live restore). See "Persistence (Staged Rollout)" above.

**Files:**

- `apps/agent/src/stores/chat/chat-store.ts` — Add `ChatMeasurementCache`, `PersistedMeasurement`, and `PersistedRenderCache` (discriminated union) type definitions parallel to existing `VirtuosoSizeCache`. Add `measurementCache` field + `setMeasurementCache` action to `ChatSessionData`. Existing `virtuosoSizeCache` field and actions remain fully intact.
- `apps/agent/src/stores/chat/render-cache-store.ts` — Add new-format type definitions and offline helper functions (not wired to any runtime path). The live `parsePersistedEntry()` at lines 113-170 is NOT touched — it continues to parse today's untagged `{ sessionId, schemaVersion: 1, cache: VirtuosoSizeCache, accessedAt }` shape exactly as-is. NO DB_VERSION bump — that happens in Phase 3.
- **New:** `apps/agent/src/lib/chat/chat-scroll-utils.ts` — Extract `isNearBottom(container, threshold)`, `scrollToBottom(container, behavior)`, `estimateMessageHeight(message)` (from chat-messages.tsx lines 243-289)
- **New:** `apps/agent/src/lib/chat/chat-selectors.ts` — Shared DOM selector constants and query helpers:
  ```typescript
  export const CHAT_SCROLLER_SELECTOR = '[data-testid="chat-scroller"], [data-testid="virtuoso-scroller"]';
  export const CHAT_LIST_SURFACE_SELECTOR = '[data-testid="chat-list-inner"], [data-testid="virtuoso-list"]';
  export function findChatScroller(root: ParentNode): HTMLElement | null { ... }
  export function findChatListSurface(root: ParentNode): HTMLElement | null { ... }
  ```
  Multi-selector queries allow gradual migration — both old and new test IDs resolve during transition.
- Tests: Unit tests for new cache types (serialization, validation, `isExactMeasurementCache`, vacuous-zero guard) + scroll utils + `chat-selectors.ts` helpers + **regression test proving existing untagged v1 entries still warm successfully through startup and hover prefetch** (this locks down the "Phase 1 doesn't break live paths" contract)

**Verification:** `bun run check` passes. Zero runtime changes — existing Virtuoso read/write/restore paths completely unchanged. No IDB schema change. Live `parsePersistedEntry()` untouched.

### Phase 2: Selector and Helper Abstraction _(behavioral change: DOM queries only)_

**Goal:** Migrate all raw selector strings to the shared `chat-selectors.ts` module. This does NOT transfer scroll ownership — Virtuoso still owns the scroller. The goal is to make the Phase 3 diff smaller and reviewable by decoupling all consumer code from hardcoded `virtuoso-*` selectors.

**Why not scroll ownership here**: The audit identified that current scroll restore, ready-instance validation, geometry tracing, and velocity scroll all depend on the Virtuoso-owned scroller element. Wrapping the list in a new scroller div while Virtuoso still manages scrolling is not safely behavior-preserving. True scroll ownership transfers in Phase 3 with the virtualizer swap.

**Files:**

- `apps/agent/src/components/chat/chat-messages.tsx` — Replace all `[data-testid="virtuoso-scroller"]` and `[data-testid="virtuoso-list"]` queries with `findChatScroller()` / `findChatListSurface()` from `chat-selectors.ts`. `listRef.current?.scrollerElement()` calls remain unchanged (Virtuoso still owns scrolling).
- `apps/agent/src/hooks/ui/use-velocity-scroll.ts` — Import `CHAT_LIST_SURFACE_SELECTOR` instead of hardcoded `LIST_SELECTOR`
- `apps/agent/src/components/layout/chat-area/SessionInstance.tsx` — Use `findChatScroller()` instead of raw querySelector
- `apps/agent/src/services/conversations/session-switch-coordinator.ts` — Same
- `apps/agent/src/services/conversations/session-switch-trace.ts` — Same
- Tests: Update mock DOM to include both old and new `data-testid` attributes; update selector assertions
  - `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx`
  - `apps/agent/src/__tests__/unit/hooks/ui/use-velocity-scroll.test.tsx`
  - `apps/agent/src/__tests__/services/conversations/claude-ui-bridge.test.ts`
  - `apps/agent/src/__tests__/unit/components/layout/chat-area/session-instance-manager.test.tsx`

**Verification:** All 34 chat-messages tests pass. `grep -r '"virtuoso-scroller"\|"virtuoso-list"' apps/agent/src/ --include='*.ts' --include='*.tsx'` returns zero hits outside `chat-selectors.ts` fallback patterns. Manual: session switching, streaming, velocity scroll all work.

### Phase 3: Core Virtualizer Swap _(highest risk — main behavioral change)_

**Goal:** Replace `VirtuosoMessageList` with `useVirtualizer` + unvirtualized tail rows. This is where scroll ownership transfers from the library to the component. This is also where the IDB schema bumps to DB_VERSION=2 and legacy v1 cache conversion becomes active.

**Substeps** (for reviewability of this large diff):

**3a. Render skeleton**: Replace the JSX render section — swap `<VirtuosoMessageList>` for `useVirtualizer` hook + manual DOM with absolute-positioned items + non-virtualized tail rows + shimmer + sentinel. Add `scrollContainerRef` as explicit scroll owner. Short conversation path (`virtualizedRowCount === 0`) renders without virtualizer, assigns `data-testid="chat-list-inner"` to the tail container so `findChatListSurface()` and velocity-scroll have a concrete DOM target to observe.

**3b. Cache restore**: Wire the dual-path restore (`initialMeasurementsCache` for exact, `estimateSize` for warm, content-aware fallback for cold). Add `buildLegacyEstimateMap()` for v1→v2 conversion when row identity is available. Bump DB_VERSION=2 in `render-cache-store.ts`. The `onupgradeneeded` handler does NOT create a new object store — the existing `size-caches` store is kept as-is (single-store tagged entries per the Persistence section). The version bump only signals that the app now writes tagged v2 entries and reads both untagged v1 and tagged v2 from the same store.

**3c. Scroll-intent mapping**: Replace `DataWithScrollModifier` useMemo with imperative scroll management (`shouldAutoScrollRef`, pointer/touch/wheel intent tracking, `scheduleStickToBottom()`). Wire each `ScrollIntent` to its native `scrollTo()` / `scrollToIndex()` call.

**3d. Verification adaptation**: Adapt verification touchpoints to new API calls (see mapping below). This is a code-level substitution within the existing state machine, not a rewrite.

**Files:**

- `apps/agent/src/components/chat/chat-messages.tsx` — **Major rewrite of render section:**
  - Remove: `VirtuosoMessageList`, `VirtuosoMessageListLicense`, `DataWithScrollModifier` useMemo, `ChatFooter` component, `MessageItemContent` callback, all `listRef.current?.scrollerElement()` calls
  - Add: `scrollContainerRef` (explicit scroll owner), `useVirtualizer({...})` config with `initialMeasurementsCache` for exact restore + `estimateSize` seeded from cache + `useFlushSync: false` (React 19 required) + `useAnimationFrameWithResizeObserver: false` (per official docs; only enable if WKWebView "undelivered notifications" error appears), `ALWAYS_UNVIRTUALIZED_TAIL_ROWS` split, width tracking via ResizeObserver, width-scoped `getItemKey`, `shouldAdjustScrollPositionOnItemSizeChange`, `shouldAutoScrollRef` scroll management, scroll event listener with pointer/touch/wheel intent tracking, `ResizeObserver` on tail container for post-ready mutations, `rowVirtualizer.measure()` on image load (debounced per frame), `buildLegacyEstimateMap()` for v1 cache conversion
  - Render: `scrollContainerRef` div (owns `overflow-y: auto`) → relative container sized by `getTotalSize()` with `data-testid="chat-list-inner"` → absolute-positioned virtualized items with `ref={measureElement}` → flow tail rows → shimmer → sentinel. When `virtualizedRowCount === 0`, the relative container is omitted and the tail container itself carries `data-testid="chat-list-inner"`.
  - **Preserve intact**: All 30+ verification refs, all verification callbacks (with adapted API calls), all trace instrumentation, overscan phase logic (item-count based), layout mutation tracking
  - Adapt verification touchpoints:
    - `getCurrentlyRendered()` → `getVirtualItems().map(vi => rows[vi.index]) + nonVirtualizedRows`
    - `scrollToItem()` → `scrollToIndex()` or native `scrollTo()`
    - `getSizeRanges()` → `measurementsCache` (public)
    - `setSizeRanges()` → `initialMeasurementsCache` (exact path) or `estimateSize` (warm path)
    - `data.replace(rows, opts)` → reactive `count` + `scrollToIndex()`
    - `restoredSizeCacheRef` → `restoredExactMeasurementsRef` (strict: only true when `isExactMeasurementCache` passes and `initialMeasurementsCache` was used)
  - Short conversation path: when `virtualizedRowCount === 0`, skip virtualizer entirely, verification checks tail container directly
- `apps/agent/src/stores/chat/chat-store.ts` — `snapshotMeasurementCache()` now builds `ChatMeasurementCache` from public `measurementsCache`
- `apps/agent/src/stores/chat/render-cache-store.ts` — Bump DB_VERSION=2. The `onupgradeneeded` handler keeps the existing `size-caches` object store unchanged (single-store tagged entries — no new store created). Replace the live `parsePersistedEntry()` with the dual-format parser that accepts both untagged v1 and tagged v2 entries from the same store. New writes use tagged v2 format. Warmup/prefetch paths continue to warm whichever format exists (format discrimination internal to the store module).
- `apps/agent/src/lib/chat/chat-selectors.ts` — Remove old `virtuoso-*` fallback selectors (no longer needed post-swap)
- `apps/agent/src/lib/query/use-conversation-prefetch.ts` — No signature change needed (callers ignore return value; format discrimination stays internal to `render-cache-store.ts`)
- `apps/agent/src/lib/query/prefetch-sidebar-sessions.ts` — Same (no external API change)
- `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx` — Full rewrite of mock layer: replace `MockVirtuosoMessageListMethods` with mock `useVirtualizer` return; port all 34 tests + add new TanStack-specific cases (see New Test Cases below)

**Verification:**

- All 34 ported tests + new regression tests pass
- Manual test matrix: empty session, short conversation (< 8 msgs), long conversation (100+ msgs), streaming auto-scroll, new user message smooth scroll, history load, rewind, panel resize triggering width reflow

### Phase 4: Verification System Adaptation _(timing tuning)_

**Goal:** Tune the verification state machine for TanStack's measurement timing. Key insight: unvirtualized tail rows mean the sentinel is always in DOM, eliminating sentinel-probing stalls.

**Files:**

- `apps/agent/src/components/chat/chat-messages.tsx` — Verification callbacks only:
  - `ensureListSurfaceReady()` — When `virtualizedRowCount > 0`, check for virtualizer wrapper div. When `virtualizedRowCount === 0`, check for tail container. Both accessible via `findChatListSurface()`.
  - `getRenderSurfaceMetrics()` — `renderedRowCount` = `getVirtualItems().length + nonVirtualizedRows.length`; `tailSentinelRendered` always true when messages exist
  - `forceTailProbeRender()` — Simplified: just `scrollToIndex(last, {align: 'end'})`, no `data.replace()`
  - `startPremeasureIfNeeded()` — Less necessary (estimateSize seeded from cache); cold path uses native scrollTop walk
  - Timing constants: `HIDDEN_READY_STABLE_MS` may decrease from 48→32ms; `VISIBLE_READY_QUIET_MS` stays 200ms
  - Hidden-to-visible preseed snapshot comparison adapts for non-virtualized tail rows
  - **Width mismatch during promotion**: When hidden pre-mount width differs from visible width (sidebar resize, window resize during verification), width-scoped keys auto-invalidate cached measurements. The promotion detects this via `isViewportWidthCompatible()` and falls back to the slow stabilization path (200ms quiet) rather than the preseed fast path. The `restoredExactMeasurementsRef` is cleared.
- `apps/agent/src/services/conversations/session-switch-trace.ts` — Replace `purgeItemSizesUsed` with `restorePath: 'exact' | 'warm' | 'cold'` in geometry snapshot

**Verification:** Session switch latency targets:

- Warm cache + hidden fast path: < 50ms
- Cold cache + hidden slow path: < 200ms
- Visible preseed match: < 16ms
- No more than 20% regression in any path

### Phase 5: Cache Migration and Cleanup _(remove Virtuoso message-list entirely)_

**Goal:** Remove all `@virtuoso.dev/message-list` types, dual-format code, and the package dependency. Note: `react-virtuoso` (separate package, used in `ChangesList.tsx` for git diffs) is NOT part of this migration and remains.

**Files:**

- `apps/agent/src/stores/chat/chat-store.ts` — Remove `VirtuosoSizeCache`, `VirtuosoSizeRange`, `virtuosoSizeCache` field, `setVirtuosoSizeCache`/`clearVirtuosoSizeCache` actions, `PersistedRenderCache` union type. Keep `ChatMeasurementCache` as the sole cache type.
- `apps/agent/src/stores/chat/render-cache-store.ts` — Remove `virtuoso-v1` branch from `parsePersistedEntry`, remove `parseCurrentUntaggedV1()`, remove old format functions, remove `VirtuosoSizeCache` import, remove `LegacyPersistedEntryV1` type. Un-visited sessions with v1 entries fail to parse → treated as cache miss (cold). Keep only `ChatMeasurementCache` format.
- `apps/agent/src/components/chat/chat-messages.tsx` — Remove `buildEstimatedSizeRanges()`, `buildLegacyEstimateMap()`, old `isUsableRenderCache()` variant
- `apps/agent/src/components/layout/chat-area/ChatContent.tsx` — Update Virtuoso reference comments
- `apps/agent/src/services/chat/hydrate-conversation-snapshot.ts` — Verify `layoutVersion` preservation works with new cache format
- Comment/doc cleanup outside the scoped grep (e.g. doc-header comment in chat-messages.tsx, ChatContent.tsx comment) is in scope for Phase 5. References in `docs/` decision records (e.g. `VIRTUOSO-SCROLLBAR-JITTER-COMPENSATION.md`) are intentionally preserved as historical records.
- `package.json` — Remove `@virtuoso.dev/message-list` + its `patchedDependencies` entry. (`react-virtuoso` stays — it's unrelated.)
- Tests:
  - Rename `virtuoso-size-cache.test.ts` → `measurement-cache.test.ts`; update all type refs
  - `render-cache-store.test.ts` — Update to `ChatMeasurementCache` format, remove v1 compat tests
  - `session-instance-manager.test.tsx` — Remove `@virtuoso.dev/message-list` mock references
  - `claude-ui-bridge.test.ts` — Update ready-instance DOM fixtures

**Verification:** Scoped cleanup gate (excludes unrelated `react-virtuoso` usage in git diffs):

```bash
rg -n "@virtuoso.dev/message-list|VirtuosoMessageList|VirtuosoSizeCache|virtuoso-scroller|virtuoso-list" \
  apps/agent/src/components/chat \
  apps/agent/src/hooks/ui \
  apps/agent/src/services/conversations \
  apps/agent/src/stores/chat \
  apps/agent/src/lib/chat
```

Returns zero hits. `bun run check` passes. `bun install` clean.

### Phase 6: Velocity Scroll Adaptation and Polish

**Goal:** Verify velocity scroll damping works with TanStack's DOM structure; tune final constants.

**Files:**

- `apps/agent/src/hooks/ui/use-velocity-scroll.ts` — Verify MutationObserver/ResizeObserver targets correct elements. TanStack renders absolute-positioned items within a `position: relative` wrapper whose height = `getTotalSize()`. The velocity scroll's inner-list observation should target this wrapper div (via `findChatListSurface()`). `compensateScrollHeight()` reads `scroller.scrollHeight` which still changes when the wrapper height changes — no logic change, just verify the observation target.
- `apps/agent/src/components/chat/chat-messages.tsx` — Final constant tuning:
  - `BOTTOM_TOLERANCE_PX`: Two thresholds — 64px for auto-scroll detection, 4px for verification geometry checks
  - Overscan: height-budget-based item counts (see Overscan Budget section)
  - Verify `rowVirtualizer.measure()` on image load is debounced correctly
- Tests: `use-velocity-scroll.test.tsx` verification with new DOM structure

**Verification:** Manual on WKWebView (Tauri):

- Rapid wheel scroll: no ghost/blank items
- Scrollbar: no jitter during mid-list scrolling
- Streaming: auto-scroll follows reliably
- Session switch: no visible scroll jump

---

## New Test Cases (Required Before Implementation)

In addition to porting all 34 existing tests, these TanStack-specific regression cases must be added in Phase 3:

```typescript
describe('TanStack Virtual migration regressions', () => {
  it('rejects partial caches for hidden fast-path verification', () => {
    // Cache with fewer measurements than virtualizedRowCount → falls back to slow path
  });

  it('keeps short conversations ready without waiting for a virtualized surface', () => {
    // ≤8 messages → virtualizedRowCount === 0 → no virtualizer wrapper → verification
    // checks tail container directly and signals ready
  });

  it('re-measures after non-virtualized tail image loads before visible commit', () => {
    // Image load in tail row after hidden-ready → ResizeObserver fires →
    // visible-ready snapshot catches geometry change → slow stabilization path
  });

  it('survives active-turn tail expansion without scroll drift', () => {
    // Streaming grows unvirtualized region → rows leave virtualizer →
    // scroll position maintained via shouldAutoScrollRef + scheduleStickToBottom
  });

  it('ignores late async cache arrival during active verification', () => {
    // getRenderCacheAsync resolves after verification started on cold estimates →
    // cache stored in memory for next switch, not applied mid-verification
  });

  it('falls back to slow stabilization on width mismatch during promotion', () => {
    // Hidden width !== visible width (sidebar resize) → exact cache invalidated →
    // restoredExactMeasurementsRef cleared → slow visible path
  });

  it('switches cleanly between tail-only and virtualized rendering at 8/9 row boundary', () => {
    // 8 rows → virtualizedRowCount === 0, tail container is the list surface
    // Add 9th row → virtualizedRowCount === 1, virtualizer wrapper becomes list surface
    // Verify: findChatListSurface() returns correct element, velocity-scroll observer
    // reattaches, scroll position preserved, readiness stays coherent
    // Then rewind back to 8 rows → reverse transition
  });

  it('does not claim exact restore for short conversations (vacuous zero guard)', () => {
    // virtualizedRowCount === 0, cache.measurements.length >= 0 is trivially true
    // isExactMeasurementCache must return false → no instant ready path
  });
});
```

---

## Critical Files

### Core (High Risk)

| File                                                                   | Lines | Change Level                                             | Phase         |
| ---------------------------------------------------------------------- | ----- | -------------------------------------------------------- | ------------- |
| `apps/agent/src/components/chat/chat-messages.tsx`                     | 2445  | Major rewrite (render + scroll ownership + verification) | 2, 3, 4, 5, 6 |
| `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx` | 2161  | Full mock rewrite + 8 new TanStack regression cases      | 2, 3          |
| `apps/agent/src/stores/chat/chat-store.ts`                             | 500+  | Type migration + action changes                          | 1, 3, 5       |
| `apps/agent/src/stores/chat/render-cache-store.ts`                     | 510   | Persistence format migration + v1 compat reader          | 1, 5          |
| `apps/agent/src/hooks/ui/use-velocity-scroll.ts`                       | 400+  | Selector abstraction + DOM target verification           | 2, 6          |

### Integration Surface (Medium Risk)

| File                                                                  | Change Level                                                                 | Phase         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------- |
| `apps/agent/src/components/layout/chat-area/SessionInstance.tsx`      | Selector abstraction                                                         | 2             |
| `apps/agent/src/services/conversations/session-switch-coordinator.ts` | Selector abstraction                                                         | 2             |
| `apps/agent/src/services/conversations/session-switch-trace.ts`       | Selector abstraction + geometry snapshot update                              | 2, 4          |
| `apps/agent/src/main.tsx`                                             | Startup warmup — verify unchanged through Phase 1-2, format-aware in Phase 3 | 1 (verify), 3 |
| `apps/agent/src/services/chat/hydrate-conversation-snapshot.ts`       | Verify layoutVersion compat                                                  | 5             |
| `apps/agent/src/lib/query/use-conversation-prefetch.ts`               | No external API change (format stays internal to render-cache-store)         | 3 (verify)    |
| `apps/agent/src/lib/query/prefetch-sidebar-sessions.ts`               | Same — no external API change                                                | 3 (verify)    |
| `apps/agent/src/components/layout/chat-area/ChatContent.tsx`          | Comment update                                                               | 5             |

### New Files

| File                                           | Purpose                                                         | Phase |
| ---------------------------------------------- | --------------------------------------------------------------- | ----- |
| `apps/agent/src/lib/chat/chat-scroll-utils.ts` | `isNearBottom()`, `scrollToBottom()`, `estimateMessageHeight()` | 1     |
| `apps/agent/src/lib/chat/chat-selectors.ts`    | Shared DOM selectors + query helpers                            | 1     |

### Test Files

| File                                                                                          | Change Level                                       | Phase |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----- |
| `apps/agent/src/__tests__/unit/stores/chat/virtuoso-size-cache.test.ts`                       | Rename → `measurement-cache.test.ts`, update types | 5     |
| `apps/agent/src/__tests__/unit/stores/chat/render-cache-store.test.ts`                        | Update cache format assertions                     | 5     |
| `apps/agent/src/__tests__/unit/hooks/ui/use-velocity-scroll.test.tsx`                         | Selector abstraction + DOM structure update        | 2, 6  |
| `apps/agent/src/__tests__/services/conversations/claude-ui-bridge.test.ts`                    | Ready-instance DOM fixture update                  | 2, 5  |
| `apps/agent/src/__tests__/unit/components/layout/chat-area/session-instance-manager.test.tsx` | Remove Virtuoso mock refs                          | 2, 5  |

### Package

| File           | Change                                                            | Phase |
| -------------- | ----------------------------------------------------------------- | ----- |
| `package.json` | Remove `@virtuoso.dev/message-list` + `patchedDependencies` entry | 5     |

**Reference:** `/reference/t3code/apps/web/src/components/chat/MessagesTimeline.tsx` — proven patterns for all TanStack Virtual usage

---

## Risk Assessment

| Phase                    | Risk        | Mitigation                                                                                                                                                                                         |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (Foundation)           | Low         | Additive only, no runtime change                                                                                                                                                                   |
| 2 (Selector Abstraction) | Low-Medium  | Behavior-preserving: only DOM query paths change, Virtuoso still owns scrolling. Multi-selector patterns resolve both old and new test IDs during transition.                                      |
| **3 (Core Swap)**        | **High**    | 34 ported tests + 8 new regression cases as safety net. Verification system structure preserved with API call substitutions only. `restoredExactMeasurementsRef` provides strict fast-path gating. |
| 4 (Verification Tuning)  | Medium-High | State machine structure preserved. Width mismatch during promotion handled explicitly. Timing changes are empirical — may need iteration.                                                          |
| 5 (Cleanup)              | Low         | Structural removal, no behavioral change. Expanded file matrix catches all integration surfaces.                                                                                                   |
| 6 (Polish)               | Medium      | WKWebView behavior is empirically tuned. Velocity scroll already well-instrumented.                                                                                                                |

---

## Edge Cases: Remaining Detail

### Velocity-Scroll on Short Conversations (`virtualizedRowCount === 0`)

When `virtualizedRowCount === 0`, there is no virtualizer-sized wrapper div. The velocity-scroll hook observes the inner list surface via `findChatListSurface()`. In short conversations, the tail container itself carries `data-testid="chat-list-inner"`, giving the observer a concrete DOM target. The MutationObserver watches the tail container's style/height changes; the ResizeObserver watches its border-box. Functionally identical to the long-conversation path — only the target element differs.

### User-Scrolled-Up Boundary Crossing During Streaming

When the user has scrolled up while an active turn is expanding, rows may cross from the virtualized region into the non-virtualized tail near the viewport boundary:

1. The virtualizer's `count` decreases by 1 (the row leaves virtualized management)
2. The row unmounts from the absolute-positioned region and re-mounts in the flow tail
3. `shouldAutoScrollRef` is `false` (user scrolled up), so `scheduleStickToBottom()` does NOT fire
4. `shouldAdjustScrollPositionOnItemSizeChange` fires for the count decrease. Since the removed item was at/near the viewport boundary, the callback detects it intersects the viewport and returns `false` (no adjustment) — the content shifts naturally as the flow tail absorbs the row
5. The user's reading position is preserved because the above-viewport content hasn't changed

If this produces a visible jump during real testing, a mitigation is to use the interaction-anchor pattern from t3code (`onMessagesClickCapture` at ChatView.tsx:2094-2128): capture the nearest visible element's `getBoundingClientRect().top` before the boundary change, then compensate `scrollTop` after layout settles.

---

## End-to-End Verification

After all phases, confirm:

1. `bun run check` passes (typecheck + lint + tests)
2. Scoped cleanup gate — zero hits for chat-surface Virtuoso references:
   ```bash
   rg -n "@virtuoso.dev/message-list|VirtuosoMessageList|VirtuosoSizeCache|virtuoso-scroller|virtuoso-list" \
     apps/agent/src/components/chat apps/agent/src/hooks/ui \
     apps/agent/src/services/conversations apps/agent/src/stores/chat apps/agent/src/lib/chat
   ```
   Note: `react-virtuoso` in `ChangesList.tsx` (git diffs) is unrelated and remains.
3. Manual test on `bunx tauri dev`:
   - New conversation: messages render, streaming follows, user message animates
   - Short conversation (1-4 messages): renders without virtualizer, verification instant, velocity-scroll observer attaches to tail container
   - Long conversation (100+ msgs): scroll through without blanks or jitter
   - Session switching: instant for warm cache, < 200ms for cold
   - Session switch after sidebar resize: falls back to slow stabilization, no layout corruption
   - First launch after upgrade (v1 caches): legacy caches convert to warm estimates (Path B), no full cold reset
   - Panel resize: no stale heights, text reflows correctly, width-scoped keys invalidate
   - Rewind: messages remove, scrolls to new bottom
   - History load: scrolls to top
   - WKWebView velocity scroll: no ghost items on rapid scroll
   - Image load in streaming message: re-measure fires, no scroll jump
   - Active turn expansion during streaming (at bottom): no scroll drift as rows leave virtualizer
   - Active turn expansion during streaming (scrolled up): reading position preserved, no visible jump at boundary
