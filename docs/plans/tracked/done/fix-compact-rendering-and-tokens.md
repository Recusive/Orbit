# Fix OpenCode `/compact` Rendering & Token Count

## Context

The `/compact` command was implemented for the OpenCode backend by Codex, but two bugs remain in the rendering and token calculation layers. The store infrastructure (`activeCompactions`, settlement, timeout) works correctly — these are purely frontend display issues.

**Root cause summary:**

- The Claude backend sends `/compact` as a REAL user message that persists in JSONL. After compaction, `MessageItem.tsx` sees `displayedContent === '/compact'` on that persistent user message and renders CompactIndicator permanently.
- The OpenCode backend intercepts `/compact` before `send()` — it never becomes a real message. A synthetic user message exists only while `activeCompaction` is non-null. Once `settleCompaction()` fires, the synthetic message vanishes. The backend's `compaction` part (on the real user message) is converted to raw markdown `'---\n*Context compacted*'` by `adaptParts`, rendering as ugly text in the assistant bubble.
- Token calculation sums ALL messages' tokens cumulatively. The reference app (`session-context-metrics.ts`) uses the LAST assistant message's tokens as a context window snapshot.

---

## Fix 1: CompactIndicator renders permanently after compaction

**File:** `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`

### 1a. Add `hasCompaction` flag to `AdaptedOcParts` (line ~35)

```typescript
interface AdaptedOcParts {
  content: string;
  thinkingBlocks: ThinkingBlock[];
  tools: ToolExecution[];
  interruptReason?: string;
  isInterrupted: boolean;
  isThinkingActive: boolean;
  hasCompaction: boolean; // ← ADD
}
```

### 1b. Change `case 'compaction'` in `adaptParts` (line 291)

Stop producing raw markdown. Set the flag instead:

```typescript
// Old:
case 'compaction':
  content = appendBlock(content, '---\n*Context compacted*');
  break;

// New:
case 'compaction':
  hasCompaction = true;
  break;
```

Add `let hasCompaction = false;` at the top of `adaptParts` (near line 226 alongside the other `let` declarations).

Include `hasCompaction` in the return object (line ~354):

```typescript
return {
  content,
  thinkingBlocks,
  tools,
  ...(interruptReason !== undefined ? { interruptReason } : {}),
  isInterrupted,
  isThinkingActive,
  hasCompaction,
};
```

### 1c. Add `hasCompaction` to `AdaptedOcMessage` (line ~44)

```typescript
interface AdaptedOcMessage {
  chat: ChatMessage;
  tools: ToolExecution[];
  hasCompaction: boolean; // ← ADD
}
```

### 1d. Propagate in `adaptOcMessage` (line ~504)

```typescript
return {
  chat: { ... },
  tools: adapted.tools,
  hasCompaction: adapted.hasCompaction,  // ← ADD
};
```

### 1e. Update `chatMessages` useMemo (line ~643)

After building entries from adapted, overwrite content to `/compact` for any user message that had a compaction part.

```typescript
const chatMessages = useMemo(() => {
  const entries = adapted.map((entry) => {
    const chat = entry.chat;
    // Backend user messages with a compaction part render as CompactIndicator
    if (entry.hasCompaction && chat.role === 'user') {
      return { ...chat, content: '/compact', displayedContent: '/compact' };
    }
    return chat;
  });
  // Synthetic message for live compaction (pending/timed_out)
  if (activeCompaction !== null) {
    entries.push({
      id: activeCompaction.messageId,
      role: 'user' as const,
      content: '/compact',
      displayedContent: '/compact',
    });
  }
  return entries;
}, [activeCompaction, adapted]);
```

**Why this works for all states:**

- **During compaction (live):** `activeCompaction !== null` → synthetic message appended → CompactIndicator shows "Context compacting"
- **After settlement + `loadMessages()`:** Backend returns real user message with `compaction` part → `hasCompaction = true` → content overwritten to `/compact` → CompactIndicator shows "Context compacted" (no matching entry in `activeCompactions` → `compactionStatus === null` → done state)
- **Session reload:** Same as after settlement — backend data always has the compaction part
- **Brief overlap during transition:** React 19 batches state updates from `loadMessages()` (OcMessageStore) and `settleCompaction()` (ChatStore) in the same `.then()` microtask into a single render. Even if both synthetic and persisted indicators briefly coexist, they render identically ("Context compacted" divider) and the overlap is imperceptible.

### 1f. Settle AFTER loadMessages to prevent flash

**File:** `apps/agent/src/services/opencode/oc-event-coordinator.ts`

The current `session.compacted` handler settles compaction BEFORE reloading messages. This causes a ~200ms flash where the synthetic CompactIndicator disappears (settlement removes it) but the backend's real compaction user message hasn't loaded yet (async `loadMessages()`). Fix: settle AFTER `loadMessages()` completes. React 19 batches both state updates (message store + ChatStore) from the `.then()` microtask into a single render, so the transition is seamless.

```typescript
// Old:
case 'session.compacted':
  logger.info('Session compacted, reloading messages', {
    sessionId: payload.properties.sessionID,
  });
  useChatStore.getState().settleCompaction(payload.properties.sessionID);
  void ocSessionService.loadMessages(payload.properties.sessionID).catch((error: unknown) => {
    logger.error('Failed to reload compacted OpenCode session', error);
  });
  break;

// New:
case 'session.compacted':
  logger.info('Session compacted, reloading messages', {
    sessionId: payload.properties.sessionID,
  });
  void ocSessionService
    .loadMessages(payload.properties.sessionID)
    .then(() => {
      useChatStore.getState().settleCompaction(payload.properties.sessionID);
    })
    .catch((error: unknown) => {
      logger.error('Failed to reload compacted OpenCode session', error);
      // Still settle on failure — don't leave a stuck indicator
      useChatStore.getState().settleCompaction(payload.properties.sessionID);
    });
  break;
```

**Transition sequence (no flash):**

1. `session.compacted` fires → `loadMessages()` starts
2. Synthetic message still showing ("Context compacting") — `activeCompaction !== null`
3. `loadMessages()` resolves → `.then()` runs → `settleCompaction()` fires
4. React 19 batches both state updates (message store from loadMessages + ChatStore from settleCompaction) into a single render → synthetic removed, persisted compaction message appears → seamless transition

---

## Fix 2: Token count uses last assistant message (context window snapshot)

### 2a. Rewrite `buildOcSessionUsage`

**File:** `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts` (line ~364)

The current implementation sums ALL messages' tokens cumulatively. The reference app (`Agent-backend/packages/app/src/components/session/session-context-metrics.ts:41-78`) uses the LAST assistant message's tokens as a context window snapshot — because each turn's `tokens.input` reflects what the model actually received. After compaction, the next turn's `tokens.input` drops dramatically.

```typescript
export function buildOcSessionUsage(messages: OcRenderedMessage[]): UsageData {
  // Use the last assistant message's token breakdown as a context window snapshot.
  // Each turn's tokens.input reflects what the model actually received — after
  // compaction, this value drops because old messages were replaced with a summary.
  // Matches the reference app: session-context-metrics.ts:lastAssistantWithTokens()
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = messages[i];
    if (entry === undefined || entry.message.role !== 'assistant') {
      continue;
    }
    const tokens = entry.message.tokens;
    const total =
      tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
    if (total <= 0) {
      continue;
    }
    return {
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheReadInputTokens: tokens.cache.read,
      cacheCreationInputTokens: tokens.cache.write,
      // Cost is still cumulative (lifetime spend, not current context)
      totalCostUsd: messages.reduce(
        (sum, m) => sum + (m.message.role === 'assistant' ? m.message.cost : 0),
        0
      ),
    };
  }

  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    totalCostUsd: 0,
  };
}
```

### 2b. Add unit tests for `buildOcSessionUsage`

**File:** `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter-compact.test.ts`

```
describe('buildOcSessionUsage')
  ✓ multiple assistant messages → returns last one's tokens
  ✓ last assistant has zero tokens, earlier one has tokens → returns earlier one
  ✓ assistant with only reasoning tokens is not skipped (reasoning included in total)
  ✓ no assistant messages → returns zeroes
  ✓ cost is still cumulative across all assistants (not snapshot)
  ✓ user messages are skipped
```

---

## Files Modified

| File                                                                                   | Changes                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`                                     | `AdaptedOcParts` + `AdaptedOcMessage`: add `hasCompaction`; `adaptParts`: replace markdown with flag; `adaptOcMessage`: propagate flag; `chatMessages` useMemo: overwrite compaction user messages; `buildOcSessionUsage`: rewrite to last-assistant-snapshot |
| `apps/agent/src/services/opencode/oc-event-coordinator.ts`                             | `session.compacted`: settle AFTER `loadMessages()` completes                                                                                                                                                                                                  |
| `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter-compact.test.ts`         | Add `buildOcSessionUsage` unit tests                                                                                                                                                                                                                          |
| `apps/agent/src/__tests__/unit/services/opencode/oc-event-coordinator-compact.test.ts` | Line 68: reverse ordering assertion (settle-after-load, not before). Line 170: make async to flush `.then()` microtask                                                                                                                                        |
| `apps/agent/src/__tests__/integration/services/opencode/oc-compact-flow.test.ts`       | Update settlement assertions to async                                                                                                                                                                                                                         |

## Files NOT Modified

- `compact-indicator.tsx` — works correctly, renders "done" when `compactionStatus === null`
- `MessageItem.tsx` — `/compact` detection logic already correct
- `chat-store.ts` — store infrastructure works correctly
- `InputControls.tsx` / `input/types.ts` — pre-existing issue (ignores cache/reasoning tokens in `usedTokens`); follow-up task, not this plan's scope

---

## Verification

1. `bunx tauri dev` with OpenCode backend
2. Open a conversation with several messages and tool calls
3. Type `/compact` → should see CompactIndicator with "Context compacting" (animated dots)
4. Wait for compaction to complete → CompactIndicator should show "Context compacted" (permanent divider with dashed lines + Minimize2 icon) — NOT raw markdown
5. No flash between "Context compacting" and "Context compacted" — seamless transition
6. No `---\n*Context compacted*` text should appear in any message bubble
7. Token count in the context bar should reflect the post-compaction value (significantly lower than pre-compaction)
8. Switch away from the session and back → CompactIndicator should still show permanently
9. Verify Claude backend `/compact` still works unchanged
10. Run `bun run check` to verify types and lint
11. Run `bun run test` to verify all tests pass
