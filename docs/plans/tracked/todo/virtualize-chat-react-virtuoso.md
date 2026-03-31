# Plan: Virtualize Chat Messages with react-virtuoso

## Context

The chat message list renders ALL messages via `.map()` with no virtualization. Long conversations (200+ messages with tool widgets) feel sluggish because every MessageItem + its tool widgets live in the DOM at all times. A previous `@tanstack/react-virtual` implementation was removed (commit `7bcf085d`) due to WKWebView text selection issues caused by `contain: paint` and absolute positioning. react-virtuoso uses a fundamentally different layout strategy (padding-based, no `contain: paint`), so those issues should not apply. react-virtuoso is already installed and used successfully in `ChangesList.tsx`.

## Key Design Decisions

| Question                                 | Decision                                         | Why                                                                          |
| ---------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Own scroller or `customScrollParent`?    | Let Virtuoso own the scroller                    | ChatMessages is the sole scrollable content in its slot; no shared parent    |
| Keep `use-stick-to-bottom`?              | Remove, replace with `followOutput`              | Can't have two scroll controllers fighting                                   |
| Keep `useSmoothScroll`?                  | Remove                                           | Its wheel interception would fight Virtuoso's scroll tracking                |
| `computeItemKey`?                        | `(index) => index`                               | Same as current keys — msg.id changes mid-session via `reconcileMessageId()` |
| Footer vs data items for loading/queued? | Virtuoso `Footer` slot                           | They're ephemeral UI, not messages                                           |
| Overscan?                                | `{ main: 600, reverse: 600 }` pixels             | Chat messages are tall; 600px = ~2-3 extra messages each direction           |
| Tool widget expand state?                | Lift to external Map with `useSyncExternalStore` | Survives unmount/remount from virtualization                                 |

---

## Phase 1: Lift Tool Widget Expand State

Before virtualizing, make tool widgets resilient to unmount/remount.

### Step 1.1 — Create `useToolWidgetExpanded` hook

**New file:** `apps/agent/src/components/chat/tools/shared/use-tool-widget-state.ts`

- Module-level `Map<string, boolean>` keyed by `tool.id`
- `useSyncExternalStore` wrapper for React integration (not Zustand — too lightweight for a store)
- API: `useToolWidgetExpanded(toolId, defaultExpanded?)` returns `[boolean, () => void]`
- `clearToolWidgetState()` export — called on session switch to reset all expanded states

### Step 1.2 — Export from barrel

**Edit:** `apps/agent/src/components/chat/tools/shared/index.ts` — add export

### Step 1.3 — Pass `toolId` through ToolWidgetRenderer

**Edit:** `apps/agent/src/components/chat/messages/ToolWidgetRenderer.tsx`

Add `toolId={tool.id}` prop to every widget invocation. The `tool` object is already available.

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
- `import { clearToolWidgetState } from './tools/shared'`
- `const virtuosoRef = useRef<VirtuosoHandle>(null)`

**New JSX structure:**

```tsx
<Virtuoso<ChatMessage, VirtuosoContext>
  ref={virtuosoRef}
  data={messages}
  context={virtuosoContext} // { isLoading, queuedMessage, onCancelQueue }
  computeItemKey={(index) => index}
  followOutput={handleFollowOutput} // (isAtBottom) => isAtBottom ? 'smooth' : false
  atBottomStateChange={setIsAtBottom}
  initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
  overscan={{ main: 600, reverse: 600 }}
  increaseViewportBy={{ top: 400, bottom: 400 }}
  itemContent={renderMessage}
  components={virtuosoComponents}
  className="flex-1"
/>
```

**Custom Virtuoso components** (defined outside ChatMessages for stable reference):

- `List` — wraps content with `mx-auto pt-4 px-4` and `maxWidth` chat constraint. Must spread `{...props.style}` to preserve Virtuoso's padding-top/padding-bottom.
- `Footer` — renders QueuedMessageBubble, ShimmerText loading indicator, and bottom spacer `<div className="mt-44">`. Receives state via `context` prop.
- `Scroller` — adds `scrollbarGutter: 'stable both-edges'` and `contain: 'layout style'` to Virtuoso's scroll container.

**Context type** for passing non-message data to Footer:

```ts
interface VirtuosoContext {
  isLoading: boolean;
  queuedMessage: QueuedMessage | null;
  onCancelQueue: () => void;
}
```

**`itemContent` callback** — memoized via `useCallback`, same content as current `.map()` body.

**Keep all existing memoization** unchanged: `toolsByMessageId`, `lastAssistantMessageId`, `lastInAssistantGroupIds`, `animatingMessageIds`, `useRotatingMessage`.

### Step 2.2 — Update session switch effect

Replace `scrollRef.current.scrollTop = 0` + `stopScroll()` with:

```ts
virtuosoRef.current?.scrollTo({ top: 0 });
clearToolWidgetState();
```

### Step 2.3 — Update new-message animation effect

Replace `scrollToBottom()` call with:

```ts
virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
```

### Step 2.4 — Remove stale virtualizer comment

**Edit:** `apps/agent/src/components/chat/messages/MessageItem.tsx` (line 68)

Remove: `"since the virtualizer limits to ~15 messages in the DOM"` — stale from the removed TanStack implementation.

---

## Phase 3: Cleanup

- Mark `use-smooth-scroll.ts` as `@deprecated` (only consumer was chat-messages.tsx)
- Leave `use-stick-to-bottom` in package.json for now (removal is a separate PR)
- Remove the "PINNED: use-stick-to-bottom@1.1.2" comment from chat-messages.tsx
- Remove the "Do NOT add contain: paint, content-visibility: auto" warning comment — no longer applicable with Virtuoso's padding-based approach

---

## Files Modified

| File                                                    | Change                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `components/chat/tools/shared/use-tool-widget-state.ts` | **NEW** — external expand state store                      |
| `components/chat/tools/shared/index.ts`                 | Add export                                                 |
| `components/chat/messages/ToolWidgetRenderer.tsx`       | Pass `toolId` to all widgets                               |
| `components/chat/tools/*.tsx` (14 files)                | Swap useState for useToolWidgetExpanded                    |
| `components/chat/chat-messages.tsx`                     | **Major rewrite** — Virtuoso replaces .map() + scroll libs |
| `components/chat/messages/MessageItem.tsx`              | Remove stale comment (line 68)                             |
| `hooks/ui/use-smooth-scroll.ts`                         | Add @deprecated JSDoc                                      |

All paths relative to `apps/agent/src/`.

---

## Verification

### Functional Tests (run in Tauri app via `bunx tauri dev`)

1. **Streaming auto-scroll** — Start a conversation, verify response streams with smooth auto-scroll
2. **Scroll away cancels follow** — While streaming, scroll up. Auto-scroll should stop.
3. **Tool expand survives scroll** — Expand a tool widget, scroll far away, scroll back. Must remain expanded.
4. **Session switch resets** — Switch conversations. Scroll resets, tool expand states clear.
5. **200+ message conversation** — Load a long conversation. Verify smooth scrolling, no blank flashes.
6. **User message animation** — Send a message. Verify `animate-message-in` plays.
7. **Queued message** — Type while agent runs. Verify queued bubble appears below messages.
8. **Text selection** — Select text across multiple messages. Verify character-level selection (not block-level).
9. **Tool expand height change** — Expand a bash tool with long output. Verify no scroll jumping.
10. **Rewind** — Click rewind on a message. Verify conversation truncates and scroll adjusts.

### Quality Checks

```bash
bun run typecheck    # TypeScript
bun run lint         # ESLint
bun run test         # Vitest
```

### Performance (Chrome DevTools)

- Verify DOM node count stays bounded (~10-20 MessageItems in DOM for 200 messages)
- Profile streaming: confirm only the streaming message re-renders per chunk
