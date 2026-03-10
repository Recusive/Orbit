# Fix: Interrupted Tool Uses Invisible After Conversation Reload

> **Audit**: `reviews/audit-plan.md` — Incorporated all critical feedback (Feb 26, 2026)

## Context

When a user asks Claude to use a tool (e.g., AskUserQuestion), then **rejects/denies** the tool, the conversation loads correctly in Claude Code TUI but renders as a **completely empty div** in Orbit on relaunch. The JSONL file and Claude Code show the interrupted state correctly — Orbit doesn't.

**Repro session**: `f275658a-aeb4-4990-acf7-252b098e4deb` (orbit-marketing project)

## Root Cause Analysis

### Bug 1: Rust merge across interrupt boundaries

**File**: `crates/common/conversations/src/lib.rs`

The JSONL for this session has:

```
Line 5:  user → "using the ask tools..."
Line 6:  assistant → thinking block
Line 7:  assistant → tool_use: ToolSearch
Line 8:  user → tool_result (ToolSearch, success)         ← CONSUMED by extract_tool_results
Line 9:  assistant → tool_use: AskUserQuestion
Line 10: user → tool_result (AskUserQuestion, is_error)   ← CONSUMED by extract_tool_results
Line 11: user → "[Request interrupted by user]"            ← CONSUMED by interrupt handler
Line 15: assistant → "No response requested."
```

`process_user_line()` consumes tool_result-only messages and interrupt markers **without** pushing anything to `raw_messages`. After parsing, `raw_messages` contains:

```
[user, assistant(6), assistant(7), assistant(9), assistant(15), user(16), assistant(17), assistant(18)]
```

Lines 6, 7, 9, **and 15** are all consecutive assistants → `merge_consecutive_assistants()` absorbs them all into ONE message with:

- thinking (from line 6) ✓
- ToolSearch + AskUserQuestion tools ✓
- content: **"No response requested."** (from line 15)
- is_interrupted: true ✓

### Bug 2: Frontend `hasVisibleContent` filter is too aggressive

**File**: `apps/agent/src/components/chat/messages/message-utils.ts:295`

```typescript
// Checks BEFORE thinking/tools/interrupted:
if (message.content.trim() === 'No response requested.') return false; // ← hides everything!
```

The merged message's text content is "No response requested." → function returns false → `MessageItem` returns null → empty `<div class="mb-3"></div>`.

## Fix (Revised per audit)

### Fix 1: Rust — Interrupt-only merge boundary (parser-internal)

**File**: `crates/common/conversations/src/lib.rs`

**Key design decision**: Only interrupt markers create merge boundaries — NOT generic `tool_result` lines. Normal tool flows (`assistant(tool_use)` → `user(tool_result)` → `assistant(continuation)`) MUST continue to merge. Existing tests at `:2387` and `:3141` validate this behavior.

**Implementation** (boundary state stays internal to parsing, never touches `Message` DTO):

1. Add `pending_interrupt_boundary: bool` to `ParseContext` (line 1230)
2. Add `turn_start_ids: HashSet<String>` to `ParseContext`
3. In `process_user_line` (line 1287), when consuming interrupt marker ONLY:
   - Set `self.pending_interrupt_boundary = true`
   - (Do NOT set boundary for generic `tool_result` — line 1277 is unchanged)
4. In `process_assistant_line` (line 1318):
   - If `self.pending_interrupt_boundary` is true, add the assistant's UUID to `self.turn_start_ids`
   - Reset `self.pending_interrupt_boundary = false`
5. Change `merge_consecutive_assistants` signature: `fn merge_consecutive_assistants(raw: Vec<Message>, turn_starts: &HashSet<String>) -> Vec<Message>`
6. In merge loop: before absorbing, check `!turn_starts.contains(&msg.id)`
7. In `finalize()`, pass `turn_start_ids` through to the merge call

After this fix, the messages become:

```
[user, merged_assistant(6+7+9, interrupted), assistant(15, boundary), user(16), merged_assistant(17+18)]
```

The "No response requested." message is now standalone and correctly hidden by `hasVisibleContent`. The interrupted assistant with tools renders correctly. Normal tool-result continuations still merge.

### Fix 2: Frontend — Check "No response requested." after thinking/tools/interrupted

**File**: `apps/agent/src/components/chat/messages/message-utils.ts:276-303`

Move the `'No response requested.'` check to only trigger when the message has no other visible content:

```typescript
export function hasVisibleContent(message, segments, isComplete): boolean {
  // User message checks (unchanged)...

  const hasThinking = ...;
  const hasSegments = segments.length > 0;

  // Messages with thinking, tools, or interrupted status are always visible
  if (hasThinking || hasSegments || Boolean(message.isInterrupted)) return true;

  // Only THEN filter SDK placeholder (when there's no other content)
  if (message.content.trim() === 'No response requested.') return false;

  return isComplete;
}
```

Defense-in-depth — messages with tools/thinking/interrupted status are never accidentally hidden.

## Files to Modify

| File                                                       | Change                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `crates/common/conversations/src/lib.rs`                   | Add `pending_interrupt_boundary` + `turn_start_ids` to ParseContext, pass to merge |
| `apps/agent/src/components/chat/messages/message-utils.ts` | Reorder `hasVisibleContent` checks                                                 |

**Not modified** (audit concern resolved): `Message` struct and `src-tauri/src/commands/agent/conversations.rs` DTO conversion are untouched — boundary state is parser-internal.

## Verification

1. **Rust unit test (fix)**: JSONL with: user → assistant(tool_use) → user(tool_result, is_error) → user(interrupt) → assistant("No response requested."). Assert TWO separate assistant messages.

2. **Rust unit test (regression)**: JSONL with: user → assistant(tool_use) → user(tool_result, success) → assistant(continuation text). Assert ONE merged assistant message (normal tool flow preserved).

3. **Frontend unit test**: `hasVisibleContent` returns `true` for message with `content: "No response requested."` + `isInterrupted: true` + thinking blocks. Returns `false` for pure placeholder.

4. **Manual E2E**: Load session `f275658a-aeb4-4990-acf7-252b098e4deb` in Orbit — the ask tool message should render with ThinkingBox, ToolSearch widget, AskUserQuestion widget (error), InterruptIndicator.

5. **Run tests**:
   ```bash
   cargo test -p orbit-conversations    # Rust tests (including new + existing)
   bun run test                          # Frontend tests
   bun run check                         # Full typecheck + lint
   ```
