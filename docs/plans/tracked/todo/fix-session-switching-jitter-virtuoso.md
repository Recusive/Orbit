# Fix Session Switching Jitter and Flash in VirtuosoMessageList

## Context

When switching between conversations in the sidebar, users experience three visual defects:

1. **Blank screen** (~50-150ms gap between old and new content)
2. **Wrong scroll position** (messages appear at index 0 instead of bottom)
3. **Visible auto-scroll** (content slides into place after appearing)

**Previous attempt failed** because it modified both cached and uncached code paths, and the timing interactions between `isCached` checks and the `setTimeout(0)` deferral in `handleConversationLoaded` broke first-time session loading.

---

## Findings

### Switch path

`sidebar click` → `use-sidebar-actions.ts:237` → `claude-ui-bridge.ts:18` → `claude-conversation-repo.ts:31` → `conversation-handlers.ts:90` → `use-tauri-message-listener.ts:131` → `chat-message-service.ts:1105`.

### Timing

- `select()` immediately sets `isLoadingConversation=true`, `isConversationTransitioning=true`, and swaps `activeSessionId` before the load result is merged into the store (`claude-ui-bridge.ts:28`).
- The actual `conversation:loaded` merge is deferred again with `setTimeout(0)` at `chat-message-service.ts:1128`. So `await select()` does not mean "messages are ready".

### Cached switch today

- Cached messages are already in `ChatStore`, but the whole content area is hidden by `visibility:hidden` at `ChatContent.tsx:82`.
- The skeleton is intentionally delayed 200ms at `BackendChatSurface.tsx:93`, so fast switches mean a blank flash.
- When the refresh response arrives, `handleConversationLoaded()` always writes `scrollIntent='history-load'` at `chat-message-service.ts:1306`, and `ChatMessages` converts that to `item-location index 0` at `chat-messages.tsx:276`. That is the visible reposition.

### Uncached switch today

- The reveal timer is not tied to message hydration or Virtuoso readiness. `useLayoutStabilization` observes the outer container at `use-layout-stabilization.ts:92` and reveals after ~50ms of no size change.
- That outer flex container often does not resize when messages arrive (it's flex-1, size determined by parent, not children), so the uncached path can reveal before `conversation:loaded` has committed data. **That is why the earlier cache/uncache split exposed an empty chat area.**

### Additional observations

- `conversation:loading` has a handler at `chat-message-service.ts:1099`, but nothing in the current load path emits it; loading is effectively local-only from `select()`.
- The current worktree already contains the `prevMessageCount` fix at `chat-messages.tsx:378`, the deferred skeleton at `BackendChatSurface.tsx:93`, and the always-mounted input at `ChatContent.tsx:123`. Those are not the remaining root cause.

---

## Plan

### 1. Add explicit per-session hydration state and scroll intent actions (`chat-store.ts`)

**Add `hydrationState` to `ChatSessionData`:**

```typescript
type SessionHydrationState = 'unloaded' | 'hydrated';

interface ChatSessionData {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  isStopPending: boolean;
  scrollIntent?: ScrollIntent | null;
  hydrationState: SessionHydrationState; // NEW
}
```

**Extend `ScrollIntent`:**

```typescript
export type ScrollIntent =
  | 'history-load'
  | 'compact-reload'
  | 'rewind'
  | 'session-restore' // cached switch: instant bottom placement
  | 'session-refresh'; // cached background refresh: non-animated bottom hold
```

**New store actions:**

```typescript
markSessionHydrated: (id: string): void => {
  set((draft) => {
    const session = draft.sessions[id];
    if (session) session.hydrationState = 'hydrated';
  });
},

setScrollIntent: (id: string, intent: ScrollIntent | null): void => {
  set((draft) => {
    const session = draft.sessions[id];
    if (session) session.scrollIntent = intent;
  });
},
```

**Update `createEmptySession()`:**

```typescript
function createEmptySession(): ChatSessionData {
  return {
    messages: [],
    isAgentRunning: false,
    isStopPending: false,
    scrollIntent: null,
    hydrationState: 'unloaded',
  };
}
```

**Update `evictIfNeeded()` — reset hydration on eviction:**

```typescript
if (session) {
  session.messages = [];
  session.hydrationState = 'unloaded'; // ADD
}
Reflect.deleteProperty(loadedSessions, candidate);
```

---

### 2. Split `select()` into cached swap / uncached hydrate (`claude-ui-bridge.ts:18-45`)

Use `hydrationState` (not `messages.length`) to classify. Use `setScrollIntent()` (not `setMessages()`) for the cached path:

```typescript
async select(sessionId): Promise<void> {
  if (sessionId === useUIStore.getState().activeConversationId) return;

  const uiState = useUIStore.getState();
  const title =
    uiState.conversations.find((c) => c.sessionId === sessionId)?.title ?? null;

  const chatStore = useChatStore.getState();
  const session = chatStore.sessions[sessionId];
  const isHydrated = session?.hydrationState === 'hydrated';

  if (isHydrated) {
    // Cached: skip transition — Virtuoso handles data swap in the same React commit.
    // Switch session FIRST so React never renders stale content as visible.
    chatStore.setScrollIntent(sessionId, 'session-restore');
    uiState.setActiveConversation(sessionId, title);
    useMessageBufferStore.getState().markLoadPending(sessionId);
    chatStore.setActiveSession(sessionId);
    useFileStore.getState().switchSession(sessionId);
    // Cancel any in-flight uncached transition AFTER session swap.
    // Ordering matters: clear flags last so React never reveals the old session.
    uiState.setLoadingConversation(false);
    uiState.setConversationTransitioning(false);
  } else {
    // Uncached: full transition with visibility:hidden + stabilization
    uiState.setLoadingConversation(true);
    uiState.setConversationTransitioning(true);
    uiState.setActiveConversation(sessionId, title);
    useMessageBufferStore.getState().markLoadPending(sessionId);
    chatStore.setActiveSession(sessionId);
    useFileStore.getState().switchSession(sessionId);
  }

  await new Promise<void>((resolve, reject) => {
    startTransition(() => {
      claudeConversationRepo.load(sessionId).then(resolve).catch(reject);
    });
  });
},
```

**Why `hydrationState` over `messages.length`:** Empty-but-loaded conversations are hydrated with 0 messages. `messages.length > 0` would force them through full transition every time. Eviction resets to `'unloaded'`.

**Why `setScrollIntent()` over `setMessages()`:** `setMessages()` replays a snapshot that can clobber in-flight streaming chunks. `setScrollIntent()` writes only metadata.

---

### 3. Handle both new intents in `messageListData` (`chat-messages.tsx:~283`)

Add two cases in the scrollIntent switch, after `'history-load'`:

```typescript
case 'session-restore':
case 'session-refresh':
  return {
    data: messages,
    scrollModifier: {
      type: 'item-location',
      location: { index: messages.length - 1, align: 'end' },
    },
  };
```

Both intents produce the same modifier: instant non-animated bottom placement. They exist as separate types for semantic clarity in the service layer (`'session-restore'` = user-initiated switch, `'session-refresh'` = background disk refresh). v1 intentionally restores to bottom because no per-session viewport state exists yet.

**Why not `null`:** `scrollIntent === null` falls through to the heuristic path (`items-change` smooth or `auto-scroll-to-bottom` conditional), which can still animate or reposition after a background refresh. Explicit intent avoids the heuristic entirely.

---

### 4. Make `handleConversationLoaded` cache-aware + fix streaming guard (`chat-message-service.ts`)

**4a. Use `'session-refresh'` instead of `'history-load'` for hydrated sessions (line ~1122, 1306):**

Snapshot hydration state alongside `cachedMessages` BEFORE `setTimeout(0)`:

```typescript
// Snapshot BEFORE setTimeout(0) — store state may change during deferral
const cachedMessages = chatStore.sessions[message.session_id]?.messages ?? null;
const wasHydrated = chatStore.sessions[message.session_id]?.hydrationState === 'hydrated';
```

Then use `wasHydrated` (not message count) for intent selection:

```typescript
useChatStore
  .getState()
  .setMessages(message.session_id, newMessages, wasHydrated ? 'session-refresh' : 'history-load');
useChatStore.getState().markSessionHydrated(message.session_id);
```

**Why `wasHydrated` instead of `cachedMessages.length > 0`:** A previously loaded empty conversation is hydrated but has 0 messages. Using message count would misclassify it and send `'history-load'` (snap to top) on every refresh.

**4b. Mark hydrated in `handleConversationCreated` (line ~1054):**

New sessions are immediately ready:

```typescript
chatStore.markSessionLoaded(sid);
chatStore.markSessionHydrated(sid); // ADD
```

**4c. Fix streaming guard — scope transition teardown to active session (line ~1155-1170):**

Currently the streaming guard clears `isLoadingConversation` and `isConversationTransitioning` unconditionally, even for stale navigations. A stale `conversation:loaded` from session A can cancel session B's transition before B hydrates.

```typescript
if (targetSession?.isAgentRunning && hasLiveMessages) {
  if (!isStaleNavigation) {
    const preferredTitle = getPreferredTitle(message.session_id);
    useFileStore.getState().switchSession(message.session_id);
    useChatStore.getState().setActiveSession(message.session_id);
    useUIStore
      .getState()
      .setActiveConversation(message.session_id, preferredTitle ?? message.title);
    useToolStore.getState().switchSession(message.session_id);
    // MOVED INSIDE !isStaleNavigation:
    useUIStore.getState().setLoadingConversation(false);
    useUIStore.getState().setConversationTransitioning(false);
  }
  // Always mark hydrated — the session has authoritative data regardless
  useChatStore.getState().markSessionHydrated(message.session_id);
  return;
}
```

**4d. Hydrate rewind-created sessions (`handleConversationRewound`, line ~1385):**

```typescript
useChatStore.getState().setMessages(targetSessionId, rewoundMessages, 'rewind');
useChatStore.getState().markSessionHydrated(targetSessionId); // ADD
```

---

### 5. Gate uncached reveal on hydration signal (`use-layout-stabilization.ts`)

Replace the timer-based readiness guess with an explicit `isHydrated` precondition.

**Update `UseLayoutStabilizationProps` (types.ts):**

```typescript
interface UseLayoutStabilizationProps {
  readonly isTransitioning: boolean;
  readonly isHydrated: boolean; // NEW
  readonly messageCount: number;
  readonly setLoadingConversation: (loading: boolean) => void;
  readonly setConversationTransitioning: (transitioning: boolean) => void;
}
```

**Update the `useLayoutEffect`:**

```typescript
useLayoutEffect(() => {
  if (!isTransitioning) return undefined;
  if (!isHydrated) return undefined; // Wait for load commit before stabilizing

  const container = contentRef.current;
  if (!container) {
    setLoadingConversation(false);
    setConversationTransitioning(false);
    return undefined;
  }

  // ... rest of existing stabilization logic unchanged ...
}, [
  isTransitioning,
  isHydrated,
  messageCount,
  setConversationTransitioning,
  setLoadingConversation,
]);
```

**Update `BackendChatSurface.tsx` to pass `isHydrated`:**

```typescript
const isHydrated = useChatStore((s) => s.sessions[sessionId]?.hydrationState === 'hydrated');

const { contentRef } = useLayoutStabilization({
  isTransitioning,
  isHydrated,
  messageCount: messages.length,
  setLoadingConversation: useUIStore.getState().setLoadingConversation,
  setConversationTransitioning: useUIStore.getState().setConversationTransitioning,
});
```

---

## Files Changed

| File                                                      | Changes                                                                                                                                     | Risk   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `stores/chat/chat-store.ts`                               | `hydrationState` field, `setScrollIntent()`, `markSessionHydrated()`, eviction reset, `createEmptySession()`, two new `ScrollIntent` values | Medium |
| `services/conversations/claude-ui-bridge.ts`              | Branch on `hydrationState`, use `setScrollIntent()`                                                                                         | Low    |
| `components/chat/chat-messages.tsx`                       | `'session-restore'` + `'session-refresh'` cases in switch                                                                                   | Low    |
| `services/chat/chat-message-service.ts`                   | `markSessionHydrated()` in 4 places, `'session-refresh'` intent, streaming guard scoping                                                    | Medium |
| `components/layout/chat-area/use-layout-stabilization.ts` | Gate on `isHydrated` before starting timer                                                                                                  | Medium |
| `components/layout/chat-area/types.ts`                    | Add `isHydrated` to props interface                                                                                                         | None   |
| `components/chat/BackendChatSurface.tsx`                  | Pass `isHydrated` selector to stabilization hook                                                                                            | Low    |

All paths prefixed with `apps/agent/src/`.

## Hydration State Transitions

```
createEmptySession()            → 'unloaded'
handleConversationCreated()     → 'hydrated'   (new session, immediately ready)
handleConversationLoaded()      → 'hydrated'   (after setMessages commit)
  └─ streaming guard path       → 'hydrated'   (session has live authoritative data)
handleConversationRewound()     → 'hydrated'   (rewind target has authoritative history)
evictIfNeeded()                 → 'unloaded'   (LRU clears messages + hydration)
destroySession()                → deleted       (entire session removed)
```

## What's NOT Changed

- `SKELETON_MIN_DISPLAY_MS = 0` (stays)
- `STABILIZATION_STABLE_THRESHOLD_MS = 50` (stays)
- Deferred skeleton 200ms delay in BackendChatSurface (stays)
- `handleConversationLoaded`'s `setTimeout(0)` wrapper (stays)
- Empty data guard in `messageListData` useMemo (stays)
- ChatInput never-unmount pattern (stays)
- Virtuoso binary search patch (stays)
- `loadedSessions` record (preserved — separate concern from hydration)

## Edge Cases

| Case                                     | `isHydrated`                    | Behavior                                                             |
| ---------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Session evicted by LRU                   | `false` (reset to `'unloaded'`) | Full transition — correct                                            |
| Empty conversation (0 messages, loaded)  | `true`                          | Instant switch — correct                                             |
| Quick double-switch (A→B→A)              | Each evaluated independently    | Epoch guards filter stale responses                                  |
| Active agent (streaming)                 | `true` (has live messages)      | Instant switch + streaming guard                                     |
| First load on app startup                | `false` (no sessions in memory) | Full transition — correct                                            |
| Hydrated session, not evicted            | `true`                          | Instant switch, scroll to bottom                                     |
| Slow backend load (>200ms)               | `false` until commit            | Stays hidden until hydrated — no premature reveal                    |
| Cached session left mid-scroll           | `true`                          | Snaps to bottom (documented v1 tradeoff)                             |
| Background refresh changes message count | N/A                             | `'session-refresh'` holds bottom — no heuristic path                 |
| Background refresh changes active chain  | N/A                             | `'session-refresh'` replaces data at bottom — stable                 |
| Forked rewind, switch away and back      | `true` (marked on rewind)       | Instant switch — correct                                             |
| Stale A loaded while B transitioning     | N/A                             | Streaming guard only tears down flags for active session             |
| Background streaming + cached switch     | N/A                             | `setScrollIntent()` writes metadata only — no message clobber        |
| A→uncached B→cached A (interrupt)        | A: `true`                       | Cached branch clears global transition flags — A visible immediately |
| Hydrated empty session refreshed         | `true`                          | `wasHydrated` → `'session-refresh'` — no misclassification           |

## Verification

### Automated Tests

1. **ChatMessages** — `'session-restore'` and `'session-refresh'` both produce `item-location` at last index, no smooth scroll.
2. **ChatMessageService** — `conversation:loaded` uses `'session-refresh'` when `cachedMessages` non-empty, `'history-load'` when empty. `markSessionHydrated` called after each commit path.
3. **ChatMessageService** — rewind handler marks target session hydrated; forked rewind session is instant on re-switch.
4. **ChatMessageService** — streaming guard only clears transition flags when `!isStaleNavigation`.
5. **claude-ui-bridge** — hydrated sessions use `setScrollIntent`, skip transition flags; unhydrated sessions set both flags.
6. **useLayoutStabilization** — `isHydrated=false` prevents stabilization; `isHydrated=true` starts ResizeObserver flow. Empty hydrated conversation reveals correctly.
7. **Edge cases** — loaded-empty session switching, cached switch while target is streaming, uncached slow-load delayed >200ms, stale session A loaded while B is transitioning.
8. **Interrupt** — A→uncached B→cached A: verify transition flags cleared immediately, A content visible without stabilization delay.

### Manual Testing

1. `bunx tauri dev`
2. Create 3+ conversations with messages
3. Switch between them rapidly — no blank flash, messages at bottom, no scroll animation
4. Force LRU eviction (open 20+ conversations), switch back — full transition with skeleton
5. Start new conversation (0 messages) — empty state appears correctly
6. Switch to streaming conversation — instant, streaming continues
7. Rewind a conversation (fork), switch away, switch back — instant

### Lint/Type

```bash
bun run check
./scripts/lint-all.sh
```
