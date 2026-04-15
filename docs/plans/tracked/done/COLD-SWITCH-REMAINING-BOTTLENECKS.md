# Plan: Cold Switch Remaining Bottlenecks

## Status of Previous Fixes

The `assistant-markdown` layout-pending fix is confirmed done by two independent Codex audits. Zero `positioning:layout-pending` or `hidden-backtrack:layout-pending` across 32 switches. That bug class is closed.

The visible-phase overscan collapse from `isReadyForSteady` reset is also confirmed done. The overscan ternary and hidden→visible promotion fast path are working correctly.

**These bottlenecks are now the dominant remaining cold-switch cost.**

---

## Problem 1: Hidden-phase tail-sentinel instability on cold sessions

### What the traces show

**Switch #1 — 4 msgs, 921ms (cold startup):**

```
 25ms  stabilizing                  rows=5 tail=false pending=0
 26ms  overscan-change              null -> entry (800px)
283ms  hidden-backtrack:tail-sentinel-lost  rows=2
283ms  positioning:no-sentinel      rows=0 scrollH=9550 clientH=647
316ms  positioning:no-sentinel      rows=0 scrollH=647 clientH=647
443ms  positioning:placeholder-short rows=1 scrollH=647 clientH=647
445ms  positioning:no-post-probe
580ms  positioning:not-at-bottom    rows=2 scrollTop=0 scrollH=4938 clientH=647
614ms  stabilizing                  rows=2 tail=true pending=0
671ms  hidden-backtrack:tail-sentinel-lost  rows=2
739ms  stabilizing                  rows=2 tail=false pending=0
852ms  hidden-backtrack:snapshot-changed
907ms  hidden-ready                 stable · 4 msgs
```

**Switch #3 — 132 msgs, 1840ms (cold):**

```
 64ms  positioning:no-sentinel      rows=6 scrollH=647 clientH=647
 65ms  positioning:placeholder-short rows=1 scrollH=647 clientH=647
 68ms  positioning:no-post-probe
            ← 1448ms SILENT GAP →
1516ms positioning:not-at-bottom    rows=2 scrollTop=0 scrollH=13910 clientH=647
1686ms stabilizing                  rows=2 tail=false pending=0
1821ms hidden-ready                 stable · 132 msgs
```

### Root cause analysis

Three mechanisms combine to produce the stall:

**1. Estimated heights cause initial over-rendering → row collapse → sentinel drop**

Estimated heights at `chat-messages.tsx:76-85` undercount real content height. Virtuoso estimates 5 rows fit in 800px overscan. As Streamdown/Shiki render real content, rows grow taller → Virtuoso culls to 2 rows → tail sentinel drops from render range. The 48ms stability window extends as ResizeObserver detects ongoing layout changes.

**2. The stabilization backtrack probes unconditionally — the wrong call site**

At `chat-messages.tsx:1418-1428`, when `tail-sentinel-lost` fires during the stabilization callback:

```typescript
if (!latestMetrics?.tailSentinelRendered) {
  restorePhaseRef.current = 'positioning';
  hiddenCandidateSnapshotRef.current = null;
  if (!hasAttemptedTailProbeRef.current) {
    forceTailProbeRender(); // ← unconditional probe
    return;
  }
  alignScrollerToBottom();
  progressPositioningRef.current(latestRendered);
  return;
}
```

This branch does NOT check if the sentinel is already in Virtuoso's render data (just not in the DOM yet). The DOM query `querySelector('[data-tail-sentinel]')` lags behind Virtuoso's internal state by 1-2 frames. The `progressPositioning` path at `chat-messages.tsx:1845-1853` already has this guard:

```typescript
const sentinelAlreadyInRange = rendered.some((r) => r.kind === 'tail-sentinel');
if (!sentinelAlreadyInRange && forceTailProbeRender()) { ... }
```

The stabilization backtrack is the unguarded branch.

**3. `forceTailProbeRender` purges ALL sizes → Virtuoso rebuilds from scratch**

`forceTailProbeRender()` at `chat-messages.tsx:1033-1052` calls `replace(renderRows, {purgeItemSizes: true})`. This destroys every cached height. For 132 messages, Virtuoso rebuilds incrementally over ~1.4 seconds. During this rebuild, `getRenderSurfaceMetrics` returns null because the list element is temporarily unavailable. The silent `!metrics` early return in `progressPositioning` at `chat-messages.tsx:1819-1823` produces no trace.

**4. The post-probe contract requires a surface delta that may never arrive**

`hasObservedPostProbeSurface()` at `chat-messages.tsx:1306-1348` captures a placeholder snapshot during the purged probe, then waits for the surface to change before trusting the result. After a purged probe, this is correct — the placeholder surface is based on zeroed estimates. But if `purgeItemSizes` is removed, the surface may not change significantly, causing `hasObservedPostProbeSurface` to stall indefinitely.

### The 1448ms silent gap

Between `positioning:no-post-probe` (68ms) and `positioning:not-at-bottom` (1516ms), `progressPositioning` has two untraced `!metrics` paths:

1. `progressPositioning` at `chat-messages.tsx:1819-1823`:

   ```typescript
   const metrics = getRenderSurfaceMetrics(rendered);
   if (!metrics) {
     alignScrollerToBottom();
     queuePositioningRecheck();
     return; // ← no trace
   }
   ```

2. `beginStabilizationIfTargetRendered` at `chat-messages.tsx:1614-1619`:
   ```typescript
   const metrics = getRenderSurfaceMetrics(rendered);
   if (!metrics) {
     if (restorePhaseRef.current === 'positioning') {
       alignScrollerToBottom();
     }
     return false; // ← no trace
   }
   ```

**Hypothesis**: After `purgeItemSizes`, Virtuoso remounts the list element. During remount, `scrollerElement()` or `querySelector('[data-testid="virtuoso-list"]')` returns null. Fix 0 will confirm which path fires.

---

## Problem 2: Visible-phase preseed miss on medium-large cold sessions

### What the traces show

**Switch #9 — 19 msgs, 942ms (cold):**

```
 45ms  stabilizing              rows=20 tail=true pending=0
 45ms  hidden-ready             cache-match-instant · 19 msgs
 46ms  promote                  → visible
152ms  overscan-change          entry -> steady (8000px) vPhase=visible
152ms  visible-start            19 msgs
            ← preseed FAILS →
482ms  positioning:no-sentinel  rows=3 scrollH=11111 clientH=647
487ms  stabilizing              rows=4 tail=false pending=0
937ms  visible-ready            stable · 19 msgs
```

### Root cause

The preseed comparison `isSameReadinessSurfaceSnapshot()` at `chat-messages.tsx:152-166` compares 5 fields including `renderedRowCount`. The hidden-ready snapshot was captured with `renderedRowCount=20` (all rows at 800px overscan). At visible-start, the overscan has changed to 8000px. Virtuoso recalculates and temporarily renders only 3-4 rows. The `renderedRowCount` mismatch (20 vs 3) fails the comparison.

The hidden→visible promotion fast path at `chat-messages.tsx:1997-2019` intentionally preserves `isReadyForSteady = true` to avoid the collapse that was fixed in the prior plan. This means the overscan is already `steady` (8000px) by the time the preseed check runs.

**This is a comparison-precision issue, not an overscan-timing issue.** The content is identical. Only the render window changed.

---

## Fix 0: Add DEV-only traces at the two silent `!metrics` returns

**Files**: `apps/agent/src/components/chat/chat-messages.tsx:1614-1619` and `chat-messages.tsx:1819-1823`

Add `markSwitchTimeline` at both silent `!metrics` early returns. Distinguish scroller-missing from list-element-missing:

```typescript
// In progressPositioning (~line 1819):
const metrics = getRenderSurfaceMetrics(rendered);
if (!metrics) {
  markSwitchTimeline('positioning:no-metrics', `rows=${String(rendered.length)}`);
  alignScrollerToBottom();
  queuePositioningRecheck();
  return;
}

// In beginStabilizationIfTargetRendered (~line 1614):
const metrics = getRenderSurfaceMetrics(rendered);
if (!metrics) {
  markSwitchTimeline('no-metrics:stabilization-gate', `rows=${String(rendered.length)}`);
  if (restorePhaseRef.current === 'positioning') {
    alignScrollerToBottom();
  }
  return false;
}
```

**Cleanup**: These traces are part of the session switch timeline infrastructure (only active during switches, gated by `activeTimeline !== null`). They can remain in production or be moved behind an `import.meta.env.DEV` guard. Add a cleanup step after diagnosis is complete — once we confirm whether the gap is scroller-missing, list-missing, or something else, the no-metrics traces can be consolidated or removed.

**Expected impact**: Diagnostic only. Confirms whether the 1448ms gap is `!metrics` returns.

---

## Fix 1: Add sentinel-in-render-range guard to the stabilization backtrack probe

**File**: `apps/agent/src/components/chat/chat-messages.tsx:1418-1428`

The stabilization backtrack at line 1418 probes unconditionally when `!hasAttemptedTailProbeRef.current`. But the sentinel might be in Virtuoso's render data (just not yet in the DOM due to frame lag). The same guard already exists in `progressPositioning` at line 1845-1853.

```typescript
// Before (line 1418-1431):
if (!latestMetrics?.tailSentinelRendered) {
  markSwitchTimeline(
    'hidden-backtrack:tail-sentinel-lost',
    `rows=${String(latestRendered.length)}`
  );
  restorePhaseRef.current = 'positioning';
  hiddenCandidateSnapshotRef.current = null;
  if (!hasAttemptedTailProbeRef.current) {
    forceTailProbeRender();
    return;
  }
  alignScrollerToBottom();
  progressPositioningRef.current(latestRendered);
  return;
}

// After:
if (!latestMetrics?.tailSentinelRendered) {
  const sentinelInRenderRange = latestRendered.some((row) => row.kind === 'tail-sentinel');
  markSwitchTimeline(
    'hidden-backtrack:tail-sentinel-lost',
    `rows=${String(latestRendered.length)} inRange=${String(sentinelInRenderRange)}`
  );
  restorePhaseRef.current = 'positioning';
  hiddenCandidateSnapshotRef.current = null;
  if (!hasAttemptedTailProbeRef.current && !sentinelInRenderRange) {
    forceTailProbeRender();
    return;
  }
  alignScrollerToBottom();
  progressPositioningRef.current(latestRendered);
  return;
}
```

**Why safe**: This matches the existing guard in `progressPositioning` at line 1845-1853 with the same comment: "if it's already rendered (just not in the DOM yet), probing is counterproductive." The DOM query lags Virtuoso's internal state by 1-2 frames. The stabilizing phase's 48ms window catches the remaining DOM lag.

**Why this is the right call site**: Codex audit correctly identified that the plan's original "only probe if genuinely missing" idea was already implemented in `progressPositioning`. The unguarded probe is at line 1418 — the stabilization backtrack path. This is where Switch #1's first `tail-sentinel-lost` at 283ms triggers an unnecessary purged probe.

**What this does NOT change**: The `forceTailProbeRender` function itself stays unchanged. It still uses `purgeItemSizes: true`. The `hasObservedPostProbeSurface` contract stays intact. This fix only adds a guard to prevent the probe from firing when the sentinel is already in the render range.

**Expected impact**: When the sentinel is in Virtuoso's data but not yet in the DOM (1-2 frame lag), this avoids the destructive `purgeItemSizes` probe. The positioning phase falls through to `alignScrollerToBottom()` + `progressPositioning()`, which will find the sentinel in the DOM on the next frame. For Switch #1, this should eliminate the first `tail-sentinel-lost` → probe cycle (283ms → 614ms).

**Tests to update**: Existing test at `chat-messages.test.tsx:1309-1342` tests the purged probe behavior with tail-sentinel-lost. The test should still pass because it's testing the case where the sentinel is NOT in the render range (the test's mock `getCurrentlyRendered` returns rows without a tail-sentinel kind). Add a new test for the case where the sentinel IS in the render range — verify the probe does NOT fire.

---

## Fix 2: Dedicated visible-preseed geometry comparator

**File**: `apps/agent/src/components/chat/chat-messages.tsx`

Add a new comparison function that ignores `renderedRowCount` and `scrollTop`, keeping only content-geometry fields:

```typescript
function isVisiblePreseedGeometryMatch(
  left: ReadinessSurfaceSnapshot | null,
  right: ReadinessSurfaceSnapshot
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.scrollHeight === right.scrollHeight &&
    left.bottomTop === right.bottomTop &&
    left.layoutSettledVersion === right.layoutSettledVersion
  );
}
```

Use this at the preseed check in `scheduleVisibleVerificationCheck` (~line 1515) instead of `isSameReadinessSurfaceSnapshot`:

```typescript
// Before:
if (isSameReadinessSurfaceSnapshot(visibleCandidateSnapshotRef.current, immediateSnapshot)) {

// After:
if (isVisiblePreseedGeometryMatch(visibleCandidateSnapshotRef.current, immediateSnapshot)) {
```

Leave all hidden-phase comparisons using the strict `isSameReadinessSurfaceSnapshot`.

**Why ignore `renderedRowCount`**: After the entry→steady overscan transition, Virtuoso recalculates its render range. The row count changes even though the content is identical. The hidden phase already proved content stability — the preseed check should confirm content GEOMETRY (scrollHeight, bottomTop) hasn't changed, not the render window size.

**Why ignore `scrollTop`**: After `alignScrollerToBottom()` during promotion, the exact `scrollTop` value may differ by sub-pixel amounts or due to overscan-induced Virtuoso scroll adjustments. `bottomTop` (= scrollHeight - clientHeight) confirms the content height is the same without requiring exact scroll position match.

**Why keep `layoutSettledVersion`**: This confirms no layout mutations have fired between hidden-ready and visible-start. If a mutation fired, layoutSettledVersion increments and the preseed correctly fails.

**Edge case — late tool/widget resize**: If a tool widget fires a layout mutation between hidden-ready and visible-start that changes `scrollHeight`, the preseed will correctly fail because `scrollHeight` differs. If the mutation changes only row arrangement (not total height), `scrollHeight` and `bottomTop` still match but the visual result may differ — however, this is the same risk the current strict comparator has (it doesn't compare per-row heights either).

**Edge case — async persistent cache restore**: If `getRenderCacheAsync()` resolves and sets `restoredSizeCacheRef.current = true` between hidden-ready and visible-start, Virtuoso may re-render with cached sizes. This would change `scrollHeight` → preseed correctly fails. No special handling needed.

**Tests to add**: Add a test in `chat-messages.test.tsx` that verifies visible-preseed fires when `renderedRowCount` differs between hidden-ready and visible-start snapshots (the scenario that currently fails). Verify the existing preseed test still passes (it uses matching row counts).

---

## Implementation Order

| Step | Fix   | What                                                          | Risk |
| ---- | ----- | ------------------------------------------------------------- | ---- |
| 1    | Fix 0 | Add `positioning:no-metrics` traces (DEV or permanent)        | None |
| 2    | Fix 1 | Add sentinel-in-render-range guard to stabilization backtrack | Low  |
| 3    | Fix 2 | Dedicated `isVisiblePreseedGeometryMatch` comparator          | Low  |
| 4    | —     | Collect traces with Fix 0+1+2, share with Codex               | —    |

## Critical Files

| File                                                     | Fix | What Changes                                   |
| -------------------------------------------------------- | --- | ---------------------------------------------- |
| `apps/agent/src/components/chat/chat-messages.tsx:1819`  | 0   | `positioning:no-metrics` trace                 |
| `apps/agent/src/components/chat/chat-messages.tsx:1614`  | 0   | `no-metrics:stabilization-gate` trace          |
| `apps/agent/src/components/chat/chat-messages.tsx:1418`  | 1   | Add `sentinelInRenderRange` guard before probe |
| `apps/agent/src/components/chat/chat-messages.tsx:~152`  | 2   | New `isVisiblePreseedGeometryMatch` function   |
| `apps/agent/src/components/chat/chat-messages.tsx:~1515` | 2   | Use new comparator at preseed site             |

## Verification

```bash
bun run check
```

**Existing tests that must still pass:**

- Preseed with matching geometry: `chat-messages.test.tsx:792-862`
- Preseed with layoutPendingCount > 0: `chat-messages.test.tsx:863-930`
- Restored-cache hidden ready: `chat-messages.test.tsx:942-979`
- Purged tail probe: `chat-messages.test.tsx:1309-1342`
- Post-probe gating: `chat-messages.test.tsx:1343-1451`

**New tests:**

1. **Fix 1**: Stabilization backtrack with sentinel in render range → probe does NOT fire
2. **Fix 2**: Visible preseed with different `renderedRowCount` → preseed succeeds (geometry match)

**Runtime verification (`bunx tauri dev`):**

1. **Fix 0**: 132-msg cold switch. Expect `positioning:no-metrics` traces filling the 1448ms gap.
2. **Fix 1**: 4-msg cold switch (startup). Expect fewer `tail-sentinel-lost` cycles. First stabilization at 25ms should NOT trigger a probe if sentinel is in render range.
3. **Fix 2**: 19-msg cold switch. Expect `visible-preseed snapshot-match-instant` (geometry match despite different `renderedRowCount`). Previously 942ms → target <150ms.
4. **Warm revisits**: All sessions 32-71ms unchanged.
5. **Streaming check**: Send a message with code blocks, verify Streamdown layout settling still works.

**Edge case verification:**

- Viewport-width resize during session switch — verify `isUsableRenderCache` at `chat-messages.tsx:630` still rejects caches outside the 16px tolerance (`VIEWPORT_WIDTH_TOLERANCE_PX`)
- Switch to a session with expanded tool widgets during verification — verify layout mutations still block when `layoutSettledVersion` increments
- Async persistent cache restore arriving after verification started on estimates — verify `getRenderCacheAsync()` at `chat-messages.tsx:651-668` correctly applies cached sizes even if positioning already began
- Keep-alive re-verification where `restoredSizeCacheRef` is re-set from cache metadata at `chat-messages.tsx:2048-2063` without calling `setSizeRanges()` — verify the flag accurately reflects cache state

**Fix 0 cleanup:**
After diagnosis is confirmed (the `positioning:no-metrics` traces prove or disprove the null-metrics hypothesis), either:

- Remove the traces if the hypothesis was wrong and they add no ongoing value
- Keep them in the session-switch timeline if they provide useful ongoing diagnostics (they're already gated by `activeTimeline !== null` so only fire during switches)

## What This Plan Does NOT Cover

- **FPS drops during hidden-phase rendering** — Main-thread rendering cost. Requires `startTransition`, time-slicing, or Web Workers.
- **Reducing the 1448ms Virtuoso rebuild cost for 132-msg sessions** — Fix 1 reduces unnecessary probes but the first-ever cold render is bounded by Virtuoso's incremental mount time. This is the cost of rendering 132 messages without a size cache.
- **Redesigning the post-probe placeholder→real-surface contract** — Fix 1 avoids triggering the probe unnecessarily but does not change the probe itself or `hasObservedPostProbeSurface`. A future plan could introduce a `tailProbeModeRef` ('purged' | 'soft') to allow non-destructive probes, but that requires redesigning the post-probe contract and its tests.

## Removed From Plan (per Codex audit)

**Fix 3 (defer overscan expansion)** was removed. The hidden→visible promotion fast path at `chat-messages.tsx:1997-2019` intentionally preserves `isReadyForSteady = true` to avoid the collapse fixed in the prior plan. The proposed overscan ternary using `isReadyForSteady` would resolve to `steady` on the main promotion path — it's a no-op.

**"Soft probe" (skip `purgeItemSizes`)** was removed. The current `hasObservedPostProbeSurface()` contract at `chat-messages.tsx:1306-1348` requires a placeholder snapshot from a purged probe, then waits for a surface delta. Without `purgeItemSizes`, the placeholder surface might never change → the check stalls indefinitely. Redesigning this contract is out of scope for this plan.
