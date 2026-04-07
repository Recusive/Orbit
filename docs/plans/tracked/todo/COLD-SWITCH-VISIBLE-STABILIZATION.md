# Plan: Cold Switch Readiness Pipeline Optimization

## What The Current Logs Prove

**Fixed or improved:**

- Hidden timeout / tail-sentinel positioning stalls: zero `hidden_timeout` aborts in recent logs. Short sessions like `/login` (2 msgs) complete in ~91ms first visit.
- Warm revisits: 30-50ms with `cache-match-instant` firing consistently. Store-level switch cost is 0-2ms.

**Still slow — cold switches:**

- Switch #1 (26 msgs): 2347ms — `slow-path`, two hidden-phase restarts, row collapse from 27→3
- Switch #3 (19 msgs): 961ms — hidden-ready at 30ms, then visible-phase collapse to `rows=2 tail=false`, visible-ready at 958ms
- Multiple others: 359-447ms even for 2-8 message sessions

**Two distinct bottleneck classes remain:**

### Bottleneck A: Hidden-phase verification restart (Switch #1 pattern)

```
273ms  hidden-start     26 msgs
274ms  stabilizing      rows=27 tail=true     ← All rows rendered, stabilizing started
694ms  hidden-start     26 msgs               ← FULL RESTART — 420ms wasted
695ms  stabilizing      rows=27 tail=true
1939ms stabilizing      rows=3 tail=false     ← Row collapse within hidden phase
2327ms hidden-ready     stable · 26 msgs
```

The critical observation: `hidden-start 26 msgs` appears TWICE. Messages were already populated at 273ms. The restart at 694ms is NOT caused by empty messages arriving from slow-path. Something else changed the `verificationKey` between 274ms and 694ms.

`verificationKey` is computed at `SessionInstance.tsx:170-172`:

```typescript
const verificationKey =
  verificationPhase !== null && readinessSignature !== null
    ? `${String(verificationRequestId ?? 0)}:${verificationPhase}:${readinessSignature}`
    : null;
```

`readinessSignature` is computed at `session-switch-store.ts:142-146`:

```typescript
return [
  String(session.layoutVersion),
  String(session.messages.length),
  session.messages.at(-1)?.id ?? '',
].join(':');
```

If `layoutVersion` increments (the only mutable field when messages stay the same), the signature changes → `verificationKey` changes → `useEffect` at `chat-messages.tsx:1900` detects key change → full state reset at lines 1928-1973 → verification restarts.

`layoutVersion` is ONLY incremented by `setMessages()` at `chat-store.ts:399`. **The root cause of the restart is an unknown second `setMessages()` call between 273ms and 694ms.** Phase 0 instrumentation must identify who calls it and why.

**Hypotheses to test with instrumentation:**

1. A second `hydrateConversationSnapshot()` call that fails the `isLayoutEquivalent` check (e.g., `hydrationState` not yet `'hydrated'` when the check runs)
2. The usage restore path at `use-chat-messages.ts:206-260` indirectly triggering a message update
3. A `conversation:loaded` event arriving after the initial hydration and calling `setMessages()` again
4. Some other store update that triggers a re-render with a changed `readinessSignature` input

### Bottleneck B: Visible-phase overscan collapse (Switch #3 pattern)

```
30ms   hidden-ready     stable · 19 msgs
31ms   promote          → visible
142ms  visible-start    19 msgs
236ms  stabilizing      rows=2 tail=false     ← Collapsed from ~20 rows to 2
958ms  visible-ready    stable · 19 msgs
```

Root cause confirmed by code analysis: the overscan ternary at `chat-messages.tsx:821` evaluates to `'entry'` (800px) during visible-phase verification because `setIsReadyForSteady(false)` at line 1973 resets the flag during phase transition. See Phase 2 for the fix.

---

## Phase 0: Instrumentation (before any code fix)

### Why

The audit correctly identified that the plan lacks proof of which gate causes hidden-phase backtracking. Hidden stabilization at `chat-messages.tsx:1383-1446` has 6 distinct backtrack paths. Without branch-specific traces, fixes are guesswork. The Switch #1 restart cause is still unproven.

### Location 1: Hidden stabilization backtracks (`chat-messages.tsx:1399-1431`)

Add a `markSwitchTimeline` call at EACH backtrack branch with the specific gate name:

| Line | Gate                              | Trace string                                                    |
| ---- | --------------------------------- | --------------------------------------------------------------- |
| 1399 | `!tailSentinelRendered`           | `hidden-backtrack:tail-sentinel-lost rows=N`                    |
| 1411 | `isHiddenPlaceholderShortSurface` | `hidden-backtrack:placeholder-short rows=N scrollH=X clientH=Y` |
| 1418 | `!hasObservedPostProbeSurface`    | `hidden-backtrack:no-post-probe-surface`                        |
| 1425 | `!isAtBottom`                     | `hidden-backtrack:not-at-bottom scrollTop=X bottomTop=Y`        |
| 1433 | `layoutPendingCount > 0`          | `hidden-backtrack:layout-pending count=N`                       |
| 1440 | snapshot changed                  | `hidden-backtrack:snapshot-changed`                             |

### Location 2: Verification key change detection (`chat-messages.tsx:1907-1910`)

The `useEffect` at line 1900 fires when `effectiveVerificationKey` or `effectiveVerificationPhase` changes. Add a trace BEFORE the reset:

```typescript
// At line 1914 (before the reset block):
markSwitchTimeline(
  'verification-key-change',
  [
    `prev-key=${previousVerificationKeyRef.current}`,
    `next-key=${effectiveVerificationKey}`,
    `prev-phase=${previousVerificationPhaseRef.current}`,
    `next-phase=${effectiveVerificationPhase}`,
    `msgs=${messages.length}`,
    `layoutVersion=${useChatStore.getState().sessions[sessionId ?? '']?.layoutVersion ?? 0}`,
  ].join(' ')
);
```

This will prove whether the restart is caused by a `layoutVersion` bump (readinessSignature changed) or a phase/requestId change.

### Location 3: `setMessages` call tracking (at callers, NOT in chat-store.ts)

`chat-store.ts` cannot import `markSwitchTimeline` — the trace layer already imports `useChatStore`, so this would create a circular dependency.

Instead, add the trace at the three callers that invoke `setMessages` during a pending switch:

| Caller                        | File                                   | Where                                                                                           |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `hydrateConversationSnapshot` | `hydrate-conversation-snapshot.ts:274` | Before `chatStore.setMessages()` — log `setMessages:hydrate session=X msgs=N isLayoutEquiv=Y`   |
| `handleConversationLoaded`    | `chat-message-service.ts`              | Before any `setMessages` in the loaded handler — log `setMessages:conv-loaded session=X msgs=N` |
| `claude-ui-bridge.select`     | `claude-ui-bridge.ts:154`              | Before the empty-session `setMessages` call — log `setMessages:bridge-empty session=X`          |

Each trace should include the session ID (last 6 chars), message count, and the current `layoutVersion` from `useChatStore.getState().sessions[id]?.layoutVersion`. This proves which caller triggers the `layoutVersion` bump that causes the verification restart.

### Location 4: Readiness timeout state dump (`chat-messages.tsx:1211`)

Capture full gate state on timeout:

```typescript
{
  restorePhase, verificationPhase, renderedRowCount: rendered.length,
  totalRowCount: renderRows.length, sentinelInRenderRange, tailSentinelInDOM,
  isAtBottom, layoutPendingCount, overscanPhase, overscan,
  hasAttemptedTailProbe, isReadyForSteady, isPremeasuring, hasUserScrolled,
  scrollHeight, clientHeight, restoredSizeCache, visiblePreseedPending,
}
```

### Location 5: Overscan phase transitions (`chat-messages.tsx:832-841`)

When `overscanPhase` changes from previous value, log which ternary branch was taken:

```typescript
markSwitchTimeline(
  'overscan-change',
  `${prev} → ${overscanPhase} (${overscan}px) phase=${effectiveVerificationPhase} ready=${isReadyForSteady} premeasure=${isPremeasuring} scroll=${hasUserScrolled}`
);
```

### Verify instrumentation

Run `bunx tauri dev`, switch to the 26-message session. The trace should show:

- Exactly what caused each `hidden-backtrack` (gate name + metrics)
- Whether a `verification-key-change` occurred and what the old/new keys were
- Whether a `setMessages-called` trace fired between the two `hidden-start` events
- The overscan value at each phase transition

---

## Phase 1: Fix hidden-phase verification restart (data-driven)

### Status: Blocked on Phase 0 data

The root cause of the Switch #1 hidden-phase restart (273ms → 694ms, 420ms wasted) is not yet proven. Phase 0 instrumentation will reveal which of these hypotheses is correct:

**Hypothesis A — Redundant `setMessages` bumps `layoutVersion`:**
If Phase 0 shows `setMessages-called` between the two `hidden-start` events, the fix is to prevent the redundant call. Likely targets:

- `hydrateConversationSnapshot` at line 271-274: the `isLayoutEquivalent` check may fail on initial load because `hydrationState` starts as `'unloaded'` (line 181 in `chat-store.ts`), not `'hydrated'`
- Fix: in `hydrateConversationSnapshot`, also check message identity directly (not just hydration state) before calling `setMessages`

**Hypothesis B — Phase/requestId change from coordinator:**
If Phase 0 shows `verification-key-change` with a different `requestId` or `phase` but identical `readinessSignature`, the restart is triggered by the coordinator (e.g., a timing race in `promotePendingToVisibleVerification`). Fix would be in the coordinator.

**Hypothesis C — ResizeObserver resets during stabilization:**
If Phase 0 shows `hidden-backtrack:snapshot-changed` repeatedly, the 48ms stability window (`HIDDEN_READY_STABLE_MS`) is resetting because Virtuoso keeps resizing rows. Fix would be to increase the tolerance or debounce more aggressively.

**Hypothesis D — Row collapse at 1939ms (rows=27 → rows=3):**
If Phase 0 shows `hidden-backtrack:tail-sentinel-lost` at ~1939ms, the row collapse is caused by a Virtuoso overscan re-evaluation after the probe. This may overlap with the overscan issue in Phase 2.

### Verify

After Phase 0 data identifies the cause, the fix should eliminate the second `hidden-start` event. Switch #1 should show a single continuous hidden verification pass.

---

## Phase 2: Fix visible-phase overscan collapse after promotion

### Root cause (confirmed by code trace)

The overscan ternary at `chat-messages.tsx:814-823`:

```typescript
: isPremeasuring || isReadyForSteady || hasUserScrolled   // line 819 — all false after reset
  ? 'steady'                                                // line 820
  : isVerifying                                             // line 821 — true during visible verification
    ? 'entry'                                               // ← BUG: 800px, should be 8000px
    : 'steady'
```

When `effectiveVerificationPhase` transitions to `'visible'`, the `useEffect` at line 1900 resets `isReadyForSteady` to false (line 1973). Line 819 fails. Line 821 matches → overscan = 800px → Virtuoso renders 2-3 rows → preseed snapshot can't match → visible stabilization loops.

### The fix

**File**: `apps/agent/src/components/chat/chat-messages.tsx:821`

```typescript
// Before (line 821):
: isVerifying ? 'entry' : 'steady'

// After:
: isVerifying
  ? (effectiveVerificationPhase === 'visible' ? 'steady' : 'entry')
  : 'steady'
```

**Why safe**: Hidden verification already proved the layout is stable. Visible phase needs full rendering (8000px) to match the preseed snapshot. Using 800px during visible verification actively prevents the match.

**Why not fix the line 1973 reset instead**: `setIsReadyForSteady(false)` is intentionally conservative — it prevents stale state from a prior cycle leaking. The ternary should encode the knowledge that visible-phase verification needs steady overscan.

### Verify

Switch #3 pattern: `visible-preseed snapshot-match-instant` should fire immediately after `visible-start`. No `rows=2 tail=false`. 961ms → <100ms.

---

## Phase 3: Pre-fetch conversation detail for startup fast-path

### What already exists vs what's missing

| Capability                                            | Status                      | Location                                                                     |
| ----------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| Render cache warmup (Virtuoso sizes from IndexedDB)   | **Exists**                  | `main.tsx:76` — `warmMemoryCacheFromIdb()`                                   |
| Last-active session ID persistence                    | **Exists**                  | `claudeConversationRepo.restoreActiveSession()` at `claude-ui-bridge.ts:244` |
| Conversation detail query cache (messages + metadata) | **Missing on initial load** | `getFreshConversationDetail()` at `claude-ui-bridge.ts:123` returns null     |

### The fix

**File**: `apps/agent/src/main.tsx`

After the existing `warmMemoryCacheFromIdb()` call at line 76, add:

```typescript
void prefetchLastActiveConversation();
```

This function:

1. Reads session ID via `claudeConversationRepo.restoreActiveSession()`
2. Calls `loadConversationDetailFresh(sessionId)` → populates TanStack Query cache
3. Fire-and-forget. When `select()` runs later, it finds cached data (`query-fast-path` at `claude-ui-bridge.ts:138`) or joins the in-flight fetch (`join-path` at line 167)

**Distinction**: If the prefetch is still in flight when `select()` runs, the trace should show `join-path` (not `slow-path`), confirming the prefetch was joined rather than a separate slow-path load.

### Verify

Switch #1 trace should show `query-fast-path` or `join-path` instead of `slow-path`. Select phase should drop from 273ms to <10ms (cache hit) or remain short (fetch join).

---

## Phase 4: Improve estimated height heuristics (conditional)

### Status: Gated on Phase 0 data

`estimateMessageHeight()` at `chat-messages.tsx:209-237` exists. `buildEstimatedSizeRanges()` at line 239-254 feeds Virtuoso via `setSizeRanges()`. This phase should NOT proceed unless Phase 0 proves estimate error is a significant contributor.

**How to validate**: After Phase 0 instrumentation is live, add a temporary comparison when `restoredSizeCacheRef` transitions to true. Compare `buildEstimatedSizeRanges(messages)` vs measured ranges. If max per-message error < 100px, estimates are not the problem — the bottleneck is backtracking or probe behavior.

**Known weaknesses if validation shows error matters**:

- `MAX_ESTIMATED_MESSAGE_HEIGHT = 640px` caps long messages (actual can exceed 1500px)
- `ESTIMATED_CHARS_PER_LINE = 72` is hardcoded, doesn't account for viewport width
- `ESTIMATED_COMPLEX_MARKDOWN_BONUS = 48px` is flat regardless of code block count
- Tool widget heights (Bash, Edit, Read) are not estimated

---

## Future Exploration: React 19.2 Activity API

Not in scope. Research at `docs/architecture/REACT-19-ACTIVITY-OPTIMIZATION.md`. Re-evaluate if warm switches remain >20ms after Phases 1-3.

---

## Implementation Order

| Phase | What                                            | Expected Impact                              | Risk       | Effort |
| ----- | ----------------------------------------------- | -------------------------------------------- | ---------- | ------ |
| **0** | Instrumentation at 5 locations                  | Proves root causes                           | None       | 30min  |
| **1** | Fix hidden-phase restart (pending Phase 0 data) | Eliminates ~400ms wasted verification        | Low-Medium | TBD    |
| **2** | Fix overscan ternary for visible phase          | Visible collapse eliminated (961ms → <100ms) | Low        | 15min  |
| **3** | Pre-fetch conversation detail on startup        | Eliminates slow-path select (273ms → <10ms)  | Low        | 1hr    |
| **4** | Improve height estimates (conditional)          | Cold gap 300ms → ~150ms (if proven)          | Medium     | 2-3hr  |

## Critical Files

| File                                                                | Phase | What Changes                                  |
| ------------------------------------------------------------------- | ----- | --------------------------------------------- |
| `apps/agent/src/components/chat/chat-messages.tsx:1399-1431`        | 0     | Branch-specific backtrack traces              |
| `apps/agent/src/components/chat/chat-messages.tsx:1914`             | 0     | Verification key change trace                 |
| `apps/agent/src/services/chat/hydrate-conversation-snapshot.ts:274` | 0     | `setMessages` call trace (hydrate caller)     |
| `apps/agent/src/services/chat/chat-message-service.ts`              | 0     | `setMessages` call trace (conv-loaded caller) |
| `apps/agent/src/services/conversations/claude-ui-bridge.ts:154`     | 0     | `setMessages` call trace (bridge caller)      |
| `apps/agent/src/components/chat/chat-messages.tsx:1211`             | 0     | Timeout state dump                            |
| `apps/agent/src/components/chat/chat-messages.tsx:832`              | 0     | Overscan phase transition trace               |
| `apps/agent/src/components/chat/chat-messages.tsx`                  | 1     | TBD pending Phase 0                           |
| `apps/agent/src/components/chat/chat-messages.tsx:821`              | 2     | Overscan ternary fix                          |
| `apps/agent/src/main.tsx`                                           | 3     | Conversation detail prefetch                  |

## Acceptance Criteria

| Criterion                            | Target                                          | How to verify                                       |
| ------------------------------------ | ----------------------------------------------- | --------------------------------------------------- |
| No hidden timeout aborts             | 0 aborts across 20+ switches                    | Session switch traces                               |
| No visible-phase `rows=2 tail=false` | Never after `visible-start`                     | Session switch traces                               |
| No wasted hidden-phase restarts      | Single `hidden-start` per switch (no duplicate) | Session switch traces                               |
| Cold first-visit ≤10 msgs            | < 200ms                                         | Trace: `select → DONE`                              |
| Cold first-visit 10-20 msgs          | < 400ms                                         | Trace: `select → DONE`                              |
| Cold first-visit 20+ msgs            | < 800ms                                         | Trace: `select → DONE`                              |
| Warm revisits                        | 30-50ms                                         | Trace: `cache-match-instant → DONE`                 |
| Initial load select phase            | `query-fast-path` or `join-path`                | Not `slow-path`                                     |
| No regressions                       | 0 new failures                                  | `bun run typecheck && bun run lint && bun run test` |
| Phase 4 gated                        | Only if estimate error > 100px/message          | Comparison log                                      |
