# Master Plan: Instant Session Switching

> **Goal:** Zero blank screens, zero skeletons, zero loading states during session switching.
> Click A → B → C with no visible gap and no first-scroll jitter.
>
> **Combined from:** TanStack Query data-layer plan + rendering-layer hardening plan.
> This is the production roadmap, not a local patch list.

---

## Non-Negotiable Invariants

These are the rules the implementation must satisfy. If a proposed change violates one of them, the change is wrong.

1. **Never blank the message area during a switch**
   - At every moment during A → B, either:
     - session A is still visibly shown, or
     - session B is visibly shown.
   - "Nothing shown" is not an allowed intermediate state.

2. **Only reveal `render-ready` sessions**
   - `data-ready` is not enough.
   - A session is not revealable until:
     - the list surface exists,
     - bottom metrics are real,
     - and the first visible interaction path is sufficiently measured/stable.

3. **Revisits must never get worse than first visits**
   - Hot revisits with valid render cache must stay instant.
   - Cache-miss revisits may use hidden warm-up, but must not regress into a blank middle frame.

4. **Data cache and render cache are separate concerns**
   - Canonical conversation payloads belong in the data cache (TanStack Query).
   - Virtuoso measurement artifacts belong in a render cache (persistent size cache).
   - Do not store render artifacts as if they were canonical backend data.

5. **`useVelocityScroll` is not the primary fix surface**
   - It may smooth input and compensate height churn.
   - It must not become the coordinator or correctness layer for session switching.

---

## Problem Statement

### The Data Problem

On a cold switch to an unseen session, the app waits on the full event pipeline:

1. `claudeConversationRepo.load()` posts `conversation:load` to Rust
2. Backend reads/parses JSONL and returns `conversation:loaded`
3. `ChatMessageService.handleConversationLoaded()` merges and restores tool state
4. Virtuoso renders/measures rows
5. `onReady` fires and the CSS handoff happens

This creates visible holdover and delay on first visits, and the same delay again after Zustand LRU eviction because the current in-memory caches are lost.

### The Rendering Problem

The blank and jitter defects are not only a data issue. They come from the reveal pipeline:

1. `ChatContent` can derive empty state from transient active-session message state and effectively hide all session instances during a switch.
2. `ChatMessages` can begin readiness from collapsed placeholder metrics before the real list surface exists.
3. Some tool/message rows still expand after mount, which can reintroduce scrollbar churn even after a correct handoff.

### What Already Works

- Mounted hot revisits are capable of instant CSS-only switching when the target render state is still valid.
- The keep-alive manager pattern itself is correct in principle:
  - `shownSessionId` vs `activeSessionId`
  - holdover while the target warms
  - offscreen hidden instances

The problem is not that the coordinator concept is wrong. The problem is that the current code can still misclassify "what is ready to show."

---

## Revisit Policy Matrix

This is the decision table the implementation must follow.

| Scenario                                                 | Data Cache | Render Cache | Switch Behavior                                            |
| -------------------------------------------------------- | ---------- | ------------ | ---------------------------------------------------------- |
| Hot revisit, valid render cache                          | yes        | yes          | Instant A → B                                              |
| Hot revisit, invalid render cache                        | yes        | no           | Keep A visible, hidden warm-up for B                       |
| Cold first visit, prefetched data                        | yes        | no           | Keep A visible, sync hydrate + hidden warm-up for B        |
| Cold first visit, no prefetched data                     | no         | no           | Keep A visible while data loads, then hidden warm-up for B |
| Evicted revisit, Query cache hit + render cache hit      | yes        | yes          | Instant A → B                                              |
| **Evicted revisit, Query cache hit + render cache miss** | **yes**    | **no**       | **Keep A visible, hidden warm-up for B**                   |
| Hydrated empty conversation                              | yes        | n/a          | Direct empty state, never transient blank                  |

**Critical rule:**
A cache-miss revisit may be slower than a hot revisit, but it must never produce A → blank → B.

---

## Definition Of `render-ready`

A session is `render-ready` only when all of these are true:

1. `scrollerElement()` exists
2. `[data-testid="virtuoso-list"]` exists
3. Bottom metrics are real, not placeholder/collapsed (`scrollHeight`/`clientHeight` from the real list surface)
4. Either:
   - the session is genuinely short and all messages are rendered, or
   - the last item is rendered and the first interaction corridor has been premeasured
5. No known high-risk late-expansion work remains for immediately visible rows

This explicitly rules out:

- placeholder `scrollHeight === clientHeight` metrics
- reveal before the list element exists
- "session was once ready" as a valid reason to reveal again

---

## Architecture Overview

Two layers, one outcome:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Data Cache (Phases 1-3)                               │
│  Make data available before the click.                          │
│                                                                 │
│  Sidebar hover ──► TanStack Query prefetch ──► Query cache      │
│  User clicks   ──► Cache hit? ──► Write to Zustand (sync)       │
│                    Cache miss? ──► Existing event-based flow     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: Render Pipeline + Cache (Phases 4-5)                  │
│  Guarantee the target is safe to reveal.                        │
│                                                                 │
│  render cache valid? ──► instant hot revisit                    │
│  render cache missing? ─► hidden warm-up behind holdover        │
│  never blank ───────────► old shown session holds until target   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Cache Responsibilities (TanStack Query)

- Conversation payloads (messages, tool-use data, session usage)
- Freshness / stale time / prefetch / request deduplication
- 30-min `gcTime` — survives Zustand's 20-session LRU eviction

### Render Cache Responsibilities (Persistent Size Cache)

- Virtuoso `sizeRanges`
- `layoutVersion` / `messageCount` / `lastMessageId` for invalidation
- Survives Zustand LRU eviction (module-level Map, not Zustand state)

### Why Zustand Stays

Zustand remains the React source of truth for:

- Currently shown/active session state
- Mounted-session management
- Write-through updates from backend events

TanStack Query supplements Zustand. It does not replace the event-based write path.

### Why Not Replace `handleConversationLoaded()`

`handleConversationLoaded()` already encodes:

- Streaming guard
- Staleness / epoch logic
- Active chain extraction
- Message merge rules
- Tool restoration
- Usage restoration

It is too risky to replace wholesale. The Query fast path bypasses it only when the cache gives a clean synchronous result. Otherwise the current event path remains the fallback.

---

## Phase 1: TanStack Query Foundation

> **Purpose:** Add the data cache library. Zero behavioral change.
> **Risk:** None. **Dependency:** None.

**Files to create:**

- `apps/agent/src/lib/query/query-client.ts`
- `apps/agent/src/lib/query/query-keys.ts`
- `apps/agent/src/lib/query/index.ts`

**Files to modify:**

- `package.json` — add `@tanstack/react-query`
- Provider composition (`main.tsx` or equivalent) — add `QueryClientProvider`

### 1.1 Install

```bash
bun add @tanstack/react-query
```

### 1.2 QueryClient singleton

**`apps/agent/src/lib/query/query-client.ts`**

```typescript
import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient for the Orbit app.
 *
 * Defaults tuned for a Tauri desktop app:
 * - No refetchOnWindowFocus (desktop app, not browser tab)
 * - No retries (Tauri invokes fail fast, retrying disk reads is pointless)
 * - Long gcTime (conversations are expensive to re-parse, keep them warm)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min — data is "fresh" (no background refetch)
      gcTime: 30 * 60 * 1000, // 30 min — survive Zustand's 20-session LRU eviction
      refetchOnWindowFocus: false, // Desktop app — not a browser tab
      retry: false, // Tauri invokes fail fast
    },
  },
});
```

### 1.3 Query key factory

**`apps/agent/src/lib/query/query-keys.ts`**

```typescript
/**
 * Centralized query key factory.
 * Pattern: [domain, entity, id] — enables:
 * - queryClient.invalidateQueries({ queryKey: ['conversations'] }) → all
 * - queryClient.invalidateQueries({ queryKey: ['conversations', 'detail', id] }) → one
 */
export const queryKeys = {
  conversations: {
    all: ['conversations'] as const,
    detail: (sessionId: string) => ['conversations', 'detail', sessionId] as const,
  },
} as const;
```

### 1.4 Wire provider

Wrap the app with `QueryClientProvider` in the same provider layer as ThemeProvider.

**Acceptance criteria:**

- [ ] `bun run check` passes
- [ ] App boots without errors
- [ ] No behavioral change

---

## Phase 2: Prefetch on Sidebar Hover

> **Purpose:** Fill the data cache during human motor time (~300ms hover-to-click).
> **Risk:** Low — fires background invokes, no existing flow changed.
> **Dependency:** Phase 1.

**Files to create:**

- `apps/agent/src/lib/query/use-conversation-prefetch.ts`

**Files to modify:**

- `apps/agent/src/components/layout/primary-sidebar/components/ConversationItem.tsx`
- `apps/agent/src/components/layout/primary-sidebar/components/ConversationList.tsx`
- `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`
- `apps/agent/src/components/layout/primary-sidebar/types.ts`

### 2.1 Prefetch hook

**`apps/agent/src/lib/query/use-conversation-prefetch.ts`**

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { conversationLoad } from '@/lib/api/conversations';
import { queryKeys } from './query-keys';

/**
 * Returns a stable callback that prefetches a conversation's data on hover.
 * Uses the direct conversationLoad() invoke — same path as reloadConversationFromDisk().
 */
export function useConversationPrefetch(): (sessionId: string) => void {
  const queryClient = useQueryClient();

  return useCallback(
    (sessionId: string): void => {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.conversations.detail(sessionId),
        queryFn: () => conversationLoad(sessionId),
      });
    },
    [queryClient]
  );
}
```

### 2.2 Wire into ConversationItem

Add `onPrefetch` prop to `ConversationItemProps`, fire on `mouseEnter`:

```typescript
// ConversationItem.tsx — update onMouseEnter:
onMouseEnter={() => {
  setIsHovered(true);
  onPrefetch?.();  // ← prefetch conversation data
}}
```

### 2.3 Thread through ConversationList → PrimarySidebar

```typescript
// PrimarySidebar.tsx:
const prefetchConversation = useConversationPrefetch();

<ConversationList
  ...existing props
  onPrefetchConversation={prefetchConversation}
/>
```

**Acceptance criteria:**

- [ ] Hovering a conversation fires `conversation_load` invoke (visible in dev logs)
- [ ] Clicking after hovering does NOT fire a second invoke (TanStack deduplicates)
- [ ] No behavioral change to existing session switching

---

## Phase 3: Cache-First Session Select

> **Purpose:** Bypass the 100-250ms backend round-trip when data is already cached.
> **Risk:** Medium — adds a fast path to `select()`. Existing flow is the fallback.
> **Dependency:** Phases 1 + 2.

**Files to modify:**

- `apps/agent/src/services/conversations/claude-ui-bridge.ts` — cache-first fast path
- `apps/agent/src/services/chat/chat-message-service.ts` — invalidate on persist

### 3.1 Fast path in `claudeUiBridge.select()`

Insert before the slow event-based `claudeConversationRepo.load()` call (`claude-ui-bridge.ts`, unloaded path after line 57):

```typescript
// FAST PATH: Check if TanStack Query has cached conversation data.
const cached = queryClient.getQueryData<ConversationDto | null>(
  queryKeys.conversations.detail(sessionId)
);

if (cached && cached.messages.length > 0) {
  const newMessages = cached.messages
    .filter(
      (m): m is typeof m & { role: 'user' | 'assistant' } =>
        m.role === 'user' || m.role === 'assistant'
    )
    .map((m) => mapPersistedMessage(m));

  const activeChain = getActiveChain(newMessages);

  chatStore.setMessages(sessionId, activeChain, 'session-restore');
  chatStore.markSessionHydrated(sessionId);
  chatStore.markSessionLoaded(sessionId);

  if (cached.sessionUsage) {
    useToolStore.getState().restoreSessionUsage(sessionId, toContextUsage(cached.sessionUsage));
  }

  restoreToolsForMessages(cached.messages, sessionId);

  uiState.setLoadingConversation(false);
  uiState.setConversationTransitioning(false);
  logger.debug(`[${sid}] FAST PATH: loaded from Query cache`, {
    msgCount: activeChain.length,
  });
  return;
}

// SLOW PATH: Fall through to existing event-based flow (unchanged)
```

The fast path replicates: message filtering, active chain extraction, usage restoration, tool restoration. It does NOT need: streaming guard, epoch staleness, message merge (evicted sessions have empty Zustand state).

### 3.2 Invalidate on persist

```typescript
// chat-message-service.ts, after conversationAddMessage() succeeds:
queryClient.invalidateQueries({
  queryKey: queryKeys.conversations.detail(sessionId),
});
```

### 3.3 Remove on delete

```typescript
// claude-ui-bridge.ts remove():
queryClient.removeQueries({
  queryKey: queryKeys.conversations.detail(sessionId),
});
```

**Acceptance criteria:**

- [ ] Hover → click: messages appear with no skeleton, no holdover delay
- [ ] Click without hover: falls through to existing flow (holdover visible, then swap)
- [ ] New message sent → next hover returns fresh data
- [ ] Conversation deleted → no stale cache

---

## Phase 4: Rendering Pipeline Hardening

> **Purpose:** Guarantee no blank frame even on cache miss. Fix known rendering bugs.
> **Risk:** Low-Medium — targeted fixes to specific bugs, NOT a coordinator rewrite.
> **Dependency:** None — can run in parallel with Phases 1-3.

**Files to modify:**

- `apps/agent/src/components/layout/chat-area/ChatContent.tsx`
- `apps/agent/src/components/chat/chat-messages.tsx`
- `apps/agent/src/components/layout/chat-area/SessionInstanceManager.tsx`

### 4.1 Fix the `isActiveHidden` transient blank

**Bug:** `ChatContent.tsx:111` passes `isActiveHidden={isEmptyState}`. During session switch, `isEmptyState` can become `true` transiently before `conversation:loaded` arrives, hiding all instances.

**Fix:** Empty state must be computed from definitive store state, not transient message props:

```typescript
// ChatContent.tsx — replace current isEmptyState:
const sessionHydration = useChatStore(
  (s) => s.sessions[sessionId ?? '']?.hydrationState ?? 'unloaded'
);
const isDefinitivelyEmpty =
  messages.length === 0 && !isLoadingConversation && sessionHydration === 'hydrated';
```

### 4.2 Add `waiting-for-surface` readiness guard

**Bug:** `ChatMessages` can start readiness timers before the Virtuoso list surface exists, leading to false-positive stabilization from placeholder metrics.

**Fix:** Guard readiness progression on real render surface existence:

```typescript
// chat-messages.tsx — add surface check:
function hasRenderSurface(): boolean {
  const handle = listRef.current;
  if (!handle) return false;
  const scroller = handle.scrollerElement();
  if (!scroller) return false;
  const list = scroller.querySelector('[data-testid="virtuoso-list"]');
  return list !== null;
}

// Do NOT start positioning/premeasuring/stabilizing until hasRenderSurface() returns true.
// If no surface, stay in 'idle' and retry on next RAF.
```

### 4.3 Null-guard `shownSessionId`

**Invariant:** `shownSessionId` must NEVER become null/undefined while a switch is in flight.

```typescript
// SessionInstanceManager.tsx — in handleStabilized:
setShownSessionId((prev) => {
  const currentActive = useChatStore.getState().activeSessionId;
  if (sessionId === currentActive) {
    return sessionId;
  }
  return prev; // INVARIANT: never return null during switch
});
```

**Acceptance criteria:**

- [ ] No switch path can produce zero visible session instances
- [ ] Hydrated empty conversation goes directly to empty state without blanking
- [ ] Long session first visit: no readiness signal before list surface exists
- [ ] `shownSessionId` never null/undefined during any switch

---

## Phase 5: Persistent Render Cache

> **Purpose:** Skip Virtuoso re-measurement after LRU eviction.
> **Risk:** Low — new module, minimal changes to existing code.
> **Dependency:** None — can run in parallel with everything.

**Files to create:**

- `apps/agent/src/stores/chat/render-cache-store.ts`

**Files to modify:**

- `apps/agent/src/stores/chat/chat-store.ts`
- `apps/agent/src/components/chat/chat-messages.tsx`

### 5.1 Persistent render cache module

Module-level `Map` that survives Zustand LRU eviction. NOT a Zustand store — read imperatively on mount.

**`apps/agent/src/stores/chat/render-cache-store.ts`**

```typescript
import { createLogger } from '@orbit/common/lib';

import type { VirtuosoSizeCache } from './chat-store';

const logger = createLogger('RenderCacheStore');

/**
 * Persistent Virtuoso size cache that survives Zustand LRU eviction.
 *
 * When ChatStore evicts a session (clearing messages + virtuosoSizeCache),
 * the size ranges are saved here. On re-mount, ChatMessages checks this
 * store BEFORE falling back to full re-measurement.
 *
 * Plain Map, not Zustand — no reactivity needed. Read once on mount.
 * LRU capped at 50 entries to prevent unbounded memory growth.
 */
const MAX_CACHED_SESSIONS = 50;
const cache = new Map<string, VirtuosoSizeCache>();
const accessOrder: string[] = [];

function touchLru(sessionId: string): void {
  const idx = accessOrder.indexOf(sessionId);
  if (idx >= 0) accessOrder.splice(idx, 1);
  accessOrder.push(sessionId);

  while (accessOrder.length > MAX_CACHED_SESSIONS) {
    const oldest = accessOrder.shift();
    if (oldest) {
      cache.delete(oldest);
      logger.debug('Evicted persistent render cache', { sessionId: oldest.slice(-6) });
    }
  }
}

export function saveRenderCache(sessionId: string, sizeCache: VirtuosoSizeCache): void {
  cache.set(sessionId, sizeCache);
  touchLru(sessionId);
  logger.debug('Saved render cache', {
    sessionId: sessionId.slice(-6),
    rangeCount: sizeCache.ranges.length,
    messageCount: sizeCache.messageCount,
  });
}

export function getRenderCache(sessionId: string): VirtuosoSizeCache | null {
  const entry = cache.get(sessionId);
  if (entry) touchLru(sessionId);
  return entry ?? null;
}

export function removeRenderCache(sessionId: string): void {
  cache.delete(sessionId);
  const idx = accessOrder.indexOf(sessionId);
  if (idx >= 0) accessOrder.splice(idx, 1);
}
```

### 5.2 Save before Zustand eviction

```typescript
// chat-store.ts evictIfNeeded(), BEFORE clearing the session:
if (session.virtuosoSizeCache) {
  saveRenderCache(candidate, session.virtuosoSizeCache);
}

// Then clear as before:
session.messages = [];
session.hydrationState = 'unloaded';
session.virtuosoSizeCache = null;
```

### 5.3 Restore on mount

```typescript
// chat-messages.tsx useLayoutEffect (line 320):
const store = useChatStore.getState();
const session = store.sessions[sessionId];
let sizeCache = session?.virtuosoSizeCache ?? null;

// Fallback: persistent render cache (survives Zustand LRU eviction)
if (!sizeCache) {
  sizeCache = getRenderCache(sessionId);
  if (sizeCache) {
    logger.debug(`[${sid}] Using persistent render cache (post-eviction restore)`);
  }
}

// Existing validation logic unchanged (layoutVersion, messageCount, lastMessageId)...
```

### 5.4 Clean up on delete

```typescript
// chat-store.ts destroySession():
removeRenderCache(id);
```

**Acceptance criteria:**

- [ ] Evict session → switch back → size cache restored, no re-measurement
- [ ] Delete session → render cache cleaned up
- [ ] LRU evicts at 50 entries
- [ ] `layoutVersion` mismatch → render cache skipped, fresh measurement

---

## Phase 6: Row Height Stability

> **Purpose:** Remove post-reveal height churn from late-expanding widgets.
> **Risk:** Low — audit and targeted CSS/component fixes.
> **Dependency:** Best done after Phases 4-5 so measurement baseline is clean.

**Files likely involved:**

- `apps/agent/src/components/chat/messages/MessageItem.tsx`
- Tool widgets under `apps/agent/src/components/chat/tools/`
- `apps/agent/src/globals.css`

### 6.1 Audit late-expanding rows

Likely sources:

- Bash widget lazy Shiki highlighting (swap from monospace placeholder → highlighted)
- Edit/Write diff preload/render
- Markdown/code block rendering
- Image sizing after mount
- Any widget that swaps "loading" → "real" height after reveal

### 6.2 Rules

- Immediately visible rows at reveal time must be height-stable
- If async rendering is unavoidable, reserve enough vertical space before reveal or precompute the heavy result during hidden warm-up
- Do not defer this phase indefinitely — even perfect handoff and perfect Query cache will not eliminate jitter if visible rows expand after reveal

**Acceptance criteria:**

- [ ] No large `scrollHeight` swings in the immediately visible band after reveal
- [ ] First scroll after reveal does not depend on live code-highlighting/diff expansion to settle

---

## Phase 7: Verification, Metrics, And Rollout

### 7.1 Performance targets

| Scenario                              | Target                              |
| ------------------------------------- | ----------------------------------- |
| Hot revisit + valid render cache      | Visually instant                    |
| Cache-hit first visit (hover → click) | No blank, sub-100ms visible handoff |
| Cold cache miss                       | Previous session held, never blank  |
| First interactive upward scroll       | No visible jitter                   |

### 7.2 Full test matrix

| Scenario                                   | Verified by                       |
| ------------------------------------------ | --------------------------------- |
| Hot revisit with valid render cache        | Phase 5 AC                        |
| Cache-miss revisit                         | Phase 4 AC                        |
| Cold first visit (hover → click)           | Phase 3 AC                        |
| Hydrated empty conversation                | Phase 4.1 AC                      |
| Rapid A → B → C → D switching              | Phase 4.3 AC                      |
| Eviction then revisit                      | Phase 3 + 5 AC                    |
| Deletion then revisit                      | Phase 3.3 + 5.4 AC                |
| Long tool-heavy session first upward fling | Phase 6 AC                        |
| New message → stale cache                  | Phase 3.2 AC                      |
| Switch during active streaming             | Existing behavior (hydrated path) |

### 7.3 Rollout guidance

- Phases 1+4+5 can start simultaneously (three independent workstreams).
- Phase 2 depends on 1. Phase 3 depends on 1+2.
- Phase 6 is best after 4+5 so measurement baseline is clean.
- Phase 7 gates on all previous phases.

**Critical shipping constraint:** Phase 4 (rendering fixes) must ship before or alongside Phase 3 (cache-first select) in any user-facing release. Without the `isActiveHidden` fix, cache-first select can still produce A → blank → B on cache edge cases (expired cache, click without hover, race conditions). The data-layer speed wins from Phase 3 are only safe to ship when the rendering-layer blank-prevention from Phase 4 is also in place.

**Recommended execution order for fastest perceived improvement:**

1. Phase 1 (Query foundation) + Phase 4 (rendering fixes) + Phase 5 (render cache) — all in parallel
2. Phase 2 (hover prefetch) — after Phase 1
3. Phase 3 (cache-first select) — after Phases 1+2+4 are all landed
4. Phase 6 (row height stability) — after 4+5
5. Phase 7 (verify + measure) — after all

### 7.4 What not to change lightly

- Do not replace `handleConversationLoaded()` wholesale
- Do not push more coordination logic into `useVelocityScroll`
- Do not use `messages.length === 0` alone to drive empty-state rendering during switches
- Do not treat "session was once stabilized" as sufficient for instant revisit unless render cache is also valid

---

## Implementation Order & Parallelism

```text
     Phase 1              Phase 4              Phase 5
  TanStack Query       Rendering Fixes      Persistent Render Cache
    Foundation         (isActiveHidden,       (module-level Map)
  (install, provider)  waiting-for-surface,
        │              shownSessionId guard)
        │                    │                      │
        ▼                    │                      │
     Phase 2                 │                      │
  Prefetch on Hover          │                      │
        │                    │                      │
        │                    │                      │
        ├────────────────────┤                      │
        │   Phase 3 REQUIRES Phase 4               │
        │   (blank-state fix must land              │
        │    before cache-first select ships)       │
        ▼                    ▼                      │
     Phase 3 ◄──── Phase 4 must land first         │
  Cache-First select()       │                      │
        │                    │                      │
        └────────────────────┴──────────────────────┘
                             │
                             ▼
                          Phase 6
                     Row Height Stability
                             │
                             ▼
                          Phase 7
                     Verify + Measure
```

**Three parallel workstreams, one gate:**

1. **Data** (1 → 2 → 3): TanStack Query install → prefetch → cache-first select
2. **Rendering** (4): Targeted fixes to isActiveHidden, readiness, shownSessionId
3. **Measurement** (5): Persistent render cache

**Gate:** Phase 3 (cache-first select) must not ship to users before Phase 4 (rendering fixes) lands. Without the blank-state fix, cache edge cases can still produce A → blank → B.
