# Plan: Migrate to VirtuosoMessageList

## Context

The current chat virtualization uses regular `Virtuoso` + `use-stick-to-bottom` — two libraries with separate responsibilities that fight each other. After 6+ failed attempts to get auto-scroll working during streaming, the architecture is proven wrong. `Virtuoso`'s `followOutput` doesn't handle existing item content growth (streaming), and `use-stick-to-bottom`'s ResizeObserver has timing issues with Virtuoso's internal scroll management.

`@virtuoso.dev/message-list` (`VirtuosoMessageList`) is a purpose-built chat component from the same team. It has built-in stick-to-bottom, streaming-aware auto-scroll via `scrollModifier`, `StickyFooter` for pinned UI, and an imperative data API — solving every problem we fought with in one component.

**Goal:** Replace `Virtuoso` + `use-stick-to-bottom` with `VirtuosoMessageList`. Minimal changes to the data pipeline: one new `scrollIntent` field on `ChatSessionData` for explicit update classification. Only `chat-messages.tsx` changes significantly.

---

## Phase 1: Install package

**Add** `@virtuoso.dev/message-list` to root `package.json`:

```bash
bun add @virtuoso.dev/message-list
```

**Keep** `react-virtuoso` — still used by `ChangesList.tsx` in the git source control panel.

**Keep** `use-stick-to-bottom` in package.json for now — remove in a separate cleanup PR after verifying everything works.

---

## Phase 1.5: Fix test infrastructure (pre-refactor baseline)

The existing `chat-messages.test.tsx` fails 6/6 on the current branch. Root cause: the JSDOM `ResizeObserver` mock in `vitest.setup.ts:128` fires `callback([], this)` — empty entries array. `use-stick-to-bottom` accesses entry properties and crashes.

**Why this matters:** Without a green baseline, the migration has no regression gate. We can't tell if a post-migration failure is old or new.

**Fix the mock** so it supplies a minimal valid entry:

```ts
observe(target: Element): void {
  // Supply a minimal valid entry so use-stick-to-bottom (and any other
  // ResizeObserver consumer) doesn't crash on empty entries.
  const entry = {
    target,
    contentRect: target.getBoundingClientRect(),
    borderBoxSize: [{ blockSize: 0, inlineSize: 0 }],
    contentBoxSize: [{ blockSize: 0, inlineSize: 0 }],
    devicePixelContentBoxSize: [{ blockSize: 0, inlineSize: 0 }],
  } as ResizeObserverEntry;
  this.callback([entry], this);
}
```

**Verify:** `bun run test -- apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx` passes 6/6.

This fix benefits the entire test suite (not just this migration) since `ResizeObserver` is used by multiple components. Commit separately before the main rewrite.

**Post-migration testing context:** After the rewrite, the `@virtuoso.dev/message-list` mock replaces `react-virtuoso` mock entirely, and `use-stick-to-bottom` is no longer in the render path. The `ResizeObserver` fix still helps other tests.

---

## Phase 1.75: Add `scrollIntent` to ChatStore

The service layer already knows the semantic source of each `setMessages` call. Pass
that signal through the store so `ChatMessages` doesn't have to guess.

**File:** `apps/agent/src/stores/chat/chat-store.ts`

```ts
// Add to ChatSessionData interface:
type ScrollIntent = 'history-load' | 'compact-reload' | 'rewind';

interface ChatSessionData {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  isStopPending: boolean;
  scrollIntent?: ScrollIntent | null;  // ← new
}

// Update setMessages to accept optional intent:
setMessages: (id: string, msgs: ChatMessage[], scrollIntent?: ScrollIntent | null): void => {
  set((draft) => {
    if (!draft.sessions[id]) {
      draft.sessions[id] = createEmptySession();
      touchLru(draft.lruOrder, id);
    }
    draft.sessions[id].messages = msgs;
    draft.sessions[id].scrollIntent = scrollIntent ?? null;
  });
},

// Add clearScrollIntent action:
clearScrollIntent: (id: string): void => {
  set((draft) => {
    const session = draft.sessions[id];
    if (session) session.scrollIntent = null;
  });
},
```

**File:** `apps/agent/src/services/chat/chat-message-service.ts`

3 callers pass the intent:

```ts
// conversation:loaded (line ~1306):
useChatStore.getState().setMessages(message.session_id, newMessages, 'history-load');

// compact reload (line ~1025):
useChatStore.getState().setMessages(sessionId, newMessages, 'compact-reload');

// conversation:rewound (line ~1385):
useChatStore.getState().setMessages(targetSessionId, rewoundMessages, 'rewind');
```

Callers that don't carry scroll intent (`setMessages(sid, [])` for new sessions) pass
no third argument → defaults to `null` → heuristic fallback in `ChatMessages`.

---

## Phase 2: Rewrite `chat-messages.tsx`

**File:** `apps/agent/src/components/chat/chat-messages.tsx`

### What gets removed

- `import { Virtuoso } from 'react-virtuoso'`
- `import { useStickToBottom } from 'use-stick-to-bottom'`
- `useStickToBottom()` call and its `scrollRef`, `contentRef`, `scrollToBottom`, `stopScroll`
- `scrollParent` state and `mergedScrollRef` callback (the two-library bridge)
- The outer scroll container `<div ref={mergedScrollRef}>` and inner content wrapper `<div ref={contentRef}>`
- 6 of 10 stable refs (`toolsByMessageIdRef`, `animatingIdsRef`, `lastAssistantIdRef`, `lastInGroupRef`, `messageCountRef`, `isAgentRunningRef`) — replaced by context `useMemo`
- **Keep 4 callback refs** (`onRewindRef`, `onOpenFileRef`, `onOpenUrlRef`, `onFeedbackRef`) with `useCallback` stable wrappers — these callbacks are plain closures from `createChatActionHandlers()`, not `useCallback`-wrapped, so they get new references every render. Without refs, `arePropsEqual` sees new callback references and re-renders ALL visible MessageItems.
- The `renderMessage` useCallback (replaced by `ItemContent` component)
- Inline shimmer text, queued message bubble, h-3 gap div, mt-44 spacer
- `VirtuosoHandle` type import

### What gets added

**Imports:**

```ts
import { VirtuosoMessageList, VirtuosoMessageListLicense } from '@virtuoso.dev/message-list';
import type {
  VirtuosoMessageListMethods,
  ItemContent as VirtuosoItemContent,
} from '@virtuoso.dev/message-list';
```

**Context type** for passing non-message state to ItemContent and custom components:

```ts
interface MessageListContext {
  toolsByMessageId: Map<string, ToolExecution[]>;
  lastAssistantMessageId: string | null;
  lastInAssistantGroupIds: Set<string>;
  messageCount: number;
  isAgentRunning: boolean;
  animatingMessageIds: Set<string>;
  onRewind: (messageId: string) => void;
  onOpenFile: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onFeedback: () => void;
  onAnimationComplete: (messageId: string) => void;
  queuedMessage: QueuedMessage | null;
  onCancelQueue: () => void;
}
```

**Stable callback refs** — `onRewind`, `onOpenFile`, `onOpenUrl`, `onFeedback` are plain closures from `createChatActionHandlers()` (not `useCallback`-wrapped). Without refs, every parent render creates new references → new context → all visible MessageItems re-render via `arePropsEqual` callback comparison (`message-utils.ts:338-342`). Keep 4 refs + stable wrappers:

```ts
const onRewindRef = useRef(onRewind);
onRewindRef.current = onRewind;
const onOpenFileRef = useRef(onOpenFile);
onOpenFileRef.current = onOpenFile;
const onOpenUrlRef = useRef(onOpenUrl);
onOpenUrlRef.current = onOpenUrl;
const onFeedbackRef = useRef(onFeedback);
onFeedbackRef.current = onFeedback;

const stableOnRewind = useCallback((id: string): void => {
  onRewindRef.current(id);
}, []);
const stableOnOpenFile = useCallback((path: string): void => {
  onOpenFileRef.current(path);
}, []);
const stableOnOpenUrl = useCallback((url: string): void => {
  onOpenUrlRef.current(url);
}, []);
const stableOnFeedback = useCallback((): void => {
  onFeedbackRef.current();
}, []);
```

Net ref reduction: 10 refs → 4 refs. The other 6 (toolsByMessageId, animatingIds, lastAssistantId, lastInGroup, messageCount, isAgentRunning) are safely handled by the context `useMemo`.

**Module-level components** (outside ChatMessages for stable references):

```tsx
// ItemContent — renders each message. Receives data + context, no refs needed.
// IMPORTANT: mx-auto + px-4 + CHAT_MAX_WIDTH_STYLE must be on EACH item wrapper.
// VirtuosoMessageList owns the scroller — there's no intermediate max-width
// container like the current Virtuoso setup. Without this, messages stretch
// full-width on ultra-wide displays (5120px+).
const MessageItemContent: VirtuosoItemContent<ChatMessage, MessageListContext> = ({
  data: msg,
  index,
  context,
}) => {
  const tools = context.toolsByMessageId.get(msg.id) ?? [];
  return (
    <div className="mx-auto px-4 mb-3" style={CHAT_MAX_WIDTH_STYLE}>
      <MessageItem
        message={msg}
        tools={tools}
        isLastAssistantMessage={msg.id === context.lastAssistantMessageId}
        isLastInAssistantGroup={context.lastInAssistantGroupIds.has(msg.id)}
        isLastMessage={index === context.messageCount - 1}
        isAgentRunning={context.isAgentRunning}
        animate={context.animatingMessageIds.has(msg.id)}
        onRewind={context.onRewind}
        onOpenFile={context.onOpenFile}
        onOpenUrl={context.onOpenUrl}
        onFeedback={context.onFeedback}
        onAnimationComplete={context.onAnimationComplete}
      />
    </div>
  );
};

// Header — top padding. Current code has pt-4 on the content container;
// VirtuosoMessageList has no equivalent without a Header component.
const MessageListHeader: FC<{ context: MessageListContext }> = () => (
  <div className="pt-4" aria-hidden="true" />
);

// Footer — scrolls with content. Queued message + bottom spacer.
const MessageListFooter: FC<{ context: MessageListContext }> = ({ context }) => (
  <div className="mx-auto px-4" style={CHAT_MAX_WIDTH_STYLE}>
    {context.queuedMessage !== null ? (
      <QueuedMessageBubble message={context.queuedMessage} onCancel={context.onCancelQueue} />
    ) : null}
    {/* Clears the floating input */}
    <div className="h-44" aria-hidden="true" />
  </div>
);

// StickyFooter — pinned at viewport bottom. "Thinking" shimmer.
const MessageListStickyFooter: FC<{ context: MessageListContext }> = ({ context }) =>
  context.isAgentRunning ? (
    <div className="mx-auto px-4" style={CHAT_MAX_WIDTH_STYLE}>
      <div className="flex items-center gap-2 px-[9px] py-2">
        <ShimmerText className="font-sans text-base text-foreground">Thinking</ShimmerText>
      </div>
    </div>
  ) : null;
```

**Ref:** `useRef<VirtuosoMessageListMethods<ChatMessage, MessageListContext>>(null)`

**Data prop with dynamic scrollModifier** (per-update-type scroll behavior):

VirtuosoMessageList's `ScrollModifier` type supports distinct behaviors for different
kinds of data changes. The full type from `@virtuoso.dev/message-list@1.16.2`:

| ScrollModifier type     | Purpose                                                   | Orbit use case                                                 |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `auto-scroll-to-bottom` | New items at end — scroll to bottom if at bottom          | Message append                                                 |
| `items-change`          | Existing items changed content — maintain visual position | Streaming content growth                                       |
| `remove-from-end`       | Items removed from end — adjust scroll for shorter list   | Rewind truncation                                              |
| `item-location`         | Jump to specific item (with optional `purgeItemSizes`)    | History load (`conversation:loaded`: `[]` → full conversation) |
| `prepend`               | Items added at start — maintain position                  | Not used                                                       |

The `messageListData` useMemo selects the correct modifier using the explicit
`scrollIntent` signal from the store (set by the service layer), with a length-based
fallback for streaming and append (which don't go through `setMessages`):

```ts
// Read the explicit scroll intent from the store (set by service layer)
const scrollIntent = useChatStore((s) => s.sessions[sessionId ?? '']?.scrollIntent ?? null);

const messageListData = useMemo((): DataWithScrollModifier<ChatMessage> => {
  // ── Explicit intent from service layer (setMessages callers) ──────
  if (scrollIntent !== null) {
    switch (scrollIntent) {
      case 'history-load':
        // conversation:loaded: show from top (top-on-open behavior)
        return {
          data: messages,
          scrollModifier: {
            type: 'item-location',
            location: { index: 0, align: 'start' },
          },
        };
      case 'compact-reload':
        // Compact replaced messages: maintain visual position
        return {
          data: messages,
          scrollModifier: { type: 'items-change', behavior: 'smooth' },
        };
      case 'rewind':
        // Rewind truncated messages: adjust for shorter list
        return { data: messages, scrollModifier: 'remove-from-end' };
    }
  }

  // ── Heuristic fallback for streaming and append ───────────────────
  // These paths use addMessage / appendToLastMessage / updateMessage,
  // not setMessages, so they don't carry a scrollIntent.
  const prevLength = prevMessageCount.current;

  if (messages.length === prevLength) {
    // Streaming: existing items changed content (same count).
    return {
      data: messages,
      scrollModifier: { type: 'items-change', behavior: 'smooth' },
    };
  }

  // Append: new message(s) during active conversation.
  return {
    data: messages,
    scrollModifier: {
      type: 'auto-scroll-to-bottom',
      autoScroll: ({ atBottom }: { atBottom: boolean }) => (atBottom ? 'smooth' : false),
    },
  };
}, [messages, scrollIntent]);

// Clear the intent after the render consumes it
useEffect(() => {
  if (scrollIntent !== null && sessionId !== undefined) {
    useChatStore.getState().clearScrollIntent(sessionId);
  }
}, [scrollIntent, sessionId]);
```

**Session switch** uses the imperative `data.replace()` API (see Effects section below),
not the declarative `data` prop. The imperative call includes `purgeItemSizes: true` to
clear stale item measurements from the previous conversation.

**Update type → scroll behavior mapping (hybrid declarative + imperative):**

Each update type gets the correct `ScrollModifier` from the library's type system. The
dynamic `useMemo` above selects the modifier by comparing array lengths. Session switch
uses the imperative API for measurement purge.

| Update type                     | Source signal                              | ScrollModifier                                      | API path                                       |
| ------------------------------- | ------------------------------------------ | --------------------------------------------------- | ---------------------------------------------- |
| **Streaming**                   | Heuristic: `length === prevLength`         | `{ type: 'items-change', behavior: 'smooth' }`      | Declarative                                    |
| **Message append**              | Heuristic: `length > prevLength`           | `{ type: 'auto-scroll-to-bottom', autoScroll }`     | Declarative                                    |
| **User send while scrolled up** | Heuristic + `useEffect`                    | `auto-scroll-to-bottom` + `scrollToItem` override   | Hybrid                                         |
| **History load**                | Explicit: `scrollIntent: 'history-load'`   | `{ type: 'item-location', location: { index: 0 } }` | Declarative                                    |
| **Compact reload**              | Explicit: `scrollIntent: 'compact-reload'` | `{ type: 'items-change', behavior: 'smooth' }`      | Declarative                                    |
| **Rewind**                      | Explicit: `scrollIntent: 'rewind'`         | `'remove-from-end'`                                 | Declarative                                    |
| **Session switch**              | `sessionId` change                         | N/A                                                 | Imperative: `data.replace({ purgeItemSizes })` |

The explicit `scrollIntent` signal covers all `setMessages` callers (history load, compact, rewind). The heuristic fallback covers streaming and append, which use `addMessage`/`appendToLastMessage`/`updateMessage` and don't go through `setMessages`.

**Context object** (single `useMemo`, replaces 6 of the original 10 refs — 4 callback refs kept above):

```ts
const messageListContext = useMemo(
  (): MessageListContext => ({
    toolsByMessageId,
    lastAssistantMessageId,
    lastInAssistantGroupIds,
    messageCount: messages.length,
    isAgentRunning,
    animatingMessageIds,
    onRewind: stableOnRewind,
    onOpenFile: stableOnOpenFile,
    onOpenUrl: stableOnOpenUrl,
    onFeedback: stableOnFeedback,
    onAnimationComplete: handleAnimationComplete,
    queuedMessage,
    onCancelQueue,
  }),
  [
    toolsByMessageId,
    lastAssistantMessageId,
    lastInAssistantGroupIds,
    messages.length,
    isAgentRunning,
    animatingMessageIds,
    stableOnRewind,
    stableOnOpenFile,
    stableOnOpenUrl,
    stableOnFeedback,
    handleAnimationComplete,
    queuedMessage,
    onCancelQueue,
  ]
);
```

Note: `stableOnRewind` etc. are referentially stable (empty `useCallback` deps), so they never trigger context recreation. The volatile deps are `toolsByMessageId` (tool start/complete), `animatingMessageIds` (user send), `messages.length` (message append), and `isAgentRunning` (turn start/end). When context does recreate, `arePropsEqual` on `MessageItem` does field-level tool comparison (`message-utils.ts:344-356`), so only messages with actual prop changes re-render.

**JSX structure:**

```tsx
<ToolWidgetSessionContext.Provider value={sessionKey}>
  <VirtuosoMessageListLicense licenseKey="">
    <VirtuosoMessageList<ChatMessage, MessageListContext>
      ref={listRef}
      data={messageListData}
      context={messageListContext}
      computeItemKey={({ data, index }) => `${sessionKey}:${String(index)}`}
      ItemContent={MessageItemContent}
      Header={MessageListHeader}
      Footer={MessageListFooter}
      StickyFooter={MessageListStickyFooter}
      shortSizeAlign="top"
      className="flex-1 overflow-x-hidden overscroll-y-contain"
      style={{ scrollbarGutter: 'stable both-edges' }}
    />
  </VirtuosoMessageListLicense>
</ToolWidgetSessionContext.Provider>
```

### Effects (simplified)

**Session switch** — uses imperative `data.replace()` with `purgeItemSizes` to clear
stale item measurements from the previous conversation. Without this, switching from
a 200+ message conversation to a short one uses cached sizes, causing blank space or
incorrect scroll range. The declarative `data` prop re-syncs on the next render.

```ts
// Ref to read latest messages without adding to effect deps
const messagesRef = useRef(messages);
messagesRef.current = messages;

useEffect(() => {
  if (prevSessionIdRef.current === sessionId) return;
  setAnimatingMessageIds(new Set());
  prevMessageCount.current = 0;
  prevSessionIdRef.current = sessionId;

  // Imperative replace: purge stale item sizes + scroll to top.
  // The declarative data prop handles subsequent updates (streaming, append).
  listRef.current?.data.replace(messagesRef.current, {
    initialLocation: { index: 0, align: 'start' },
    purgeItemSizes: true,
  });
}, [sessionId]);
```

**New user message:**

```ts
useEffect(() => {
  const prevCount = prevMessageCount.current;
  prevMessageCount.current = messages.length;
  if (messages.length === prevCount + 1) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'user') {
      setAnimatingMessageIds((prev) => new Set(prev).add(lastMsg.id));
      listRef.current?.scrollToItem({ index: 'LAST', align: 'end', behavior: 'smooth' });
    }
  }
}, [messages]);
```

### What stays unchanged

- `ChatMessagesProps` interface
- `animatingMessageIds` state + `handleAnimationComplete`
- `toolsByMessageId` useMemo
- `lastAssistantMessageId` useMemo
- `lastInAssistantGroupIds` useMemo
- `ToolWidgetSessionContext.Provider`
- All tool store subscriptions

---

### Known trade-offs & edge cases

- **Cmd+F / Find-in-page**: Virtualized messages are not in the DOM. Browser find-in-page only searches rendered messages. This persists from the regular Virtuoso implementation. A custom search overlay can be built on the `data` array in a follow-up.
- **StickyFooter "Thinking" shimmer**: The shimmer is now pinned at the viewport bottom (visible even when scrolled up). This is a UX change from the current behavior where it scrolls with content. If this is undesirable, move shimmer to `Footer` instead. Also verify the pinned shimmer does not overlap the floating input (`absolute bottom-0 z-20` in ChatContent).
- **Key strategy**: Uses `${sessionKey}:${index}` (index-based, matching original virtualization plan). `reconcileMessageId` (`chat-store.ts:393`) mutates `msg.id` from frontend UUID to SDK checkpoint UUID on every `agent:checkpoint` event. ID-based keys would cause React to unmount+remount the user message row mid-conversation, resetting hover/"Show more"/animation state. Index-based keys avoid this. Session prefix forces full remount on session switch.
- **`shortSizeAlign: 'top'`**: Matches current behavior (short conversations start at top). `'bottom-smooth'` would be a UX change — not what Orbit does today.
- **Scroll model: explicit `scrollIntent` for `setMessages` callers, heuristic for streaming/append**: The service layer passes `scrollIntent` through the store for all `setMessages` calls (history load, compact reload, rewind). Streaming and append use `addMessage`/`appendToLastMessage`/`updateMessage` which don't go through `setMessages`, so they use a length-based heuristic (`length === prev` → `items-change`, `length > prev` → `auto-scroll-to-bottom`). Session switch uses imperative `data.replace({ purgeItemSizes })`. Verify in manual testing:
  - **Streaming**: `items-change` with `behavior: 'smooth'` should follow content growth at bottom, stay put if scrolled up.
  - **History load**: `item-location` at index 0 should show conversation from top.
  - **Rewind**: `remove-from-end` should adjust scroll for shorter list without jumping.
  - **Compact reload**: `items-change` with `behavior: 'smooth'` should maintain visual position.
  - **Session switch**: Imperative `data.replace()` purges measurements + scrolls to top. Verify no double-render flash.
- **Empty messages list**: `messages=[]` with Footer spacer (`h-44`) still renders. ChatContent handles the empty state separately (`isEmptyState` → different layout), so this may be a non-issue in practice.
- **Message ID reconciliation while row is mounted**: `reconcileMessageId` fires during streaming (after first `agent:checkpoint`). With index-based keys, this is an in-place update. `arePropsEqual` compares `pm.id !== nm.id` and will correctly re-render that single row without unmounting.
- **Tool expand/collapse above viewport during streaming**: VirtuosoMessageList adjusts scroll position when above-viewport items change size. Verify this works when a tool widget expands while the last message is streaming.
- **Session switch with cached measurements**: Switching from a tall conversation (200+ msgs) to a short one may leave stale item size measurements. Session-prefixed keys force full remount which should clear measurements, but verify empirically.
- **Rewind with visible queued bubble**: If a queued message is in the Footer and rewind truncates messages while not at bottom, verify the Footer persists and scroll position is reasonable.

---

## Phase 3: Verify ChatContent layout still works

**File:** `apps/agent/src/components/layout/chat-area/ChatContent.tsx` — NO changes needed.

The floating input (`absolute bottom-0`) overlays the bottom of VirtuosoMessageList. The `h-44` spacer in `Footer` creates clearance. VirtuosoMessageList owns its own scroller so `flex-1` and `height: 100%` work correctly (no siblings fighting for space).

---

## Phase 4: Update tests

**File:** `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx`

### Mock strategy

Replace the `react-virtuoso` mock with a `@virtuoso.dev/message-list` mock that renders all items synchronously:

```tsx
vi.mock('@virtuoso.dev/message-list', async () => {
  const React = await import('react');

  return {
    VirtuosoMessageListLicense: ({ children }: { children: ReactNode }) => <>{children}</>,
    VirtuosoMessageList: React.forwardRef(function MockVirtuosoMessageList(
      props: MockVirtuosoMessageListProps,
      ref: React.ForwardedRef<MockVirtuosoMessageListMethods>
    ) {
      React.useImperativeHandle(ref, () => ({
        scrollToItem: scrollToItemMock,
      }));
      mockVirtuosoMessageListProps(props);
      const data = props.data?.data ?? [];
      return (
        <div data-testid="chat-virtuoso-message-list">
          {props.Header ? <props.Header context={props.context} /> : null}
          {data.map((item, index) => (
            <div key={props.computeItemKey?.({ data: item, index }) ?? index}>
              <props.ItemContent data={item} index={index} context={props.context} />
            </div>
          ))}
          {props.Footer ? <props.Footer context={props.context} /> : null}
          {props.StickyFooter ? <props.StickyFooter context={props.context} /> : null}
        </div>
      );
    }),
  };
});
```

### Assertions to update

- `data.data` shape: verify `messages` array + `scrollModifier` structure
- `computeItemKey`: now receives `{ data, index }` object, returns `${sessionKey}:${index}`
- `context` object: verify stable callback refs, tool lookup, animation state
- `scrollToItem` calls: session switch → `{ index: 0, align: 'start' }`, user send → `{ index: 'LAST', align: 'end', behavior: 'smooth' }`

### New test cases

- StickyFooter renders shimmer when `isAgentRunning=true`, hides when `false`
- Header renders `pt-4` spacer
- Footer renders queued message + `h-44` spacer
- Context object contains stable callback refs (verify reference identity across re-renders)

### Testing context

For tests that need scroll behavior validation, use `VirtuosoMessageListTestingContext` from the library's test utilities (see https://virtuoso.dev/virtuoso-message-list/testing/). This provides a controlled rendering environment where viewport size and scroll position can be set declaratively.

### Regression gate

After all Phase 4 changes, verify: `bun run test -- apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx` passes all tests. This is the minimum regression gate before merging.

---

## Files Modified

| File                                                                   | Change                                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `package.json`                                                         | Add `@virtuoso.dev/message-list`                                                                         |
| `apps/agent/src/stores/chat/chat-store.ts`                             | Add `scrollIntent` to `ChatSessionData`, optional param on `setMessages`, new `clearScrollIntent` action |
| `apps/agent/src/services/chat/chat-message-service.ts`                 | 3 `setMessages` callers pass scroll intent (`'history-load'`, `'compact-reload'`, `'rewind'`)            |
| `apps/agent/src/components/chat/chat-messages.tsx`                     | **Major rewrite** — VirtuosoMessageList replaces Virtuoso + use-stick-to-bottom                          |
| `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx` | Update mocks and assertions                                                                              |
| `vitest.setup.ts`                                                      | Fix ResizeObserver mock (Phase 1.5)                                                                      |

**Unchanged:** ChatContent.tsx, MessageItem.tsx, message-utils.ts, types.ts, all 14 tool widgets, use-tool-widget-state.ts, BackendChatSurface.tsx, all streaming pipeline code.

---

## Verification

### Manual Tests (in Tauri app via `bunx tauri dev`)

1. **Streaming auto-scroll** — Send message, verify response streams with auto-scroll to bottom
2. **Scroll up cancels follow** — During streaming, scroll up. Auto-scroll stops. Scroll back to bottom — auto-scroll resumes.
3. **User message scroll** — Send message while scrolled up. List scrolls to bottom to show new message.
4. **"Thinking" shimmer** — Verify pinned at viewport bottom (StickyFooter), doesn't jitter with scroll content
5. **Session switch** — Switch conversations. Scroll resets. Tool expand state scoped.
6. **200+ messages** — Load long conversation. Smooth scroll, no blank flash.
7. **Text selection** — Select across multiple messages. Character-level, not block-level.
8. **Tool expand** — Expand tool, scroll away, scroll back. Remains expanded.
9. **Rewind** — Click rewind. Conversation truncates, scroll adjusts.
10. **Short conversation** — Few messages align to top (`shortSizeAlign: 'top'`, matches current behavior)
11. **Queued message** — Type while agent runs. Queued bubble in Footer below messages.

### Scroll model edge cases (in Tauri app)

12. **Streaming with tool expand above viewport** — During streaming, expand a tool widget that's scrolled above the viewport. Auto-scroll should not jump.
13. **Rewind while scrolled up** — Scroll up, click rewind. Conversation truncates. Scroll position should not jump to a stale offset.
14. **Rewind with queued message** — Type while agent runs (queued bubble in Footer), then rewind. Queued bubble should persist.
15. **Session switch tall→short** — Load a 200+ message conversation, then switch to a 3-message conversation. No stale measurements or blank space.
16. **reconcileMessageId during streaming** — Send a message, observe the first `agent:checkpoint` fires. User message row should NOT remount (verify hover state survives).
17. **StickyFooter vs floating input** — During streaming, scroll up. Verify the pinned shimmer does not visually overlap the floating input bar.

### Quality Checks

```bash
bun run typecheck
bun run lint
bun run test
```

---

## License Note

`@virtuoso.dev/message-list` requires a commercial license for production. Empty string `licenseKey=""` enables trial mode for development. Purchase at https://virtuoso.dev/pricing before shipping to users. Add a `// TODO: Add production license key` comment.
