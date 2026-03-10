# Fix: Thinking Block Issues Across Session Switches

Two bugs observed after switching away from a conversation and switching back:

## Bug 1: Thinking Durations Disappear

After session switch, "Thought for 3.2s" becomes just "Thought" — all per-phase duration labels vanish.

**Root cause chain:**

1. During streaming, each thinking phase gets measured duration via `Date.now() - startTime`
2. `handleAgentComplete` computes a `finalThinkingDuration` for the last active phase, stores `thinkingDurationMs` on the message
3. `conversationAddMessage` persists to backend — but does NOT include per-phase durations (not in `ThinkingPhaseDto`)
4. Rust sidecar `MessageMetadata` only stores one `thinking_duration_ms: Option<u64>` — no per-phase array
5. On reload, `mapPersistedMessage` assigns total to last block only: `index === thinkingPhases.length - 1 ? (m.thinkingDurationMs ?? 0) : 0`
6. `ThinkingBox` hides duration when `thinkingDurationMs <= 0` (`thinking-box.tsx:105`)

## Bug 2: Thinking Blocks Appear in Different Order

During streaming, `nextMarkerOrdinal` assigns ordinals sequentially as IPC events arrive (thinking/tool interleaved). After reload, the Rust JSONL parser (`extract_assistant_content`) recomputes ordinals from the JSONL content block array order. When `absorb_assistant_message` merges consecutive assistant JSONL lines, it shifts ordinals by `max(existing) + 1`. The merged ordinals are correct relative to the JSONL canonical order but may differ from streaming event arrival order.

**However:** The streaming `contentOffset` values are set at thinking-finalization time (`currentMsg.content.length`) and at tool:start time (`message.content_offset`). These should match the JSONL parser's UTF-16 running text length. Since `buildUnifiedSegments` sorts by `(offset, ordinal)`, and both offsets and ordinals are consistent between streaming and JSONL parsing, the ordering should be stable.

**Verdict:** Bug 2 is likely an IPC timing artifact during streaming that self-corrects on reload. The JSONL-derived order is canonical. Existing tests cover this:

- `crates/common/conversations/src/lib.rs:2355-2548` (Rust merge/ordering tests)
- `apps/agent/src/__tests__/unit/components/chat/messages/build-unified-segments.test.ts:48-96` (frontend ordering)

## Approach: Per-Phase Duration Persistence (Bug 1 Fix)

Thread `duration_ms` through the full stack: Rust struct → sidecar metadata → DTOs → Zod schemas → frontend.

**Key principles:**

- Use a shared `serializeThinkingBlocks` helper for ALL persistence paths (completion, interruption, rewind) to avoid fragile duplication.
- Finalize active thinking blocks before any persistence — interrupted messages must receive `contentOffset` and final `durationMs` before serialization, otherwise `buildUnifiedSegments` misclassifies them as legacy prepended blocks on reload.

**Note on `thinkingDurationMs`:** The top-level `thinkingDurationMs` is a legacy fallback value, NOT a true sum of all phases. It tracks only the last active phase's timer and may overcount post-thinking time. Treat it as fallback-only; per-phase `durationMs` is the authoritative source when available.

---

## Changes

### 1. Rust `ThinkingPhase` struct — add `duration_ms`

**File:** `crates/common/conversations/src/lib.rs:117-126`

Add field to `ThinkingPhase`:

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub duration_ms: Option<u64>,
```

### 2. Rust sidecar `MessageMetadata` — add `phase_durations`

**File:** `crates/common/conversations/src/lib.rs:168-175`

Add field:

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
phase_durations: Option<Vec<u64>>,
```

### 3. Rust `add_message` — persist phase durations

**File:** `crates/common/conversations/src/lib.rs:817-844`

Extract per-phase durations from `message.thinking_phases` and store in sidecar alongside existing `thinking_duration_ms`.

**IMPORTANT:** Use `map` with `unwrap_or(0)` instead of `filter_map` to preserve positional alignment. `filter_map` drops `None` entries, shifting indices — on reload, phase N's duration would be applied to the wrong phase.

```rust
let phase_durations: Option<Vec<u64>> = {
    let durations: Vec<u64> = message.thinking_phases
        .iter()
        .map(|p| p.duration_ms.unwrap_or(0))
        .collect();
    if durations.iter().all(|&d| d == 0) { None } else { Some(durations) }
};
```

Also expand the `if message.thinking_duration_ms.is_some()` guard to `if message.thinking_duration_ms.is_some() || phase_durations.is_some()`.

### 4. Rust `load_conversation` — merge phase durations from sidecar

**File:** `crates/common/conversations/src/lib.rs` (metadata merge loop, lines ~672-728)

Add a small Rust helper to avoid duplicating the bounds-checked merge loop:

```rust
fn apply_phase_durations(phases: &mut [ThinkingPhase], durations: Option<&[u64]>) {
    if let Some(durations) = durations {
        for (i, phase) in phases.iter_mut().enumerate() {
            if let Some(&dur) = durations.get(i) {
                phase.duration_ms = Some(dur);
            }
        }
    }
}
```

The phase_durations merge MUST be placed INSIDE the same block that applies `thinking_duration_ms` — before the `continue` statements. If placed after, it will never execute.

**Direct ID match block** (line 679-681):

```rust
if let Some(meta) = metadata.get(&msg.id) {
    msg.thinking_duration_ms = meta.thinking_duration_ms;
    apply_phase_durations(&mut msg.thinking_phases, meta.phase_durations.as_deref());
    continue;
}
```

**Fingerprint match block** (after line 726): Refactor to capture the full metadata entry alongside duration. Track `matched_phase_durations: Option<&Vec<u64>>` alongside `matched_duration`:

```rust
let mut matched_phase_durations: Option<&Vec<u64>> = None;

// Inside exact match:
matched_duration = meta.thinking_duration_ms;
matched_phase_durations = meta.phase_durations.as_ref();

// Inside longest-prefix match:
best_duration = meta.thinking_duration_ms;
best_phase_durations = meta.phase_durations.as_ref();
// (track best_phase_durations alongside best_duration / best_len / tie)

// After match resolution:
msg.thinking_duration_ms = matched_duration;
apply_phase_durations(&mut msg.thinking_phases, matched_phase_durations.map(Vec::as_slice));
```

### 5. Rust `ThinkingPhaseDto` — add `duration_ms`

**File:** `src-tauri/src/commands/agent/conversations.rs:82-91`

Add field:

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub duration_ms: Option<u64>,
```

Update both `From` impls (`ThinkingPhase → ThinkingPhaseDto` at line 189 and `ThinkingPhaseDto → ThinkingPhase` at line 240) to include `duration_ms`.

### 6. Frontend `ThinkingPhaseDto` — add `durationMs`

**File:** `apps/agent/src/lib/api/conversations.ts:46-50`

```typescript
export interface ThinkingPhaseDto {
  content: string;
  contentOffset?: number;
  ordinal?: number;
  durationMs?: number; // NEW
}
```

### 7. Frontend Zod schemas — add `durationMs` to ALL thinking phase schemas

**File:** `apps/agent/src/types/protocol/protocol.ts`

**CRITICAL:** Three separate schemas define thinking phase shapes. All three must be updated. With `.strict()` on the parent schemas and Zod's default strip-unknown behavior on nested objects, an unrecognized `durationMs` field would either drop the whole incoming event (strict parent) or silently strip the field (nested object).

**7a. Extract a shared schema** (replaces the existing `ThinkingPhaseSchema` at line 1477):

```typescript
const ThinkingPhaseSchema = z
  .object({
    content: z.string(),
    contentOffset: z.number().optional(),
    ordinal: z.number().optional(),
    durationMs: z.number().optional(), // NEW
  })
  .strict();
```

This is used by both `PersistedMessageSchema` (line 1506) and `ConversationRewoundSchema` (line 1573).

**7b. Update the outgoing `RewindConversationSchema.current_messages`** (line 312-344):

The inline thinkingPhases schema at line 321-329 is a SEPARATE definition that does NOT use `ThinkingPhaseSchema`. Replace the inline definition with the shared schema:

```typescript
current_messages: z
  .array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      parentUuid: z.string().nullish(),
      thinking: z.string().optional(),
      thinkingDurationMs: z.number().optional(),
      thinkingPhases: z.array(ThinkingPhaseSchema).optional(),  // CHANGED: use shared schema
      toolUses: z
        .array(/* ... existing ... */)
        .optional(),
    })
  )
  .optional(),
```

### 8. Frontend interrupt-time thinking block finalization

**File:** `apps/agent/src/services/chat/chat-message-service.ts` (new method on `ChatMessageService`)

**WHY THIS IS NEEDED:** During streaming, new thinking blocks are created at `chat-message-service.ts:1644-1652` WITHOUT `contentOffset` — the offset is only assigned when the phase is finalized at text/tool boundaries (`chat-message-service.ts:1359`, `:1569`) or completion (`:604`). If the user interrupts while thinking is active, the last block has no `contentOffset`.

On reload, `buildUnifiedSegments` at `message-utils.ts:154-167` routes no-offset, non-streaming blocks into `legacyBlocks` which are **prepended at the top** of the message. This causes a trailing interrupted thinking phase to appear above prior text/tool output — a visible ordering bug.

**Solution:** Add a `finalizeInterruptedMessage` method to `ChatMessageService` that the stop/reject paths call before persistence:

```typescript
/**
 * Finalize an interrupted message's active thinking block for persistence.
 *
 * During streaming, new thinking blocks are created without contentOffset
 * (assigned at text/tool boundaries or completion). Without finalization,
 * buildUnifiedSegments classifies no-offset non-streaming blocks as
 * "legacy" blocks and prepends them at the top — causing reordering.
 *
 * Also computes final durationMs from the private thinkingStartTimes map.
 */
finalizeInterruptedMessage(message: ChatMessage): ChatMessage {
  if (message.isThinkingActive !== true || !message.thinkingBlocks?.length) {
    return message;
  }

  const blocks = [...message.thinkingBlocks];
  const lastBlock = blocks[blocks.length - 1];
  if (!lastBlock) return message;

  const startTime = this.thinkingStartTimes.get(message.id);
  const finalDuration = startTime !== undefined ? Date.now() - startTime : lastBlock.durationMs;

  blocks[blocks.length - 1] = {
    ...lastBlock,
    // Assign contentOffset if missing — use current content length as the trailing position
    ...(lastBlock.contentOffset === undefined ? { contentOffset: message.content.length } : {}),
    // Compute final duration from the private timer
    durationMs: finalDuration,
  };

  // Clean up the timer
  this.thinkingStartTimes.delete(message.id);

  return {
    ...message,
    isThinkingActive: false,
    thinkingBlocks: blocks,
  };
}
```

### 9. Frontend shared serializer — `serializeThinkingBlocks`

**File:** Add to `apps/agent/src/lib/mappers/conversations.ts` (existing mapper file, consistent with codebase convention) and re-export from `apps/agent/src/lib/mappers/index.ts`

The `thinkingBlocks → thinkingPhases` mapping is currently duplicated across completion, interruption, and rewind paths — each with subtle differences. Extract a shared helper:

```typescript
import type { ThinkingBlock } from '@/components/chat/messages/types';
import type { ThinkingPhaseDto } from '@/lib/api/conversations';

export function serializeThinkingBlocks(blocks?: ThinkingBlock[]): ThinkingPhaseDto[] | undefined {
  if (!blocks || blocks.length === 0) return undefined;
  return blocks.map((block) => ({
    content: block.content,
    ...(block.contentOffset !== undefined ? { contentOffset: block.contentOffset } : {}),
    ...(block.ordinal !== undefined ? { ordinal: block.ordinal } : {}),
    ...(block.durationMs > 0 ? { durationMs: block.durationMs } : {}),
  }));
}
```

### 10. Frontend `mapPersistedMessage` — use per-phase durations

**File:** `apps/agent/src/services/chat/chat-message-service.ts:120-145`

First, update the function's inline parameter type to include `durationMs`:

```typescript
thinkingPhases?:
  | {
      content: string;
      contentOffset?: number | undefined;
      ordinal?: number | undefined;
      durationMs?: number | undefined;  // NEW
    }[]
  | undefined;
```

Then change from assigning total to last block only → use per-phase `durationMs` when available:

```typescript
const thinkingBlocks: ThinkingBlock[] | undefined =
  thinkingPhases.length > 0
    ? thinkingPhases.map((phase, index) => ({
        content: phase.content,
        durationMs:
          phase.durationMs ??
          (index === thinkingPhases.length - 1 ? (m.thinkingDurationMs ?? 0) : 0),
        contentOffset: phase.contentOffset,
        ordinal: phase.ordinal,
      }))
    : m.thinking
      ? [{ content: m.thinking, durationMs: m.thinkingDurationMs ?? 0 }]
      : undefined;
```

The fallback (`index === last ? legacy : 0`) preserves backward compat for old sessions without per-phase data. Note: the legacy `thinkingDurationMs` may overcount post-thinking time; per-phase `durationMs` is authoritative when available.

### 11. Frontend `handleAgentComplete` — include per-phase durations in persistence

**File:** `apps/agent/src/services/chat/chat-message-service.ts:674-694`

Use the shared serializer from Step 9:

```typescript
const thinkingPhasesDto = serializeThinkingBlocks(completedMsg.thinkingBlocks);

// In the conversationAddMessage call:
...(thinkingPhasesDto ? { thinkingPhases: thinkingPhasesDto } : {}),
```

### 12. Frontend interrupted persistence — finalize then serialize

**File:** `apps/agent/src/hooks/chat/handlers/chat-actions.ts`

Two callsites persist interrupted assistant messages. Both must finalize the active thinking block BEFORE serialization to ensure `contentOffset` is set. Import `chatMessageService` (the singleton) and the shared serializer.

**12a. Stop handler** (line 293-319):

```typescript
if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
  // Finalize active thinking block before persistence (sets contentOffset + final durationMs)
  const finalized = chatMessageService.finalizeInterruptedMessage(lastMsg);
  const interruptedMsg: ChatMessage = {
    ...finalized,
    isStreaming: false,
    isInterrupted: true,
  };

  if (interruptedMsg.content) {
    const thinkingPhasesDto = serializeThinkingBlocks(interruptedMsg.thinkingBlocks);
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
        ...(thinkingPhasesDto ? { thinkingPhases: thinkingPhasesDto } : {}),
        createdAt: Date.now(),
        ...(interruptedMsg.parentUuid !== undefined
          ? { parentUuid: interruptedMsg.parentUuid }
          : {}),
      },
      workspacePath ?? undefined,
      activeWorktreePath ?? undefined
    );
  }

  useChatStore.getState().updateMessage(sessionId, lastMsg.id, () => interruptedMsg);
}
```

**12b. Reject handler** (line 502-528): Same pattern — `finalizeInterruptedMessage` then `serializeThinkingBlocks`.

Note: `isInterrupted: true` in the payload is informational only for the sidecar. The Rust `add_message` at `lib.rs:817` does not persist interruption state — that comes from JSONL markers parsed at `lib.rs:1358`.

### 13. Frontend rewind builder — thread `durationMs` through `current_messages`

**File:** `apps/agent/src/hooks/chat/handlers/chat-actions.ts:404-412`

Use the shared serializer:

```typescript
const truncatedMessages = messages.slice(0, messageIndex + 1).map((m) => {
  const tools = /* ... existing ... */;
  const thinkingPhasesDto = serializeThinkingBlocks(m.thinkingBlocks);
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    parentUuid: m.parentUuid ?? null,
    ...(tools.length > 0 ? { toolUses: tools } : {}),
    ...(m.thinking ? { thinking: m.thinking } : {}),
    ...(m.thinkingDurationMs !== undefined
      ? { thinkingDurationMs: m.thinkingDurationMs }
      : {}),
    ...(thinkingPhasesDto ? { thinkingPhases: thinkingPhasesDto } : {}),
  };
});
```

### 14. Frontend `conversation-handlers.ts` — no code change needed

**File:** `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts`

`handleConversationLoad` at line 111-113 already passes `thinkingPhases: m.thinkingPhases` which preserves all fields from the DTO. The Zod schema fix (Step 7) ensures `durationMs` survives validation, and the DTO update (Step 6) ensures TypeScript recognizes the field.

---

## Files Modified (Summary)

| File                                                   | Change                                                                                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/common/conversations/src/lib.rs`               | Add `duration_ms` to `ThinkingPhase`, `phase_durations` to `MessageMetadata`, `apply_phase_durations` helper, persist/load logic with positional alignment |
| `src-tauri/src/commands/agent/conversations.rs`        | Add `duration_ms` to `ThinkingPhaseDto`, update `From` impls                                                                                               |
| `apps/agent/src/lib/api/conversations.ts`              | Add `durationMs` to `ThinkingPhaseDto`                                                                                                                     |
| `apps/agent/src/types/protocol/protocol.ts`            | Add `durationMs` to `ThinkingPhaseSchema`, replace inline schema in `RewindConversationSchema` with shared schema                                          |
| `apps/agent/src/lib/mappers/conversations.ts`          | Add `serializeThinkingBlocks` shared helper, re-export from `index.ts`                                                                                     |
| `apps/agent/src/services/chat/chat-message-service.ts` | Add `finalizeInterruptedMessage` method, update `mapPersistedMessage` inline type + hydration logic, use shared serializer in `handleAgentComplete`        |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`   | Finalize + serialize in both interrupt paths, use shared serializer in rewind builder                                                                      |

## Known Limitations

- **Positional array assumption:** `phase_durations` is a positional `Vec<u64>` aligned to `thinking_phases` by index. If the JSONL parser produces a different phase count than the frontend had during streaming (e.g., due to `absorb_assistant_message` merge differences), trailing phases will have no duration. The `durations.get(i)` lookup safely returns `None` for missing indices.
- **Partial writes from crash:** If the app crashes during streaming, `phase_durations` in the sidecar may have fewer entries than thinking phases. Bounds-checked and tested explicitly.
- **Old sessions:** Sessions without `phase_durations` in the sidecar gracefully fall back to legacy `thinkingDurationMs` on the last block.
- **Thinking-only interrupted messages:** If interrupted before any text content, the stop paths skip `conversationAddMessage` when `content` is empty. These turns cannot recover thinking phase data on reload. This is pre-existing behavior, not introduced by this change.
- **Fingerprint ambiguity:** Duplicate exact 128-byte thinking prefixes remain iteration-order dependent in the `HashMap` match. The new `phase_durations` field inherits this behavior. Documented and regression-tested.
- **Fingerprint is bytes, not chars:** `truncate_to_char_boundary` truncates to 128 bytes at a char boundary, not 128 characters. Plan text and comments should use "bytes" consistently. Non-ASCII test case required.

## Verification

### Rust tests (`cargo test -p orbit-conversations`)

| Test                                                      | What it verifies                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `test_thinking_phase_serialization_with_duration`         | `ThinkingPhase` round-trip with `duration_ms`                    |
| `test_load_merges_phase_durations_from_sidecar_direct_id` | Direct ID match applies phase durations                          |
| `test_load_merges_phase_durations_via_fingerprint`        | Fingerprint fallback also applies phase durations                |
| `test_load_skips_ambiguous_exact_prefix_phase_durations`  | Duplicate prefixes: decide behavior and test it                  |
| `test_load_handles_short_phase_duration_arrays`           | `phase_durations.len() < thinking_phases.len()` — bounds-checked |
| `test_fingerprint_non_ascii`                              | Non-ASCII thinking text with byte-truncated fingerprint          |

### Rust DTO tests (`cargo test -p orbit-tauri`)

| Test                                               | What it verifies                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `thinking_phase_dto_round_trip_preserves_duration` | Extend existing `thinking_phase_dto_round_trip_preserves_fields` at `conversations.rs:456` |

### Frontend tests (`bun run test`)

| Test                                                                         | What it verifies                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Existing `build-unified-segments` tests                                      | No regressions in ordering                                      |
| `mapPersistedMessage phase duration hydration`                               | Per-phase durationMs flows through to ThinkingBlock             |
| `mapPersistedMessage fallback for old sessions`                              | Legacy total-on-last-block when no per-phase data               |
| `interrupted assistant persistence includes thinkingPhases`                  | Stop/reject paths serialize durationMs                          |
| `interrupted trailing thinking after prior content reloads in correct order` | Finalized contentOffset prevents legacy-block misclassification |
| `second rewind preserves phase durations via frontend fallback`              | `current_messages` round-trip keeps durationMs                  |

### Manual tests

1. Start conversation with thinking enabled → get multi-phase response → verify durations shown → switch away → switch back → verify durations still shown
2. Interrupt a streaming response mid-thinking (after prior text/tool output) → switch away → switch back → verify thinking phase appears in correct position (not at top) and duration is preserved
3. Rewind to a message with thinking → verify durations survive → rewind again (second+ rewind uses frontend messages) → verify durations still survive
4. Load old session without `phase_durations` in sidecar → verify fallback to total-on-last-block behavior
