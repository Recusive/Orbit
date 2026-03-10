# Fix: Loader/Action Bar Flickering Between Tool-Use Turns

## Context

During multi-tool agent responses, the UI flickers between each tool execution. After every tool completes, the loader disappears and the action bar briefly shows (as if the turn is complete), then 1-3 seconds later new content starts streaming and the loader reappears. This happens because the Claude SDK sends a `result` message after **each tool-use round-trip** (not just at the very end), and each one maps to `agent:complete` in the frontend, which immediately clears `isAgentRunning` and sets `isStreaming = false`.

**Root cause chain:**

1. SDK yields multiple `result` messages per `sendMessage()` — one per tool-use API round-trip
2. Bridge emits `type: 'result'` for each → `tauri-provider.tsx:278-308` maps ALL to `agent:complete`
3. `handleAgentComplete()` (line 627) immediately sets `isAgentRunning = false` and `isStreaming = false` (line 518)
4. Loader gate: `isLoading = isAgentRunning` (`chat-messages.tsx:296`) → loader hides
5. Action bar gate: `isComplete && isLastInAssistantGroup` (`MessageItem.tsx:354`) → action bar shows
6. 1-3 seconds later, next turn's `tool:start` re-asserts `isAgentRunning = true` (line 1312) — but the UI already flickered

**Existing infrastructure (unused but ready):**

- `agentRunningTimers` Map — `chat-message-service.ts:136`
- `cancelAgentRunningTimer()` — `chat-message-service.ts:161-169`
- `turnHadTools` Map — `chat-message-service.ts:134`
- `handleToolStart` already calls `cancelAgentRunningTimer(sid)` — line 1236
- `handleAgentThinking` already calls `cancelAgentRunningTimer(sid)` — line 462
- Chunk/thinking batchers already re-assert `isAgentRunning = true` — lines 1312, 1525, 1604

---

## Fix — 5 changes

### 1. Delayed `isAgentRunning` clear in `handleAgentComplete()`

**File:** `apps/agent/src/services/chat/chat-message-service.ts`

First, add a helper to schedule the delayed clear. This encapsulates timer creation and tracks
the due timestamp (needed for safe session remap in Fix 3):

```typescript
/** Track when each delayed clear is due — needed by remapRunningState()
 *  to reschedule with correct remaining time after session remap. */
private agentRunningTimerDueAt = new Map<string, number>();

/** Schedule a delayed isAgentRunning clear for the given session.
 *  Cancels any existing timer first. The callback is bound to sessionId
 *  at creation time — if session IDs are remapped, remapRunningState()
 *  must cancel and reschedule with the new ID. */
private scheduleAgentRunningClear(sessionId: string, delayMs: number): void {
  this.cancelAgentRunningTimer(sessionId);
  const dueAt = Date.now() + delayMs;
  const timer = setTimeout(() => {
    this.agentRunningTimers.delete(sessionId);
    this.agentRunningTimerDueAt.delete(sessionId);
    useChatStore.getState().setAgentRunning(sessionId, false);
    useChatStore.getState().setStopPending(sessionId, false);
  }, delayMs);
  this.agentRunningTimers.set(sessionId, timer);
  this.agentRunningTimerDueAt.set(sessionId, dueAt);
}
```

Update `cancelAgentRunningTimer` to also clear the `dueAt` entry:

```typescript
private cancelAgentRunningTimer(sessionId: string): void {
  const timer = this.agentRunningTimers.get(sessionId);
  if (timer !== undefined) {
    clearTimeout(timer);
    this.agentRunningTimers.delete(sessionId);
    this.agentRunningTimerDueAt.delete(sessionId);
  }
}
```

Then in `handleAgentComplete()` (around line 625-627), replace the immediate clear:

```typescript
// BEFORE (line 624-628):
this.forceCompleteOrphanedTools(sid);
this.cancelAgentRunningTimer(sid);
this.turnHadTools.set(sid, false);
useChatStore.getState().setAgentRunning(sid, false);
useChatStore.getState().setStopPending(sid, false);

// AFTER:
this.forceCompleteOrphanedTools(sid);
this.cancelAgentRunningTimer(sid);
const hadTools = this.turnHadTools.get(sid) === true;
this.turnHadTools.set(sid, false);

if (hadTools) {
  // Delay clearing isAgentRunning — the SDK sends intermediate 'result'
  // messages between tool-use rounds, each triggering agent:complete.
  // If another turn starts within the timeout, cancelAgentRunningTimer()
  // (called by handleToolStart, handleAgentThinking, handleAgentChunk)
  // will prevent the delayed clear from firing.
  this.scheduleAgentRunningClear(sid, AGENT_RUNNING_CLEAR_DELAY_MS);
} else {
  // No tools used this turn — clear immediately (text-only responses)
  useChatStore.getState().setAgentRunning(sid, false);
  useChatStore.getState().setStopPending(sid, false);
}
```

**Why 1500ms:** Covers the typical 1-2 second gap between Claude processing tool results and starting a new response, while keeping the final-turn penalty short (action bar appears 1.5s after the agent's last tool-using turn). If a new turn starts, it cancels the timer via `cancelAgentRunningTimer`. If no new turn starts within 1.5s, the timer fires and clears normally.

**Why only when `hadTools`:** Text-only responses should clear immediately — no flickering risk since there are no tool-use round-trips.

**Why `setStopPending` is inside the delayed callback:** If the user presses stop during an intermediate turn, `isStopPending` should NOT clear until the turn is truly done. On intermediate completions, the bridge is still processing — clearing early causes the stop button to flash back to its default state before the stop takes effect.

**Already handled by existing code:**

- `handleToolStart` (line 1236): calls `cancelAgentRunningTimer(sid)` ✓
- `handleAgentThinking` (line 462): calls `cancelAgentRunningTimer(sid)` ✓
- `handleAgentChunk` (line 424): calls `cancelAgentRunningTimer(sid)` ✓
- `handleAgentError` (line 667): calls `cancelAgentRunningTimer(sid)` + deletes `turnHadTools(sid)` ✓
- `destroySession` (line 186-191): calls `cancelAgentRunningTimer(sid)` + deletes `turnHadTools(sid)` ✓
- Chunk batcher slow path (line 1525): calls `setAgentRunning(sid, true)` ✓

**Note:** The updated `cancelAgentRunningTimer` also clears `agentRunningTimerDueAt`, so existing callers (`handleAgentError`, `destroySession`) get the new cleanup for free.

**Also update `destroyAll()`** (line 193-206) — the full teardown clears all Maps for HMR cleanup but doesn't know about the new `agentRunningTimerDueAt` Map. Add one line:

```typescript
destroyAll(): void {
  // ... existing clears ...
  this.agentRunningTimers.clear();
  this.agentRunningTimerDueAt.clear();  // ← ADD THIS
  this.turnHadTools.clear();
}
```

### 1.1 Extract timeout constant

**File:** `apps/agent/src/lib/utils/constants.ts`

Add to the constants file:

```typescript
/** Delay before clearing isAgentRunning after a tool-using turn completes.
 *  Covers the typical 1-2s gap between Claude processing tool results.
 *  Kept short to minimize action bar delay on the final turn. */
export const AGENT_RUNNING_CLEAR_DELAY_MS = 1500;
```

### 2. Gate action bar on `isAgentRunning` for the current message

**Files:** `apps/agent/src/components/chat/messages/MessageItem.tsx`, `apps/agent/src/components/chat/chat-messages.tsx`, `apps/agent/src/components/chat/messages/types.ts`, `apps/agent/src/components/chat/messages/message-utils.ts`

The action bar currently shows whenever `isComplete && isLastInAssistantGroup` (line 354). During intermediate completions where `isStreaming` goes `false`, this briefly shows the action bar. Fix: hide the action bar for the message being actively generated while the agent is still running, but keep all previous turns' action bars visible.

**IMPORTANT:** We must NOT gate on `isLastAssistantMessage` — that prop identifies the most recent assistant message _globally_, not the one currently being generated. When the user sends a new message, `handleSend()` sets `isAgentRunning = true` immediately (`chat-actions.ts:172`), but the previous assistant is still `isLastAssistantMessage = true` until a new assistant message arrives. Using it in the gate would incorrectly hide the previous turn's action bar during that gap.

Instead, use `isLastMessage` — whether the message is the very last in the array (regardless of role). After user sends, the user message is last, so no assistant has `isLastMessage = true` and all previous action bars stay visible.

**chat-messages.tsx** — compute and pass `isLastMessage`:

```typescript
// In the messages.map() render (around line 449):
const isLastMsg = msg.id === messages[messages.length - 1]?.id;

<MessageItem
  ...
  isLastMessage={isLastMsg}
  ...
/>
```

**types.ts** — add prop to `MessageItemProps`:

```typescript
/** Whether this is the very last message in the array (any role).
 *  Used to gate the action bar — only the actively-generating message
 *  should be hidden while the agent is running. */
readonly isLastMessage: boolean;
```

**message-utils.ts** — add to `arePropsEqual`:

```typescript
if (prev.isLastMessage !== next.isLastMessage) return false;
```

**MessageItem.tsx** — use `isLastMessage` in the gate:

```typescript
// BEFORE (line 354):
{isComplete && isLastInAssistantGroup ? (

// AFTER:
{isComplete && isLastInAssistantGroup && !(isAgentRunning && isLastMessage) ? (
```

**Logic:**

- Previous turns' action bars (after user sends): `isLastMessage = false` (user msg is last) → `!(true && false)` = `true` → SHOWS ✓
- Current assistant during intermediate gap (with Fix 1): `isAgentRunning = true`, `isLastMessage = true` → `!(true && true)` = `false` → HIDDEN ✓
- Current turn after final completion: `isAgentRunning = false` → `!(false && true)` = `true` → SHOWS ✓
- User message at end: `isLastMessage = true` but `msg.role === 'user'` → user messages don't render the action bar block at all → N/A

### 3. Remap timer/map state on session remap

**File:** `apps/agent/src/services/chat/chat-message-service.ts`

`handleSystemInit()` remaps session IDs in `ChatStore`, `ToolStore`, `CheckpointStore`, and `UIStore` — but does NOT remap `ChatMessageService`'s own `agentRunningTimers` and `turnHadTools` Maps. If a delayed timer fires on the old session ID, `setAgentRunning(oldSid, false)` will auto-create a ghost session entry in ChatStore (since `setAgentRunning` creates missing sessions). Meanwhile, the new session ID has no timer, so `isAgentRunning` never clears.

Add a remap method and call it from `handleSystemInit`:

```typescript
/** Migrate service-owned timer and state maps from old to new session ID.
 *  Called during system:init session remap to prevent orphaned timers.
 *
 *  IMPORTANT: Cannot simply re-key timer map entries — setTimeout callbacks
 *  close over the session ID at creation time. Re-keying the map doesn't
 *  rewrite the closure, so the callback would still call
 *  setAgentRunning(oldSid, false) and create a ghost session.
 *  Instead: cancel old timer, schedule fresh one bound to newSid. */
private remapRunningState(oldSid: string, newSid: string): void {
  // Migrate turnHadTools (simple value, no closure concern)
  const hadTools = this.turnHadTools.get(oldSid);
  if (hadTools !== undefined) {
    this.turnHadTools.delete(oldSid);
    this.turnHadTools.set(newSid, hadTools);
  }

  // Migrate delayed running-clear timer: cancel old, reschedule with newSid
  const oldDueAt = this.agentRunningTimerDueAt.get(oldSid);
  this.cancelAgentRunningTimer(oldSid); // cancel closure-bound-to-oldSid timer

  if (oldDueAt !== undefined) {
    const remaining = Math.max(0, oldDueAt - Date.now());
    this.scheduleAgentRunningClear(newSid, remaining);
  }
}
```

Call in `handleSystemInit()` remap branch (after store remaps, around line 361):

```typescript
// Migrate service-owned in-flight state (timers, tool flags)
this.remapRunningState(frontendSessionId, sdkSessionId);
```

### 4. Defensive timer cancel in `handlePermissionRequest`

**File:** `apps/agent/src/services/chat/chat-message-service.ts`

`handlePermissionRequest` does not currently cancel pending running-clear timers. If listener ordering changes (permission event arriving before `tool:start`), a pending timer could fire and clear `isAgentRunning` early. Add defensive hardening:

```typescript
private handlePermissionRequest(
  message: Extract<ExtensionMessage, { type: 'permission:request' }>
): void {
  this.cancelAgentRunningTimer(message.session_id);  // ← ADD THIS
  this.chunkBatchers.get(message.session_id)?.cancel(FLUSH_PENDING);
  // ... existing code
}
```

### 5. Fix the incorrect comment and align subtype documentation

**File:** `apps/agent/src/services/chat/chat-message-service.ts` (lines 614-623)

Replace the misleading comment that says "exactly ONE result message per sendMessage()":

```typescript
// The SDK sends a 'result' message after each tool-use round-trip within
// a single sendMessage() call — NOT just once at the end. In a multi-tool
// response, there are N intermediate results (one per tool round) plus
// one final result. handleToolStart/handleAgentThinking cancel the delayed
// isAgentRunning timer, preventing premature UI completion signals.
//
// result_subtype is the SDK's SDKResultMessage.subtype — values need
// verification with real multi-tool runs. Known values from SDK source:
//   "success"                              → normal completion
//   "error_max_turns" / "error_during_execution" / etc. → error completion
// Intermediate results may carry a different subtype (e.g., "tool_use")
// — validate before using for deterministic clear logic.
logger.debug('agent:complete', { sessionId: sid, subtype: message.result_subtype, hadTools });
```

The `logger.debug` call is dev-only (gated by `DEBUG=1` at runtime). It stays in the final code as a permanent diagnostic line — zero cost in production, critical for debugging timer/subtype issues during development.

Also align the comment in `protocol.ts:1063-1065` to match. The current comment incorrectly says `"end_turn"` is a subtype — that's the Anthropic API `stop_reason`, not the SDK result subtype.

---

## Pre-Implementation Validation: `result_subtype` semantics

**Before implementing**, run a real multi-tool session and log the `result_subtype` on every `agent:complete` event. If intermediate results carry a distinguishable subtype (e.g., `"tool_use"` on intermediate, `"success"` on final), we can use deterministic branching instead of (or in addition to) the timer:

```typescript
// Pseudocode — only if subtype validation confirms distinct values:
const subtype = message.result_subtype;

if (subtype === 'tool_use') {
  // Deterministic intermediate — delay clear
  this.scheduleAgentRunningClear(sid, AGENT_RUNNING_CLEAR_DELAY_MS);
} else if (subtype === 'success') {
  // Deterministic final — clear immediately
  useChatStore.getState().setAgentRunning(sid, false);
  useChatStore.getState().setStopPending(sid, false);
} else {
  // Unknown/undefined/legacy — fall back to hadTools heuristic
  if (hadTools) this.scheduleAgentRunningClear(sid, AGENT_RUNNING_CLEAR_DELAY_MS);
  else {
    useChatStore.getState().setAgentRunning(sid, false);
    useChatStore.getState().setStopPending(sid, false);
  }
}
```

**Note:** `end_turn` is the Anthropic API `stop_reason`, NOT the SDK result subtype. Do not include it in subtype branches unless real event logging confirms the SDK forwards it.

If subtype-driven branching works, it eliminates the 1.5s final-turn delay entirely. Keep the timer as fallback for unknown or undefined subtypes.

---

## Performance Benefit

This fix actually **reduces** re-renders compared to the current behavior. Before the fix, `isAgentRunning` toggles `false→true→false` per intermediate turn, causing 2N re-renders across all MessageItem components (via the `arePropsEqual` memo comparison). After the fix, `isAgentRunning` stays `true` throughout multi-tool responses and transitions to `false` once at the end — a single re-render. For a 5-tool response, this eliminates ~8 unnecessary full-list re-renders.

## Files to modify

| File                                                       | Change                                                                                                                                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/services/chat/chat-message-service.ts`     | Delayed `isAgentRunning` clear in `handleAgentComplete()`, move `setStopPending` into delayed callback, `remapRunningState()` for session remap, `cancelAgentRunningTimer` in `handlePermissionRequest`, fix comment |
| `apps/agent/src/components/chat/messages/MessageItem.tsx`  | Gate action bar on `!(isAgentRunning && isLastMessage)`                                                                                                                                                              |
| `apps/agent/src/components/chat/chat-messages.tsx`         | Compute and pass `isLastMessage` prop                                                                                                                                                                                |
| `apps/agent/src/components/chat/messages/types.ts`         | Add `isLastMessage: boolean` to `MessageItemProps`                                                                                                                                                                   |
| `apps/agent/src/components/chat/messages/message-utils.ts` | Add `isLastMessage` to `arePropsEqual` comparison                                                                                                                                                                    |
| `apps/agent/src/lib/utils/constants.ts`                    | Add `AGENT_RUNNING_CLEAR_DELAY_MS = 1500` constant                                                                                                                                                                   |
| `apps/agent/src/types/protocol/protocol.ts`                | Fix `result_subtype` comment (align with SDK subtype, not API stop_reason)                                                                                                                                           |

## What NOT to change

- **No bridge changes** — frontend-only fix using existing timer infrastructure
- **No `isStreaming` delay** — `isStreaming = false` is correct for intermediate messages (their content IS complete)
- **No changes to loader gate in `chat-messages.tsx`** — `isLoading = isAgentRunning` works correctly with delayed clear (only adding `isLastMessage` prop computation)
- **No changes to `tool-store.ts`** — tool completion handling is fine
- **No changes to `handleToolEnd`** — it correctly doesn't modify streaming state
- **No changes to `handleToolStart`'s `cancelAgentRunningTimer` call** — it already cancels the timer
- **No changes to `handleAgentChunk`'s `cancelAgentRunningTimer` call** — it already cancels the timer (line 424)

## Edge Cases

- **Text-only responses (no tools):** `hadTools = false` → immediate clear, no delay. No behavior change.
- **Single-tool responses:** Delayed clear fires after 1.5s, but `handleToolStart` for the next round cancels it first if another round starts. If it's the final round, the 1.5s delay is the cost.
- **Interrupted turns (`agent:stop`):** `handleAgentError` calls `cancelAgentRunningTimer(sid)` and immediately clears `isAgentRunning`. Session destroy also cancels timers. If the bridge sends `agent:complete` (not `agent:error`) for a stopped session, verify the timer is cancelled — if `agent:complete` arrives, the timer restarts instead of clearing immediately. Trace the `agent:stop` → bridge → error/complete path.
- **Session switch during delay:** Timer fires, calls `setAgentRunning(sid, false)` on the old session. Harmless — the session still exists in the store. Session remap is now handled by Fix 3 (`remapRunningState`) which cancels the old closure-bound timer and schedules a fresh one bound to the new session ID with the remaining time.
- **Very slow Claude responses (>1.5s between tool rounds):** Timer fires, `isAgentRunning` briefly goes false (loader flickers once), then re-asserts on next event. This is an edge case — 1.5s covers 90%+ of inter-turn gaps.
- **Queued messages:** If queued message sending depends on `isAgentRunning === false`, there's a 1.5s delay before queued messages are sent after the final tool-using turn. May feel slightly sluggish. Acceptable trade-off vs flickering.
- **Two `agent:complete` events in the same microtask:** `cancelAgentRunningTimer` runs synchronously before setting the new timer, so the second call cancels the first timer and sets a new one. Correct behavior.
- **`setStopPending` on intermediate completions:** Moved into the delayed callback. If the user presses stop during an intermediate turn, `isStopPending` stays true until the timer fires or the bridge sends `agent:error`. No more stop button flashing.
- **User sends new message — previous action bar visibility:** After `handleSend()` sets `isAgentRunning = true`, all previous action bars should remain visible. The `isLastMessage` gate (Fix 2) ensures this: the last message is the user message, so no assistant has `isLastMessage = true`, and the gate evaluates to `true` for all previous assistants. This was a correctness gap in the original `isLastAssistantMessage` approach.
- **`permission:request` before `tool:start`:** If event ordering changes and a permission request arrives before `tool:start`, the pending timer could fire and clear `isAgentRunning`. Fix 4 adds defensive `cancelAgentRunningTimer` in `handlePermissionRequest`.
- **Unknown `result_subtype` values:** If the pre-implementation validation reveals unexpected subtype values, the `hadTools` heuristic provides a safe fallback. The timer approach is always correct (just slower on final turn).
- **SDK subtype drift across versions/models:** The `result_subtype` values are not part of a stable public contract — future SDK versions or new models could change them. Mitigation: the subtype branch is optional (gated behind pre-implementation validation). If enabled, the `else` fallback (`hadTools` heuristic) covers any unknown or new subtypes automatically. If subtype-driven branching is NOT implemented (validation shows ambiguous values), the plan works entirely without it. Pin the validated subtype values in a code comment with the SDK version that was tested, so future upgrades know to re-validate.
- **Queued message dispatch delay:** `use-queued-message.ts:37` dispatches queued messages via `useEffect` when `isAgentRunning` transitions to `false`. With the 1.5s delay on the final tool-using turn, queued messages wait an extra 1.5s before sending. This is perceptible but acceptable — the user already waited through the entire multi-tool response, and 1.5s is well below the "broken" threshold. If subtype-driven branching is implemented (Clear immediately on `subtype === 'success'`), the delay drops to zero for final turns. For long interactions with many queued messages, the cumulative effect is per-message (each queue dispatch is independent), not compounding.
- **Near-simultaneous remap + stop/interrupt burst:** Three events can arrive in rapid succession: (1) user presses stop → `handleAgentError` fires, cancels timer, clears `isAgentRunning`; (2) bridge also sends `agent:complete` → `handleAgentComplete` fires, may schedule a NEW timer; (3) `system:init` remap arrives → `remapRunningState` cancels and reschedules. The concern is ordering: if `agent:complete` arrives AFTER `handleAgentError` already cleared everything, it re-asserts a delayed timer on a session that should be done. Mitigation: `handleAgentError` deletes `turnHadTools(sid)` entirely (line 668), so a subsequent `handleAgentComplete` sees `hadTools = false` and clears immediately (no delayed timer). The remap path is safe because `remapRunningState` only reschedules if `agentRunningTimerDueAt` has an entry — and `cancelAgentRunningTimer` in `handleAgentError` deletes that entry. Net: the error path's cleanup is authoritative and prevents stale timers from being remapped. Verify this specific sequence in the stop/remap verification step (step 7 + 10).

## Verification

### Pre-implementation

0. **Validate `result_subtype`:** Add `logger.debug('agent:complete subtype', { sessionId: sid, subtype: message.result_subtype })` in `handleAgentComplete` and run a multi-tool session with `DEBUG=1`. Log the subtype for each `agent:complete` event. If intermediate vs final subtypes are distinguishable, implement subtype-driven branching before the timer fallback. **Keep this log line in the final code as `logger.debug`** — it only appears when `DEBUG=1` is set, costs nothing in production, and is invaluable for diagnosing future timer race issues.

### Post-implementation

1. `bun run check` — typecheck + lint + tests pass
2. `bunx tauri dev` — run the app
3. Send a message that triggers multiple tools (e.g., "read these 3 files and summarize them")
4. Verify: loader stays visible between tools, action bar only shows after final completion
5. Send a simple text-only message — verify action bar shows immediately (no 1.5s delay)
6. Test with thinking enabled — verify thinking box + tools don't flicker
7. Test stop/interrupt during multi-tool turn — verify loader clears properly
8. Test queued message — verify it sends after the 1.5s delay on the final turn
9. **Previous turn action bar:** Send a message, wait for response, send another. Verify the previous turn's action bar (copy/rewind) stays visible during the gap between user send and first assistant chunk
10. **Session remap:** Trigger a rewind (which causes session remap via `forkSessionAt` → `system:init`). Verify the timer migrates correctly and `isAgentRunning` clears after the new session's response completes
11. Add targeted tests:
    - `apps/agent/src/__tests__/services/chat/agent-running-timer.test.ts` — unit tests with `vi.useFakeTimers()` for delayed-clear scheduling, cancellation on tool:start/thinking/chunk, remap with remaining time, and stop-pending lifecycle
    - `apps/agent/src/__tests__/components/chat/messages/message-item-action-bar.test.tsx` — render tests for action bar visibility: hidden during intermediate gaps (`isAgentRunning && isLastMessage`), visible on previous turns after user send, visible after final completion

## Future Improvements

- **Bridge-level signal for final vs intermediate result:** The bridge could inspect `result_subtype` or track the SDK's `sendMessage()` completion to emit `agent:complete:final` vs `agent:complete:intermediate`. This would eliminate the timer entirely — no false negatives, no 1.5s delay on the final turn. Requires bridge changes (explicitly avoided in this point fix).
- **Stress test scenario:** Add a multi-tool flickering test in the stress test framework for regression testing.
