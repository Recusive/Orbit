# Fix: Thinking Block Grouping + Session Switch Content Loss + Thinking Persistence

> **Status**: ✅ APPROVED — IMPLEMENTATION READY (audits 1-5, 2026-03-06)
> **Audit 1**: 4 critical, 5 recommended, 8 edge cases — all addressed
> **Audit 2**: 1 critical (tool ordinals in transport stack) — addressed
> **Audit 3**: 1 critical (tool ordinal shifting in merge) — addressed
> **Audit 4**: 3 edge cases — 1 fixed (prefix 64→128), 2 accepted as known limitations
> **Audit 5**: 1 critical (ranked fingerprint matching for mixed-version sidecars) — addressed

## Context

Three related bugs in the chat UI:

1. **Thinking blocks group at the top** instead of interleaving with tool widgets. During streaming, the pattern should be `thinking → tool → text → thinking → tool → text` (like Claude Code CLI), but all thinking blocks render above all tools/content because `MessageItem.tsx` renders them as a separate group before the segments array.

2. **Content loss on session switch** — switching away from a conversation and back causes one large assistant message to split into 4+ smaller ones separated by "Tool loaded." user messages. These are SDK protocol messages (containing `tool_result` blocks alongside text) that the Rust parser's `is_tool_result_only()` check fails to filter because it requires ALL blocks to be `tool_result`, not ANY.

3. **Thinking phases lost on reload** — `absorb_assistant_message` (lib.rs:1575) only keeps the FIRST assistant's `thinking` content. Multi-phase thinking from merged JSONL lines is dropped on reload — user sees one thinking block instead of the original three. Fixing this alongside Bug 1 ensures interleaved thinking survives the full lifecycle (streaming → persist → reload).

---

## Bug 1: Interleave Thinking Blocks with Tool/Content Segments

### Files to Modify

| File                                                       | Change                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/agent/src/components/chat/messages/types.ts`         | Add `contentOffset` to `ThinkingBlock`, add `'thinking'` variant to `Segment` |
| `apps/agent/src/components/chat/messages/message-utils.ts` | Replace `buildSegments` internals with unified boundary sweep                 |
| `apps/agent/src/components/chat/messages/MessageItem.tsx`  | Use unified segments, remove separate thinking rendering                      |
| `apps/agent/src/components/chat/messages/index.ts`         | Export `buildUnifiedSegments` from barrel                                     |
| `apps/agent/src/services/chat/chat-message-service.ts`     | Record `contentOffset` on ThinkingBlock when thinking ends                    |

### Step 1: Extend `ThinkingBlock` type (`types.ts:8-11`)

Add `contentOffset` and `ordinal` — the content length when the thinking phase ended, and a stable ordering key for deterministic cross-type ordering at same offsets:

```typescript
export interface ThinkingBlock {
  content: string;
  durationMs: number;
  contentOffset?: number | undefined;
  /** Stable ordering key for deterministic same-offset ordering with tools.
   *  AUDIT FIX (Critical #3): offsets alone cannot distinguish ordering when
   *  a thinking phase and tool share the same content boundary. */
  ordinal?: number | undefined;
}
```

### Step 2: Add `'thinking'` Segment variant (`types.ts:100-102`)

```typescript
export type Segment =
  | { type: 'content'; text: string; key: string }
  | { type: 'tool'; tool: ToolExecution; key: string }
  | { type: 'thinking'; block: ThinkingBlock; index: number; isStreaming: boolean; key: string };
```

### Step 3: Record `contentOffset` when thinking ends (`chat-message-service.ts`)

Three places set `isThinkingActive: false` — each must also set `contentOffset` on the last thinking block.

**IMPORTANT**: The offset must be captured from the Zustand snapshot BEFORE the `updateMessage` call, not inside it. Zustand + Immer produces new references on write, so reading `lastMsg.content.length` from the snapshot before calling `updateMessage` is safe and gives the correct pre-append value.

**(a) `handleToolStart` (~line 1319-1338):** Use `msg.content.length + pendingChunkLength` as the offset. This matches the fallback used for tool `contentOffset` at line 1307-1310 (same scale).

**(b) Chunk batcher fast path (~line 1525-1550):** Capture `lastMsg.content.length` BEFORE calling `updateMessage`:

```typescript
// BEFORE the updateMessage call — lastMsg is from the immutable Zustand snapshot
const thinkingContentOffset = lastMsg.content.length;

// Then inside the block update:
updatedBlocks[updatedBlocks.length - 1] = {
  ...lastBlock,
  durationMs: Date.now() - startTime,
  contentOffset: thinkingContentOffset,
};
```

**(c) `handleAgentComplete` (~line 538-553):** Use `lastMsg.content.length`.

### Step 4: Create `buildUnifiedSegments` (`message-utils.ts`)

**Critical design**: This function must NOT layer on top of the existing `buildSegments` tool-only sweep. `buildSegments` only creates content boundaries at tool offsets, so a text-only multi-phase turn (`thinking1 + text1, thinking2 + text2` with no tools) would produce one content segment — making it impossible to insert thinking blocks between text chunks.

Instead, `buildUnifiedSegments` uses a single boundary sweep over both tool AND thinking offsets, slicing content at every marker:

```typescript
type Marker =
  | { kind: 'thinking'; offset: number; block: ThinkingBlock; index: number; ordinal: number }
  | { kind: 'tool'; offset: number; tool: ToolExecution; ordinal: number };

export function buildUnifiedSegments(
  content: string,
  tools: ToolExecution[],
  thinkingBlocks: ThinkingBlock[] | undefined,
  isThinkingActive: boolean | undefined,
  isStreaming: boolean | undefined
): Segment[] {
  const markers: Marker[] = [];
  const thinkingArr = thinkingBlocks ?? [];

  // AUDIT FIX (Critical #1): Distinguish between legacy no-offset blocks
  // and the ACTIVE streaming block (which also lacks contentOffset but should
  // render at the END, not the top).
  const activeThinkingIndex =
    isStreaming === true && isThinkingActive === true ? thinkingArr.length - 1 : -1;

  const legacyBlocks: Array<{ block: ThinkingBlock; index: number }> = [];
  let activeTrailingBlock: { block: ThinkingBlock; index: number } | undefined;

  // AUDIT FIX (Critical #3 + Audit 2 Critical #1): Use PERSISTED ordinals for
  // deterministic cross-type ordering at same offsets. Both ToolExecution and
  // ThinkingBlock now carry persisted ordinals from the Rust parser. Fall back to
  // a synthetic counter only for legacy data where ordinals are absent.
  //
  // AUDIT FIX (Audit 3, Recommended #1): Initialize synthetic fallback counter
  // ABOVE the max existing ordinal to avoid collisions with persisted values
  // in partially-migrated data.
  const existingOrdinals = [
    ...tools.map((t) => t.ordinal).filter((n): n is number => n !== undefined),
    ...thinkingArr.map((b) => b.ordinal).filter((n): n is number => n !== undefined),
  ];
  let ordinalCounter = existingOrdinals.length > 0 ? Math.max(...existingOrdinals) + 1 : 0;

  for (const tool of tools) {
    markers.push({
      kind: 'tool',
      offset: tool.contentOffset ?? 0,
      tool,
      ordinal: tool.ordinal ?? ordinalCounter++,
    });
  }
  for (const [index, block] of thinkingArr.entries()) {
    if (block.contentOffset !== undefined) {
      markers.push({
        kind: 'thinking',
        offset: block.contentOffset,
        block,
        index,
        ordinal: block.ordinal ?? ordinalCounter++,
      });
    } else if (index === activeThinkingIndex) {
      // Currently streaming — no offset yet. Will be appended at the end.
      activeTrailingBlock = { block, index };
    } else {
      // Legacy block from pre-phase-persistence data. Prepend at top.
      legacyBlocks.push({ block, index });
    }
  }

  // Sort by offset, then by ordinal for deterministic same-offset ordering.
  // This replaces the previous hard-coded "thinking before tool" tie-break.
  markers.sort((a, b) => {
    if (a.offset !== b.offset) return a.offset - b.offset;
    return a.ordinal - b.ordinal;
  });

  const segments: Segment[] = [];
  let cursor = 0;

  // Prepend ONLY legacy blocks (pre-phase-persistence data without offsets).
  // These are NOT the active streaming block — that goes at the end.
  for (const { block, index } of legacyBlocks) {
    segments.push({
      type: 'thinking',
      block,
      index,
      isStreaming: false,
      key: `thinking-${String(index)}`,
    });
  }

  for (const marker of markers) {
    // Emit content between cursor and this marker
    if (marker.offset > cursor) {
      const text = content.slice(cursor, marker.offset);
      if (text.trim()) {
        segments.push({ type: 'content', text, key: `content-${String(cursor)}` });
      }
      cursor = marker.offset;
    }

    if (marker.kind === 'thinking') {
      segments.push({
        type: 'thinking',
        block: marker.block,
        index: marker.index,
        isStreaming: false, // Offset-bearing blocks are finalized, never streaming
        key: `thinking-${String(marker.index)}`,
      });
    } else {
      segments.push({ type: 'tool', tool: marker.tool, key: marker.tool.id });
    }
  }

  // Trailing content after last marker
  if (cursor < content.length) {
    const text = content.slice(cursor);
    if (text.trim()) {
      segments.push({ type: 'content', text, key: `content-${String(cursor)}` });
    }
  }

  // AUDIT FIX (Critical #1): Append the active streaming thinking block at
  // the END — this is the currently in-flight phase that hasn't been finalized
  // with a contentOffset yet. It must render AFTER all prior content/tools,
  // not at the top with legacy blocks.
  if (activeTrailingBlock !== undefined) {
    segments.push({
      type: 'thinking',
      block: activeTrailingBlock.block,
      index: activeTrailingBlock.index,
      isStreaming: true,
      key: `thinking-${String(activeTrailingBlock.index)}`,
    });
  }

  // Edge case: no markers, no legacy blocks, no active block — just emit all content
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: 'content', text: content, key: 'content-0' });
  }

  return segments;
}
```

**`buildSegments` deprecation** (Audit Recommended #1): Make `buildSegments` a thin wrapper over `buildUnifiedSegments` (passing `undefined` for thinking params) rather than maintaining two independent implementations. Add a `@deprecated` JSDoc comment directing callers to `buildUnifiedSegments`. This prevents behavioral drift between the two functions.

### Step 5: Update `MessageItem.tsx`

**(a)** Memoize `effectiveThinkingBlocks` separately to stabilize the reference. Without this, the fallback `[{ content, durationMs }]` creates a new array every render, defeating the outer `useMemo` and causing recomputation on every 50ms streaming batch:

```typescript
const effectiveThinkingBlocks = useMemo(
  () =>
    message.thinkingBlocks ??
    (message.thinking
      ? [{ content: message.thinking, durationMs: message.thinkingDurationMs ?? 0 }]
      : undefined),
  [message.thinkingBlocks, message.thinking, message.thinkingDurationMs]
);

const segments = useMemo(
  () =>
    message.role === 'assistant'
      ? buildUnifiedSegments(
          animatedContent,
          tools,
          effectiveThinkingBlocks,
          message.isThinkingActive,
          message.isStreaming
        )
      : [],
  [
    message.role,
    animatedContent,
    tools,
    effectiveThinkingBlocks,
    message.isThinkingActive,
    message.isStreaming,
  ]
);
```

**(b)** Remove separate thinking block rendering (lines 350-370).

**(c)** Add thinking case to the `segments.map()` renderer:

```tsx
if (segment.type === 'thinking') {
  return (
    <ThinkingBox
      key={segment.key}
      thinking={segment.block.content}
      thinkingDurationMs={segment.block.durationMs}
      isStreaming={segment.isStreaming}
    />
  );
}
```

### Step 6: Update barrel export (`index.ts`)

```typescript
export {
  arePropsEqual,
  buildSegments,
  buildUnifiedSegments,
  getActiveChain,
  hasVisibleContent,
} from './message-utils';
```

### Step 7: Add frontend unit tests for `buildUnifiedSegments`

Pure function — straightforward to test:

See expanded test cases in the **Verification** section below (includes audit edge cases).

---

## Bug 2: Filter Mixed tool_result User Messages

### Files to Modify

| File                                     | Change                                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| `crates/common/conversations/src/lib.rs` | Add `has_any_tool_result()`, update `process_user_line` |

### Step 1: Add `has_any_tool_result` method (`lib.rs`, after line 255)

```rust
/// Check if this content contains ANY tool_result block (SDK protocol message).
#[inline]
fn has_any_tool_result(&self) -> bool {
    match self {
        Self::Text(_) => false,
        Self::Blocks(blocks) => blocks.iter().any(|b| {
            b.get("type").and_then(serde_json::Value::as_str) == Some("tool_result")
        }),
    }
}
```

Consistent with `extract_user_text_from_line` (line 1480-1482) which already uses `.any()`.

**Why `has_any_tool_result` is safe**: `process_user_line` calls `extract_tool_results` before returning early. `extract_tool_results` (line 1625) iterates only `tool_result` blocks and skips text blocks. The text blocks (e.g., `"Tool loaded."`) are SDK protocol artifacts, not real user text.

### Step 2: Update `process_user_line` (line 1300)

Change from `is_tool_result_only()` to `has_any_tool_result()`.

### Step 3: Remove `is_tool_result_only` (line 245-255)

No longer called — remove to avoid confusion.

### Step 4: Add Rust tests

- Unit test for `has_any_tool_result()`: pure text, pure tool_result, mixed, text-only blocks, empty
- Integration test: JSONL with mixed `[tool_result, text("Tool loaded.")]` user messages — verify they don't split the assistant merge, and tool outputs are still backfilled
- Regression test documenting that mixed `[tool_result, text]` user lines are always SDK artifacts, not real user text
- **Edge case test** (Audit Edge Case #6): JSONL with `[tool_result, text("real user text")]` — verify the text block is discarded. Pin down the invariant that mixed arrays are always SDK protocol artifacts, since `has_any_tool_result()` will now discard ALL blocks in such arrays via `extract_tool_results`.

> **AUDIT (Recommended #4) — Agent-bridge parser alignment**: The agent-bridge's rewind/session
> slicer in `agent-bridge/src/agent/session/session-manager.ts:585-599` still only checks the FIRST
> block for `tool_result`. This divergence from the Rust parser's `.any()` check may cause the
> agent-bridge to treat mixed `[tool_result, text]` arrays differently during session slicing.
> **Decision**: Accept the divergence for now — the agent-bridge operates on live SDK data where
> mixed arrays are rare, and its session-slicing logic has different requirements from reload parsing.
> Document this as a known divergence point. If bugs surface in rewind behavior related to tool_result
> filtering, align both parsers.

---

## Bug 3: Preserve Multi-Phase Thinking on Reload

### Problem

When the JSONL has three consecutive assistant lines (each with a thinking phase), `merge_consecutive_assistants` calls `absorb_assistant_message` which does:

```rust
if target.thinking.is_none() {
    target.thinking = incoming.thinking;
}
```

Only Phase 1 survives. Phases 2 and 3 are dropped.

### Full Transport Stack

The new `thinking_phases` field must flow through the entire stack. Missing ANY hop causes silent data loss:

```
Rust Message (lib.rs)
  → Rust MessageDto (conversations.rs)
    → TS ConversationMessageDto (conversations.ts)  ← Tauri invoke returns this
      → conversation-handlers.ts .map()             ← MUST include field (Step 9a) or it's dropped here
        → Zod PersistedMessageSchema (protocol.ts)  ← MUST accept field (Step 7) or Zod strips/rejects it
          → mapPersistedMessage (chat-message-service.ts) ← Converts to ChatMessage with ThinkingBlock[]
```

### Files to Modify

| File                                                           | Change                                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/common/conversations/src/lib.rs`                       | Add `ThinkingPhase` struct, `thinking_phases` to `Message`, add `ordinal` to `ToolUse`, update `extract_assistant_content` (shared ordinal counter) and `absorb_assistant_message` |
| `src-tauri/src/commands/agent/conversations.rs`                | Add `ThinkingPhaseDto` with `ordinal`, add `ordinal` to `ToolUseDto`, `thinking_phases` to `MessageDto`, `From` impls                                                              |
| `apps/agent/src/lib/api/conversations.ts`                      | Add `ThinkingPhaseDto` with `ordinal`, add `ordinal` to `ToolUseDto`, `thinkingPhases` to `ConversationMessageDto`                                                                 |
| `apps/agent/src/types/protocol/protocol.ts`                    | Add `ThinkingPhaseSchema`, add `ordinal` to `PersistedToolUseSchema` and rewind tool schema, update `PersistedMessageSchema` and `ConversationRewoundSchema`                       |
| `apps/agent/src/stores/agent/tool-store.ts`                    | Add `ordinal` to `ToolExecution` interface and `restoreToolsForMessage`                                                                                                            |
| `apps/agent/src/services/chat/chat-message-service.ts`         | Centralized `mapPersistedMessage()` helper, update all 3 hydration paths, pass `ordinal` in `restoreToolsForMessage` calls                                                         |
| `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts` | Pass `thinkingPhases` in `conversation:loaded` payload (session switch) AND both rewind response paths (disk + fallback)                                                           |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`           | Include thinking data + tool ordinals in rewind request `current_messages`, update `handlePermissionDeny` persistence                                                              |

> **AUDIT FIX (Audit 2, Critical #1)**: The previous version of this table included a contradictory
> row: "Update `add_message` sidecar to optionally persist per-phase metadata". Steps 12-13 explicitly
> decided NOT to store phases in the sidecar. That row has been removed.
>
> **AUDIT FIX (Audit 2, Critical #1)**: Added `ordinal` to `ToolUse` across the full transport stack
> (Rust, DTO, TS DTO, Zod, ToolStore, rewind payloads). Without this, same-offset cross-type ordering
> between tools and thinking phases is not deterministic after reload/rewind.

### Step 1: Add `ThinkingPhase` struct to Rust (`lib.rs`, after `ToolUse` ~line 107)

Mirrors `ToolUse` — content with an offset for interleaving:

```rust
/// A single thinking phase within an assistant turn.
/// Parallels `ToolUse` — content with an offset for interleaving.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingPhase {
    /// Thinking text content
    pub content: String,
    /// UTF-16 content offset at the point this thinking phase appeared.
    /// Same scale as `ToolUse::content_offset`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_offset: Option<u32>,
    /// AUDIT FIX (Critical #3): Stable ordering key for deterministic cross-type
    /// ordering when multiple markers share the same content offset. Assigned
    /// sequentially in `extract_assistant_content` as blocks are encountered
    /// (interleaved with tool ordinals). `ToolUse` also carries this field
    /// (see Step 1b below) — both share the same ordinal namespace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<u32>,
}
```

### Step 1b: Add `ordinal` to `ToolUse` (`lib.rs:89-105`)

> **AUDIT FIX (Audit 2, Critical #1)**: `ordinal` must exist on BOTH `ThinkingPhase` AND `ToolUse`
> for deterministic cross-type ordering. Without this, tool ordinals are synthesized from frontend
> array order after reload/rewind, which is not equivalent to the original source order.

Add `ordinal` field to the existing `ToolUse` struct:

```rust
pub struct ToolUse {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(default = "default_true")]
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_offset: Option<u32>,
    /// Stable ordering key — shared namespace with ThinkingPhase ordinals.
    /// Assigned in `extract_assistant_content` as blocks are encountered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<u32>,
}
```

This field is assigned by the shared `ordinal_counter` in `extract_assistant_content` (Step 3), shifted in `absorb_assistant_message` (Step 4), and flows through the full transport stack (Steps 5-11).

**Full transport chain for tool ordinals:**

```
Rust ToolUse.ordinal (lib.rs — parser assigns from shared counter)
  → Rust ToolUseDto.ordinal (conversations.rs — Step 5b)
    → TS ToolUseDto.ordinal (conversations.ts — Step 6b)
      → Zod PersistedToolUseSchema (protocol.ts — Step 7b)
        → ToolStore.restoreToolsForMessage (tool-store.ts — Step 7c)
          → ToolExecution.ordinal (tool-store.ts — Step 7c)
            → buildUnifiedSegments reads tool.ordinal (message-utils.ts — Step 4)
Rewind path:
  → chat-actions.ts handleRewind includes ordinal (Step 11)
    → RewindConversationSchema toolUses accepts ordinal (Step 7b)
      → conversation-handlers.ts passes ordinal through (Step 9)
```

### Step 2: Add `thinking_phases` to `Message` struct (`lib.rs`, after `thinking_duration_ms`)

```rust
#[serde(default, skip_serializing_if = "Vec::is_empty")]
pub thinking_phases: Vec<ThinkingPhase>,
```

Keep flat `thinking: Option<String>` for backward compat (sidecar fingerprint matching, single-phase fallback).

### Step 3: Update `extract_assistant_content` (`lib.rs` ~line 1691)

Return type becomes `(String, Option<String>, Vec<ThinkingPhase>, Vec<ToolUse>)`.

Record thinking phases with their content offset and ordinal. Ordinals are assigned sequentially across ALL block types (thinking + tool_use) in encounter order, enabling deterministic cross-type ordering at same offsets (**Audit Critical #3**):

```rust
// Counter shared across ALL block types for deterministic ordering
let mut ordinal_counter: u32 = 0;

// ... inside the block iteration loop:

Some("thinking") => {
    if let Some(text) = block.get("thinking").and_then(Value::as_str) {
        thinking_phases.push(ThinkingPhase {
            content: text.to_owned(),
            content_offset: Some(text_utf16_len),
            ordinal: Some(ordinal_counter),
        });
        ordinal_counter += 1;
        // AUDIT FIX (Critical #2): Concatenate flat field using the SAME
        // separator ("\n\n") that the frontend uses in chat-message-service.ts.
        // The sidecar `thinking_prefix` fingerprint matching (lib.rs:650-675)
        // relies on byte-for-byte compatibility between Rust's flat `thinking`
        // string and the frontend's accumulated `thinking` field.
        match &mut thinking {
            Some(existing) => {
                existing.push_str("\n\n");
                existing.push_str(text);
            }
            None => {
                thinking = Some(text.to_owned());
            }
        }
    }
}

Some("tool_use") => {
    // ... existing tool_use extraction ...
    // Assign ordinal from the shared counter
    tool.ordinal = Some(ordinal_counter);
    ordinal_counter += 1;
}
```

**AUDIT FIX (Critical #2) — Sidecar fingerprint contract**: The flat `thinking` string is concatenated with `"\n\n"` separators to match the frontend's accumulation in `chat-message-service.ts`. The frontend MUST also use `"\n\n"` when a new thinking block begins (see Step 3 addendum below). If these diverge, `thinking_prefix` matching in `lib.rs:650-675` will fail and `thinking_duration_ms` will be silently dropped on reload when bridge message IDs differ from SDK UUIDs.

**Step 3 addendum — Frontend thinking accumulation alignment**: In `chat-message-service.ts`, where a new thinking block starts (the `needsNewBlock` path in the chunk batcher), the thinking accumulation must use `"\n\n"` as separator to stay compatible:

```typescript
// In chunk batcher, when starting a new thinking block:
const updatedThinking =
  (lastMsg.thinking ?? '').length > 0
    ? `${lastMsg.thinking}\n\n${accumulatedThinking}`
    : accumulatedThinking;
```

Update all call sites to destructure the new 4-tuple.

### Step 4: Update `absorb_assistant_message` (`lib.rs` ~line 1559)

Merge thinking phases the same way tools are merged — shift offsets and append:

```rust
// Replace the old thinking-first-wins logic with concatenation.
// AUDIT FIX (Critical #2): Uses "\n\n" separator — same as extract_assistant_content
// and the frontend accumulation, preserving sidecar fingerprint compatibility.
match (&mut target.thinking, incoming.thinking) {
    (Some(existing), Some(ref incoming_text)) => {
        existing.push_str("\n\n");
        existing.push_str(incoming_text);
    }
    (None, some @ Some(_)) => {
        target.thinking = some;
    }
    _ => {}
}

// AUDIT FIX (Critical #3 + Audit 3 Critical #1): Compute ordinal shift from
// the SHARED namespace across BOTH thinking phases AND tool uses in the target.
// Both incoming thinking phases AND incoming tool uses must be shifted.
let ordinal_shift = target.thinking_phases.iter()
    .filter_map(|p| p.ordinal)
    .chain(target.tool_uses.iter().filter_map(|t| t.ordinal))
    .max()
    .map(|m| m + 1)
    .unwrap_or(0);

// Shift and merge incoming TOOL USES — ordinals + content offsets
// AUDIT FIX (Audit 3, Critical #1): The existing tool merge already shifts
// content_offset. We now ALSO shift ordinal using the same shared shift value.
for mut tool in incoming.tool_uses {
    tool.content_offset = Some(tool.content_offset.unwrap_or(0).saturating_add(shift));
    tool.ordinal = tool.ordinal.map(|o| o.saturating_add(ordinal_shift));
    target.tool_uses.push(tool);
}

// Shift and merge incoming THINKING PHASES — ordinals + content offsets
for mut phase in incoming.thinking_phases {
    phase.content_offset = Some(phase.content_offset.unwrap_or(0).saturating_add(shift));
    phase.ordinal = phase.ordinal.map(|o| o.saturating_add(ordinal_shift));
    target.thinking_phases.push(phase);
}
```

> **Note**: The existing `absorb_assistant_message` already has a tool merge loop that shifts
> `content_offset`. That loop must be updated to ALSO shift `ordinal` — do NOT add a second
> tool loop. The code above shows the complete replacement for the tool + thinking merge section.

### Step 5: Add `ThinkingPhaseDto` to Rust transport (`conversations.rs`)

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThinkingPhaseDto {
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_offset: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<u32>,
}
```

Add to `MessageDto`:

```rust
#[serde(default, skip_serializing_if = "Vec::is_empty")]
pub thinking_phases: Vec<ThinkingPhaseDto>,
```

Add `From` impls for `ThinkingPhase ↔ ThinkingPhaseDto`, update `From<Message> for MessageDto` and `From<MessageDto> for Message` to map `thinking_phases`.

### Step 5b: Add `ordinal` to `ToolUseDto` (`conversations.rs`)

> **AUDIT FIX (Audit 2, Critical #1)**: Thread `ordinal` through the ToolUse transport layer.

```rust
pub struct ToolUseDto {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(default = "default_true")]
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_offset: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<u32>,
}
```

Update `From<ToolUse> for ToolUseDto` and `From<ToolUseDto> for ToolUse` to map `ordinal`.

### Step 6: Add to TS DTO (`conversations.ts`)

```typescript
export interface ThinkingPhaseDto {
  content: string;
  contentOffset?: number;
  ordinal?: number;
}

export interface ConversationMessageDto {
  // ... existing fields ...
  thinkingPhases?: ThinkingPhaseDto[];
}
```

### Step 6b: Add `ordinal` to TS `ToolUseDto` (`conversations.ts`)

> **AUDIT FIX (Audit 2, Critical #1)**: Thread `ordinal` through the TS ToolUse transport.

```typescript
export interface ToolUseDto {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  success: boolean;
  contentOffset?: number;
  ordinal?: number;
}
```

> **AUDIT (Recommended #2 — Nice-to-Have #2)**: Consider extracting a shared `ThinkingPhase` TS type reused by DTOs, Zod schemas, and chat mapping to reduce drift across TS transport layers. For now, the DTO and Zod schema define it independently — acceptable given the small surface area.

### Step 7: Add to Zod schemas (`protocol.ts`)

**PersistedMessageSchema** — uses `.strip()` so this is additive/safe:

```typescript
const ThinkingPhaseSchema = z.object({
  content: z.string(),
  contentOffset: z.number().optional(),
  ordinal: z.number().optional(),
});

// Add to PersistedMessageSchema's .object():
thinkingPhases: z.array(ThinkingPhaseSchema).optional(),

// Add to .transform():
thinkingPhases: msg.thinkingPhases ?? [],
```

**ConversationRewoundSchema** — uses `.strict()`, MUST be updated or new field will be rejected:

```typescript
// Add to the inner message schema in ConversationRewoundSchema:
thinkingPhases: z.array(ThinkingPhaseSchema).optional(),
```

**RewindConversationSchema** — uses `.strict()`, request-side `current_messages` MUST also be updated or thinking data will be stripped by Zod before it reaches the backend:

```typescript
// Add to current_messages inner object in RewindConversationSchema:
thinking: z.string().optional(),
thinkingDurationMs: z.number().optional(),
thinkingPhases: z.array(ThinkingPhaseSchema).optional(),
```

### Step 7b: Add `ordinal` to tool Zod schemas (`protocol.ts`)

> **AUDIT FIX (Audit 2, Critical #1)**: Thread `ordinal` through Zod tool validation.

**PersistedToolUseSchema** — uses `.strict()`, MUST be updated or `ordinal` will be rejected:

```typescript
const PersistedToolUseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
    output: z.string().optional(),
    success: z.boolean().default(true),
    contentOffset: z.number().optional(),
    ordinal: z.number().optional(),
  })
  .strict();
```

**RewindConversationSchema toolUses** — also `.strict()`:

```typescript
// Update the toolUses inner object in RewindConversationSchema:
toolUses: z.array(z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
  output: z.string().optional(),
  success: z.boolean(),
  contentOffset: z.number().optional(),
  ordinal: z.number().optional(),
})).optional(),
```

### Step 7c: Add `ordinal` to `ToolExecution` and `restoreToolsForMessage` (`tool-store.ts`)

> **AUDIT FIX (Audit 2, Critical #1)**: Thread `ordinal` into the ToolStore so it survives reload.

```typescript
// Add to ToolExecution interface:
export interface ToolExecution {
  // ... existing fields ...
  contentOffset?: number | undefined;
  ordinal?: number | undefined; // ← NEW
  sessionId?: string | undefined;
}

// Update restoreToolsForMessage parameter type and toolExecution construction:
restoreToolsForMessage: (
  messageId: string,
  tools: {
    id: string;
    name: string;
    input: Record<string, unknown>;
    output?: string | undefined;
    success: boolean;
    contentOffset?: number | undefined;
    ordinal?: number | undefined; // ← NEW
  }[],
  sessionId?: string
) => {
  // ... inside the loop:
  const toolExecution: ToolExecution = {
    // ... existing fields ...
    contentOffset: tool.contentOffset,
    ordinal: tool.ordinal, // ← NEW
    sessionId: sessionId ?? state.currentSessionId ?? undefined,
  };
};
```

Then update all `restoreToolsForMessage` call sites in `chat-message-service.ts` to pass `ordinal`:

```typescript
useToolStore.getState().restoreToolsForMessage(
  m.id,
  m.toolUses.map((t) => ({
    id: t.id,
    name: t.name,
    input: t.input,
    success: t.success,
    ...(t.output !== undefined ? { output: t.output } : {}),
    ...(t.contentOffset !== undefined ? { contentOffset: t.contentOffset } : {}),
    ...(t.ordinal !== undefined ? { ordinal: t.ordinal } : {}),
  })),
  message.session_id
);
```

### Step 8: Centralize `mapPersistedMessage` in `chat-message-service.ts`

Three hydration paths currently duplicate message mapping logic:

1. `handleConversationLoaded` (~line 988-1026) — session switch
2. `reloadConversationFromDisk` (~line 823-835) — compact reload
3. `handleConversationRewound` (~line 1209-1222) — rewind

Extract a shared helper:

```typescript
/** Map a persisted/transport message to a ChatMessage. Used by load, compact reload, and rewind. */
function mapPersistedMessage(m: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  thinkingDurationMs?: number;
  thinkingPhases?: { content: string; contentOffset?: number; ordinal?: number }[];
  isInterrupted?: boolean;
  turnDurationMs?: number;
  parentUuid?: string | null;
  toolUses?: { name: string; success: boolean }[];
}): ChatMessage {
  // Build thinkingBlocks: prefer per-phase data, fall back to flat thinking string.
  // AUDIT FIX (Recommended #3): When per-phase data exists but per-phase durations
  // are not available, assign the aggregate thinkingDurationMs to the LAST phase
  // so the "Thought for Xs" label remains visible. This preserves the existing UX
  // until true per-phase durations are stored in the sidecar (future enhancement).
  const thinkingBlocks: ThinkingBlock[] | undefined =
    m.thinkingPhases && m.thinkingPhases.length > 0
      ? m.thinkingPhases.map((p, i) => ({
          content: p.content,
          durationMs: i === m.thinkingPhases!.length - 1 ? (m.thinkingDurationMs ?? 0) : 0,
          contentOffset: p.contentOffset,
          ordinal: p.ordinal,
        }))
      : m.thinking
        ? [{ content: m.thinking, durationMs: m.thinkingDurationMs ?? 0 }]
        : undefined;

  const base: ChatMessage = {
    id: m.id,
    role: m.role,
    content: m.content,
    displayedContent: m.content,
    ...(m.parentUuid !== undefined ? { parentUuid: m.parentUuid } : {}),
    ...(thinkingBlocks ? { thinkingBlocks } : {}),
    ...(m.thinking ? { thinking: m.thinking } : {}),
    ...(m.thinkingDurationMs !== undefined ? { thinkingDurationMs: m.thinkingDurationMs } : {}),
    ...(m.turnDurationMs !== undefined ? { turnDurationMs: m.turnDurationMs } : {}),
  };

  // Derive interrupt state
  if (m.isInterrupted === true) {
    const hasRejectedQuestion = m.toolUses?.some(
      (t) => t.name.toLowerCase() === 'askuserquestion' && !t.success
    );
    return {
      ...base,
      isInterrupted: true as const,
      ...(hasRejectedQuestion ? { interruptReason: 'User rejected to answer' } : {}),
    };
  }

  return base;
}
```

Then update all three paths to use `mapPersistedMessage()`:

- `handleConversationLoaded`: replace inline `.map()` at lines 995-1026
- `reloadConversationFromDisk`: replace inline `.map()` at lines 825-835
- `handleConversationRewound`: replace inline `.map()` at lines 1209-1222

### Step 9: Update `conversation-handlers.ts` payload mappings

**Three** payload-construction `.map()` calls in this file explicitly cherry-pick fields. All three currently drop `thinkingPhases`. If ANY one is missed, the data flows from Rust → DTO → TS DTO and then gets silently discarded before reaching Zod or `mapPersistedMessage`.

**(a) `handleConversationLoad` — `conversation:loaded` payload (line 101-117):**

This is the **primary session-switch/reload transport path**. The `.map()` at line 101 includes `thinking` and `thinkingDurationMs` but not `thinkingPhases`. Without this fix, `mapPersistedMessage` falls back to flat `thinking` (single phase, no offsets), and `buildUnifiedSegments` prepends all thinking at top — reproducing Bug 1 on every session switch.

```typescript
messages: conv.messages.map((m) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  createdAt: m.createdAt,
  ...(m.thinking ? { thinking: m.thinking } : {}),
  ...(m.thinkingDurationMs !== undefined
    ? { thinkingDurationMs: m.thinkingDurationMs }
    : {}),
  // Per-phase thinking data for interleaved rendering on reload
  ...(m.thinkingPhases && m.thinkingPhases.length > 0
    ? { thinkingPhases: m.thinkingPhases }
    : {}),
  ...(m.isInterrupted === true ? { isInterrupted: true } : {}),
  ...(m.turnDurationMs !== undefined ? { turnDurationMs: m.turnDurationMs } : {}),
  ...(m.toolUses && m.toolUses.length > 0 ? { toolUses: m.toolUses } : {}),
  ...(m.usage ? { usage: m.usage } : {}),
  ...(m.parentUuid !== undefined ? { parentUuid: m.parentUuid } : {}),
})),
```

**(b) Rewind response — disk path (line 376-383):**

```typescript
messages: messagesUpToRewind
  .filter((m) => isChatRole(m.role))
  .map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.createdAt,
    thinking: m.thinking,
    thinkingDurationMs: m.thinkingDurationMs,
    thinkingPhases: m.thinkingPhases,
    toolUses: m.toolUses,
    parentUuid: m.parentUuid,
  })),
```

**(c) Rewind response — fallback path (line 397-404):**

The fallback receives `current_messages` from the frontend rewind request. After Step 11, those messages now include thinking data. The mapping must pass it through:

```typescript
messages: current_messages.map((m) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  timestamp: Date.now(),
  // Thinking data round-trips from frontend rewind request (Step 11)
  ...(m.thinking ? { thinking: m.thinking } : {}),
  ...(m.thinkingDurationMs !== undefined ? { thinkingDurationMs: m.thinkingDurationMs } : {}),
  ...(m.thinkingPhases && m.thinkingPhases.length > 0
    ? { thinkingPhases: m.thinkingPhases }
    : {}),
  toolUses: m.toolUses,
  parentUuid: m.parentUuid,
})),
```

### Step 10: Add Rust tests

> **AUDIT (Recommended #5)**: Extend existing parser regression tests in `crates/common/conversations/src/lib.rs:2459-2504`.

- Unit test: `extract_assistant_content` with multiple thinking blocks → verify all phases captured with correct offsets AND correct ordinals (sequential across thinking + tool_use blocks)
- Unit test: `absorb_assistant_message` merging two messages each with thinking → verify phases accumulated, offsets shifted, and ordinals shifted to remain globally unique
- **AUDIT FIX (Audit 3, Critical #1 + Recommended #3)**: Unit test: `absorb_assistant_message` merging two messages where BOTH have tool uses AND thinking phases → verify ALL ordinals (tools + thinking) are shifted from the shared max, with no duplicates or overlaps in the merged result
- Integration test: JSONL with `[thinking, text, tool_use]` → `[tool_result]` → `[thinking, text]` → verify merged message has two thinking phases with correct offsets/ordinals and flat `thinking` is concatenated with `"\n\n"` separator
- **Edge case** (Audit Edge Case #3): JSONL where a thinking block and tool_use share the same content offset → verify ordinals preserve encounter order
- **Edge case** (Audit Edge Case #8): JSONL with multi-byte Unicode content → verify `content_offset` uses UTF-16 length (same scale as `ToolUse::content_offset`)

### Step 11: Update rewind REQUEST transport (`chat-actions.ts` + `protocol.ts`)

The rewind request sends `current_messages` to the backend so it can reconstruct the conversation after fork. Currently `handleRewind()` (`chat-actions.ts:379-397`) strips each message to `{id, role, content, parentUuid, toolUses}` — all thinking data is dropped. And `RewindConversationSchema` (`protocol.ts:291-335`) is `.strict()`, so even if thinking fields were included, Zod would reject them.

**Both must be updated together**, or thinking phases are silently lost on every rewind:

**(a) `handleRewind` in `chat-actions.ts` (~line 390-397):**

```typescript
const truncatedMessages = messages.slice(0, messageIndex + 1).map((m) => {
  const tools = toolState.completedTools
    .filter((t) => t.messageId === m.id)
    .map((t) => ({
      id: t.id,
      name: t.toolName,
      input: t.toolInput,
      success: t.success ?? false,
      ...(typeof t.toolOutput === 'string' ? { output: t.toolOutput } : {}),
      ...(t.contentOffset !== undefined ? { contentOffset: t.contentOffset } : {}),
      // AUDIT FIX (Audit 2, Critical #1): Include tool ordinals in rewind payload
      ...(t.ordinal !== undefined ? { ordinal: t.ordinal } : {}),
    }));
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    parentUuid: m.parentUuid ?? null,
    ...(tools.length > 0 ? { toolUses: tools } : {}),
    // Preserve thinking data for round-trip through rewind
    ...(m.thinking ? { thinking: m.thinking } : {}),
    ...(m.thinkingDurationMs !== undefined ? { thinkingDurationMs: m.thinkingDurationMs } : {}),
    ...(m.thinkingBlocks && m.thinkingBlocks.length > 0
      ? {
          thinkingPhases: m.thinkingBlocks.map((b) => ({
            content: b.content,
            ...(b.contentOffset !== undefined ? { contentOffset: b.contentOffset } : {}),
            ...(b.ordinal !== undefined ? { ordinal: b.ordinal } : {}),
          })),
        }
      : {}),
  };
});
```

**(b) `RewindConversationSchema` — already updated in Step 7** (see the `RewindConversationSchema` block above). The thinking fields in the inner object allow the data to pass Zod validation.

### Step 12: Update write-side sidecar metadata (`chat-message-service.ts` + `chat-actions.ts`)

> **AUDIT FIX (Critical #4)**: `conversationAddMessage(...)` does NOT persist `thinkingPhases` to
> disk. `ConversationManager::add_message()` (`lib.rs:767-793`) only writes `.metadata.json` sidecar
> entries when `thinking_duration_ms` is present — it ignores message body fields like `content`,
> `tool_uses`, and any `thinking_phases` we add. The actual phase data survives through two independent
> channels:
>
> 1. **JSONL parsing** — `extract_assistant_content` (Step 3) + `absorb_assistant_message` (Step 4)
>    reconstruct phases from the SDK's JSONL on every load/reload.
> 2. **Rewind request transport** — `current_messages` in the rewind request round-trips phase data
>    from the frontend (Step 11) when the JSONL is stale or unavailable.
>
> Therefore, Step 12 is about passing **sidecar metadata** (`thinking`, `thinkingDurationMs`) through
> `conversationAddMessage` — NOT about persisting `thinkingPhases` itself. The `thinkingPhases` field
> is NOT included in these calls because the backend would ignore it anyway.

Every path that persists assistant messages via `conversationAddMessage` must include the flat `thinking` string and `thinkingDurationMs` for sidecar fingerprint matching. The `thinkingPhases` field is intentionally omitted — it is recovered from JSONL parsing (see audit note above).

**(a) `handleAgentComplete` in `chat-message-service.ts` (~line 605-626):**

The persistence block currently writes `thinking` and `thinkingDurationMs`. No changes needed for `thinkingPhases` — JSONL parsing handles phase recovery:

```typescript
if (!wasMessagePersisted(sid, completedMsg.id)) {
  void conversationAddMessage(
    sid,
    {
      id: completedMsg.id,
      role: 'assistant',
      content: completedMsg.content,
      ...(completedMsg.thinking ? { thinking: completedMsg.thinking } : {}),
      ...(completedMsg.thinkingDurationMs !== undefined
        ? { thinkingDurationMs: completedMsg.thinkingDurationMs }
        : {}),
      // NOTE: thinkingPhases intentionally NOT included here.
      // Phases are recovered from JSONL via extract_assistant_content (Step 3).
      // conversationAddMessage only writes sidecar metadata, not message body fields.
      createdAt: Date.now(),
      ...(usageDto ? { usage: usageDto } : {}),
      ...(toolUsesDto ? { toolUses: toolUsesDto } : {}),
      ...(completedMsg.parentUuid !== undefined ? { parentUuid: completedMsg.parentUuid } : {}),
    },
    workspacePath ?? undefined,
    activeWorktreePath ?? undefined
  );
}
```

**(b) `handlePermissionDeny` in `chat-actions.ts` (~line 493-508):**

Same pattern — pass `thinking` and `thinkingDurationMs` for sidecar, phases come from JSONL:

```typescript
if (interruptedMsg.content) {
  void conversationAddMessage(
    sessionId,
    {
      id: interruptedMsg.id,
      role: 'assistant',
      content: interruptedMsg.content,
      ...(interruptedMsg.thinking ? { thinking: interruptedMsg.thinking } : {}),
      ...(interruptedMsg.thinkingDurationMs !== undefined
        ? { thinkingDurationMs: interruptedMsg.thinkingDurationMs }
        : {}),
      createdAt: Date.now(),
      ...(interruptedMsg.parentUuid !== undefined ? { parentUuid: interruptedMsg.parentUuid } : {}),
    },
    workspacePath ?? undefined,
    activeWorktreePath ?? undefined
  );
}
```

**(c) `handleStop` in `chat-actions.ts` (~line 293-317)** — AUDIT FIX (Recommended #2): This is another assistant persistence path that the original plan did not explicitly name. The stop-path interruption must also pass `thinking` and `thinkingDurationMs` for sidecar metadata. Verify this path during implementation and update if needed.

**(d) Coverage verification**: Search for ALL `conversationAddMessage` calls where `role: 'assistant'` to verify that `thinking` and `thinkingDurationMs` are passed consistently. The three paths above (complete, permission deny, stop) should cover all cases.

### Step 13: Sidecar metadata contract clarification (`lib.rs`)

> **AUDIT FIX (Critical #4)**: This step clarifies what `conversationAddMessage` actually persists
> and what it does not.

`ConversationManager::add_message()` (`lib.rs:767-793`) currently writes only `thinking_duration_ms` and a `thinking_prefix` content fingerprint to the `.metadata.json` sidecar. The sidecar is used for metadata the SDK doesn't persist to JSONL.

**What is persisted to sidecar**: `thinking_duration_ms`, `thinking_prefix` (first N chars of flat thinking string for fingerprint matching when bridge UUIDs differ from SDK UUIDs).

**What is NOT persisted to sidecar**: `thinking_phases`, `content`, `tool_uses`, or any message body field. These come from JSONL parsing.

**Decision**: Do NOT store `thinking_phases` in the sidecar. The phases are recovered from the JSONL itself via `extract_assistant_content` (Step 3) and `absorb_assistant_message` (Step 4). Per-phase content offsets and ordinals are derived from JSONL block order during parsing. Adding them to the sidecar would create a second source of truth that could drift from the JSONL.

**AUDIT FIX (Critical #2) — Fingerprint stability**: The sidecar's `thinking_prefix` field stores the first N bytes of the flat `thinking` string. After this change, the flat string uses `"\n\n"` separators between phases (matching both Rust `extract_assistant_content` and frontend accumulation). This is a **behavioral change** from the previous code where only the first phase was kept — the fingerprint will now include content from all phases.

**EDGE CASE FIX — Prefix collision risk**: The current prefix length is **64 bytes** (`truncate_to_char_boundary(thinking, 64)`). For multi-phase messages where Phase 1 alone exceeds 64 bytes (common — thinking blocks are often full paragraphs), two messages sharing the same Phase 1 but different Phase 2+ would produce identical fingerprints, causing wrong `thinkingDurationMs` assignment on reload.

**Action**: Increase `thinking_prefix` from 64 to **128 bytes** in both write (`lib.rs:783`) and read (`lib.rs:668`) paths. This gives the prefix enough room to span the `"\n\n"` separator and capture the start of Phase 2, differentiating most multi-phase messages. The sidecar `.metadata.json` size increase is negligible (~64 extra bytes per assistant message with thinking).

```rust
// lib.rs:668 (read path)
let msg_prefix = truncate_to_char_boundary(thinking, 128);

// lib.rs:783 (write path)
.map(|t| truncate_to_char_boundary(t, 128).to_owned());
```

**Backward compatibility**: Existing sidecar entries store 64-byte prefixes. The read path
must handle mixed-version sidecars where some entries have 64-byte and others have 128-byte
prefixes. A naive `starts_with` with first-match `break` is **unsafe** because `metadata`
is a `HashMap` (unordered) — an old 64-byte prefix from a _different_ message could match
before the correct 128-byte entry.

**AUDIT FIX (Audit 5, Critical #1)**: Use ranked matching — exact match first, then longest
`starts_with` match. Skip ambiguous ties.

```rust
// lib.rs:668-674 (read path) — ranked matching logic
let msg_prefix = truncate_to_char_boundary(thinking, 128);

// Phase 1: Try exact match (fastest, no ambiguity)
let mut matched_duration: Option<u64> = None;
for meta in metadata.values() {
    if let Some(stored_prefix) = &meta.thinking_prefix {
        if !stored_prefix.is_empty() && stored_prefix == msg_prefix {
            matched_duration = meta.thinking_duration_ms;
            break; // Exact match — no ambiguity possible
        }
    }
}

// Phase 2: If no exact match, fall back to longest starts_with
// (handles old 64-byte entries matching against new 128-byte msg_prefix)
if matched_duration.is_none() {
    let mut best_len: usize = 0;
    let mut best_duration: Option<u64> = None;
    let mut tie = false;

    for meta in metadata.values() {
        if let Some(stored_prefix) = &meta.thinking_prefix {
            if !stored_prefix.is_empty()
                && msg_prefix.starts_with(stored_prefix.as_str())
            {
                let len = stored_prefix.len();
                if len > best_len {
                    best_len = len;
                    best_duration = meta.thinking_duration_ms;
                    tie = false;
                } else if len == best_len {
                    tie = true; // Ambiguous — two stored prefixes of same length match
                }
            }
        }
    }

    if !tie {
        matched_duration = best_duration;
    }
    // If tie: skip — ambiguous match, better to lose duration than assign wrong one
}

msg.thinking_duration_ms = matched_duration;
```

This handles all cases:

- **New-to-new**: Both 128 bytes → exact match in Phase 1 (fast path)
- **Old-to-new**: Stored 64 bytes, loaded 128 bytes → `starts_with` in Phase 2, longest wins
- **Mixed sidecar**: Old 64-byte entry from message A + new 128-byte entry from message B → Phase 1 exact-matches B, Phase 2 skips A's shorter prefix
- **Ambiguous tie**: Two old 64-byte entries with same prefix → skipped (inherently best-effort for legacy data)

Add regression tests:

- Mixed-version sidecar with both 64-byte and 128-byte entries for different messages
- Two old 64-byte entries sharing same prefix → verify neither is incorrectly matched
- Exact 128-byte match takes priority over `starts_with` match of different length

**Future enhancement** (Nice-to-Have #1): If per-phase durations are needed (currently the aggregate `thinkingDurationMs` is assigned to the last phase in `mapPersistedMessage`), add an optional `Vec<u64>` of per-phase durations to `MessageMetadata`. This would allow "Thought for Xs" labels on each individual thinking block.

---

## Verification

### Automated

> **AUDIT (Recommended #5)**: Extend EXISTING test suites rather than starting from scratch.
> Existing tests already cover the right patterns:
>
> - Parser/merge regressions: `crates/common/conversations/src/lib.rs:2459-2504`
> - Frontend rewind/load simulations: `apps/agent/src/__tests__/integration/chat/rewind-e2e.test.ts:1-330`
> - Thinking reload regression: `apps/agent/src/stress-tests/review-fixes-stress-test.ts:446-534`
> - DTO transport layer: `src-tauri/src/commands/agent/conversations.rs` (add `From` impl tests for `ThinkingPhaseDto`)

```bash
# Rust tests (Bug 2 + Bug 3)
cargo test -p orbit-conversations

# Frontend tests (Bug 1)
bun run test

# Full quality check
bun run check
```

### Frontend unit tests for `buildUnifiedSegments`

Pure function — extend existing test file or create alongside `message-utils.ts`:

- No thinking blocks, no tools → single content segment
- No thinking blocks, with tools → same as existing `buildSegments` behavior
- All blocks lack `contentOffset` (legacy) → prepends all thinking before content/tools
- Mixed offsets with tools → interleaves correctly, ordinals determine same-offset ordering
- Text-only multi-phase (no tools) → content sliced at thinking offsets
- **Active streaming block (Audit Critical #1)**: Second thinking phase actively streaming (no `contentOffset`) → appended at END, not prepended at top
- **Active first phase**: First thinking phase streaming with `isThinkingActive=true` → appended at end (no legacy blocks to prepend)
- **Same-offset ordering (Audit Critical #3)**: Thinking phase and tool share same offset → ordinals determine order, not hard-coded type priority
- Partially-migrated: some blocks with offsets, some without → no-offset legacy blocks prepended, offset blocks interleaved, active block appended
- **Unicode content (Audit Edge Case #8)**: Multi-byte content with UTF-16 offsets → verify slicing produces valid strings

### Rust transport layer tests

> **AUDIT FIX (Audit 2, Recommended #3)**: Cover BOTH thinking and tool ordinal transport.

- `From<ThinkingPhase> for ThinkingPhaseDto` and reverse — verify `content`, `content_offset`, and `ordinal` round-trip
- `From<ToolUse> for ToolUseDto` and reverse — verify `ordinal` round-trips alongside existing fields
- `From<Message> for MessageDto` — verify BOTH `thinking_phases` and tool `ordinal` are included (catches silent field-drop regressions)
- `From<MessageDto> for Message` — reverse direction for both

### Integration test at transport boundary (Nice-to-Have #3)

```typescript
it('preserves thinkingPhases through conversation:loaded hydration', () => {
  const payload = {
    type: 'conversation:loaded',
    uuid: crypto.randomUUID(),
    session_id: 's1',
    title: 'Test',
    messages: [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Done',
        createdAt: 1,
        thinking: 'phase 1\n\nphase 2',
        thinkingDurationMs: 4200,
        thinkingPhases: [
          { content: 'phase 1', contentOffset: 0, ordinal: 0 },
          { content: 'phase 2', contentOffset: 4, ordinal: 2 },
        ],
        toolUses: [],
      },
    ],
  };

  chatMessageService.handleMessage(payload);

  const msg = useChatStore.getState().sessions['s1']?.messages[0];
  expect(msg?.thinkingBlocks?.map((b) => b.content)).toEqual(['phase 1', 'phase 2']);
  // AUDIT (Recommended #3): Verify aggregate duration assigned to last phase
  expect(msg?.thinkingBlocks?.[1]?.durationMs).toBe(4200);
  expect(msg?.thinkingBlocks?.[0]?.durationMs).toBe(0);
});
```

### Manual

1. **Bug 1 (streaming interleave)**: Run `bunx tauri dev`, enable extended thinking, send a prompt that triggers multiple thinking phases + tool calls. Verify thinking boxes interleave with tool widgets (not all stacked at top).
2. **Bug 1 (active streaming phase)**: During a multi-phase turn, observe the SECOND thinking phase while it's still streaming. Verify it appears AFTER the first phase's tool/content, not at the top of the message.
3. **Bug 2 (session switch)**: After a conversation with MCP tool calls, switch to another conversation and back. Verify the assistant message stays as one merged message without "Tool loaded." splits.
4. **Bug 3 (reload persistence)**: After a multi-phase thinking conversation, switch away and back (or restart app). Verify all thinking phases appear interleaved, not just the first one.
5. **Bug 3 (compact reload)**: After `/compact`, verify thinking phases survive the reload.
6. **Bug 3 (rewind)**: Rewind a conversation with multi-phase thinking. Verify thinking phases are present in the rewound state.
7. **Bug 3 (rewind round-trip)**: After rewind, do a second rewind. Verify thinking phases survive both rewind cycles (tests Step 11 — request-side transport). **(Audit Edge Case #7)**
8. **Bug 3 (permission deny)**: During a multi-phase thinking turn, deny a permission request. Verify thinking phases are still visible after the interruption (tests Step 12b).
9. **Bug 3 (stop interruption)**: During a multi-phase thinking turn, hit Stop. Verify thinking phases are still visible after the interruption (tests Step 12c — `handleStop`). **(Audit Edge Case #4)**
10. **Duration display**: After reloading a multi-phase conversation, verify "Thought for Xs" label appears on the last thinking block (not "Thought for 0s"). **(Audit Recommended #3)**
11. **Regression**: Verify conversations without thinking or tools still render correctly.
12. **Legacy backward compat**: Verify legacy conversations (pre-fix, no `thinking_phases`) still show flat thinking at top with duration label intact.
13. **Sidecar fingerprint**: Reload a multi-phase conversation where bridge message IDs differ from SDK UUIDs. Verify `thinkingDurationMs` is still recovered via sidecar `thinking_prefix` matching. **(Audit Edge Case #2)**
14. **Fingerprint backward compat**: Load a conversation whose sidecar was written with the old 64-byte prefix. Verify `thinkingDurationMs` is still recovered via `starts_with` matching against the new 128-byte prefix. **(Edge Case #1)**

---

## Audit Trail

### Audit: 2026-03-06 (Codex)

**Verdict**: APPROVE WITH CHANGES

**Critical issues addressed**:

1. **Active in-flight thinking ordering** — `buildUnifiedSegments` now distinguishes legacy no-offset blocks (prepended) from the active streaming block (appended at end). See Step 4 code.
2. **Flat-thinking/sidecar fingerprint compatibility** — Both Rust `extract_assistant_content` and frontend chunk batcher use `"\n\n"` separator. Documented in Step 3 addendum and Step 13.
3. **Same-offset marker ordering** — Added `ordinal` field to `ThinkingPhase` (Rust) and `ThinkingBlock` (TS). Ordinals assigned sequentially across all block types in `extract_assistant_content`. Sort by `(offset, ordinal)` instead of hard-coded type priority.
4. **Persistence contract misconception** — Step 12 rewritten to clarify that `conversationAddMessage` only writes sidecar metadata (`thinking`, `thinkingDurationMs`), not `thinkingPhases`. Phases are recovered from JSONL parsing (Steps 3-4) and rewind request transport (Step 11).

**Recommended improvements addressed**:

1. `buildSegments` → thin wrapper over `buildUnifiedSegments` (Step 4 closing note)
2. `handleStop()` explicitly named as persistence path (Step 12c)
3. Aggregate `thinkingDurationMs` assigned to last phase in `mapPersistedMessage` (Step 8)
4. Agent-bridge parser divergence documented with decision rationale (Bug 2, Step 4 note)
5. Extend existing test suites instead of starting from scratch (Verification section)

**Edge cases addressed**:

1. Active second/third thinking phase → Critical #1 fix (active trailing block)
2. Sidecar fingerprint fallback → Critical #2 fix + manual verification step
3. Same-offset tool/thinking → Critical #3 fix (ordinals)
4. Stop-path interruption → Recommended #2 (handleStop in Step 12c)
5. Historical multi-phase with aggregate duration → Recommended #3 (last-phase assignment)
6. Mixed `[tool_result, text]` with real user text → Regression test + invariant pin
7. Rewind 2+ frontend fallback → Manual verification step #7
8. Unicode/UTF-16 offsets → Unit test case + documented invariant (same scale as `ToolUse::content_offset`)

### Audit 2: 2026-03-06 (Codex)

**Verdict**: APPROVE WITH CHANGES (one remaining critical)

**Critical issue addressed**:

1. **Tool ordinals missing from full transport stack** — `ordinal` was only on `ThinkingPhase`/`ThinkingBlock`, not on `ToolUse`. Added `ordinal` field to:
   - Rust `ToolUse` struct (Step 1b)
   - Rust `ToolUseDto` (Step 5b)
   - TS `ToolUseDto` (Step 6b)
   - Zod `PersistedToolUseSchema` + rewind tool schema (Step 7b)
   - `ToolExecution` interface + `restoreToolsForMessage` (Step 7c)
   - Rewind request `handleRewind` tool mapping (Step 11)
   - `buildUnifiedSegments` now reads persisted `tool.ordinal` instead of always synthesizing (Step 4)

**Recommended improvements addressed**:

1. Contradictory Bug 3 "Files to Modify" table entry removed (sidecar per-phase persistence row)
2. Agent-bridge parser divergence marked as known-risk item (Bug 2 note)
3. Transport test coverage expanded to include `ToolUseDto` ordinal round-trip (Verification section)

**Edge cases resolved**:

1. Same-offset tool/thinking after reload or rewind → now deterministic via persisted ordinals on both types
2. Mixed `[tool_result, text]` parser divergence → documented as known risk with decision rationale
3. Tool ordinals out of scope → NO, they are now in scope. Same-offset cross-type ordering is fully deterministic.

### Audit 3: 2026-03-06 (Codex)

**Verdict**: APPROVE WITH CHANGES (one remaining critical)

**Critical issue addressed**:

1. **Tool ordinals not shifted during assistant merge** — `absorb_assistant_message` Step 4 only shifted incoming `thinking_phases` ordinals, not incoming `tool_uses` ordinals. Since they share the same ordinal namespace, merged turns could produce duplicate ordinals. Fix: compute `ordinal_shift` from `max(all target ordinals) + 1`, then shift BOTH incoming tools AND incoming thinking phases before appending. The existing tool content_offset shift loop is updated to also shift ordinals.

**Recommended improvements addressed**:

1. Frontend `buildUnifiedSegments` fallback counter now initializes to `max(existingOrdinals) + 1` to avoid collisions in partially-migrated data where some markers have persisted ordinals and others don't.
2. Agent-bridge parser divergence remains documented as known-risk (no change needed).
3. Merge regression test expanded to cover both tool uses AND thinking phases with ordinals in the merged result.

**Edge cases resolved**:

1. Merged assistant turn with tool ordinals on both sides → ordinal_shift applied to both tool_uses and thinking_phases
2. Partially migrated data → fallback counter starts above max persisted ordinal
3. Agent-bridge parser divergence → unchanged, documented as known risk

### Audit 4: 2026-03-06 (Edge Case Review)

**Verdict**: APPROVE (no new critical issues)

**Edge case addressed**:

1. **`thinking_prefix` fingerprint collision** — Multi-phase thinking with Phase 1 >64 bytes caused identical fingerprints for different messages. Fix: increase prefix from 64 to 128 bytes in both read/write paths. Backward compatibility via ranked matching (see Audit 5 for the refined matching logic). (Step 13)

**Edge cases accepted as known limitations**: 2. **Agent-bridge parser divergence** — Intentional difference between Rust `.any()` and bridge first-block check. SDK always puts `tool_result` first; divergence is theoretical only. Documented as known risk. 3. **Aggregate `thinkingDurationMs` only** — Per-phase durations require future sidecar extension. Last phase shows aggregate. Cosmetic limitation, not a bug.

### Audit 5: 2026-03-06 (Fingerprint Matching Fix)

**Verdict**: APPROVE WITH CHANGES (one critical in fingerprint backward compat)

**Critical issue addressed**:

1. **`starts_with` first-match from unordered HashMap** — The naive `starts_with || ==` with `break` could match a wrong entry from a different message in mixed-version sidecars (old 64-byte + new 128-byte prefixes). Fix: two-phase ranked matching — exact match first (fast path), then longest `starts_with` match with tie-breaking. Ambiguous ties (two entries of same prefix length) are skipped rather than guessed. (Step 13)
