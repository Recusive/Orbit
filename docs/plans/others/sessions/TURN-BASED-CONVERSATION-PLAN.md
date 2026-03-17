# Turn-Based Conversation Model Migration

## Summary

Migrate the chat from a flat `ChatMessage[]` + separate `ToolStore` model to a shallow **turn-based tree** where each turn pairs a user message with an assistant response containing pre-built segments. Segments are constructed at **ingest time** (when streaming events arrive) instead of at **render time** (eliminating `buildSegments()` reconstruction every frame).

**Rewind stays exactly as-is** — fork-to-new-session approach is unchanged.
**Direct swap** — no feature flags, each phase fully replaces the old code.

---

## Phase 0: New Types

**Goal:** Define the target data types. No behavior changes.

**Create:** `apps/agent/src/types/conversation/turn.ts`

```typescript
interface ConversationTurn {
  id: string; // = userMessage.id
  userMessage: UserTurnMessage;
  response: AssistantResponse | null; // null while waiting
}

interface UserTurnMessage {
  id: string;
  content: string;
  attachedFiles?: string[];
  attachedImages?: ImageAttachment[];
  timestamp: number;
}

interface AssistantResponse {
  id: string;
  segments: ResponseSegment[]; // built incrementally during streaming
  thinking?: string;
  thinkingDurationMs?: number;
  isStreaming: boolean;
  isInterrupted?: boolean;
  usage?: UsageData;
}

type ResponseSegment =
  | { type: 'text'; content: string; key: string }
  | { type: 'tool'; execution: ToolExecution; key: string };
```

**Create:** `apps/agent/src/types/conversation/index.ts` (barrel export)

---

## Phase 1: TurnBuilder Class

**Goal:** A stateful builder that constructs `ConversationTurn[]` incrementally as streaming events arrive. This is the core of the new model — it replaces `buildSegments()` and `contentOffset`.

**Create:** `apps/agent/src/lib/conversation/turn-builder.ts`

API:

- `startTurn(userMsg)` → creates ConversationTurn with null response
- `startResponse(turnId, messageId)` → creates AssistantResponse with empty segments
- `appendText(messageId, text)` → extends last text segment (or creates new one)
- `appendThinking(messageId, thinking)` → sets response.thinking
- `startTool(messageId, toolExec)` → seals current text segment, pushes tool segment
- `completeTool(toolId, output, success)` → updates existing tool segment in-place
- `completeResponse(messageId, usage?)` → sets isStreaming = false
- `interruptResponse(messageId)` → sets isInterrupted = true
- `loadTurns(turns)` → bulk load from persistence
- `getTurns()` → returns current snapshot (new ref only if dirty)
- `flush()` → commits any accumulated text to segments (for RAF batching)

**Key behavior:** When `appendText()` is called, it accumulates into the last text segment. When `startTool()` is called, the current text segment is "sealed" and a new tool segment begins. After tool completion, subsequent `appendText()` creates a fresh text segment after the tool. **This eliminates `contentOffset` entirely.**

**Create:** `apps/agent/src/lib/conversation/__tests__/turn-builder.test.ts`

Test cases:

- Basic text streaming → single text segment
- Text → tool → text → produces 3 segments
- Multiple tools back-to-back
- Load persisted turns, verify structure
- flush() commits pending text
- Snapshot reference stability (getTurns() returns same ref when no changes)

---

## Phase 2: Persistence Adapter

**Goal:** Convert between `ConversationMessageDto[]` (backend format) and `ConversationTurn[]`. No Rust changes needed.

**Create:** `apps/agent/src/lib/conversation/persistence-adapter.ts`

```typescript
function dtoToTurns(messages: ConversationMessageDto[]): ConversationTurn[];
function turnToDto(turn: ConversationTurn): ConversationMessageDto[];
```

**Logic for `dtoToTurns`:**

1. Walk messages sequentially
2. User message → start new turn
3. Assistant message → set as turn.response
4. Convert `toolUses[]` into interleaved ResponseSegments (use tool positions relative to content)
5. Handle edge cases: system messages, assistant-only messages

**Logic for `turnToDto`:**

1. Extract userMessage → ConversationMessageDto with role 'user'
2. Extract response → ConversationMessageDto with role 'assistant'
3. Flatten tool segments back into `toolUses[]` array
4. Reconstruct full content string by concatenating text segments

**Create:** `apps/agent/src/lib/conversation/__tests__/persistence-adapter.test.ts`

---

## Phase 3: Turn Store + Replace Message State

**Goal:** Replace the `useMessageState` hook (flat `ChatMessage[]` cache) with a turn-based store.

**Create:** `apps/agent/src/stores/chat/turn-store.ts`

```typescript
interface TurnStoreState {
  turns: ConversationTurn[];
  builder: TurnBuilder;

  // Session management
  switchSession: (sessionId: string) => void;
  getSessionTurns: (sessionId: string) => ConversationTurn[];

  // Per-session cache (same pattern as current messagesCache)
  sessionCache: Map<string, ConversationTurn[]>;
}
```

**Modify:** `apps/agent/src/hooks/chat/state/message-state.ts`

- Replace `messages: ChatMessage[]` with `turns: ConversationTurn[]`
- The `messagesCache` Map becomes `turnsCache`
- `messagesRef` becomes `turnsRef`

**Modify:** `apps/agent/src/hooks/chat/use-chat-messages.ts`

- Return type changes: `messages` → `turns`
- `setMessages` → replaced with TurnBuilder methods
- `handleSend` creates a turn via `builder.startTurn()` instead of pushing a ChatMessage
- The `conversationAddMessage()` call in pending message handler uses `turnToDto()`

---

## Phase 4: Adapt Message Handler (Core Streaming)

**Goal:** Replace `setMessages()` calls in the message handler with TurnBuilder method calls. This is the most complex phase.

**Modify:** `apps/agent/src/hooks/chat/handlers/message-handler.ts`

### Changes by event type:

**`agent:chunk`** (line ~441):

- Current: RAF batch → `setMessages(prev => updateLastMessage(prev, content))`
- New: RAF batch → `builder.appendText(messageId, content)` → `setTurns(builder.getTurns())`

**`agent:thinking`** (line ~472):

- Current: `setMessages(prev => updateThinking(prev, thinking))`
- New: `builder.appendThinking(messageId, thinking)`

**`tool:start`** (line ~940):

- Current: `startTool(toolId, messageId, toolName, toolInput, contentOffset)`
- New: `builder.startTool(messageId, { id: toolId, toolName, toolInput, status: 'running', ... })`
- **`contentOffset` calculation eliminated** (lines ~187-198 `pendingChunkLengths` Map removed)

**`tool:end`** (line ~978):

- Current: `completeTool(toolId, output, success)`
- New: `builder.completeTool(toolId, output, success)`

**`agent:complete`** (line ~489):

- Current: flush RAF → persist → `setMessages(prev => markComplete(prev))`
- New: flush RAF → `builder.completeResponse(messageId, usage)` → persist via `turnToDto()`

**`conversation:loaded`** (line ~719):

- Current: Maps dto messages → ChatMessage[], calls restoreToolsForMessage()
- New: `dtoToTurns(messages)` → `builder.loadTurns(turns)` → `setTurns(builder.getTurns())`
- **`restoreToolsForMessage()` still called** for ToolStore permission/usage tracking

**`conversation:rewound`** (line ~884):

- Current: Truncate ChatMessage[] array
- New: `dtoToTurns(truncatedMessages)` → `builder.loadTurns(turns)`

### What gets deleted from message-handler:

- `pendingChunkLengths` Map (contentOffset tracking)
- `updateLastMessage()` helper
- `markMessageComplete()` helper
- Direct `setMessages()` calls for streaming

### What stays:

- RAF batching infrastructure (`rafBatch`)
- `conversationAddMessage()` persistence calls (using `turnToDto()`)
- File change tracking (edit/write tool detection for FileStore)
- Browser activity recording

---

## Phase 5: Adapt Rendering (ChatMessages + MessageItem)

**Goal:** ChatMessages renders turns instead of flat messages. Eliminates `toolsByMessageId` computation and `buildSegments()`.

### Modify: `apps/agent/src/components/chat/chat-messages.tsx`

**Props change:**

```typescript
// Before
readonly messages: ChatMessage[];

// After
readonly turns: ConversationTurn[];
```

**Virtualizer count:**
Each turn produces 1 or 2 virtual items (user message + optional response):

```typescript
const flatItems = useMemo(() => {
  const items: Array<{ type: 'user' | 'assistant'; turn: ConversationTurn }> = [];
  for (const turn of turns) {
    items.push({ type: 'user', turn });
    if (turn.response !== null) {
      items.push({ type: 'assistant', turn });
    }
  }
  return items;
}, [turns]);

// virtualizer count = flatItems.length
```

**Delete:**

- `useActiveTools()` / `useCompletedTools()` subscriptions (lines 294-295)
- `toolsByMessageId` useMemo (lines 301-337)
- `deduplicateAndSortTools()` import

**Keep:**

- `useRunningTool()` selector (for loading status message)
- All scroll/animation/virtualizer logic

### Modify: `apps/agent/src/components/chat/messages/MessageItem.tsx`

**Split into two components:**

**`UserMessageItem`** — renders user bubble + attachments

- Props: `{ userMessage: UserTurnMessage, animate?: boolean }`
- Simple, no tools

**`AssistantResponseItem`** — renders pre-built segments directly

- Props: `{ response: AssistantResponse, isLast: boolean, onRewind, onOpenFile, onOpenUrl, onFeedback }`
- Iterates `response.segments` directly (no `buildSegments()` call)
- Text segments → `<Streamdown>`
- Tool segments → `<ToolWidgetRenderer>`

### Modify: `apps/agent/src/components/chat/messages/message-utils.ts`

- **Delete** `buildSegments()` function
- **Simplify** `arePropsEqual()` → new memo comparisons for UserMessageItem and AssistantResponseItem
- **Delete** `_CHAT_MESSAGE_KEYS_CHECK` compile-time guard (replaced by turn-level types)

### Modify: `apps/agent/src/components/chat/messages/types.ts`

- Remove `ChatMessage` interface (replaced by ConversationTurn types)
- Remove `Segment` type (replaced by ResponseSegment)
- Update `MessageItemProps` → split into `UserMessageItemProps` + `AssistantResponseItemProps`

---

## Phase 6: Adapt Chat Actions (Send, Stop, Rewind)

**Goal:** Update `chat-actions.ts` to work with turns instead of flat messages.

**Modify:** `apps/agent/src/hooks/chat/handlers/chat-actions.ts`

**`handleSend`:**

- Current: Creates `ChatMessage` with role 'user', pushes to flat array
- New: Creates `UserTurnMessage`, calls `builder.startTurn(userMsg)`

**`handleRewind`:**

- Current: Walks backward through flat messages to find user message
- New: Direct lookup — turn.id IS the user message ID
- **Rewind behavior stays identical** — still calls `conversation:rewind` with session_id, message_id, user_message_id

**`handleStop`:**

- Current: Sets `isAgentRunning = false`, sends `agent:stop`
- New: Same + `builder.interruptResponse(messageId)`

---

## Phase 7: Cleanup & ToolStore Decoupling

**Goal:** Remove dead code and decouple ToolStore from rendering pipeline.

### Delete:

- `buildSegments()` from `message-utils.ts`
- `contentOffset` field from `ToolExecution` interface in `tool-store.ts`
- `pendingChunkLengths` tracking in `message-handler.ts`
- `displayedContent` field from any remaining types
- `_CHAT_MESSAGE_KEYS_CHECK` guard
- Old `ChatMessage` interface (if not already removed in Phase 5)
- `deduplicateAndSortTools()` usage from `chat-messages.tsx`
- `useActiveTools()` / `useCompletedTools()` imports from `chat-messages.tsx`

### Keep in ToolStore:

- `pendingPermissions` — permission approval UI
- `sessionUsage` / `addUsage()` — token tracking in status bar
- `inputMode` / `thinkingMode` / `model` — mode selectors
- `activeTools` / `completedTools` — for non-rendering consumers (e.g., message persistence, file change tracking)
- `startTool()` / `completeTool()` — still called from message-handler to maintain ToolStore state for above consumers

### Modify `tool-store.ts`:

- Remove `contentOffset` from `ToolExecution` interface
- Remove `contentOffset` parameter from `startTool()` action
- Update `restoreToolsForMessage()` — no contentOffset in restored tools

---

## Files Modified (Summary)

| File                                                     | Phase | Change                                               |
| -------------------------------------------------------- | ----- | ---------------------------------------------------- |
| `types/conversation/turn.ts`                             | 0     | **New** — Turn types                                 |
| `types/conversation/index.ts`                            | 0     | **New** — Barrel                                     |
| `lib/conversation/turn-builder.ts`                       | 1     | **New** — TurnBuilder class                          |
| `lib/conversation/__tests__/turn-builder.test.ts`        | 1     | **New** — Tests                                      |
| `lib/conversation/persistence-adapter.ts`                | 2     | **New** — DTO ↔ Turn mapping                         |
| `lib/conversation/__tests__/persistence-adapter.test.ts` | 2     | **New** — Tests                                      |
| `hooks/chat/state/message-state.ts`                      | 3     | **Modify** — ChatMessage[] → ConversationTurn[]      |
| `hooks/chat/use-chat-messages.ts`                        | 3     | **Modify** — Return turns, use builder               |
| `hooks/chat/handlers/message-handler.ts`                 | 4     | **Modify** — Use TurnBuilder for all events          |
| `components/chat/chat-messages.tsx`                      | 5     | **Modify** — Render turns, remove tool subscriptions |
| `components/chat/messages/MessageItem.tsx`               | 5     | **Modify** — Split into User + Assistant items       |
| `components/chat/messages/message-utils.ts`              | 5     | **Modify** — Delete buildSegments, simplify memo     |
| `components/chat/messages/types.ts`                      | 5     | **Modify** — Replace ChatMessage with turn props     |
| `hooks/chat/handlers/chat-actions.ts`                    | 6     | **Modify** — Turn-based send/rewind/stop             |
| `stores/agent/tool-store.ts`                             | 7     | **Modify** — Remove contentOffset                    |
| `hooks/agent/handlers/conversation-handlers.ts`          | 4     | **Modify** — Use dtoToTurns for loaded/rewound       |

All paths relative to `apps/agent/src/`.

---

## Verification

### After Phase 1 (TurnBuilder):

```bash
bun run test apps/agent/src/lib/conversation/__tests__/turn-builder.test.ts
```

### After Phase 2 (Persistence):

```bash
bun run test apps/agent/src/lib/conversation/__tests__/persistence-adapter.test.ts
```

### After Phase 4 (Message Handler):

```bash
bun run typecheck   # Ensure no type errors
bun run lint        # Ensure no lint violations
bunx tauri dev      # Manual test: send a message, verify streaming + tools render
```

### After Phase 5 (Rendering):

```bash
bunx tauri dev      # Manual test:
# 1. Send message → verify user bubble + streaming response + tool widgets
# 2. Send message with @file attachment → verify attachment renders
# 3. Long conversation → verify virtualizer scrolling works
# 4. Expand/collapse tool widget → verify scroll anchoring
# 5. Switch conversations → verify turns load correctly from persistence
```

### After Phase 6 (Rewind):

```bash
bunx tauri dev      # Manual test:
# 1. Send 3 messages → click rewind on message 2 → verify fork works
# 2. After rewind → send new message → verify new session works
# 3. Switch back to original conversation → verify it's intact
```

### Full suite:

```bash
bun run check          # typecheck + lint + tests
cargo test             # Rust tests (should be unaffected)
cd agent-bridge && bun test  # Integration tests
```
