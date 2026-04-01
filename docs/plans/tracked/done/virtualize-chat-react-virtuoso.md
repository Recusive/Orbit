# Plan: Virtualize Chat Messages with react-virtuoso

## Reference Docs

- `reference/virtuoso-message-list/` — Virtuoso Message List docs (tutorials, examples, hooks, scrolling, testing)

## Context

The chat message list renders ALL messages via `.map()` with no virtualization. Long conversations (200+ messages with tool widgets) feel sluggish because every MessageItem + its tool widgets live in the DOM at all times. A previous `@tanstack/react-virtual` implementation was removed (commit `7bcf085d`) due to WKWebView text selection issues caused by `contain: paint` and absolute positioning. react-virtuoso uses a fundamentally different layout strategy (padding-based, no `contain: paint`), so those issues should not apply. react-virtuoso is already installed and used successfully in `ChangesList.tsx`.

## Key Design Decisions

| Question                                 | Decision                                          | Why                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Own scroller or `customScrollParent`?    | Let Virtuoso own the scroller                     | ChatMessages is the sole scrollable content in its slot; no shared parent                                                                                                                                                                                                                                                                 |
| Keep `use-stick-to-bottom`?              | Remove, replace with `followOutput`               | Can't have two scroll controllers fighting                                                                                                                                                                                                                                                                                                |
| Keep `useSmoothScroll`?                  | Remove                                            | Its wheel interception would fight Virtuoso's scroll tracking                                                                                                                                                                                                                                                                             |
| `computeItemKey`?                        | `(index) => \`${sessionId}:${index}\``            | Index avoids reconcileMessageId remount; session prefix forces full remount on session switch so row-local state (Show more, hover, feedback dialog) resets cleanly                                                                                                                                                                       |
| Footer vs data items for loading/queued? | Virtuoso `Footer` slot                            | They're ephemeral UI, not messages                                                                                                                                                                                                                                                                                                        |
| Overscan?                                | `{ main: 600, reverse: 600 }` pixels              | Chat messages are tall; 600px = ~2-3 extra messages each direction                                                                                                                                                                                                                                                                        |
| Tool widget expand state?                | Lift to external Map with `useSyncExternalStore`  | Survives unmount/remount from virtualization                                                                                                                                                                                                                                                                                              |
| Animation state after unmount?           | Clear `animatingMessageIds` via callback          | DOM-level `animation: none` is lost on unmount; state must be cleaned up                                                                                                                                                                                                                                                                  |
| Find-in-page (Cmd+F)?                    | Known trade-off — document for future search UI   | Virtualized content not in DOM; native Cmd+F only searches rendered items                                                                                                                                                                                                                                                                 |
| Row-local UI state (Show more, hover)?   | Reset on session switch via session-prefixed keys | `computeItemKey` includes `sessionId` — all keys change on session switch, React unmounts every row, row-local state (Show more, hover, feedback dialog) resets cleanly. Within a session, index stability avoids remount from `reconcileMessageId`. Scroll-driven unmount/remount also resets these — acceptable for ephemeral UI state. |
| Custom components ref wiring?            | `React.forwardRef` + spread all props             | Virtuoso passes `ref`, `style`, `data-*` attrs, `tabIndex` to custom components. Dropping any breaks measurement or scroll tracking.                                                                                                                                                                                                      |

## Known Trade-offs

- **Cmd+F / Find-in-page**: Virtualized messages are not in the DOM. Browser find-in-page only searches the ~15-20 rendered messages. This is a deliberate trade-off for DOM performance. A custom search overlay can be built on top of the `data` array in a follow-up plan.
- **Scroll feel change**: Current `useSmoothScroll` provides lerp-based "Apple-like" damping. Virtuoso uses native browser scrolling. The visual scroll feel will change. If this regresses UX, a lightweight wheel handler can be added to Virtuoso's `Scroller` component in a follow-up.
- **`followOutput` vs spring animation**: Current `use-stick-to-bottom` uses spring-based animation with ResizeObserver for streaming auto-scroll. Virtuoso's `followOutput: 'smooth'` uses CSS `scroll-behavior: smooth`. The feel is different — test side-by-side during implementation.

## Auto-Scroll Parity Strategy

The current `use-stick-to-bottom` handles four scroll scenarios. Each must have a Virtuoso equivalent:

| Scenario                               | Current (`use-stick-to-bottom`)            | Virtuoso replacement                                                                    | Coverage                            |
| -------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------- |
| Streaming text growth (last message)   | ResizeObserver + spring scroll             | `followOutput` fires on last-item size change                                           | **Full**                            |
| New message appended                   | ResizeObserver + spring scroll             | `followOutput` fires on item count change                                               | **Full**                            |
| Thinking/tool height change (last msg) | ResizeObserver + spring scroll             | `followOutput` fires on last-item size change                                           | **Full**                            |
| Tool expand/collapse ABOVE viewport    | `overflowAnchor: 'none'` + library handles | Virtuoso adjusts `padding-top` internally to compensate for above-viewport size changes | **Full** (native Virtuoso behavior) |
| User scrolls up → cancel auto-follow   | `stopScroll()` via `onScrollAway`          | `followOutput` returns `false` when `!isAtBottom`                                       | **Full**                            |

**Key difference:** Virtuoso's scroll anchoring is padding-based (adjusts `padding-top`/`padding-bottom`), not `overflow-anchor`-based. Do NOT set `overflowAnchor: 'none'` on the Scroller — let Virtuoso's internal anchoring handle it. Do NOT set `overflowAnchor: 'auto'` either — Virtuoso doesn't use or need the native CSS property.

**WKWebView caveat:** Virtuoso's above-viewport padding compensation is tested primarily in Chromium. WKWebView (Tauri's macOS renderer) may handle `padding-top` mutations differently during scroll. The "Tool expand/collapse ABOVE viewport" row above is marked "Full" based on Virtuoso's algorithm, but **must be verified in the Tauri app specifically** — not just in `bun run dev` (which uses Chrome).

**Verification during implementation:** After Phase 2, verify all five scenarios in the **Tauri app** (`bunx tauri dev`, not browser-only dev server) before proceeding to Phase 3. If `followOutput` or above-viewport anchoring doesn't work correctly in WKWebView, fall back to `scrollerRef` + manual `scrollBy()` in a ResizeObserver callback before removing `use-stick-to-bottom`.

---

## Phase 1: Lift Tool Widget Expand State

Before virtualizing, make tool widgets resilient to unmount/remount.

### Step 1.1 — Create `useToolWidgetExpanded` hook

**New file:** `apps/agent/src/components/chat/tools/shared/use-tool-widget-state.ts`

- Module-level `Map<string, boolean>` for expand state persistence
- `useSyncExternalStore` wrapper for React integration (not Zustand — too lightweight for a store)
- **Session scoping via React Context** — the hook reads `sessionId` from `ToolWidgetSessionContext` to build composite keys (`${sessionId}:${toolId}`). No module-global session variable, no effect timing issues.
- API: `useToolWidgetExpanded(toolId, defaultExpanded?)` returns `[boolean, () => void]`
- `clearToolWidgetState()` export — clears the entire Map (use for memory pressure cleanup, not routine session switching)
- `ToolWidgetSessionContext` export — React context providing the active session ID

**Why React Context instead of a module global:**

1. Context is available synchronously during render — no effect timing gap where widgets read a stale session.
2. No singleton coupling — if Orbit ever supports multiple chat surfaces or windows, each gets its own context provider.
3. Testable without module-state reset — wrap in a provider with a test session ID.

**Session scoping is critical** because:

1. `ChatMessages` can unmount entirely for empty conversations, making effect-based cleanup unreliable.
2. Tool IDs are SDK-assigned UUIDs that could theoretically collide across sessions.
3. Background sessions may have active tools that write to the same module-level Map.

**Expand state product contract:** Tool expand state is **per-session**. Switching from session A to B shows B's expand state (defaults if first visit). Switching back to A restores A's expand state. This is not "clearing" — it's scoping. The module-level Map retains all sessions' state until `clearToolWidgetState()` is called.

```ts
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

// React Context — set by ChatMessages, read by useToolWidgetExpanded
export const ToolWidgetSessionContext = createContext<string>('');

// Module-level store — persists across mounts, scoped by session:toolId composite keys
const expandedState = new Map<string, boolean>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function clearToolWidgetState(): void {
  expandedState.clear();
  notify();
}

export function useToolWidgetExpanded(
  toolId: string,
  defaultExpanded = false
): [boolean, () => void] {
  const sessionId = useContext(ToolWidgetSessionContext);
  const key = `${sessionId}:${toolId}`;

  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    return (): void => {
      listeners.delete(cb);
    };
  }, []);

  const getSnapshot = useCallback(
    (): boolean => expandedState.get(key) ?? defaultExpanded,
    [key, defaultExpanded]
  );

  const value = useSyncExternalStore(subscribe, getSnapshot);

  const toggle = useCallback((): void => {
    const current = expandedState.get(key) ?? defaultExpanded;
    expandedState.set(key, !current);
    notify();
  }, [key, defaultExpanded]);

  return [value, toggle];
}
```

### Step 1.2 — Export from barrel

**Edit:** `apps/agent/src/components/chat/tools/shared/index.ts` — add export

### Step 1.3 — Pass `toolId` through ToolWidgetRenderer

**Edit:** `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx`

Add `toolId={tool.id}` prop to **only** the 14 widgets that use `useToolWidgetExpanded` (listed in Step 1.4). Do NOT add `toolId` to widgets without expand state (`ReadToolWidget`, `SkillToolWidget`, null-return cases). The `tool` object is already available in the switch.

### Step 1.4 — Migrate 14 tool widgets

Replace `const [isExpanded, setIsExpanded] = useState(false)` with `const [isExpanded, toggleExpanded] = useToolWidgetExpanded(toolId)` in each:

| File                                           | Default |
| ---------------------------------------------- | ------- |
| `tools/bash-tool-widget.tsx` (line 36)         | `false` |
| `tools/edit-tool-widget.tsx` (line 44)         | `false` |
| `tools/write-tool-widget.tsx` (line 42)        | `false` |
| `tools/glob-tool-widget.tsx` (line 44)         | `false` |
| `tools/grep-tool-widget.tsx` (line 95)         | `false` |
| `tools/web-search-tool-widget.tsx` (line 101)  | `false` |
| `tools/web-fetch-tool-widget.tsx` (line 37)    | `false` |
| `tools/code-search-tool-widget.tsx` (line 32)  | `false` |
| `tools/task-tool-widget.tsx` (line 80)         | `false` |
| `tools/todo-tool-widget.tsx` (line 107)        | `false` |
| `tools/plan-tool-widget.tsx` (line 46)         | `true`  |
| `tools/generic-tool-widget.tsx` (line 51)      | `false` |
| `tools/browser-tool-widget.tsx` (line 159)     | `false` |
| `tools/ask-user-question-widget.tsx` (line 88) | `false` |

Each widget: add `readonly toolId: string` to props interface, receive from ToolWidgetRenderer, swap useState for hook. Change `setIsExpanded(!isExpanded)` / `setIsExpanded(prev => !prev)` to `toggleExpanded()`.

**Note:** Shiki highlighting state (`highlightedCommand`, `highlightedOutput` in bash/edit widgets) does NOT need lifting — Shiki caches grammars after first load, re-highlighting on remount is ~1ms.

### Step 1.5 — Fix animation replay on remount

**Problem:** `animatingMessageIds` is never cleared after the animation plays. The current code uses DOM-level `e.currentTarget.style.animation = 'none'` in `UserMessageBubble`'s `onAnimationEnd` (MessageItem.tsx:197). With virtualization, unmounting discards this DOM fix, so scrolling back replays the entrance animation.

**Edit:** `apps/agent/src/components/chat/chat-messages.tsx`

Add a callback to clear the animation state after it plays:

```tsx
const handleAnimationComplete = useCallback((messageId: string) => {
  setAnimatingMessageIds((prev) => {
    const next = new Set(prev);
    next.delete(messageId);
    return next;
  });
}, []);
```

Pass `onAnimationComplete={handleAnimationComplete}` to `MessageItem`.

**Edit:** `apps/agent/src/components/chat/messages/types.ts`

Add to `MessageItemProps`:

```ts
readonly onAnimationComplete?: ((messageId: string) => void) | undefined;
```

**Edit:** `apps/agent/src/components/chat/messages/MessageItem.tsx`

In `UserMessageBubble`'s `onAnimationEnd`, call the callback after the DOM fix:

```tsx
onAnimationEnd={(e) => {
  e.currentTarget.style.animation = 'none'; // immediate visual fix
  onAnimationComplete?.(message.id);        // state cleanup for remount safety
}}
```

Update `arePropsEqual` in `message-utils.ts` to compare `onAnimationComplete` by reference (stable useCallback, won't trigger re-renders).

**Phase 1 is backward-compatible** — test independently before Phase 2.

---

## Phase 2: Replace Chat Message List with Virtuoso

### Step 2.1 — Rewrite `chat-messages.tsx`

**Edit:** `apps/agent/src/components/chat/chat-messages.tsx`

**Remove:**

- `import { useStickToBottom } from 'use-stick-to-bottom'`
- `import { useSmoothScroll } from '@/hooks/ui'`
- The `useStickToBottom({...})` call and its destructured `scrollRef`, `contentRef`, `scrollToBottom`, `stopScroll`
- The `useSmoothScroll({...})` call and `mergedScrollRef` callback ref
- The outer `<div ref={mergedScrollRef}>` scroll container
- The inner `<div ref={contentRef}>` content wrapper
- The `messages.map(...)` loop
- The `overflowAnchor: 'none'` comment about use-stick-to-bottom

**Add:**

- `import { Virtuoso } from 'react-virtuoso'`
- `import type { VirtuosoHandle, Components } from 'react-virtuoso'`
- `import { ToolWidgetSessionContext } from './tools/shared'`
- Note: `clearToolWidgetState` is NOT imported in `chat-messages.tsx`. It exists for use in memory-pressure scenarios (e.g., long-running sessions with 50+ conversation switches). If profiling shows the Map growing unbounded, add an idle cleanup via `requestIdleCallback` in a future follow-up.
- `const virtuosoRef = useRef<VirtuosoHandle>(null)`
- `const [isAtBottom, setIsAtBottom] = useState(true)` — tracks whether user is at bottom of scroll

**New JSX structure:**

```tsx
<ToolWidgetSessionContext.Provider value={sessionId ?? ''}>
  <Virtuoso<ChatMessage, VirtuosoContext>
    ref={virtuosoRef}
    data={messages}
    context={virtuosoContext} // { isLoading, queuedMessage, onCancelQueue }
    computeItemKey={(index) => `${sessionId ?? ''}:${String(index)}`}
    followOutput={handleFollowOutput} // (isAtBottom) => isAtBottom ? 'smooth' : false
    atBottomStateChange={setIsAtBottom}
    overscan={{ main: 600, reverse: 600 }}
    itemContent={renderMessage}
    components={virtuosoComponents}
    className="flex-1"
  />
</ToolWidgetSessionContext.Provider>
```

**Why session-prefixed keys:** `computeItemKey` includes `sessionId` so that ALL keys change on session switch, forcing React to unmount every row. This guarantees row-local state (`Show more`, hover, feedback dialog) resets cleanly between conversations. Within a session, the index portion avoids remount from `reconcileMessageId` (which changes `msg.id` but not array position).

**`initialTopMostItemIndex` is intentionally omitted.** The current behavior starts conversations at `scrollTop = 0` (top). Virtuoso defaults to rendering from the top, which matches. During active streaming, `followOutput` handles auto-scrolling to the bottom. Setting `initialTopMostItemIndex={messages.length - 1}` would incorrectly start at the bottom on app restore and empty→populated transitions.

**Session remap (`remapConversation`) edge case:** UIStore's `remapConversation(oldId, newId)` changes `sessionId` mid-session for forks/rewind and legacy sessions. Session-prefixed keys cause all rows to remount when this happens — this is correct behavior, since rewind/fork restructures the entire conversation anyway. The expand state Map retains the old session's entries (keyed under `oldId:`), which become orphaned. This is acceptable; the entries are small and `clearToolWidgetState()` can be called during idle cleanup if the Map grows large.

**Note:** Do NOT add `increaseViewportBy` — it compounds with `overscan`, rendering 25-30+ messages and defeating virtualization. `overscan` alone provides sufficient buffer (600px = ~2-3 extra messages each direction).

**Custom Virtuoso components** (defined outside ChatMessages for stable reference):

All custom components **must** use `React.forwardRef` and spread ALL props — not just `style`. Virtuoso passes `ref`, `style`, `data-testid`, `tabIndex`, `data-virtuoso-scroller`, and other internal attributes. Dropping any of these breaks measurement, scroll tracking, or accessibility.

```tsx
const VirtuosoScroller = React.forwardRef<HTMLDivElement, React.ComponentPropsWithRef<'div'>>(
  (props, ref) => (
    <div
      {...props}
      ref={ref}
      style={{
        ...props.style,
        scrollbarGutter: 'stable both-edges',
        contain: 'layout style',
      }}
    />
  )
);
VirtuosoScroller.displayName = 'VirtuosoScroller';

const VirtuosoList = React.forwardRef<HTMLDivElement, React.ComponentPropsWithRef<'div'>>(
  (props, ref) => (
    <div
      {...props}
      ref={ref}
      className="mx-auto pt-4 px-4"
      style={{
        ...props.style, // CRITICAL: preserves Virtuoso's padding-top/padding-bottom
        maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)`,
      }}
    />
  )
);
VirtuosoList.displayName = 'VirtuosoList';
```

- `Footer` — renders QueuedMessageBubble, ShimmerText loading indicator, and bottom spacer `<div className="mt-44">`. Receives state via `context` prop. Footer is wrapped in the same `mx-auto px-4` and `maxWidth` constraint as the List to maintain chat width alignment:

```tsx
const VirtuosoFooter: Components<ChatMessage, VirtuosoContext>['Footer'] = ({ context }) => {
  if (!context) return null;
  return (
    <div
      className="mx-auto px-4"
      style={{ maxWidth: `var(${CHAT_WIDTH_VAR.primary}, ${String(CHAT_WIDTH.primary)}px)` }}
    >
      {context.queuedMessage !== null ? (
        <QueuedMessageBubble message={context.queuedMessage} onCancel={context.onCancelQueue} />
      ) : null}
      {context.isLoading ? (
        <div className="flex items-center gap-2 px-[9px] py-2">
          <ShimmerText className="font-sans text-base text-foreground">Thinking</ShimmerText>
        </div>
      ) : null}
      <div className="mt-44" aria-hidden="true" />
    </div>
  );
};
```

**Context type** for passing non-message data to Footer:

```ts
interface VirtuosoContext {
  isLoading: boolean;
  queuedMessage: QueuedMessage | null;
  onCancelQueue: () => void;
}
```

**`itemContent` callback** — memoized via `useCallback`. Wraps each message in `<div className="mb-3">` to preserve the current inter-message spacing. Same content as current `.map()` body:

```tsx
const renderMessage = useCallback(
  (index: number, msg: ChatMessage) => {
    const isLastAssistant = msg.id === lastAssistantMessageId;
    const isLastInGroup = lastInAssistantGroupIds.has(msg.id);
    const isLastMsg = index === messages.length - 1;
    const shouldAnimate = animatingMessageIds.has(msg.id);
    const tools = toolsByMessageId.get(msg.id) ?? [];

    return (
      <div className="mb-3">
        <MessageItem
          message={msg}
          tools={tools}
          isLastAssistantMessage={isLastAssistant}
          isLastInAssistantGroup={isLastInGroup}
          isLastMessage={isLastMsg}
          isAgentRunning={isAgentRunning}
          animate={shouldAnimate}
          onRewind={onRewindRef.current}
          onOpenFile={onOpenFileRef.current}
          onOpenUrl={onOpenUrlRef.current}
          onFeedback={onFeedbackRef.current}
          onAnimationComplete={handleAnimationComplete}
        />
      </div>
    );
  },
  [
    messages,
    lastAssistantMessageId,
    lastInAssistantGroupIds,
    animatingMessageIds,
    toolsByMessageId,
    isAgentRunning,
    handleAnimationComplete,
  ]
);
```

**Callback stability (required — not optional):** The callback props (`onRewind`, `onOpenFile`, `onOpenUrl`, `onFeedback`) are plain closures from `createChatActionHandlers()` — NOT `useCallback`-wrapped. Including them in the `renderMessage` dep array means every parent render → new callback → Virtuoso calls `itemContent` for all ~15-20 visible items during streaming. `MessageItem`'s `arePropsEqual` mitigates full re-renders, but the `itemContent` re-execution itself is wasteful. Use refs to keep `renderMessage` stable:

```tsx
const onRewindRef = useRef(onRewind);
const onOpenFileRef = useRef(onOpenFile);
const onOpenUrlRef = useRef(onOpenUrl);
const onFeedbackRef = useRef(onFeedback);
onRewindRef.current = onRewind;
onOpenFileRef.current = onOpenFile;
onOpenUrlRef.current = onOpenUrl;
onFeedbackRef.current = onFeedback;
// Use ___Ref.current inside renderMessage, remove all 4 from deps
```

**Keep all existing memoization** unchanged: `toolsByMessageId`, `lastAssistantMessageId`, `lastInAssistantGroupIds`, `animatingMessageIds`.

### Step 2.2 — Update session switch effect

Replace `scrollRef.current.scrollTop = 0` + `stopScroll()` with:

```ts
// Reset scroll position for new conversation
virtuosoRef.current?.scrollTo({ top: 0 });
// Clear animation state for the new session
setAnimatingMessageIds(new Set());
prevMessageCount.current = 0;
```

**Note on session scoping:** No explicit `setToolWidgetSession()` call needed. The `ToolWidgetSessionContext.Provider value={sessionId}` updates synchronously during render, and `computeItemKey` includes `sessionId` which forces React to unmount all rows — both mechanisms are props/context-driven with no effect timing gap. Old session expand state remains in the module-level Map for restoration if the user switches back. Call `clearToolWidgetState()` via `requestIdleCallback` after many session switches only if memory profiling shows the Map growing unbounded.

### Step 2.3 — Update new-message animation effect

Replace `scrollToBottom()` call with:

```ts
virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
```

### Step 2.4 — Remove stale virtualizer comment

**Edit:** `apps/agent/src/components/chat/messages/MessageItem.tsx` (line 68)

Remove: `"since the virtualizer limits to ~15 messages in the DOM"` — stale from the removed TanStack implementation.

---

## Audit Resolutions

Audit: `reviews/audit-virtuoso-message-list-migration.md`

| #   | Issue                                         | Resolution                                                                                                                                                                  |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Unstable callbacks cause cascading re-renders | **Fixed above** — 4 callback refs (`onRewindRef`, `onOpenFileRef`, `onOpenUrlRef`, `onFeedbackRef`) keep `renderMessage` stable. Removed from deps.                         |
| C2  | Missing `CHAT_MAX_WIDTH_STYLE` on ItemContent | **Already covered** — `VirtuosoList` (the List component) has `mx-auto px-4` + `maxWidth: var(...)`. All items render inside VirtuosoList, inheriting its width constraint. |
| C3  | Missing `pt-4` top padding                    | **Already covered** — `VirtuosoList` has `className="mx-auto pt-4 px-4"`.                                                                                                   |

### Edge cases from audit

1. **Empty messages list** — Virtuoso renders an empty list with Footer still visible (shimmer/queued message). No special handling needed.
2. **Rewind shrinking the array** — Virtuoso handles data array shrinking natively. `followOutput` keeps viewport at bottom if user was at bottom. Step 2.2's `scrollTo({ top: 0 })` runs on session switch, not rewind. Rewind preserves scroll position — verify during implementation.
3. **Rapid session switching** — `computeItemKey` includes `sessionId`, forcing full unmount/remount. Each switch calls `scrollTo({ top: 0 })` and clears `animatingMessageIds`. Rapid switches cause rapid unmount/remount cycles — React handles this correctly since each render is synchronous.

---

## Phase 3: Cleanup

- Mark `use-smooth-scroll.ts` as `@deprecated` (only consumer was chat-messages.tsx)
- Leave `use-stick-to-bottom` in package.json for now (removal is a separate PR)
- Remove the "PINNED: use-stick-to-bottom@1.1.2" comment from chat-messages.tsx
- **Replace** (do not just remove) the "Do NOT add contain: paint, content-visibility: auto" warning comment with an updated warning:

```
// WARNING: Do NOT add `contain: paint`, `content-visibility: auto`, or
// `user-select: none` to .message-item — all three break native text
// selection in WKWebView (block-level selection instead of character-level).
// Virtuoso's padding-based layout avoids these properties. If you change
// the virtualization library, re-verify text selection in Tauri.
```

This prevents future developers from reintroducing the problematic CSS properties after the TanStack context is forgotten.

---

## Phase 4: Automated Regression Tests

**New file:** `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx`

Use the same mocked-Virtuoso pattern as `ChangesList.test.tsx` — mock `react-virtuoso` to render all items synchronously, then assert on behavior:

```tsx
vi.mock('react-virtuoso', () => ({
  Virtuoso: (props: MockVirtuosoProps) => {
    mockVirtuosoProps(props);
    return (
      <div data-testid="chat-virtuoso">
        {props.data.map((item, index) => (
          <div key={index}>{props.itemContent(index, item)}</div>
        ))}
        {props.components?.Footer?.({ context: props.context })}
      </div>
    );
  },
}));
```

### Required test cases:

1. **Session switch resets rows** — Render with session A messages, switch to session B. Verify `computeItemKey` produces session-prefixed keys (forces full unmount/remount). Verify `animatingMessageIds` is cleared. Verify Virtuoso `scrollTo({ top: 0 })` is called. Verify `ToolWidgetSessionContext.Provider` value changes to new session ID.

2. **`onAnimationComplete` clears animation state** — Render with a message in `animatingMessageIds`. Simulate `onAnimationComplete` callback. Verify the message ID is removed from the set. Verify re-render does not pass `animate={true}` for that message.

3. **Widget expand state persists across remounts** — Call `useToolWidgetExpanded` with a toolId, toggle to expanded, unmount, remount. Verify expanded state is preserved. Verify toggling back to collapsed works.

4. **Widget state is session-scoped** — Wrap hook in `ToolWidgetSessionContext.Provider value="session-a"`, expand tool X. Re-render with `value="session-b"`. Verify tool X reads as collapsed (default). Re-render with `value="session-a"`. Verify tool X reads as expanded (restored).

5. **Footer renders loading and queued states** — Render with `isLoading=true`. Verify ShimmerText appears in footer. Render with `queuedMessage`. Verify QueuedMessageBubble appears in footer.

6. **Virtuoso receives correct props** — Verify `computeItemKey` produces session-prefixed keys (`"session-a:0"`, `"session-a:1"`, etc.). Verify `overscan`, `followOutput`, `atBottomStateChange`, and `data` are passed correctly. Verify `increaseViewportBy` is NOT passed.

7. **`itemContent` renders MessageItem with correct props** — Verify tools lookup from `toolsByMessageId`, `isLastAssistantMessage`, `isLastInAssistantGroup`, `isLastMessage`, `animate`, and `onAnimationComplete` are all wired correctly.

8. **Initial mount starts at top** — Render with existing messages. Verify `initialTopMostItemIndex` is NOT passed to Virtuoso. Verify the list renders from index 0 (top of conversation).

### Required test file for Phase 1 (independent):

**New file:** `apps/agent/src/__tests__/unit/components/chat/tools/shared/use-tool-widget-state.test.ts`

Test the `useToolWidgetExpanded` hook in isolation (use `renderHook` with `ToolWidgetSessionContext.Provider` wrapper):

- Default value when no state exists
- Toggle persists across calls
- Toggle correctly inverts a `defaultExpanded=true` entry
- Session scoping via context isolates state between sessions
- Switching context value back restores previous session's state
- `clearToolWidgetState` resets all entries across all sessions

---

## Files Modified

| File                                                                        | Change                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `components/chat/tools/shared/use-tool-widget-state.ts`                     | **NEW** — session-scoped external expand state store       |
| `components/chat/tools/shared/index.ts`                                     | Add export                                                 |
| `components/chat/messages/ToolWidgetRenderer.tsx`                           | Pass `toolId` to 14 widgets with expand state              |
| `components/chat/tools/*.tsx` (14 files)                                    | Swap useState for useToolWidgetExpanded                    |
| `components/chat/chat-messages.tsx`                                         | **Major rewrite** — Virtuoso replaces .map() + scroll libs |
| `components/chat/messages/types.ts`                                         | Add `onAnimationComplete` to MessageItemProps              |
| `components/chat/messages/MessageItem.tsx`                                  | Wire `onAnimationComplete`, remove stale comment (line 68) |
| `components/chat/messages/message-utils.ts`                                 | Add `onAnimationComplete` to `arePropsEqual` comparison    |
| `hooks/ui/use-smooth-scroll.ts`                                             | Add @deprecated JSDoc                                      |
| `__tests__/unit/components/chat/chat-messages.test.tsx`                     | **NEW** — Virtuoso wiring, session switch, footer tests    |
| `__tests__/unit/components/chat/tools/shared/use-tool-widget-state.test.ts` | **NEW** — hook isolation tests                             |

All paths relative to `apps/agent/src/`.

---

## Verification

### Functional Tests (run in Tauri app via `bunx tauri dev`)

1. **Streaming auto-scroll** — Start a conversation, verify response streams with smooth auto-scroll
2. **Scroll away cancels follow** — While streaming, scroll up. Auto-scroll should stop.
3. **Tool expand survives scroll** — Expand a tool widget, scroll far away, scroll back. Must remain expanded.
4. **Session switch resets row state** — Switch conversations. Scroll resets to top. Row-local state (hover, feedback dialog, "Show more") resets. Tool expand state switches to the new session's state (defaults on first visit).
5. **200+ message conversation** — Load a long conversation. Verify smooth scrolling, no blank flashes.
6. **User message animation** — Send a message. Verify `animate-message-in` plays.
7. **Animation no-replay on scroll** — After sending a message (animation plays), scroll up past it, then scroll back down. The animation must NOT replay. Verify `animatingMessageIds` is cleared.
8. **Queued message** — Type while agent runs. Verify queued bubble appears below messages.
9. **Text selection** — Select text across multiple messages. Verify character-level selection (not block-level).
10. **Tool expand height change** — Expand a bash tool with long output. Verify no scroll jumping.
11. **Rewind** — Click rewind on a message. Verify conversation truncates and scroll adjusts.
12. **Message spacing** — Verify consistent vertical spacing between messages matches pre-virtualization layout (`mb-3` = 12px gap).
13. **Cmd+F (known limitation)** — Open browser find. Verify it finds text in visible messages. Note: text in off-screen messages will not be found — this is a documented trade-off.
14. **Empty conversation → populated** — Switch from a conversation with 200+ messages to an empty/new conversation. Verify no stale tool expand state from the previous session is visible. Switch back — verify the old session's expand state is restored (session-scoped keys).
15. **Tool expand above viewport** — In a long conversation, expand a tool widget near the top. Scroll down. The tool completes and its output grows. Scroll back up. Verify no scroll position jump (Virtuoso padding compensation).
16. **Footer alignment** — Verify queued message bubble and "Thinking" shimmer respect the same `maxWidth` chat constraint as messages. They should not extend full-width.
17. **Show more reset on scroll** — Expand a long user message ("Show more"), scroll away, scroll back. The "Show more" toggle resets to collapsed — this is expected/acceptable behavior.
18. **Initial mount starts at top** — Open the app with an existing conversation selected. Verify the list starts at `scrollTop = 0` (top of conversation), NOT at the bottom. This matches current non-virtualized behavior.
19. **Empty → populated transition** — Start a new (empty) conversation, send a message. Verify the message appears at the top, not jumped to the bottom.

### Quality Checks

```bash
bun run typecheck    # TypeScript
bun run lint         # ESLint
bun run test         # Vitest
```

### Performance (Chrome DevTools)

- Verify DOM node count stays bounded (~10-20 MessageItems in DOM for 200 messages)
- Profile streaming: confirm only the streaming message re-renders per chunk
