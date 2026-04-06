# Session Switch Performance — Two Targeted Fixes

## Context

Session switching works correctly after the recent correctness rebuild, but timeline instrumentation reveals two specific bottlenecks that add 400-1800ms of unnecessary latency to every switch. These are not architectural problems — they are precise, fixable inefficiencies in the existing code.

**Timeline data (10 real switches):**

| Session size        | Total switch time | Hidden render | Visible verify | Target |
| ------------------- | ----------------- | ------------- | -------------- | ------ |
| Small (4-6 msgs)    | ~900ms            | 300ms         | 400ms          | ~400ms |
| Medium (20-24 msgs) | 724-1136ms        | 200-530ms     | 400ms          | ~400ms |
| Large (89-204 msgs) | 2300-2500ms       | 1670-1800ms   | 400ms          | ~700ms |

---

## Fix 1: Reduce Hidden Overscan (saves 200-1600ms on large sessions)

**Root cause:** `chat-messages.tsx` line 676 hardcodes `'steady'` (8000px) overscan during hidden verification. Every tool widget within 8000px fires async Shiki highlighting → increments `layoutPendingCount` → blocks verification until all complete. For 89 messages: 178 Shiki operations → 1800ms wait.

**Fix:** One-line change — use `'entry'` (800px) during hidden verification.

**File:** `apps/agent/src/components/chat/chat-messages.tsx`

```typescript
// Line 676 — BEFORE:
effectiveVerificationPhase === 'hidden'
  ? 'steady'

// AFTER:
effectiveVerificationPhase === 'hidden'
  ? 'entry'
```

**Why it's safe:** Verification only needs tail sentinel rendered + scroller at bottom + layout stable. Items beyond 800px are invisible off-screen. After reveal, overscan transitions to `steady` via the `isReadyForSteady` path (line 678), and the post-commit drift monitor (`startPostCommitDriftMonitor`) corrects any scroll drift.

**Fallback:** If 800px causes visible post-reveal jumps, add `OVERSCAN_HIDDEN = 1600` as an intermediate.

**Risk:** Low-Medium. Size cache restoration provides accurate placeholder sizes for items outside overscan.

---

## Fix 2: Eliminate Visible Two-Pass Tax (saves ~200ms per switch)

**Root cause:** Both `scheduleVisibleVerificationCheck` (line 1270) and `scheduleHiddenVerificationCheck` (line 1186) use a two-pass snapshot comparison:

```typescript
// Line 1313-1317:
const currentSnapshot = buildReadinessSurfaceSnapshot(latestMetrics, layoutSettledVersion);
if (!isSameReadinessSurfaceSnapshot(visibleCandidateSnapshotRef.current, currentSnapshot)) {
  visibleCandidateSnapshotRef.current = currentSnapshot; // Store snapshot
  scheduleVisibleVerificationCheckRef.current(); // Reschedule → 2nd 200ms pass
  return;
}
signalReady('stabilized'); // Only fires on 2nd pass when snapshots match
```

First pass: `visibleCandidateSnapshotRef` is null → stores snapshot → reschedules (200ms).
Second pass: snapshot matches → ready.
Total: 200ms + 200ms = ~400ms. Hidden does the same with 48ms windows: ~96ms.

**The surface was already proven stable by hidden verification.** The second visible pass is redundant if nothing changed.

**Fix:** Pre-seed `visibleCandidateSnapshotRef` with the snapshot from hidden-ready so the first 200ms pass finds a match immediately.

**File:** `apps/agent/src/components/chat/chat-messages.tsx`

Step 1 — Add ref to capture hidden-ready snapshot (after line 717):

```typescript
const hiddenReadySnapshotRef = useRef<ReadinessSurfaceSnapshot | null>(null);
```

Step 2 — Capture snapshot in `signalReady` (around line 949, inside the `effectiveVerificationPhase === 'hidden'` case):

```typescript
if (effectiveVerificationPhase === 'hidden') {
  hiddenReadySnapshotRef.current = hiddenCandidateSnapshotRef.current;
}
```

Step 3 — Pre-seed in the verification key transition effect (around line 1685, where `visibleCandidateSnapshotRef` is currently set to null):

```typescript
if (effectiveVerificationPhase === 'visible' && hiddenReadySnapshotRef.current !== null) {
  visibleCandidateSnapshotRef.current = hiddenReadySnapshotRef.current;
  hiddenReadySnapshotRef.current = null;
} else {
  visibleCandidateSnapshotRef.current = null;
}
```

Step 4 — Clear on non-verifying cleanup, unmount, AND request changes/aborts (same reset points as `visibleCandidateSnapshotRef`):

```typescript
hiddenReadySnapshotRef.current = null;
```

Add this alongside every existing `visibleCandidateSnapshotRef.current = null` reset to prevent stale hidden snapshots bleeding into a later request.

Step 5 — Add timeline mark for observability:

```typescript
// In scheduleVisibleVerificationCheck callback, when snapshot matches on first try:
markSwitchTimeline('visible-preseed', 'snapshot-match');
```

**Why ~200ms not ~400ms:** We still run one full 200ms stability window — we just skip the second pass. The first window is still valuable because the CSS reflow from `translateX(-200vw)` removal can genuinely shift layout.

**Risk:** Low. If pre-seeded snapshot doesn't match actual visible surface (CSS reflow difference), `isSameReadinessSurfaceSnapshot` returns false and the normal two-pass flow activates. Worst case = current behavior.

**Fix 1 + Fix 2 interaction:** With Fix 1, hidden verification uses `entry` (800px) overscan. Visible verification also uses `entry`. The `renderedRowCount` in the snapshot should match across phases since both use the same overscan. If CSS reflow differences cause a mismatch, the pre-seed silently falls back to two-pass — no risk of incorrect reuse.

---

## Why Ready Instance Reuse Was Dropped

The original plan included a Fix 3 to enable ready instance reuse for returning sessions. After four audit rounds, this was found to have **no reachable code path** in the current `select()` flow:

**Rapid reversal (A→B→A during B's verification):**

- User clicks A → `select(A)` → line 74: `A === activeConversationId` (B hasn't committed yet) → abort path fires → `hasCurrentReadyInstance()` never reached

**Post-commit return (B committed, A is hidden):**

- A parks to `hidden` → `OVERSCAN_PARKED = 0` → Virtuoso unloads overscan → ready record must be cleared for safety
- User clicks A → `hasCurrentReadyInstance(A)` → no record → full verification

**The fundamental problem:** `hasCurrentReadyInstance()` runs inside `select()` after the early returns for current-session abort and pending-session coalesce. But the only sessions with valid ready records are either the active session (triggers abort) or the pending session (triggers coalesce). No third-session scenario preserves a ready record long enough to reach the reuse check.

Achieving `<50ms` return-to-cached requires a different approach entirely — either store-level trusted snapshots (Workstream 1 from the larger plan) or keeping recently-visited sessions at non-zero overscan to preserve their DOM surface. This is out of scope for these two fixes.

---

## Implementation Order

| Order | Fix                      | Change Size | Expected Savings            | Risk       |
| ----- | ------------------------ | ----------- | --------------------------- | ---------- |
| 1     | Hidden overscan (Fix 1)  | 1 line      | 200-1600ms (large sessions) | Low-Medium |
| 2     | Visible pre-seed (Fix 2) | ~15 lines   | ~200ms (all switches)       | Low        |

Both fixes are independently shippable and testable.

---

## Expected Results

| Session size        | Before  | After Fix 1 | After Fix 1+2 |
| ------------------- | ------- | ----------- | ------------- |
| Small (4-6 msgs)    | ~900ms  | ~600ms      | ~400ms        |
| Medium (20-24 msgs) | ~900ms  | ~600ms      | ~400ms        |
| Large (89 msgs)     | ~2500ms | ~900ms      | ~700ms        |
| Large (204 msgs)    | ~2300ms | ~900ms      | ~700ms        |

---

## Follow-up (non-blocking, after both fixes ship)

1. **Preseed observability** — record both `visible-preseed-hit` and `visible-preseed-fallback` timeline marks to measure how often the pre-seed fires vs falls back to two-pass.
2. **Document overscan phases** — add inline comments at the `OVERSCAN_PARKED/ENTRY/STEADY` constants explaining the readiness model each value serves.

---

## Verification

After each fix:

1. `bun run typecheck` — clean
2. `bun run test` — no new failures
3. `bunx tauri dev` → switch between 5+ sessions rapidly
4. Check Safari Web Inspector for timeline output:
   - Fix 1: `hidden-start → stabilizing` gap should shrink dramatically for large sessions
   - Fix 2: `stabilizing → visible-ready` should be ~200ms instead of ~400ms
     **Keep all timeline logs** (`markSwitchTimeline`, `endSwitchTimeline`, etc.) — needed to measure progress.

---

## Files Modified

| File                                                                   | Fixes | Changes                                                                                               |
| ---------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/chat/chat-messages.tsx`                     | 1, 2  | Overscan `'steady'` → `'entry'` for hidden phase; `hiddenReadySnapshotRef` capture + visible pre-seed |
| `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx` | 2     | Test: pre-seed hit, pre-seed fallback                                                                 |

---

## Future: Instant Return-to-Cached Sessions

After Fixes 1+2, all switches (including returns) will be ~400-700ms. Achieving `<50ms` for the return case requires a fundamentally different approach — the current `select()` flow's early returns for active-session abort and pending-session coalesce prevent the ready-instance reuse check from ever reaching holdover sessions. Options:

- **Store-level trusted snapshots** that skip DOM verification entirely when signatures match (Workstream 1 from the larger plan)
- **Keep recently-visited sessions at `entry` overscan** instead of parking to 0, preserving their DOM surface for faster re-verification
- **Restructure `select()`** to check reuse BEFORE the active-session early return, allowing holdover sessions to be instantly revealed

Design separately after measuring Fix 1+2 impact.
