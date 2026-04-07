# Plan: Hidden-Phase Layout-Pending Stalls

## Problem

Cold session switches are bottlenecked by `hidden-backtrack:layout-pending` stalls, adding 200-500ms to every cold switch. Source tracking proves **100% of stalls come from the `assistant-markdown` label** — the `ResizeObserver` attached to `MessageItem.tsx`'s assistant content subtree at line 363.

**Scope clarification**: The `assistantContentRef` wraps the entire assistant content subtree, not just markdown. This subtree includes thinking blocks (`ThinkingBox`) and interleaved tool widgets (`ToolWidgetRenderer`) at `MessageItem.tsx:415`. The traces prove the assistant content subtree is blocking, which MAY include resize events from nested tool content — not purely markdown rendering. The label `assistant-markdown` is the source string, not a precise diagnosis of which child element triggered the ResizeObserver.

The root cause is `STREAMDOWN_LAYOUT_STABLE_MS = 250` at `MessageItem.tsx:75`. This 250ms settle window is designed for streaming content (Streamdown renders incrementally during agent responses). During session switching, the content is already complete — no streaming — but the 250ms window still applies because `useObservedSessionLayoutMutation` doesn't distinguish between streaming and verification contexts.

A secondary issue: the visible-phase preseed check gates on `layoutPendingCount === 0`, which fails on large sessions (41 msgs) where markdown mutations from the hidden phase haven't settled by the time visible verification starts.

## Evidence

Traces with source labels enabled:

```
SessionSwitch #5 → 9cbf74 (560ms) — 6 msgs
  231ms  hidden-backtrack:layout-pending  count=1 sources=[assistant-markdown]
  280ms  hidden-backtrack:layout-pending  count=1 sources=[assistant-markdown]
  329ms  hidden-backtrack:layout-pending  count=1 sources=[assistant-markdown]
  379ms  hidden-backtrack:layout-pending  count=1 sources=[assistant-markdown]
  430ms  hidden-backtrack:layout-pending  count=1 sources=[assistant-markdown]

SessionSwitch #7 → 274c11 (456ms) — 4 msgs
  121ms  hidden-backtrack:layout-pending  count=2 sources=[assistant-markdown,assistant-markdown]
  176ms  hidden-backtrack:layout-pending  count=2 sources=[assistant-markdown,assistant-markdown]
  226ms  hidden-backtrack:layout-pending  count=2 sources=[assistant-markdown,assistant-markdown]
  276ms  hidden-backtrack:layout-pending  count=2 sources=[assistant-markdown,assistant-markdown]
```

No stalls labeled with Shiki, image, or individual tool widget sources. All stalls carry the `assistant-markdown` label. **Caveat**: since the `assistantContentRef` wraps the entire assistant subtree (including nested tool widgets and thinking blocks), a resize from a nested child would also be labeled `assistant-markdown`. The traces prove the assistant-subtree parent observer is the blocking source, not necessarily that markdown-only rendering is the sole trigger.

Visible-phase regression (41 msgs):

```
SessionSwitch #1 → 69ad97 (1838ms) — 41 msgs
  827ms  visible-start            41 msgs
 1430ms  stabilizing              rows=2 tail=true   ← preseed did NOT fire
 1836ms  visible-ready            stable · 41 msgs
```

The preseed failed because `layoutPendingCount > 0` from ongoing `assistant-markdown` mutations.

---

## Fix 1: Remove `layoutPendingCount === 0` from visible preseed check

**File**: `apps/agent/src/components/chat/chat-messages.tsx:1479`

```typescript
// Before:
if (
  visiblePreseedPendingRef.current &&
  layoutPendingCount === 0 &&           // ← REMOVE THIS
  restorePhaseRef.current === 'stabilizing' &&
  effectiveVerificationPhase === 'visible'
)

// After:
if (
  visiblePreseedPendingRef.current &&
  restorePhaseRef.current === 'stabilizing' &&
  effectiveVerificationPhase === 'visible'
)
```

**Why safe**: The preseed snapshot was captured at `hidden-ready`. The same React tree is promoted — same component instances, same content. `isSameReadinessSurfaceSnapshot()` at line 1492 already validates geometric stability. If the snapshot matches, pending mutations haven't changed the geometry. On warm switches this path already works (layoutPendingCount is always 0).

**IMPORTANT — must ship atomically with Fix 2.** Without Fix 2, removing this gate creates a race window: `assistant-markdown` still holds 250ms leases, so geometry hasn't shifted YET but is about to (Streamdown finishes rendering → layout jumps). With Fix 2 applied, `assistant-markdown` tracking is disabled during verification, so `layoutPendingCount` is always 0 during verification — making the removed check redundant rather than dangerous.

**Expected impact**: The 41-msg visible-phase regression (1009ms) is eliminated. All visible phases use `snapshot-match-instant`.

---

## Fix 2: Disable `assistant-markdown` layout tracking during verification

**File**: `apps/agent/src/components/chat/messages/MessageItem.tsx:363-369`

The existing `ToolWidgetLayoutFrozenContext` already signals when verification is active — it's provided at `chat-messages.tsx:2188` with `value={isVerifying}`. MessageItem imports from the same shared module but doesn't consume this context for its layout mutation.

```typescript
// Current (line 363-369):
const assistantContentRef = useObservedSessionLayoutMutation<HTMLDivElement>(
  sessionId,
  'assistant-markdown',
  `${message.id}:${String(animatedContent.length)}:${String(segments.length)}`,
  hasMarkdownSegments, // active
  STREAMDOWN_LAYOUT_STABLE_MS // 250ms
);

// After:
const isLayoutFrozen = useContext(ToolWidgetLayoutFrozenContext);
const assistantContentRef = useObservedSessionLayoutMutation<HTMLDivElement>(
  sessionId,
  'assistant-markdown',
  `${message.id}:${String(animatedContent.length)}:${String(segments.length)}`,
  hasMarkdownSegments && !isLayoutFrozen, // disabled during verification
  STREAMDOWN_LAYOUT_STABLE_MS
);
```

**Why safe**: During verification, the message content is already complete (not streaming). The 250ms settle window is designed for streaming layout stabilization. The hidden-phase snapshot stability check (48ms at `HIDDEN_READY_STABLE_MS`) provides sufficient layout confirmation without the per-message ResizeObserver tracking.

**Why not reduce to 48ms instead of disabling**: Even 48ms per message × N messages adds up. With 4 assistant messages, that's 4 parallel mutations each needing 48ms of quiet — and the hidden stabilization gate rechecks every 50ms, so the total stall is still 100-200ms. Disabling entirely is cleaner.

**Streaming safety**: When the agent IS running (streaming), `isVerifying` is `false`, so `isLayoutFrozen` is `false`, and the full 250ms settle window applies normally. Verification only activates during session switching, not during streaming.

**Impact on other `layoutPendingCount` consumers**: Suppressing `assistant-markdown` leases during verification reduces `layoutPendingCount` but does NOT eliminate all mutation tracking. Three other consumers rely on this count:

| Consumer                   | Location                            | Why safe                                                                                                                                                                                                                                                                            |
| -------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hidden stabilization gate  | `chat-messages.tsx:1464`            | The gate still checks `layoutPendingCount`. Tool widgets that ARE expanded during verification still increment the count via their own `useObservedSessionLayoutMutation` (48ms default). Only the assistant-subtree observer is suppressed.                                        |
| Velocity-scroll enablement | `SessionInstance.tsx:331`           | Velocity scroll is gated on `displayMode === 'shown'`. During verification, `displayMode` is `'hidden'` or `'candidate'`, so velocity scroll is already disabled. The `layoutPendingCount` check is a secondary gate that only matters after the switch commits.                    |
| Ready-instance adoption    | `session-switch-coordinator.ts:356` | This checks `layoutPendingCount === 0` when evaluating whether a session instance is "ready." With Fix 2 applied, the count IS 0 during verification (assistant-markdown leases aren't created). This is the desired state — the instance IS ready because the content is complete. |

**Key distinction**: We are NOT suppressing all layout mutation tracking. Tool widgets (bash, edit, write, etc.) that have their own `useObservedSessionLayoutMutation` or `useBeginSessionLayoutMutation` still track independently. Only the assistant-subtree parent observer is suppressed.

**Expected impact**: The 200-500ms hidden-phase stalls from `layout-pending` are eliminated entirely. Cold switches should drop by 200-400ms.

---

## Fix 2b (optional): Also address `tail-sentinel-lost` on large sessions

The `tail-sentinel-lost` pattern (#1 at rows=3, #2 at rows=1) occurs when async layout mutations change row heights after initial stabilization → Virtuoso recalculates render range → tail sentinel leaves the range.

With Fix 2 disabling `assistant-markdown` tracking during verification, these mutations won't fire during hidden phase. This should ALSO eliminate the `tail-sentinel-lost` pattern as a side effect, since the primary source of mid-verification height changes is removed.

**Verify after Fix 2**: If `tail-sentinel-lost` still appears, it's from a different source (Shiki/tool widgets) and needs separate investigation.

---

## Implementation Order

**Fix 1 and Fix 2 MUST be applied atomically** (same commit). Fix 1 alone creates a race window where preseed commits before `assistant-markdown` mutations finish rendering. Fix 2 eliminates the race by disabling tracking during verification, making the removed `layoutPendingCount === 0` check redundant.

| Fix     | What                                                     | Expected Impact                               | Risk |
| ------- | -------------------------------------------------------- | --------------------------------------------- | ---- |
| **1+2** | Remove preseed gate + disable markdown tracking (atomic) | Visible regression + hidden stalls eliminated | Low  |
| **2b**  | Verify tail-sentinel-lost is also fixed                  | May be free with Fix 2                        | None |

## Critical Files

| File                                                          | Fix | What Changes                                                                      |
| ------------------------------------------------------------- | --- | --------------------------------------------------------------------------------- |
| `apps/agent/src/components/chat/chat-messages.tsx:1479`       | 1   | Remove `layoutPendingCount === 0` from preseed condition                          |
| `apps/agent/src/components/chat/messages/MessageItem.tsx:363` | 2   | Consume `ToolWidgetLayoutFrozenContext`, pass `!isLayoutFrozen` to `active` param |

## Verification

```bash
bun run typecheck && bun run lint && bun run test
```

**Test coverage note**: The existing `chat-messages.test.tsx` mocks `MessageItem`, so its preseed tests don't exercise the real `assistant-markdown` ResizeObserver path. `chat-store-layout-settle.test.ts` only covers lease accounting. Automated unit tests verify the code change compiles and existing contracts hold, but the real observer behavior requires runtime verification. This is appropriate — ResizeObserver behavior in jsdom is not meaningful.

Runtime verification (`bunx tauri dev`) is the **primary** validation:

1. No `hidden-backtrack:layout-pending` with `sources=[assistant-markdown]` in any switch
2. `visible-preseed snapshot-match-instant` fires on ALL switches including 41-msg session
3. No `tail-sentinel-lost` (likely fixed as side effect)
4. Cold switches with 4-8 msgs: <200ms (down from 450-560ms)
5. Warm revisits unchanged: 33-54ms
6. **Streaming regression check**: Send a message with code blocks, verify Streamdown layout settling still works (250ms window applies when `isVerifying=false`)

**Automated test additions** (during implementation):

1. **Fix 2 — MessageItem context gating**: Add a unit test that verifies `useObservedSessionLayoutMutation` receives `active=false` when `ToolWidgetLayoutFrozenContext` is `true`. Render + spy, no real ResizeObserver needed.

2. **Fix 1 — Preseed fires with `layoutPendingCount > 0`**: Add a test in `chat-messages.test.tsx` that sets up a session with `layoutPendingCount > 0` in the store during visible verification and asserts `visible-ready` still fires via preseed. The existing preseed tests at line 792 never hit this case because `MessageItem` is mocked and `layoutPendingCount` defaults to 0. The new test should explicitly set `layoutPendingCount` on the session before triggering visible verification to cover the removed gate.

## Follow-Up: Tool Widget Layout Tracking

12 tool widgets use `useObservedSessionLayoutMutation` with the default 48ms settle. They're currently safe because collapsed widgets pass `active=false`. But architecturally, the same gap exists — expanded tool widgets during verification would also stall hidden phase. A follow-up task should audit whether tool widgets should also consume `ToolWidgetLayoutFrozenContext` to disable tracking during verification. Low priority since collapsed tools are the common case during session switching.

## What This Plan Does NOT Cover

- **FPS drops during hidden-phase rendering** — Fix 2 reduces hidden phase TIME but the rendering work still happens on the main thread. FPS optimization (Web Workers, `startTransition`, deferred Shiki) is a separate concern.
- **Slow-path initial loads** — Switch #1 hit `slow-path` because the prefetch cache missed. This is a prefetch staleness issue, not a stabilization issue.
- **Hidden-phase verification restart** — The hidden→hidden key change at 317ms in Switch #1 (messages arrived from `event-load` during verification). This is the original Phase 1 issue, but deprioritized since it only affects slow-path initial loads.
