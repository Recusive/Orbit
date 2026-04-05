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

- `apps/agent/src/lib/query/query-client.ts` — QueryClient singleton
- `apps/agent/src/lib/query/query-keys.ts` — Query key factory
- `apps/agent/src/lib/query/conversation-detail.ts` — Shared loader (`ensureConversationDetail`, `getFreshConversationDetail`)
- `apps/agent/src/lib/query/conversation-detail-cache.ts` — Centralized mutation helpers
- `apps/agent/src/lib/query/index.ts` — Barrel export

**Files to modify:**

- `package.json` — add `@tanstack/react-query`
- `apps/agent/src/App.tsx` — add `QueryClientProvider` in existing provider tree

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

### 1.4 Shared conversation-detail loader

**`apps/agent/src/lib/query/conversation-detail.ts`**

One loader used by both prefetch and select — eliminates duplicate `conversation_load` invokes:

```typescript
import { conversationLoad } from '@/lib/api/conversations';
import { queryClient } from './query-client';
import { queryKeys } from './query-keys';

import type { ConversationDto } from '@/lib/api/conversations';

/** Normalized result — select() never has to catch raw invoke errors. */
type ConversationDetailResult =
  | { kind: 'data'; conversation: ConversationDto }
  | { kind: 'empty'; conversation: ConversationDto }
  | { kind: 'error' };

/**
 * Normalize backend response: convert null (not-found / cache-only)
 * into a concrete empty ConversationDto. This ensures the Query cache
 * stores a real object, not null — so getFreshConversationDetail() can
 * distinguish "fresh empty" from "no cache entry."
 */
function normalizeConversationDetail(
  sessionId: string,
  raw: ConversationDto | null
): ConversationDetailResult {
  if (!raw) {
    return {
      kind: 'empty',
      conversation: {
        sessionId,
        title: 'Untitled',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      },
    };
  }
  if (raw.messages.length === 0) {
    return { kind: 'empty', conversation: raw };
  }
  return { kind: 'data', conversation: raw };
}

/**
 * Fetch conversation detail through the Query cache, non-throwing.
 *
 * Uses fetchQuery (NOT ensureQueryData) because:
 * - fetchQuery actually refetches when data is stale or invalidated
 * - ensureQueryData returns stale cached data by default (revalidateIfStale
 *   defaults to false and still returns cached data immediately)
 * - We need hover prefetch to produce FRESH data, not serve stale cache
 *
 * Deduplication: fetchQuery inherits TanStack Query's built-in deduplication.
 * If a fetch for the same queryKey is already in flight, fetchQuery joins it.
 *
 * See: https://tanstack.com/query/latest/docs/reference/QueryClient
 * fetchQuery: "If the query exists and the data is not invalidated or older
 * than the given staleTime, it will return the data from the cache."
 */
export async function loadConversationDetailFresh(
  sessionId: string
): Promise<ConversationDetailResult> {
  try {
    const raw = await queryClient.fetchQuery({
      queryKey: queryKeys.conversations.detail(sessionId),
      queryFn: async ({ signal }) => {
        // Plumb TanStack's AbortSignal into the invoke call.
        // When cancelQueries() fires (on delete/workspace switch),
        // the signal aborts and fetchQuery rejects — preventing
        // stale data from repopulating the cache.
        // See: https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
        const result = await conversationLoad(sessionId, undefined, signal);
        // Normalize null → concrete empty DTO before it enters the cache.
        return (
          result ??
          ({
            sessionId,
            title: 'Untitled',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
          } satisfies ConversationDto)
        );
      },
    });
    return normalizeConversationDetail(sessionId, raw);
  } catch {
    return { kind: 'error' };
  }
}

/**
 * Check if the Query cache has FRESH (non-stale, non-invalidated) data.
 * Used by the synchronous fast path to hydrate without async.
 *
 * Returns a normalized result — never bare null. Cached empty conversations
 * (messages: []) return { kind: 'empty', conversation } so the fast path
 * can show direct empty state.
 */
export function getFreshConversationDetail(sessionId: string): ConversationDetailResult | null {
  const state = queryClient.getQueryState(queryKeys.conversations.detail(sessionId));
  if (!state || state.isInvalidated || state.status !== 'success') {
    return null;
  }
  const staleTime = queryClient.getDefaultOptions().queries?.staleTime ?? 0;
  const dataAge = Date.now() - state.dataUpdatedAt;
  if (dataAge > staleTime) {
    return null;
  }
  const data = state.data as ConversationDto | undefined;
  if (!data) return null;
  return normalizeConversationDetail(sessionId, data);
}
```

### 1.5 Centralized cache mutation helpers

**`apps/agent/src/lib/query/conversation-detail-cache.ts`**

Called from every persistence/delete/rewind path — prevents scattered invalidation:

```typescript
import { queryClient } from './query-client';
import { queryKeys } from './query-keys';

/**
 * Two-tier staleness guard:
 *
 * 1. Per-session generation — bumped on message persist, rewind, delete.
 *    The join path captures before await, rechecks after.
 *
 * 2. Global workspace epoch — bumped on workspace/worktree switch.
 *    Catches in-flight prefetches for sessions not yet in generationMap
 *    (which per-session generation alone would miss).
 *
 * If EITHER changes during an async operation, the result is stale
 * and must NOT be used for hydration. The select path must ABORT,
 * not fall through to the slow path (which would re-load a deleted
 * or wrong-workspace session).
 */
let workspaceEpoch = 0;
const generationMap = new Map<string, number>();

export function getWorkspaceEpoch(): number {
  return workspaceEpoch;
}

export function getConversationGeneration(sessionId: string): number {
  return generationMap.get(sessionId) ?? 0;
}

function bumpGeneration(sessionId: string): void {
  generationMap.set(sessionId, (generationMap.get(sessionId) ?? 0) + 1);
}

/** Mark a conversation's cached detail as stale. Next access will refetch. */
export function markConversationDirty(sessionId: string): void {
  bumpGeneration(sessionId);
  queryClient.invalidateQueries({
    queryKey: queryKeys.conversations.detail(sessionId),
  });
}

/** Remove a conversation's cached detail entirely (on delete).
 *  Cancels any in-flight fetch FIRST — prevents a resolving fetchQuery
 *  from repopulating the cache after removal.
 *  See: https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation */
export async function removeConversationCache(sessionId: string): Promise<void> {
  bumpGeneration(sessionId);
  await queryClient.cancelQueries({
    queryKey: queryKeys.conversations.detail(sessionId),
  });
  queryClient.removeQueries({
    queryKey: queryKeys.conversations.detail(sessionId),
  });
}

/** Invalidate all conversation caches (on workspace/worktree change).
 *  Cancels ALL in-flight fetches first, then invalidates.
 *  Bumps global workspace epoch — catches in-flight prefetches for
 *  sessions not yet tracked in generationMap. */
export async function invalidateAllConversationCaches(): Promise<void> {
  workspaceEpoch++;
  for (const sid of generationMap.keys()) {
    bumpGeneration(sid);
  }
  await queryClient.cancelQueries({
    queryKey: queryKeys.conversations.all,
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.conversations.all,
  });
}

/** Dirty cache after title update (cached ConversationDto includes title).
 *  Only after backend persistence succeeds, not on optimistic UI update. */
export function markConversationTitleDirty(sessionId: string): void {
  markConversationDirty(sessionId);
}
```

### 1.6 Wire provider

Add `QueryClientProvider` in the existing root provider tree in `App.tsx:935`, next to `ThemeProvider`, `PierreProvider`, and `TauriProvider`. Do NOT add it in `main.tsx` — keep the provider stack in one place.

### 1.7 AbortSignal support for invoke() (REQUIRED)

Delete/workspace-switch correctness depends on `cancelQueries()` actually stopping in-flight fetches. This requires AbortSignal plumbing through the invoke layer.

**`apps/agent/src/lib/api/core.ts`** — add `signal` parameter to `invoke()`:

```typescript
export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  // ... existing IS_TAURI guard ...

  return Sentry.startSpan(/* ... */, async (span) => {
    try {
      const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');

      // Tauri invoke() does not support AbortSignal natively.
      // Use Promise.race to abort if signal fires before invoke resolves.
      const invokePromise = tauriInvoke<T>(command, args);

      if (!signal) {
        const result = await invokePromise;
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      }

      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const result = await Promise.race([
        invokePromise,
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }),
      ]);

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
}
```

**`apps/agent/src/lib/api/conversations.ts`** — add `signal` to `conversationLoad()`:

```typescript
export async function conversationLoad(
  sessionId: string,
  workspacePath?: string,
  signal?: AbortSignal
): Promise<ConversationDto | null> {
  return invoke<ConversationDto | null>('conversation_load', { sessionId, workspacePath }, signal);
}
```

**Acceptance criteria:**

- [ ] `bun run check` passes
- [ ] App boots without errors
- [ ] No behavioral change (signal parameter is optional, existing callers unaffected)
- [ ] AbortSignal plumbed from Query `queryFn` through `conversationLoad` to `invoke`

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

Uses the shared `loadConversationDetailFresh()` loader — so if select() fires later, it joins the same promise instead of starting a second invoke:

```typescript
import { useCallback } from 'react';

import { loadConversationDetailFresh } from './conversation-detail';

/**
 * Returns a stable callback that prefetches conversation data.
 * Uses loadConversationDetailFresh() — the same loader select() uses.
 * If a prefetch is in flight when the user clicks, select() joins it.
 * Non-throwing — prefetch failures are silently ignored (cache stays empty).
 */
export function useConversationPrefetch(): (sessionId: string) => void {
  return useCallback((sessionId: string): void => {
    void loadConversationDetailFresh(sessionId);
  }, []);
}
```

### 2.2 Wire into ConversationItem

Add `onPrefetch` prop to `ConversationItemProps`. Fire on both `onPointerEnter` (mouse) and `onFocus` (keyboard navigation):

```typescript
// ConversationItem.tsx:
onPointerEnter={() => {
  setIsHovered(true);
  onPrefetch?.();
}}
onFocus={() => {
  onPrefetch?.();
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
- [ ] Clicking after hovering does NOT fire a second invoke (shared loader deduplicates)
- [ ] Keyboard focus-navigating through conversations also prefetches
- [ ] No behavioral change to existing session switching

---

## Phase 3: Cache-First Session Select

> **Purpose:** Bypass the 100-250ms backend round-trip when data is already cached.
> **Risk:** Medium — adds a fast path to `select()`. Existing flow is the fallback.
> **Dependency:** Phases 1 + 2.

**Files to create:**

- `apps/agent/src/services/chat/hydrate-conversation-snapshot.ts` — Shared hydration helper

**Files to modify:**

- `apps/agent/src/services/conversations/claude-ui-bridge.ts` — cache-first fast path
- `apps/agent/src/services/chat/chat-message-service.ts` — extract mapper, use centralized invalidation, call shared hydration
- All `conversationAddMessage()` call sites — use `markConversationDirty()`

### 3.1 Extract shared hydration logic

**Problem:** The fast path duplicates hydration logic from `handleConversationLoaded()`. This will drift.

**Solution:** Extract `hydrateConversationSnapshot()` — used by BOTH `handleConversationLoaded()` (slow path) and the Query fast path:

**`apps/agent/src/services/chat/hydrate-conversation-snapshot.ts`**

```typescript
import type { ChatMessage } from '@/components/chat';
import type { ConversationMessageDto, SessionUsageDto } from '@/lib/api/conversations';
import type { ScrollIntent } from '@/stores/chat/chat-store';

export interface HydrateConversationSnapshotInput {
  sessionId: string;
  dtoMessages: ConversationMessageDto[];
  sessionUsage?: SessionUsageDto;
  /** 'session-restore' for first visit, 'session-refresh' for hydrated reload. */
  scrollIntent: ScrollIntent;
  /**
   * Optional cached messages for client-only state enrichment
   * (e.g., interruptReason). Pass when merging with existing session data.
   * The slow path passes the current Zustand messages; the fast path passes undefined.
   */
  cachedMessages?: ReadonlyArray<ChatMessage>;
  /** Which path is calling — controls whether to seed the Query cache. */
  source: 'event-load' | 'query-fast-path';
  /**
   * Title from the loaded conversation. Used for Query cache seeding.
   * The conversation:loaded event carries title; the fast path has it from
   * the cached ConversationDto.
   */
  title: string;
}

/**
 * Shared hydration logic: DTO → active chain → store writes.
 *
 * This helper handles the PURE TRANSFORMATION + STORE WRITE phase.
 * It does NOT handle: streaming guards, stale-navigation guards, merge
 * policy decisions, or scrollIntent selection — those stay at the call site.
 *
 * Called by both:
 * - handleConversationLoaded() — after its guards pass, with scrollIntent from its logic
 * - cache-first select() — directly, with 'session-restore' scrollIntent
 */
export function hydrateConversationSnapshot(input: HydrateConversationSnapshotInput): void {
  // 1. Filter to user/assistant, map via mapPersistedMessage()
  // 2. Extract active chain via getActiveChain()
  // 3. If cachedMessages provided, enrich with client-only fields (interruptReason)
  // 4. chatStore.setMessages(sessionId, activeChain, input.scrollIntent)
  // 5. chatStore.markSessionHydrated(sessionId)
  // 6. chatStore.markSessionLoaded(sessionId)
  // 7. chatStore.bumpConversationLoadEpoch()
  // 8. Restore session usage with collectUsageMessageIds()
  // 9. Restore tool widgets per-message via restoreToolsForMessage()
  // 10. useToolStore.getState().switchSession(sessionId)
}
```

**Implementation notes:**

- `mapPersistedMessage()` must be extracted from `chat-message-service.ts:137` into this module (or a shared mapper file) so it's no longer private.
- `handleConversationLoaded()` keeps its streaming guard, stale-navigation guard, and merge logic — it calls `hydrateConversationSnapshot()` for the store-write phase, passing `scrollIntent` and `cachedMessages` from its own context.
- The fast path calls `hydrateConversationSnapshot()` with `scrollIntent: 'session-restore'` and no `cachedMessages` (evicted sessions have empty Zustand state).
- The slow path calls it with `scrollIntent` chosen by its own logic (`session-restore` for first load, `session-refresh` for hydrated reload) and passes the current Zustand messages for `interruptReason` enrichment.
- **Slow-path cache seeding:** After `hydrateConversationSnapshot()` completes via the event-based slow path, seed the Query cache so subsequent optimistic appends and revisits work. Without this, sessions first loaded through the slow path have no Query cache entry — `appendMessageToConversationCache()` no-ops on missing cache, breaking the "append-then-hover" guarantee. See Phase 3.4.
- **AbortSignal plumbing (REQUIRED, not optional):** This is a concrete Phase 1 deliverable. `conversationLoad()` in `lib/api/conversations.ts` must accept an optional `AbortSignal` parameter. The core `invoke()` wrapper in `lib/api/core.ts` must consume it via `Promise.race([tauriInvoke(...), abortPromise])` since Tauri's native `invoke()` does not support AbortSignal. This enables `cancelQueries()` to actually stop in-flight fetches — delete/workspace-switch correctness depends on it. See Phase 1.7.

### 3.2 Fast path in `claudeUiBridge.select()`

Insert BETWEEN the hydrated check (line 56) and the first-visit loading-state setup (line 58). Uses `getFreshConversationDetail()` — which checks both data existence AND freshness (not stale, not invalidated):

```typescript
// claude-ui-bridge.ts select() — after isHydrated check, before first-visit path:

// ── FRESH CACHE PATH (synchronous) ──
// getFreshConversationDetail() returns a normalized result:
// - { kind: 'data', conversation } for messages > 0
// - { kind: 'empty', conversation } for empty conversations (including null → normalized)
// - null if cache is missing, stale, or invalidated
const freshResult = getFreshConversationDetail(sessionId);

if (freshResult) {
  uiState.setActiveConversation(sessionId, title);
  chatStore.setActiveSession(sessionId);
  useFileStore.getState().switchSession(sessionId);

  if (freshResult.kind === 'data') {
    hydrateConversationSnapshot({
      sessionId,
      title: title ?? freshResult.conversation.title,
      dtoMessages: freshResult.conversation.messages,
      sessionUsage: freshResult.conversation.sessionUsage,
      scrollIntent: 'session-restore',
      source: 'query-fast-path',
    });
  } else {
    // kind === 'empty' — direct empty state, no transient blank
    chatStore.setMessages(sessionId, [], 'session-restore');
    chatStore.markSessionHydrated(sessionId);
    chatStore.markSessionLoaded(sessionId);
    chatStore.bumpConversationLoadEpoch();
  }

  uiState.setLoadingConversation(false);
  uiState.setConversationTransitioning(false);
  logger.debug(`[${sid}] FAST PATH: ${freshResult.kind} from fresh cache`);
  return;
}

// ── IN-FLIGHT JOIN PATH (async, with two-tier staleness guard) ──
// If a prefetch is in-flight, join it instead of starting a second invoke.
const queryState = queryClient.getQueryState(queryKeys.conversations.detail(sessionId));
if (queryState?.fetchStatus === 'fetching') {
  uiState.setLoadingConversation(true);
  uiState.setConversationTransitioning(true);
  uiState.setActiveConversation(sessionId, title);
  chatStore.setActiveSession(sessionId);
  useFileStore.getState().switchSession(sessionId);

  // Capture BOTH guards before await:
  // - workspace epoch: catches workspace/worktree switches
  // - session generation: catches message persist, rewind, delete
  const epochBefore = getWorkspaceEpoch();
  const genBefore = getConversationGeneration(sessionId);
  const result = await loadConversationDetailFresh(sessionId);
  const epochAfter = getWorkspaceEpoch();
  const genAfter = getConversationGeneration(sessionId);

  // Stale guard: if EITHER changed during await, ABORT entirely.
  // Do NOT fall through to slow path — that would re-load a deleted
  // or wrong-workspace session.
  if (epochBefore !== epochAfter || genBefore !== genAfter) {
    logger.debug(
      `[${sid}] JOIN PATH: stale (epoch ${String(epochBefore)}→${String(epochAfter)}, gen ${String(genBefore)}→${String(genAfter)}), aborting`
    );
    uiState.setLoadingConversation(false);
    uiState.setConversationTransitioning(false);
    return;
  }

  if (result.kind === 'data') {
    hydrateConversationSnapshot({
      sessionId,
      title: title ?? result.conversation.title,
      dtoMessages: result.conversation.messages,
      sessionUsage: result.conversation.sessionUsage,
      scrollIntent: 'session-restore',
      source: 'query-fast-path',
    });
    uiState.setLoadingConversation(false);
    uiState.setConversationTransitioning(false);
    return;
  }

  if (result.kind === 'empty') {
    chatStore.setMessages(sessionId, [], 'session-restore');
    chatStore.markSessionHydrated(sessionId);
    chatStore.markSessionLoaded(sessionId);
    chatStore.bumpConversationLoadEpoch();
    uiState.setLoadingConversation(false);
    uiState.setConversationTransitioning(false);
    return;
  }

  // result.kind === 'error' — fall through to slow path only on actual error
  logger.debug(`[${sid}] JOIN PATH: loader error, falling through to slow path`);
}

// SLOW PATH: Fall through to existing event-based flow (unchanged)
```

### 3.3 Seed Query cache from slow event path

**Problem:** The optimistic `appendMessageToConversationCache()` only updates an existing cached `ConversationDto` — it no-ops if there's no cache entry. But sessions first loaded through the slow event path (`conversation:loaded` → `handleConversationLoaded()`) never populate the Query cache. So any message append to a slow-path-loaded session silently fails to update the cache.

**Solution:** After `hydrateConversationSnapshot()` finishes via the slow event path, seed the Query cache with the hydrated snapshot:

```typescript
// In hydrateConversationSnapshot(), at the end (after all store writes):
// Only seed when called from the event-load path — the fast path already
// has the data in the Query cache (that's where it read it from).
if (input.source === 'event-load') {
  // The conversation:loaded event carries: session_id, title, messages,
  // session_usage. It does NOT carry createdAt/updatedAt.
  // Use Date.now() for updatedAt (we just loaded it, so it's current).
  // createdAt is non-critical for cache purposes — use Date.now() as well.
  // The canonical createdAt lives in the JSONL on disk, not in the cache.
  queryClient.setQueryData(queryKeys.conversations.detail(input.sessionId), {
    sessionId: input.sessionId,
    title: input.title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: input.dtoMessages,
    ...(input.sessionUsage ? { sessionUsage: input.sessionUsage } : {}),
  } satisfies ConversationDto);
}
```

This ensures every session — whether reached via fast path or slow path — has a Query cache entry for subsequent optimistic appends and revisits.

**Note:** `createdAt` / `updatedAt` in the Query cache are approximations (`Date.now()`). They are used only for cache metadata, not displayed to the user. The canonical timestamps live in the JSONL on disk and in the sidebar's `ConversationSummaryDto` (which comes from `conversation:list`, not from this cache).

### 3.4 Centralized cache mutation strategy

**Problem:** All `conversationAddMessage()` calls in the codebase are fire-and-forget (`void` prefix, no `await`). If we dirty the cache immediately after dispatch, a hover refetch can run before the disk write lands and refresh stale data as "fresh" for 5 minutes.

**Solution:** Two-phase mutation — optimistic local update first, invalidation on completion:

```typescript
// ── Phase A: Optimistic write-through (immediate, before persist) ──
// Append the message to the cached ConversationDto so any hover
// refetch or sync fast-path read sees the new message immediately.
import { appendMessageToConversationCache } from '@/lib/query/conversation-detail-cache';

appendMessageToConversationCache(sessionId, messageDto);

// ── Phase B: Dirty on persistence completion (async) ──
// After disk write finishes (success or failure), dirty the cache so
// the next refetch gets ground-truth from backend. This handles the
// case where the optimistic update was wrong (e.g., backend rejected).
void conversationAddMessage(sessionId, messageDto, workspacePath, worktreePath)
  .then(() => {
    markConversationDirty(sessionId);
  })
  .catch(() => {
    // On failure, also dirty — forces refetch to reconcile
    markConversationDirty(sessionId);
  });
```

**Add to `conversation-detail-cache.ts`:**

```typescript
/** Optimistic append — updates cached ConversationDto without refetching.
 *  Used before fire-and-forget persistence so hover reads see new messages. */
export function appendMessageToConversationCache(
  sessionId: string,
  message: ConversationMessageDto
): void {
  queryClient.setQueryData(
    queryKeys.conversations.detail(sessionId),
    (prev: ConversationDto | undefined) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [...prev.messages, message],
        updatedAt: Date.now(),
      };
    }
  );
}
```

**Integration points (5 call sites — ALL must be migrated):**

```typescript
// 1. chat-message-service.ts:777 — completed assistant message persistence
appendMessageToConversationCache(sessionId, messageDto);
void conversationAddMessage(...).then(() => markConversationDirty(sessionId))
  .catch(() => markConversationDirty(sessionId));

// 2. chat-actions.ts:228 — user message persistence (handleSend)
// Same two-phase pattern

// 3. chat-actions.ts:329 — interrupted assistant message persistence (handleStop)
// Same two-phase pattern

// 4. chat-actions.ts:534 — interrupted assistant message persistence (second path)
// Same two-phase pattern

// 5. use-chat-messages.ts:374 — initial conversation load persistence
// Same two-phase pattern
```

**Other mutation paths (dirty on completion only):**

```typescript
// ── Rewind (no optimistic update — rewind changes the active chain) ──
// chat-message-service.ts — in handleConversationRewound():
markConversationDirty(message.session_id);

// ── Title update (dirty after backend persistence succeeds) ──
// claude-ui-bridge.ts rename():
await claudeConversationRepo.updateTitle(sessionId, title);
markConversationTitleDirty(sessionId); // AFTER success, not before
```

### 3.4 Invalidate on workspace/worktree change

**MUST AWAIT** — `invalidateAllConversationCaches()` is `async` because it calls `cancelQueries()` first. If not awaited, a fast follow-up `select()` can race with cancellation.

```typescript
// use-sidebar-actions.ts — in worktree switching handler:
await invalidateAllConversationCaches();

// Workspace initialization (TauriProvider or workspace restore path):
await invalidateAllConversationCaches();

// Recent-project switching (if workspace path changes):
await invalidateAllConversationCaches();
```

If the caller is synchronous and cannot `await`, the workspace epoch guard in `select()` (captured before async operations) provides a secondary safety net.

### 3.5 Remove on delete

**MUST AWAIT** — `removeConversationCache()` is `async` because it calls `cancelQueries()` first. Without `await`, a resolving in-flight fetch can repopulate the cache after removal.

```typescript
// claude-ui-bridge.ts remove() — already async:
await removeConversationCache(sessionId);
```

**Acceptance criteria:**

- [ ] Hover → click: messages appear with no skeleton, no holdover delay
- [ ] Click without hover: falls through to existing flow (holdover visible, then swap)
- [ ] Click while prefetch in-flight: joins existing promise, single invoke
- [ ] New message sent → next hover returns fresh data (invalidated cache not served by `getFreshConversationDetail`)
- [ ] Conversation deleted → no stale cache, late in-flight prefetch discarded by generation guard
- [ ] Rewind → switch away → switch back: gets post-rewind messages (generation bumped, stale cache rejected)
- [ ] Empty conversation cache hit → direct empty state, no transient blank
- [ ] Workspace change → all old conversation caches invalidated, generations bumped
- [ ] Stale slow-path `conversation:loaded` after fast-path: rejected by epoch guard
- [ ] `hydrateConversationSnapshot()` used by both slow path and fast path (shared contract, no logic drift)
- [ ] All 5 `conversationAddMessage()` call sites migrated to optimistic append + dirty-on-completion
- [ ] Title update dirties cache via `markConversationTitleDirty()`
- [ ] `loadConversationDetailFresh()` error → `{ kind: 'error' }` → falls through to slow path, no unhandled promise
- [ ] Join path error during await → loading flags cleaned up, falls through to slow path
- [ ] Delete during in-flight prefetch → `cancelQueries()` fires, `fetchQuery` rejects, cache not repopulated
- [ ] Workspace switch during in-flight prefetch → same cancellation behavior
- [ ] Message append → immediate hover → sees appended message (optimistic `setQueryData`)

---

## Phase 4: Rendering Pipeline Verification

> **Purpose:** Verify the rendering invariants hold. All three fixes are already implemented.
> **Risk:** Low — verification only, no new code unless bugs reproduce.
> **Dependency:** None — can run in parallel with Phases 1-3.

**Status: All three rendering fixes already exist in the codebase.**

### 4.1 `isActiveHidden` gate — ALREADY IMPLEMENTED

**Location:** `ChatContent.tsx:59-63`

The three-check formula already exists:

```typescript
const sessionHydrationState = useChatStore(
  (state) => state.sessions[sessionId]?.hydrationState ?? 'unloaded'
);
const isEmptyState =
  sessionHydrationState === 'hydrated' && sessionMessageCount === 0 && !isLoadingConversation;
```

**Action:** Verify with slow cache-miss switch (simulate 500ms delay). If blank reproduces, tighten by also checking `isConversationTransitioning`.

### 4.2 Render-surface guard — ALREADY IMPLEMENTED

**Location:** `chat-messages.tsx:602-617`

`getRenderSurfaceMetrics()` already checks for both `scrollerElement()` and `[data-testid="virtuoso-list"]`, returning `null` if either is missing. Readiness progression already depends on this returning non-null.

**Action:** Verify no readiness timers fire before the list surface exists. Check existing test coverage at `chat-messages.test.tsx:520+`.

### 4.3 Null-safe `shownSessionId` — ALREADY IMPLEMENTED

**Location:** `SessionInstanceManager.tsx:212-227`

`handleStabilized` already uses a functional `setShownSessionId` update that preserves the previous value when the target doesn't match the current active session.

**Action:** Add a dev-mode assertion that `shownSessionId` is never null/undefined during a switch, if one doesn't exist.

**Acceptance criteria:**

- [ ] All three invariants verified against slow cache-miss switches
- [ ] Existing test coverage confirmed for each
- [ ] No new code needed unless bugs reproduce in testing

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
| Hydrated empty conversation (cache hit)    | Phase 3.6 AC                      |
| Rapid A → B → C → D switching              | Phase 4.3 AC                      |
| Eviction then revisit                      | Phase 3 + 5 AC                    |
| Deletion then revisit                      | Phase 3.5 + 5.4 AC                |
| Delete during in-flight prefetch           | Phase 3.5 AC                      |
| Long tool-heavy session first upward fling | Phase 6 AC                        |
| New message → stale cache                  | Phase 3.3 AC                      |
| Rewind → switch back                       | Phase 3.3 AC                      |
| Workspace change → stale cache             | Phase 3.4 AC                      |
| Click while prefetch in-flight             | Phase 3 join-path AC              |
| Switch during active streaming             | Existing behavior (hydrated path) |

### 7.2.1 Query-layer regression tests (add before Phase 3 implementation)

These service-level tests must be written BEFORE implementing the fast path:

- [ ] Cache-hit fresh → `hydrateConversationSnapshot()` called with correct args
- [ ] Cache-hit stale (invalidated) → falls through to slow path, not served
- [ ] In-flight prefetch join → single `conversation_load` invoke, not two
- [ ] Empty conversation cache hit → direct empty state, no fast-path skip
- [ ] Delete during in-flight prefetch → late resolver doesn't repopulate cache
- [ ] Workspace change → all conversation caches invalidated
- [ ] `appendMessageToConversationCache()` + `markConversationDirty()` at all 5 `conversationAddMessage()` call sites
- [ ] Slow-path-loaded session → Query cache seeded → subsequent append works
- [ ] Append-then-hover race: local append visible via optimistic `setQueryData` before disk write completes
- [ ] Delete cancels in-flight fetch → `cancelQueries()` + AbortSignal prevents cache repopulation
- [ ] Workspace switch cancels all in-flight fetches → same cancellation behavior

### 7.3 Rollout guidance

- Phases 1+4+5 can start simultaneously (three independent workstreams).
- Phase 2 depends on 1. Phase 3 depends on 1+2.
- Phase 6 is best after 4+5 so measurement baseline is clean.
- Phase 7 gates on all previous phases.

**Critical shipping constraint:** Phase 4 (rendering verification) must PASS before Phase 3 (cache-first select) ships to users. The rendering invariants are already implemented — Phase 4 confirms they hold under cache-miss conditions. If any verification fails, fix before shipping Phase 3.

**Recommended execution order for fastest perceived improvement:**

1. Phase 1 (Query foundation) + Phase 4 (rendering verification) + Phase 5 (render cache) — all in parallel
2. Phase 2 (hover prefetch) — after Phase 1
3. Phase 3 (cache-first select) — after Phases 1+2 landed AND Phase 4 passes verification
4. Phase 6 (row height stability) — after 4+5
5. Phase 7 (metrics + rollout) — after all

### 7.4 What not to change lightly

- Do not replace `handleConversationLoaded()` wholesale
- Do not push more coordination logic into `useVelocityScroll`
- Do not use `messages.length === 0` alone to drive empty-state rendering during switches
- Do not treat "session was once stabilized" as sufficient for instant revisit unless render cache is also valid

---

## Implementation Order & Parallelism

```text
     Phase 1              Phase 4              Phase 5
  TanStack Query       Rendering Verify    Persistent Render Cache
    Foundation         (confirm invariants   (module-level Map)
  (install, provider)  already hold)
        │                    │                      │
        ▼                    │                      │
     Phase 2                 │                      │
  Prefetch on Hover          │                      │
        │                    │                      │
        │                    │                      │
        ├────────────────────┤                      │
        │   Phase 3 REQUIRES Phase 4 PASS          │
        │   (rendering invariants must be           │
        │    confirmed before fast path ships)      │
        ▼                    ▼                      │
     Phase 3 ◄──── Phase 4 must pass first         │
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
                     Metrics + Rollout
```

**Three parallel workstreams, one verification gate:**

1. **Data** (1 → 2 → 3): TanStack Query install → prefetch → cache-first select
2. **Rendering** (4): Verify already-implemented invariants hold under cache-miss conditions
3. **Measurement** (5): Persistent render cache

**Gate:** Phase 3 (cache-first select) must not ship before Phase 4 (rendering verification) passes. The rendering invariants are already implemented — Phase 4 confirms they work, not builds them.

---

## Appendix A: Patterns Borrowed from T3 Code

> **Source:** `reference/t3code/` — Ping.gg's code editor (Electron + Node.js + Codex).
> Cloned 2026-04-04 for architecture analysis. Different stack (Electron, not Tauri),
> but several patterns are directly portable to Orbit.

### A.1 Pre-Calculated Message Heights

**Source:** `reference/t3code/apps/web/src/components/timelineHeight.ts`

T3 estimates message pixel heights via pure math — zero DOM measurement:

```typescript
// t3code constants:
USER_LINE_HEIGHT_PX = 22;
ASSISTANT_LINE_HEIGHT_PX = 22.75;
USER_BASE_HEIGHT_PX = 96; // avatar, padding, margins
ASSISTANT_BASE_HEIGHT_PX = 41;
ATTACHMENTS_PER_ROW = 2;
USER_ATTACHMENT_ROW_HEIGHT_PX = 228;
```

They iterate through text once, count newlines and character-based line wrapping,
and compute pixel height mathematically. No `ResizeObserver`, no `getBoundingClientRect()`.

**How to apply to Orbit:**

Create `apps/agent/src/lib/utils/estimate-message-height.ts`:

```typescript
/**
 * Estimate pixel height for a ChatMessage without DOM measurement.
 * Feed as Virtuoso initialItemSize to skip premeasure phase.
 *
 * Inspired by t3code's timelineHeight.ts — pure-math approach.
 */
export function estimateMessageHeight(message: ChatMessage, containerWidthPx: number): number {
  // User messages: base padding + text line count × line height + attachment rows
  // Assistant messages: base padding + text line count × line height
  // Tool widgets (collapsed): fixed height per tool type
  // Tool widgets (expanded): estimated via tool output length
}
```

| Message Type            | Estimable?                                | Expected Accuracy |
| ----------------------- | ----------------------------------------- | ----------------- |
| User text (short)       | Yes — char count × line height + base     | ~95%              |
| User text with images   | Yes — add rows × attachment height        | ~90%              |
| Assistant text          | Yes — text height + code block estimation | ~80%              |
| Tool widget (collapsed) | Yes — fixed height per type               | ~99%              |
| Tool widget (expanded)  | Harder — Shiki/diff output varies         | ~70%              |

Feed estimates as Virtuoso `initialItemSize`. Virtuoso renders with estimated heights first,
adjusts only if wrong. This **eliminates the premeasure phase** for ~90% of messages.

**Integration point:** Phase 6 (Row Height Stability) or as a new Phase 6.5.

### A.2 `placeholderData: previous` Pattern

**Source:** `reference/t3code/apps/web/src/lib/projectReactQuery.ts:41`
**Docs:** https://tanstack.com/query/latest/docs/framework/react/guides/placeholder-query-data

T3 uses this one-liner to prevent flash-of-empty on every query refresh:

```typescript
placeholderData: (previous) => previous ?? EMPTY_RESULT;
```

The UI shows the last successful result while the new fetch completes. TanStack Query
sets `isPlaceholderData: true` so components can show a subtle refresh indicator if needed.

**How to apply to Orbit:**

Add to every query where flash-of-empty is possible:

| Query                      | Pattern                                           |
| -------------------------- | ------------------------------------------------- |
| Conversation detail        | `placeholderData: (prev) => prev`                 |
| Git status                 | `placeholderData: (prev) => prev`                 |
| Git branches               | `placeholderData: (prev) => prev`                 |
| File search / fuzzy search | `placeholderData: (prev) => prev ?? EMPTY_SEARCH` |
| Settings reads             | `placeholderData: (prev) => prev`                 |

**Integration point:** Phase 1 (add as default pattern in QueryClient config or per-query).

### A.3 `staleTime: Infinity` for Immutable Data

**Source:** `reference/t3code/apps/web/src/lib/providerReactQuery.ts:109`
**Docs:** https://tanstack.com/query/latest/docs/reference/QueryClient (staleTime option)

T3 caches checkpoint diffs with `staleTime: Infinity` because they're immutable —
once computed, they never change and never need refetching.

**Orbit equivalent:**

| Data                                                     | Immutable?                                      | staleTime                 |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------- |
| Completed tool outputs (Bash, Read, Write, Edit results) | Yes — once tool completes, output never changes | `Infinity`                |
| Persisted assistant message content                      | Yes — after conversation:loaded                 | `Infinity`                |
| Conversation detail for session-restore                  | Semi — invalidated on message/rewind            | `5 min` (current default) |

**Integration point:** Phase 1 (per-query staleTime overrides).

### A.4 Adaptive Worker Pool Sizing

**Source:** `reference/t3code/apps/web/src/components/DiffWorkerPoolProvider.tsx:17-20`

T3 scales diff worker pool based on CPU cores:

```typescript
const cores = navigator.hardwareConcurrency || 4;
poolSize = Math.max(2, Math.min(6, Math.floor(cores / 2)));
// + totalASTLRUCacheSize: 240 (large syntax tree cache)
```

**How to apply to Orbit:**

Our Pierre diff workers currently use a fixed pool size. Adopt adaptive sizing:

- M3 Ultra (24 cores) → 6 workers
- M1 MacBook Air (8 cores) → 4 workers
- Low-end machine (4 cores) → 2 workers

Increase AST LRU cache from current size to ~240 entries.

**Integration point:** Standalone improvement, independent of all phases.

### A.5 TanStack Pacer for Debounced Persistence

**Source:** `reference/t3code/apps/web/src/uiStateStore.ts:128`
**Docs:** https://tanstack.com/pacer/latest/docs/overview

T3 uses `@tanstack/react-pacer` Debouncer for localStorage writes (500ms).

```bash
bun add @tanstack/react-pacer
```

Available hooks:

- `useDebouncedCallback(fn, wait)` — delays execution until inactivity ends
- `useThrottledCallback(fn, wait)` — limits execution rate smoothly
- `useQueuedState()` — queued state updates with FIFO/LIFO/priority

**Orbit replacement targets:**

| Current hand-rolled debounce                           | Replace with                              |
| ------------------------------------------------------ | ----------------------------------------- |
| Terminal resize debounce (`terminal-fit-debouncer.ts`) | `useThrottledCallback(resize, 100)`       |
| File search keystroke debounce                         | `useDebouncedCallback(search, 150)`       |
| Git status refresh throttle                            | `useThrottledCallback(refresh, 2000)`     |
| UI state persistence                                   | `Debouncer(500)` (non-hook, module-level) |

**Integration point:** Standalone improvement, independent of all phases.

---

## Appendix B: TanStack API Reference

> Quick reference for the TanStack Query APIs used in this plan.
> Full docs: https://tanstack.com/query/latest/docs/reference/QueryClient

### QueryClient Methods Used

| Method                       | Signature                 | Behavior                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetchQuery(opts)`           | `Promise<TData>`          | **The plan's primary loader.** Returns cached data if fresh. If stale/invalidated, **actually refetches** from backend. Joins in-flight fetches for the same queryKey. This is what `loadConversationDetailFresh()` uses.                                                                                |
| `ensureQueryData(opts)`      | `Promise<TData>`          | Returns cached data if present. **Does NOT refetch stale data by default** (`revalidateIfStale` defaults to `false`). Even with `revalidateIfStale: true`, returns stale data immediately while refetching in background. **NOT used in this plan** — use `fetchQuery` instead for stale-aware fetching. |
| `prefetchQuery(opts)`        | `Promise<void>`           | Fetches and caches. Returns nothing, never throws. Resolves immediately if fresh data exists.                                                                                                                                                                                                            |
| `getQueryData(key)`          | `TData \| undefined`      | Synchronous cache read. Returns `undefined` if missing. **Does not check freshness — can serve stale/invalidated data.**                                                                                                                                                                                 |
| `getQueryState(key)`         | `QueryState \| undefined` | Synchronous state read. Includes `isInvalidated`, `dataUpdatedAt`, `fetchStatus`, `status`. **Used by `getFreshConversationDetail()` for freshness checks.**                                                                                                                                             |
| `setQueryData(key, updater)` | `void`                    | Synchronous cache write. Updater can be value or `(old) => new`. Immutable updates only.                                                                                                                                                                                                                 |
| `invalidateQueries(filters)` | `Promise<void>`           | Marks matching queries stale. Refetches active queries by default. **Does NOT remove data** — stale data remains readable via `getQueryData`.                                                                                                                                                            |
| `removeQueries(filters)`     | `void`                    | Completely removes matching queries from cache. Data gone.                                                                                                                                                                                                                                               |

### Key Query Options

| Option                 | Type                       | What It Does                                                                                          |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `staleTime`            | `number`                   | How long data is "fresh" (no background refetch). `Infinity` = never stale.                           |
| `gcTime`               | `number`                   | How long inactive query data stays in cache before garbage collection. Default 5min.                  |
| `placeholderData`      | `TData \| (prev) => TData` | Show this while fetching. `(prev) => prev` keeps last result visible. Sets `isPlaceholderData: true`. |
| `refetchOnWindowFocus` | `boolean \| 'always'`      | Refetch when window regains focus. `false` for desktop apps.                                          |
| `retry`                | `number \| boolean`        | Retry failed queries. `false` for Tauri invokes (fail fast).                                          |

### Freshness vs Staleness — Critical Distinction

```
fetchQuery()         → returns fresh data. If stale/invalidated → REFETCHES. Joins in-flight.
ensureQueryData()    → returns cached data even if stale. Does NOT refetch by default.
getQueryData()       → returns cached data. Does NOT check freshness. Can serve stale.
getQueryState()      → returns full state: isInvalidated, dataUpdatedAt, fetchStatus.

invalidateQueries()  → marks stale. Data STILL in cache via getQueryData/ensureQueryData.
removeQueries()      → data GONE from cache.
```

**Why this matters for the plan:**

- Hover prefetch uses `fetchQuery` (via `loadConversationDetailFresh`) → always produces fresh data
- Sync fast path uses `getFreshConversationDetail` (which checks `getQueryState().isInvalidated`) → never serves stale
- The plan does NOT use `ensureQueryData` — it would silently serve invalidated post-rewind/post-message data
- The plan does NOT use raw `getQueryData` — it would serve stale data without freshness checks
