# Instant Session Switching — Implementation Plan

## Context

Orbit's session switching recently went through a correctness rebuild: hidden verification, tail probes, placeholder geometry, duplicate-click coalescing, and tool-restore ownership were all fixed. The system now works correctly but is optimized for **proof-of-correctness first** — every switch re-proves safety via DOM queries, two-phase verification, and layout-settle polling. The goal of this plan is to make switching **feel instant** without regressing the hard-won correctness guarantees.

**The core insight:** hot cached sessions already switch in <5ms. The problem is that the system doesn't _trust_ its own cache. Every reuse attempt runs 5 DOM queries (`isLiveReadyInstance`), requires `phase === 'visible'` on the ready record, and re-checks `layoutPendingCount`. Cold sessions (100-400ms) can't be prewarmed. Large sessions (200+ messages) block on Shiki highlighting and unmeasured tool widgets.

## Executive Summary

Eight workstreams organized into four rollout phases:

| Phase              | Workstreams                                                                    | Impact                                                                     | Risk        |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------- |
| **1. Foundation**  | Layout audit (5A), ReadinessController extraction (3), Layout frozen mode (5B) | Eliminates false readiness, clean verification architecture, reduces noise | Low-Medium  |
| **2. Post-Reveal** | Corrective drift (6A), Velocity scroll gating (6B)                             | Eliminates post-switch jumpiness                                           | Low         |
| **3. UX Polish**   | Interaction semantics (7), Sidebar indicator (7D)                              | Predictable rapid-switching behavior                                       | Low         |
| **4. Speed**       | Trusted snapshots (1), Rendering cost reduction (4), Background prewarming (2) | Instant-feeling switches, reduced cold-start latency                       | Medium-High |

**Recommendation:** Phases 1-3 are necessary — ship them regardless. Workstream 3 (ReadinessController extraction) is in Phase 1 because it is foundational: every other workstream that touches verification logic benefits from building on the clean controller rather than the 18-ref state machine. Phase 4 delivers "nearly instant" but carries architectural complexity. Trusted snapshots (1) are worth it. Background prewarming (2) is optional — evaluate after 1 ships. Rendering cost reduction (4) is high-value for large sessions but ships incrementally behind feature flags.

---

## Proposed Architecture

```
                         ┌──────────────────────────────┐
                         │    claudeUiBridge.select()    │
                         └──────────┬───────────────────┘
                                    │
                         ┌──────────▼───────────────────┐
                         │  getTrustedSnapshot(session)  │  ← NEW (Workstream 1)
                         └──────────┬───────────────────┘
                                    │
               ┌────────────────────┼────────────────────┐
               │                    │                     │
      instant-reveal          light-verify          full-verify
     (0 DOM queries)        (1 rAF check)        (existing path)
               │                    │                     │
               ▼                    ▼                     ▼
      commitSessionReveal   promotePending      beginSessionSwitch
                            → 1 frame verify     → hidden-priming
                            → commitReveal       → ReadinessController ← NEW (Workstream 3)
                                                 → visible-verifying
                                                 → commitReveal
                                                          │
                                                 ┌────────▼────────┐
                                                 │  Drift Monitor   │ ← CORRECTIVE (Workstream 6)
                                                 │  500ms correct + │
                                                 │  500ms observe   │
                                                 └─────────────────┘
```

**Background prewarming** (Workstream 2) feeds sessions into the trusted snapshot cache before click, so more switches hit the `instant-reveal` path.

---

## Detailed Plan by Workstream

---

### Workstream 1: Trusted Ready Snapshot Contract

**Goal:** Allow many switches to reveal instantly without DOM polling.

**Problem:** `hasCurrentReadyInstance()` (session-switch-coordinator.ts:312-362) runs 5 DOM queries via `isLiveReadyInstance()` on every reuse attempt. It also requires `readyRecord.phase === 'visible'`, meaning a session must have completed full visible verification at least once.

**Design: `TrustedReadySnapshot`**

A richer snapshot that carries enough state to skip DOM verification. Crucially, the snapshot must cover **all render-affecting state**, not just chatStore fields — the rendered surface also depends on session-local tool state and width/theme-driven wrapping.

```typescript
// Unified render proof spanning chat + tool + environment state.
// If any field changes, the snapshot is stale.
interface SessionRenderProof {
  readonly chatSignature: string; // [layoutVersion:messageCount:lastMessageId]
  readonly layoutSettledVersion: number;
  readonly toolRevision: number; // NEW: advances on session-local tool mutations
  readonly containerWidth: number; // NEW: instance container width at capture time
  readonly themeKey: string; // NEW: 'light' | 'dark' at capture time
}

interface TrustedReadySnapshot {
  // Identity
  sessionId: string;
  instanceGeneration: number;
  tailProofVersion: number;

  // NEW: Unified render proof (replaces separate signature/settledSignature)
  renderProof: SessionRenderProof;
  renderProofKey: string; // buildTrustedSnapshotKey(renderProof)

  // Scroll proof
  scrollPosition: 'at-bottom' | 'mid-scroll';
  scrollTop: number;
  scrollHeight: number;

  // Temporal validity
  createdAt: number;
  layoutQuietSince: number;

  // Trust classification
  trustLevel: 'instant-reveal' | 'light-verify' | 'full-verify';
}

function buildTrustedSnapshotKey(proof: SessionRenderProof): string {
  return [
    proof.chatSignature,
    String(proof.layoutSettledVersion),
    String(proof.toolRevision),
    String(proof.containerWidth),
    proof.themeKey,
  ].join('|');
}
```

**`toolRevision` ownership model.** The tool-store has a split architecture: live session state (`activeTools`, `completedTools`, `currentSessionId`) lives at the **top level** of `ToolState` (tool-store.ts:304-314), while background sessions are cached in `sessionCache: Record<string, CachedSessionData>` (tool-store.ts:324). Critically, **foreign tool entries can live in top-level `activeTools`/`completedTools` even when they belong to a non-current session** — they are tagged with `tool.sessionId` and only separated into `sessionCache` during `switchSession()` (tool-store.ts:736-763). This means `completeTool()`, `updateToolInput()`, and `mergeToolInputAnswers()` all mutate top-level state regardless of which session the tool belongs to.

A per-session revision counter stored only in `CachedSessionData` would miss foreign tool mutations that happen before `switchSession()`. Instead, use a **top-level per-session revision map** that is always authoritative:

```typescript
// In stores/agent/tool-store.ts — add to ToolState

export interface ToolState {
  // ... existing fields ...

  // Per-session tool revision map. Always authoritative regardless of where
  // tool entries physically live (top-level activeTools vs sessionCache).
  // Bumped on any tool mutation, keyed by the tool's sessionId.
  toolRevisions: Record<string, number>; // NEW
}
```

This is simpler and more robust than splitting the counter across `ToolState` and `CachedSessionData`. The map is a single source of truth — no save/restore needed during `switchSession()`.

**Bump sites** (all in `tool-store.ts`):

```typescript
// Helper — resolves the session a tool belongs to
function resolveToolSessionId(tool: ToolExecution, state: ToolState): string {
  return tool.sessionId ?? state.currentSessionId ?? '';
}

// In each mutation, after the tool state change:
const sid = resolveToolSessionId(tool, state);
state.toolRevisions[sid] = (state.toolRevisions[sid] ?? 0) + 1;
```

- `completeTool()` (line ~529) — read `tool.sessionId` from the completed tool entry
- `updateToolInput()` (line ~559) — read `tool.sessionId` from the active tool entry
- `mergeToolInputAnswers()` (line ~600) — read `tool.sessionId` from the matched tool entry
- `restoreToolsForMessage()` (line ~964) — use the `sessionId` argument passed to the function

**Snapshot subscription is now trivial:**

```typescript
function getToolRevision(sessionId: string): number {
  return useToolStore.getState().toolRevisions[sessionId] ?? 0;
}
```

No need to check `currentSessionId` or `sessionCache` — the map covers all sessions uniformly. The subscription uses the same selector-based pattern as the chatStore subscription, comparing previous vs current `getToolRevision(sessionId)` on each `useToolStore` state change.

**Why this works for all edge cases:**

- **Live session mutation:** `completeTool()` bumps `toolRevisions[currentSessionId]` ✓
- **Foreign tool mutation (background session, top-level):** `completeTool()` reads `tool.sessionId` from the entry, bumps `toolRevisions[foreignSessionId]` ✓
- **Cached session mutation (rare, via sessionCache directly):** same bump via `tool.sessionId` ✓
- **No `switchSession()` ordering dependency:** the map doesn't move between containers ✓

**`tool-store.ts` is an explicit touched file in Workstream 1** (added to the file touch points table below).

**`containerWidth`** is captured from the mounted `SessionInstance` container's `offsetWidth` at snapshot creation time. Sidebar/panel resize can change wrapping without a `window.resize` event — a width mismatch forces downgrade to `light-verify`.

**`themeKey`** captures the active theme. Theme changes affect text metrics and code block rendering.

**Trust level rules:**

| Trust Level      | Conditions                                                                                         | Verification Path                                  |
| ---------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `instant-reveal` | Age < threshold\*, `scrollPosition === 'at-bottom'`, `layoutPendingCount === 0`, signature matches | `commitSessionReveal()` directly — 0 DOM queries   |
| `light-verify`   | Age 30s-5min, OR `scrollPosition === 'mid-scroll'`, OR signature matches but settled drifted       | Skip hidden phase → one rAF visible check → commit |
| `full-verify`    | Age > 5min, OR content signature changed, OR instance generation mismatch                          | Existing two-phase hidden → visible path           |

\*Age thresholds scale by session size: small (0-30 msgs) = 60s, medium (31-100) = 30s, large (101+) = 15s.

**Invalidation events:**

1. `chatStore.setMessages()` for this session → clear snapshot
2. `layoutMutationStart()` for this session → downgrade to `full-verify`
3. Window resize OR sidebar/panel resize (container width change) → downgrade all to `light-verify`
4. Instance evicted from LRU → clear snapshot
5. Tool state mutation for this session (`restoreToolsForMessage`, `completeTool`, `mergeToolInputAnswers`, `updateToolInput`) → downgrade to `light-verify` (toolRevision mismatch)
6. Theme change → downgrade all to `light-verify` (themeKey mismatch)
7. Session deleted, rewound, or worktree-invalidated → clear snapshot and abort any pending reveal targeting this session

**Self-validation:** Snapshot registers a selector-based Zustand subscription to avoid firing on unrelated store mutations. With 10 cached snapshots and raw `subscribe()`, every `chatStore.setState()` (streaming tokens, tool progress) would trigger 10 callback invocations. Instead, use a derived-value comparison:

```typescript
function subscribeToSessionField<T>(
  sessionId: string,
  selector: (session: ChatSessionData | undefined) => T,
  callback: (current: T, previous: T) => void
): () => void {
  let previous = selector(useChatStore.getState().sessions[sessionId]);
  return useChatStore.subscribe((state) => {
    const current = selector(state.sessions[sessionId]);
    if (!Object.is(current, previous)) {
      callback(current, previous);
      previous = current;
    }
  });
}
```

This watches `messages.length`, `layoutVersion`, and `layoutPendingCount`. Subscription cleaned up on eviction.

**Invalidation rate limiting:** A session receiving rapid layout mutations (e.g., streaming with tool widgets) will continuously invalidate its snapshot. Add a `lastDowngradedAt` timestamp. If downgraded within the last 2s, don't re-promote to `instant-reveal` — stay at `full-verify` until the session has been quiet for the age threshold. This prevents thrashing on actively-streaming sessions.

**Session deletion cleanup:** If a session is deleted via `claudeUiBridge.remove()` while a trusted snapshot subscription exists, the subscription must be cleaned up. Add snapshot cleanup to the existing `clearReadyInstances([sessionId])` call path in `remove()`.

**Integration:** In `claudeUiBridge.select()`, replace the `hasCurrentReadyInstance()` call (line 109) with `getTrustedSnapshot(sessionId)`. Branch on trust level.

**Stale-generation guard in pending-switch state.** `commitSessionReveal()` currently only receives `requestId` and `targetSessionId`. It cannot detect if the target session was deleted, rewound, or worktree-invalidated between `beginSessionSwitch()` and reveal. Extend `PendingSessionSwitch` with request metadata:

```typescript
// In stores/chat/session-switch-store.ts — extend PendingSessionSwitch
interface PendingSessionSwitch {
  sessionId: string;
  title: string | null;
  sourceSessionId: string | null;
  loadStrategy: PendingLoadStrategy;
  conversationGeneration: number; // NEW: captured at beginSessionSwitch()
  workspaceEpoch: number; // NEW: captured at beginSessionSwitch()
}
```

**Capture:** `beginSessionSwitch()` snapshots `getConversationGeneration(sessionId)` and `getWorkspaceEpoch()` into the pending state.

**Refresh on retarget:** `retargetPendingSession()` re-captures generation and epoch for the new target.

**Validate on commit:** `commitSessionReveal()` checks the captured values against current values before revealing. If stale, abort with `stale_conversation_generation` or `stale_workspace_epoch`. This is a concrete check, not just a risk note.

**Validate on trusted snapshot:** `getTrustedSnapshot()` also checks that the stored `conversationGeneration` matches current, preventing instant-reveal of a session that was rewound since the snapshot was created.

**Files:**

- `stores/chat/session-switch-store.ts` — new `TrustedReadySnapshot` type, `trustedSnapshots` field, extend `PendingSessionSwitch` with generation/epoch metadata
- `stores/agent/tool-store.ts` — add `toolRevision` to `CachedSessionData`, bump in 4 mutation sites
- `services/conversations/session-switch-coordinator.ts` — new `getTrustedSnapshot()`, trust-level-aware branching, generation/epoch validation in `commitSessionReveal()` and `retargetPendingSession()`
- `services/conversations/claude-ui-bridge.ts` — update `select()` to branch on trust level
- `components/layout/chat-area/SessionInstance.tsx` — capture scroll proof and containerWidth when emitting verification result
- `components/chat/chat-messages.tsx` — expose scroll state through verification result callback

**Complexity: M** | **Necessary**

---

### Workstream 2: Background Prewarming

**Goal:** Warm likely next sessions before click so more switches hit the instant path.

**Design: `SessionPrewarmController`** — a standalone service (not a React component).

**Prewarm triggers (priority order):**

| Trigger                      | Priority | Debounce                    | Stage          |
| ---------------------------- | -------- | --------------------------- | -------------- |
| Hover on sidebar item        | Highest  | 150ms                       | Data + Hydrate |
| Keyboard ↑/↓ in sidebar      | High     | 0ms                         | Data + Hydrate |
| Visible sidebar items (idle) | Medium   | setTimeout(fn, 1) idle shim | Data only      |
| Recent sessions (idle)       | Low      | setTimeout(fn, 1) idle shim | Data only      |

**Prewarm stages:**

1. **Data fetch** — `loadConversationDetailFresh(sessionId)` → seeds TanStack Query cache. Cost: one IPC round-trip. (Already exists via `useConversationPrefetch`.)
2. **Hydrate** — `hydrateConversationSnapshot()` → parses messages, restores tools, seeds chat store. Cost: <5ms small, <50ms large.
3. **Mount** (budget-gated, optional, requires explicit contract) — add session to `mountedSessions` in `SessionInstanceManager`. Instance mounts hidden, runs readiness verification, produces trusted snapshot. Cost: 200-500ms DOM + render.

   **Important:** Today, verification is request-scoped through `pendingSessionId`, `verificationPhase`, and `verificationRequestId` in `SessionInstanceManager`/`SessionInstance`/`ChatMessages`. A prewarmed hidden mount cannot use the existing verification path because there is no active switch request. Ship Stage 1-2 first. Before any Stage 3 work, define an explicit `prewarm-verifying` mode and an adoption contract for turning a prewarmed instance into the live pending target when the user clicks it.

**Budget:**

- Stage 1-2: No instance budget — uses query cache staleTime for eviction
- Stage 3: Max 3 prewarm slots out of the existing `MAX_ALIVE_INSTANCES = 10`
- Prewarm-mounted instances evicted FIFO before user-visited instances
- A `prewarmOnly` flag distinguishes prewarm from user-visited instances

**Guards:**

- Pause all prewarm when `sessionSwitchStore.status !== 'idle'`
- Defer Stage 3 when `isAgentRunning === true` (streaming causes continuous layout mutations)
- Hover prewarm debounced 150ms to avoid pointer sweep thrashing
- **WKWebView idle shim:** `requestIdleCallback` is not available in WKWebView. Use `setTimeout(fn, 1)` fallback:
  ```typescript
  // WKWebView does not implement requestIdleCallback.
  const scheduleIdle =
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (cb: () => void): number => window.setTimeout(cb, 1);
  const cancelIdle =
    typeof cancelIdleCallback === 'function'
      ? cancelIdleCallback
      : (id: number): void => window.clearTimeout(id);
  ```
- **Concurrent prewarm + user switch:** If Stage 3 prewarming is mounting a hidden instance for session B and the user clicks session B, the user-initiated switch adopts the prewarm instance (same `sessionId`, same DOM element). The prewarm controller detects that `sessionSwitchStore.status !== 'idle'` and pauses, letting the coordinator take ownership. No abort-and-restart needed.

**Files:**

- **New:** `services/conversations/session-prewarm-controller.ts` — controller with `schedulePrewarm()`, `cancelPrewarm()`, idle scheduling
- `lib/query/use-conversation-prefetch.ts` — extend to support Stage 2 hydration
- `components/layout/chat-area/SessionInstanceManager.tsx` — accept `prewarmSessionIds`, integrate into LRU with lowest eviction priority
- `components/layout/primary-sidebar/components/ConversationItem.tsx` — wire debounced hover prewarm
- `services/conversations/claude-ui-bridge.ts` — check if data already hydrated from prewarm

**Complexity: L** | **Optional** (evaluate after Workstreams 1+3 ship)

---

### Workstream 3: Verification Architecture — ReadinessController Extraction

**Goal:** Extract the 500+ line verification state machine from `ChatMessages` into a testable, standalone class.

**Problem:** `ChatMessages` is a rendering component that also runs a complex phase machine via 18+ mutable refs. Phase transitions are implicit. The code has drifted from the original "no session-switch logic in ChatMessages" intent.

**Design: `ReadinessController` class**

```typescript
// session-readiness-controller.ts

type ReadinessPhase =
  | 'idle'
  | 'awaiting-surface'
  | 'positioning'
  | 'premeasuring'
  | 'stabilizing'
  | 'ready'
  | 'timed-out';

interface DomAdapter {
  getScrollerMetrics(): ScrollerMetrics | null;
  getRenderSurfaceMetrics(): RenderSurfaceMetrics | null;
  alignScrollerToBottom(): ScrollerMetrics | null;
  forceTailProbeRender(): boolean;
  ensureListSurfaceReady(): boolean;
  snapshotSizeCache(): void;
}

class ReadinessController {
  constructor(config: ReadinessControllerConfig, dom: DomAdapter) {}
  start(): void;
  cancel(): void; // Disposes all timers/observers/rAFs in one call
  onRenderedDataChange(rendered: ChatRenderRow[]): void;
  onLayoutPendingChange(count: number, settledVersion: number): void;
  onResult: (result: ReadinessResult) => void;
}
```

**Key decisions:**

1. **Not a hook** — plain TypeScript class, instantiated via `useRef` in `ChatMessages`, disposed on unmount or verification key change. Unit-testable without React rendering.
2. **DomAdapter injection** — all DOM access goes through the interface. `ChatMessages` implements it using `listRef` and DOM queries. Tests use a mock adapter.
3. **ChatMessages becomes thin** — responsibilities shrink to: render `VirtuosoMessageList`, provide `DomAdapter`, instantiate/dispose controller, forward data changes. Net reduction: ~400 lines.
4. **Promote/commit/abort logic moves to coordinator** — the pure pending-state transitions (`promotePendingToVisibleVerification`, `commitSessionReveal`, `abortSessionSwitch`) move to `session-switch-coordinator.ts`. However, **DOM focus capture/restore stays in `ChatContent`** (or a dedicated UI hook). The current focus-restore behavior (`ChatContent.tsx:88-139`) is local React UI state that should not leak into the service layer. The coordinator emits phase-change events; `ChatContent` reacts to them for focus management.

**Holdover cleanup:** When a session enters holdover mode, snapshot `scrollTop` and apply as forced inline style to prevent Virtuoso from adjusting it during the brief overlap. 3-line addition to existing scroll-preservation effect in `SessionInstance.tsx`.

**Files:**

- **New:** `services/conversations/session-readiness-controller.ts` — extracted state machine (~300 lines from ChatMessages)
- `components/chat/chat-messages.tsx` — remove ~500 lines of verification, replace with controller + DomAdapter. Net: ~400 line reduction
- `components/layout/chat-area/SessionInstance.tsx` — simplify signature tracking, add holdover scroll freeze
- `components/layout/chat-area/ChatContent.tsx` — remove `handlePendingVerificationResult`, delegate to coordinator
- `services/conversations/session-switch-coordinator.ts` — absorb promote/commit/abort decisions

**Complexity: L** | **Necessary** (foundational for Workstreams 1 and 2)

---

### Workstream 4: Rendering Cost Reduction

**Goal:** Reduce blocking work before reveal for large sessions (200+ messages with heavy tool content).

**4A. Deferred Shiki Highlighting (Necessary)**

Streamdown's `code` plugin triggers Shiki on every inline code block at mount time. During hidden verification, swap to a lightweight `<pre>` placeholder. After visible-ready, re-enable Shiki for viewport-visible items. Off-screen items get Shiki on scroll-into-view via IntersectionObserver.

**Files:** `components/chat/messages/MessageItem.tsx`, new `hooks/ui/use-deferred-highlight.ts`

**4B. Priority Rendering Lanes (Necessary)**

During hidden verification, overscan is 8000px — all items render at full fidelity. Introduce three tiers:

| Tier          | Zone                  | Rendering                                                  |
| ------------- | --------------------- | ---------------------------------------------------------- |
| Viewport      | Visible after reveal  | Full fidelity                                              |
| Near-viewport | Within 1 screen above | Markdown yes, tools collapsed header only, code as `<pre>` |
| Far-overscan  | Beyond 1 screen       | Deterministic-height placeholder div from size cache       |

Driven by a `RenderPriorityContext` that `MessageItem` and tool widgets consume. During hidden verification, all items render at tier 2-3.

**Important: renderingTier must gate readiness.** During hidden verification with placeholder rendering, the stability check must NOT fire `hidden-ready` on placeholder heights — those heights will change when full-fidelity rendering kicks in, causing scroll drift. Add a `renderingTier` field to the verification state. The hidden stability check only emits `hidden-ready` when `renderingTier === 'full'`. Sequence: placeholder render settles → promote `renderingTier` to full → re-run stability check → emit `hidden-ready`.

**Files:** `components/chat/chat-messages.tsx` (context provider), `components/chat/messages/MessageItem.tsx` (consumer)

**4C. Deterministic Height Reservations (Necessary)**

Define `TOOL_HEADER_COLLAPSED_HEIGHT = 40` constant. During far-overscan rendering, tool widget slots render a simple div with this exact height, avoiding full React component mount.

**Files:** `components/chat/tools/shared/constants.ts`, tool widget renderer

**4D. Size Cache Interaction (Necessary)**

During hidden verification with placeholders, do NOT snapshot the size cache. Add a `renderTier` field to `VirtuosoSizeCache` to reject placeholder-era snapshots.

**Files:** `stores/chat/render-cache-store.ts`, `stores/chat/chat-store.ts`

**Complexity: L** | **Necessary for large sessions, ship behind feature flag**

---

### Workstream 5: Layout-Settle Guarantees

**Goal:** Make the layout mutation lease system trustworthy enough to reduce DOM heuristic dependence.

**5A. Layout Mutation Audit (Necessary)**

Widgets WITH layout mutation tracking (confirmed via grep):

- `bash-tool-widget.tsx` — 2x `useBeginSessionLayoutMutation` (command + output Shiki)
- `edit-tool-widget.tsx` — 1x `useBeginSessionLayoutMutation` (diff preview)
- `write-tool-widget.tsx` — 1x `useBeginSessionLayoutMutation` (diff preview)
- `code-search-tool-widget.tsx` — 1x `useObservedSessionLayoutMutation`
- `plan-tool-widget.tsx` — 1x `useObservedSessionLayoutMutation`
- `task-tool-widget.tsx` — 1x `useObservedSessionLayoutMutation`

**Widgets MISSING layout mutation tracking (confirmed via grep + AnimatePresence audit):**

- `grep-tool-widget.tsx` — AnimatePresence expand/collapse, changes height
- `glob-tool-widget.tsx` — AnimatePresence expand/collapse
- `web-search-tool-widget.tsx` — AnimatePresence expand/collapse
- `web-fetch-tool-widget.tsx` — AnimatePresence expand/collapse
- `todo-tool-widget.tsx` — AnimatePresence expand/collapse
- `ask-user-question-widget.tsx` — AnimatePresence expand/collapse
- `generic-tool-widget.tsx` — AnimatePresence expand/collapse
- `browser-tool-widget.tsx` — AnimatePresence expand/collapse

**Note:** `read-tool-widget.tsx` was initially listed but has NO AnimatePresence — it is a static single-line button with no height changes. Removed as false positive.

**Fix:** Add `useObservedSessionLayoutMutation` to each missing widget. The hook is proven and takes ~3 lines to add.

**Files:** All 8 widgets listed above.

**5B. Layout Frozen Mode During Verification (Necessary)**

During hidden/visible verification phases, suppress tool widget **animations** but keep layout accounting **active**. The current readiness logic explicitly waits for `layoutPendingCount === 0` before promoting ready (`chat-messages.tsx:1336-1340`, `1411-1415`, `1494-1496`). Making leases/observers no-ops would break this contract and reintroduce false-ready regressions.

Add a `layoutFrozen` flag to tool widget context. When frozen:

- AnimatePresence transitions use `TOOL_EXPAND_TRANSITION_NONE` (duration: 0) — **motion only**
- `useBeginSessionLayoutMutation` **stays active** — leases still acquired and completed normally
- `useObservedSessionLayoutMutation` **stays active** — observers still watch for real content reflow
- The net effect: widgets settle their real layout instantly (no animation delay), observers detect the reflow, leases complete quickly, and `layoutPendingCount` drains naturally

```typescript
// Example: freeze animation, keep layout accounting
const transition =
  layoutFrozen || shouldReduceMotion
    ? TOOL_EXPAND_TRANSITION_NONE // duration: 0
    : TOOL_EXPAND_ENTER; // spring 0.3s

// Observer remains active — it measures real content reflow, not animation
const contentRef = useObservedSessionLayoutMutation(
  sessionId,
  'plan-markdown',
  content,
  isExpanded && content.trim().length > 0 // active stays true
);
```

This preserves the current lease/observer contract while removing animation noise that slows verification.

**Files:** `components/chat/tools/shared/use-tool-widget-state.ts`, `components/chat/chat-messages.tsx`

**5C. Tighter Lease Timeouts (Optional)**

Reduce `DEFAULT_LAYOUT_MUTATION_TIMEOUT_MS` from 5000ms to 2000ms. Emit a warning trace event on force-complete.

**Files:** `stores/chat/chat-store.ts`

**Complexity: M** | **5A+5B Necessary, 5C Optional**

---

### Workstream 6: Post-Commit Drift & Velocity Scroll

**Goal:** Eliminate post-switch scroll jumpiness.

**6A. Corrective Drift Monitor (Necessary)**

Transform `startPostCommitDriftMonitor` from observational to two-phase corrective+observational:

1. Record committed scroll state (scrollTop, scrollHeight, isAtBottom) at reveal time
2. **Phase A (0-500ms): Corrective.** If `isAtBottom` was true and drift detected → snap back to bottom. If user was mid-scroll at commit → do NOT auto-correct (less jarring at arbitrary positions).
3. **Phase B (500-1000ms): Observational only.** Keep the existing 1000ms total window, but stop correcting after 500ms. This catches late drift events for trace analysis without fighting user scroll intent.

This preserves the existing `POST_COMMIT_DRIFT_WINDOW_MS = 1000ms` monitoring window rather than halving it.

**Files:** `services/conversations/session-switch-trace.ts`, `services/conversations/session-switch-coordinator.ts`

**6B. Velocity Scroll Warmup Gating (Necessary)**

Velocity scroll currently attaches immediately after verification completes. The 1px prime nudge fires on attach.

**Fix:** Consolidate all post-reveal velocity scroll gating into `SessionInstance.tsx`, which already owns `VELOCITY_SCROLL_ENABLE_QUIET_MS = 120ms` (line 82). Do NOT add a second independent gating mechanism in `use-velocity-scroll.ts` — two gating mechanisms in different files will cause confusion and timing bugs. Instead:

- Increase `VELOCITY_SCROLL_ENABLE_QUIET_MS` from 120ms to 500ms (after drift monitor corrective phase closes)
- Add a `skipInitialPrime` prop to `use-velocity-scroll.ts` that `SessionInstance` passes as `true` for the first attachment after a switch. This suppresses the 1px prime nudge without adding a separate timer.
- Single ownership: `SessionInstance` decides when to enable velocity scroll. The hook respects the prop.

**Files:** `hooks/ui/use-velocity-scroll.ts` (add `skipInitialPrime` prop), `components/layout/chat-area/SessionInstance.tsx` (increase quiet period, pass prop)

**6C. Tool Widget Animation Suppression After Switch (Necessary)**

Verify that `AnimatePresence initial={false}` prevents re-animation for previously-expanded widgets after switch. If animations replay, detect "first render after switch" and force `shouldReduceMotion: true` for 500ms.

**Files:** `components/chat/tools/shared/use-tool-widget-state.ts` (conditional)

**6D. Freeze Frame (Optional)**

Lock scroller `overflow: hidden` for 200ms after reveal (only when session is NOT streaming). Prevents scroll compensation from being visible. Skip when `isAgentRunning === true`.

**Files:** `components/layout/chat-area/SessionInstance.tsx`

**Complexity: M** | **6A+6B+6C Necessary, 6D Optional**

---

### Workstream 7: UX / Interaction Semantics

**Goal:** Predictable, deterministic behavior for all edge cases.

| Scenario                                | Current Behavior                                                          | Proposed Behavior                                                                                        | Change Needed?                        |
| --------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Click B while switching to B**        | Coalesced (trace: `select_coalesced`)                                     | Same — no-op                                                                                             | None                                  |
| **Rapid A→B→C**                         | B aborted (`superseded_by_new_request`), C wins                           | Same — only latest wins                                                                                  | None                                  |
| **Click current A while B pending**     | No-op (early return at line 74)                                           | **Cancel B, stay on A**                                                                                  | Yes — global bridge guard (see below) |
| **Sidebar pending indicator**           | `setLoadingConversation(true)` + `setConversationTransitioning(true)`     | Show subtle highlight on target item using `usePendingSessionId()`. 150ms minimum display to avoid flash | Yes — wire indicator                  |
| **User scrolls during verification**    | Blocked: hidden session is off-screen, holdover has `pointerEvents: none` | Same — blocked by design                                                                                 | None                                  |
| **New message in target during switch** | Restabilization loop, 1500ms timeout                                      | If `isAgentRunning === true`: shorten `VISIBLE_READY_QUIET_MS` to 50ms for best-effort reveal            | Yes — streaming shortcut              |

**Cancel-by-clicking-current is a global bridge contract**, not sidebar-only. The no-op active-session guard exists in `claudeUiBridge.select()` (line 74), and non-sidebar callers (e.g., keyboard shortcuts, command palette) also go through `select()`. The cancel-while-pending logic must live in the bridge so behavior is consistent across all callers:

```typescript
// In claudeUiBridge.select() — before the existing line 74 early return
if (sessionId === useUIStore.getState().activeConversationId) {
  const switchState = useSessionSwitchStore.getState();
  if (switchState.pending !== null) {
    abortSessionSwitch(switchState.requestId, 'explicit_phase_reset');
    logger.debug(`select(${sessionId.slice(-6)}): cancel pending, stay on current`);
  }
  return;
}
```

The sidebar `use-sidebar-actions.ts` no longer needs its own guard — it delegates to `select()`.

**Files:**

- `services/conversations/claude-ui-bridge.ts` — cancel-by-clicking-current (global contract)
- Sidebar `ConversationItem` — pending indicator via `usePendingSessionId()`
- `stores/chat/session-switch-store.ts` — optional `minimumDisplayUntil` for flash prevention
- `components/layout/chat-area/ChatContent.tsx` — detect agent-running, shorten visible verification; focus-restore-on-cancel path

**Complexity: S** | **Necessary**

---

### Workstream 8: Rollout & Instrumentation

**New trace events to add:**

| Event                                     | Purpose                          |
| ----------------------------------------- | -------------------------------- |
| `layout_mutation_force_completed`         | Lease timeout (currently silent) |
| `trusted_snapshot_hit`                    | Track instant-reveal frequency   |
| `trusted_snapshot_downgrade`              | Track invalidation patterns      |
| `drift_corrected`                         | Count corrective scroll fixes    |
| `velocity_scroll_warmup_skipped`          | Post-reveal quiet period         |
| `verification_shortened_streaming`        | Streaming best-effort shortcut   |
| `prewarm_triggered` / `prewarm_completed` | Prewarming lifecycle             |

**Success metrics:**

| Metric                                    | P50 Target | P95 Target |
| ----------------------------------------- | ---------- | ---------- |
| Hot switch latency (begin→commit)         | <50ms      | <150ms     |
| Cold switch latency                       | <200ms     | <500ms     |
| Post-commit drift events per switch       | 0          | ≤1         |
| Drift magnitude (scrollHeightDelta)       | <4px       | <16px      |
| Verification timeout rate                 | <1%        | <3%        |
| Layout leak rate (force-completed leases) | <0.5%      | <2%        |

**Feature flags:**

```typescript
// Typed flag keys prevent typo-based bugs.
type SessionSwitchFlagKey =
  | 'enableTrustedSnapshots' // Workstream 1
  | 'enablePriorityRenderLanes' // Workstream 4B
  | 'enableDeferredShiki' // Workstream 4A
  | 'enableCorrectiveDrift' // Workstream 6A
  | 'enableLayoutFrozenMode' // Workstream 5B
  | 'enablePrewarming'; // Workstream 2

// Runtime-configurable in dev mode. Mutable object (not `as const`).
export const SESSION_SWITCH_FLAGS: Record<SessionSwitchFlagKey, boolean> = {
  enableTrustedSnapshots: false,
  enablePriorityRenderLanes: false,
  enableDeferredShiki: false,
  enableCorrectiveDrift: true,
  enableLayoutFrozenMode: true,
  enablePrewarming: false,
};

// Dev-mode debug accessor using the existing inline __orbit_debug merge pattern
// (see use-chat-messages.ts:635-656 for precedent)
if (import.meta.env.DEV) {
  const debug = ((window as Record<string, unknown>).__orbit_debug ?? {}) as Record<
    string,
    unknown
  >;
  debug.sessionSwitchFlags = {
    set: (key: SessionSwitchFlagKey, value: boolean): void => {
      SESSION_SWITCH_FLAGS[key] = value;
    },
    get: (): Record<SessionSwitchFlagKey, boolean> => ({ ...SESSION_SWITCH_FLAGS }),
  };
  (window as Record<string, unknown>).__orbit_debug = debug;
}
```

---

## Implementation Sequence

### Phase 1: Foundation (Ship First — Low-Medium Risk)

**Workstream 5A** — Add missing layout mutation leases to 8 tool widgets
**Workstream 3** — Extract ReadinessController from ChatMessages
**Workstream 5B** — Layout frozen mode during verification

Workstream 3 ships in Phase 1 because it is the foundational extraction. Every subsequent workstream that touches verification logic (drift correction, streaming shortcut, trusted snapshots) benefits from building on the clean `ReadinessController` class rather than the 18-ref state machine. Shipping it last would mean Phases 2-3 write against the old code and then Phase 4 rips it out — double the review surface and double the regression risk.

Sequence within Phase 1: **5A → 3 → 5B**. The layout audit (5A) is a mechanical prerequisite that makes the controller extraction (3) cleaner. Layout frozen mode (5B) integrates with the extracted controller's phase state.

**Test gate for Phase 1 (all must pass before and after extraction):**

Existing regression suites that protect the extraction surface:

```bash
bun test apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx
bun test apps/agent/src/__tests__/services/conversations/claude-ui-bridge.test.ts
bun test apps/agent/src/__tests__/unit/components/layout/chat-area/session-instance-manager.test.tsx
bun test apps/agent/src/__tests__/unit/components/layout/chat-area/chat-content.test.tsx
bun test apps/agent/src/__tests__/unit/stores/chat/chat-store-layout-settle.test.ts
bun test apps/agent/src/__tests__/unit/hooks/ui/use-velocity-scroll.test.tsx
```

New tests added alongside the extraction:

- ReadinessController unit tests with mock DomAdapter (all phase transitions, timeout behavior, cancel cleanup)
- Integration test for focus restore / pending cancel semantics (before moving orchestration out of ChatContent)
- Layout mutation audit assertion: `layoutPendingCount` and trace behavior when expanding representative widgets

Manual: Open session with 50+ tool calls. Switch away and back. Verify no premature readiness, no timeout.

### Phase 2: Post-Reveal Polish (Ship Second — Low Risk)

**Workstream 6A** — Corrective drift monitor (500ms corrective + 500ms observational)
**Workstream 6B** — Velocity scroll warmup gating (consolidated in SessionInstance)
**Workstream 6C** — Tool widget animation suppression verification

Test: Create stress session with expanded tool widgets. Switch away and back. Verify zero scroll jumps. Check trace for `drift_corrected` count.

### Phase 3: UX Semantics (Ship Third — Low Risk)

**Workstream 7** — Cancel-by-clicking-current, sidebar indicator, streaming shortcut

Test: Manual QA — rapid click A→B→A, A→B→C, double-click same target. Verify sidebar indicator shows/clears correctly with no flash.

### Phase 4: Speed (Ship Last — Medium-High Risk)

**Workstream 1** — Trusted ready snapshots (depends on 3, already shipped in Phase 1)
**Workstream 4** — Rendering cost reduction (behind feature flags)
**Workstream 2** — Background prewarming (evaluate after 1)

Test: Performance profiling with 50/200/500 message sessions. Compare P50/P95 switch latency before and after. Verify no blank flash, stale content, or missing tool widgets.

---

## Risks & Tradeoffs

| Risk                                                                                                                                                                          | Severity | Mitigation                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Trusted snapshot false trust** — DOM drifted but snapshot says instant-reveal                                                                                               | Medium   | Post-commit drift monitor catches this (runs 1000ms: 500ms corrective + 500ms observational). Accept brief visual glitch for elimination of 48-200ms verification delay.                                                                                                             |
| **ReadinessController extraction** — 18+ refs interact in subtle ways                                                                                                         | High     | Direct port, not rewrite. DomAdapter mock enables exhaustive phase-transition testing. Ship in Phase 1 so all subsequent work builds on the clean foundation.                                                                                                                        |
| **Priority rendering lanes** — placeholder heights mismatch final heights → scroll jump                                                                                       | Medium   | Use conservative overestimates. Don't snapshot size cache during placeholder rendering. Gate `hidden-ready` on `renderingTier === 'full'` to prevent premature readiness on placeholder layout.                                                                                      |
| **Prewarming wasted work** — user never visits prewarmed session                                                                                                              | Low      | Stage 1-2 cost <50ms. Stage 3 limited to 3 slots.                                                                                                                                                                                                                                    |
| **Layout frozen mode** — suppressing animations breaks user expectation                                                                                                       | Low      | Only frozen during verification phases (user doesn't see the session yet). Unfrozen immediately on commit.                                                                                                                                                                           |
| **Corrective drift** — auto-scroll-to-bottom fights with user scroll                                                                                                          | Low      | Only corrects when `isAtBottom` was true at commit. If user was mid-scroll, no correction. Corrective phase limited to 500ms.                                                                                                                                                        |
| **Window losing focus during verification** — rAF pauses when backgrounded                                                                                                    | Medium   | The stability timer (`readinessStableTimerRef`) continues but rAF-based work freezes. On `visibilitychange` back to visible, reset the stability timer and re-snapshot the surface before emitting readiness. Add a `document.visibilitychange` listener in the ReadinessController. |
| **Layout lease force-complete races snapshot evaluation** — `layoutPendingCount` transitions 1→0 mid-check                                                                    | Low      | Read `layoutPendingCount` once at the start of `getTrustedSnapshot()` and use that value consistently. The count is atomic in Zustand (single `setState` call).                                                                                                                      |
| **Snapshot subscription leak on session deletion** — `remove()` doesn't clean up subscriptions                                                                                | Medium   | Add snapshot subscription cleanup to the `clearReadyInstances([sessionId])` path called by `claudeUiBridge.remove()`.                                                                                                                                                                |
| **Hidden session tool state drift** — `restoreToolsForMessage()`, `completeTool()`, or `mergeToolInputAnswers()` can change widget heights while chat signature still matches | Medium   | The unified `SessionRenderProof` includes `toolRevision` which advances on these mutations. Snapshot auto-downgrades when `toolRevision` mismatches.                                                                                                                                 |
| **Sidebar/panel resize without `window.resize`** — hidden mounted session reflows from panel drag                                                                             | Medium   | `containerWidth` in `SessionRenderProof` captures the instance's width at snapshot time. A `ResizeObserver` on the `SessionInstance` container detects width changes and downgrades affected snapshots.                                                                              |
| **Pending target deleted/rewound mid-switch** — snapshot selected but reveal not yet committed                                                                                | Medium   | Add a `conversationGeneration` check in `commitSessionReveal()` — if generation changed since `beginSessionSwitch()`, abort with `stale_conversation_generation`. Already partially exists but must also clear the trusted snapshot.                                                 |
| **Prewarm saturated by agent-running sessions** — all 10 slots consumed, no evictable instances                                                                               | Low      | Stage 3 prewarm silently skips mounting when no evictable slot exists. Stage 1-2 (data + hydrate) still runs. Log a trace event `prewarm_mount_skipped_saturated`.                                                                                                                   |
| **Focus/selection restoration on cancel-by-clicking-current** — cancel after focus captured for restore                                                                       | Medium   | `ChatContent` owns focus capture/restore (not coordinator). On cancel, `ChatContent` restores focus to the input of the current shown session. Add explicit focus-restore-on-cancel path.                                                                                            |
| **Tool mutation on sessionCache-only background session with trusted snapshot** — tool completes while session is cached, not mounted                                         | Medium   | `toolRevision` lives in `CachedSessionData` and advances on background mutations. Snapshot subscription watches `useToolStore` for the session's `toolRevision` and downgrades on change.                                                                                            |
| **Retarget A→B→C without atomic generation update** — stored generation metadata becomes stale for the new target                                                             | Medium   | `retargetPendingSession()` re-captures `conversationGeneration` and `workspaceEpoch` for the new target atomically in the same `setState` call that updates `sessionId`.                                                                                                             |
| **Non-sidebar caller invokes select(shownSessionId) while pending** — cancel logic only in sidebar hook                                                                       | Medium   | Cancel-by-clicking-current is implemented in `claudeUiBridge.select()` (global contract), not `use-sidebar-actions.ts`. All callers get consistent behavior.                                                                                                                         |

---

## Test Strategy

### Automated

**Existing suites (must stay green throughout all phases):**

```bash
bun test apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx
bun test apps/agent/src/__tests__/services/conversations/claude-ui-bridge.test.ts
bun test apps/agent/src/__tests__/unit/components/layout/chat-area/session-instance-manager.test.tsx
bun test apps/agent/src/__tests__/unit/components/layout/chat-area/chat-content.test.tsx
bun test apps/agent/src/__tests__/unit/stores/chat/chat-store-layout-settle.test.ts
bun test apps/agent/src/__tests__/unit/hooks/ui/use-velocity-scroll.test.tsx
bun test apps/agent/src/__tests__/unit/components/chat/tools/shared/use-tool-widget-state.test.tsx
bun test apps/agent/src/__tests__/unit/stores/chat/render-cache-store.test.ts
```

**New tests:**

1. **ReadinessController unit tests** — mock DomAdapter, verify all phase transitions, timeout behavior, cancel cleanup, visibilitychange handling
2. **Trusted snapshot invalidation tests** — verify downgrade on message change, layout mutation, tool state mutation, container width change, theme change, session deletion
3. **Layout mutation lease completeness** — grep-based CI check that every tool widget with AnimatePresence also has a layout mutation hook, **paired with** a stress/integration test that asserts `layoutPendingCount` and trace behavior when expanding representative widgets (especially markdown-heavy ones like plan-tool, code-search)
4. **Drift regression test** — after commit, assert `scrollHeight > 0`, `renderedRowCount > 0`, `tailSentinelRendered === true`
5. **Focus restore integration test** — cancel-by-clicking-current restores focus correctly to the shown session's input
6. **Background-session toolRevision test** — mutate a non-current session via `restoreToolsForMessage()` / `mergeToolInputAnswers()` while it exists only in `sessionCache`, and prove the trusted snapshot for that session downgrades
7. **Stale-generation guard test** — begin a switch, then simulate session deletion/rewind/worktree change before commit, and prove `commitSessionReveal()` aborts

### Manual QA Protocol

1. Open 5 conversations: empty, 10 msgs, 50 msgs, 200 msgs, 500 msgs
2. Switch between them rapidly (A→B→C→B→A) 10 times — no blank frame, scroll always correct
3. Open session with active agent (streaming). Switch away and back — streaming resumes without jump
4. Expand 10 tool widgets in session A. Switch to B. Switch back to A — all expanded, no animation replay, no drift
5. Hover over sidebar items. Click after 200ms — switch should be noticeably faster than without hover

### Regression Detection

- `bun run test` — all existing Vitest tests pass
- `bun run check` — TypeScript + ESLint clean
- Trace event analysis: timeout rate < 3%, drift count per switch ≤ 1, force-completed leases < 2%

---

## Exact File/Module Touch Points

### New Files

- `services/conversations/session-readiness-controller.ts` — extracted verification state machine
- `services/conversations/session-prewarm-controller.ts` — background prewarming (Phase 4)
- `hooks/ui/use-deferred-highlight.ts` — IntersectionObserver-gated Shiki (Phase 4)

### Modified Files (by workstream)

| File                                                                | Workstreams  | Changes                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `services/conversations/session-switch-coordinator.ts`              | 1, 3, 6A     | Trust-level branching, absorb promote/commit/abort logic, corrective drift                                                                                                                 |
| `stores/chat/session-switch-store.ts`                               | 1, 7D        | TrustedReadySnapshot type + store, extend PendingSessionSwitch with generation/epoch, minimumDisplayUntil                                                                                  |
| `stores/agent/tool-store.ts`                                        | 1            | Add top-level `toolRevisions: Record<string, number>` map to `ToolState`, bump by `tool.sessionId` in `completeTool`, `updateToolInput`, `mergeToolInputAnswers`, `restoreToolsForMessage` |
| `services/conversations/claude-ui-bridge.ts`                        | 1, 2         | Trust-level select path, prewarm integration                                                                                                                                               |
| `components/chat/chat-messages.tsx`                                 | 3, 4, 5B, 6B | ReadinessController extraction (-400 lines), priority context, frozen flag, velocity delay                                                                                                 |
| `components/layout/chat-area/SessionInstance.tsx`                   | 1, 3, 6D     | Scroll proof capture, holdover freeze, overflow lock                                                                                                                                       |
| `components/layout/chat-area/ChatContent.tsx`                       | 3, 7F        | Remove verification handler, streaming shortcut                                                                                                                                            |
| `components/layout/chat-area/SessionInstanceManager.tsx`            | 2            | Prewarm slots in LRU                                                                                                                                                                       |
| `components/chat/messages/MessageItem.tsx`                          | 4A, 4B       | Deferred Shiki, priority context consumer                                                                                                                                                  |
| `components/chat/tools/shared/use-session-layout-mutation.ts`       | 5B           | Layout frozen mode                                                                                                                                                                         |
| `components/chat/tools/shared/use-tool-widget-state.ts`             | 5B, 6C       | Layout frozen context, animation suppression                                                                                                                                               |
| `components/chat/tools/grep-tool-widget.tsx`                        | 5A           | Add `useObservedSessionLayoutMutation`                                                                                                                                                     |
| `components/chat/tools/glob-tool-widget.tsx`                        | 5A           | Add `useObservedSessionLayoutMutation`                                                                                                                                                     |
| `components/chat/tools/web-search-tool-widget.tsx`                  | 5A           | Add `useObservedSessionLayoutMutation`                                                                                                                                                     |
| `components/chat/tools/web-fetch-tool-widget.tsx`                   | 5A           | Add `useObservedSessionLayoutMutation`                                                                                                                                                     |
| `components/chat/tools/todo-tool-widget.tsx`                        | 5A           | Add `useObservedSessionLayoutMutation`                                                                                                                                                     |
| `components/chat/tools/ask-user-question-widget.tsx`                | 5A           | Add `useObservedSessionLayoutMutation`                                                                                                                                                     |
| `components/chat/tools/generic-tool-widget.tsx`                     | 5A           | Add `useObservedSessionLayoutMutation`                                                                                                                                                     |
| `components/chat/tools/browser-tool-widget.tsx`                     | 5A           | Add `useObservedSessionLayoutMutation`                                                                                                                                                     |
| `hooks/ui/use-velocity-scroll.ts`                                   | 6B           | Add `skipPrime` option                                                                                                                                                                     |
| `services/conversations/session-switch-trace.ts`                    | 6A, 8        | Corrective drift, new trace events                                                                                                                                                         |
| `stores/chat/chat-store.ts`                                         | 4D, 5C       | Size cache renderTier, lease timeout                                                                                                                                                       |
| `stores/chat/render-cache-store.ts`                                 | 4D           | renderTier field on VirtuosoSizeCache                                                                                                                                                      |
| `lib/utils/constants.ts`                                            | 8            | SESSION_SWITCH_FLAGS                                                                                                                                                                       |
| `components/layout/primary-sidebar/hooks/use-sidebar-actions.ts`    | 7            | Remove redundant active-session guard (cancel-by-clicking-current now lives in `claudeUiBridge.select()`)                                                                                  |
| `components/layout/primary-sidebar/components/ConversationItem.tsx` | 2, 7D        | Debounced hover prewarm, pending indicator                                                                                                                                                 |

---

## Recommendation: Is "Nearly Instant" Worth the Complexity?

**Yes, but in phases.**

- **Phase 1 (Foundation)** is the highest-value phase. The layout audit (5A) is mechanical but eliminates false readiness. The ReadinessController extraction (3) is the single most valuable change — it makes `ChatMessages` maintainable and gives every subsequent workstream a clean foundation. Layout frozen mode (5B) then integrates cleanly with the controller's phase state.

- **Phases 2-3 (Polish + UX)** deliver "consistently sub-second and stable" with low risk. They fix real bugs (post-commit drift, velocity scroll warmup) and polish interaction semantics. Ship these immediately after Phase 1.

- **Phase 4 (Speed)** delivers "nearly instant" for cached sessions. Trusted snapshots (1) make hot switches genuinely instant (<50ms P50) by eliminating DOM queries on the reuse path. Rendering cost reduction (4) helps large sessions. Background prewarming (2) is the riskiest workstream with diminishing returns — hover-triggered data prefetch (Stage 1-2 only, ~3 lines of new code) captures 80% of the benefit. Full Stage 3 pre-mounting should only be built if trace data shows cold-mount latency remains a top complaint.

**Bottom line:** Ship Phase 1 (5A → 3 → 5B) first. Then Phase 2-3 quickly. Then Workstream 1 → 4A. Evaluate 2 and 4B-D with data.

---

## Verification

After each phase ships:

1. `bun run check` — typecheck + lint + tests pass
2. `bunx tauri dev` — manual QA protocol (5 sessions, rapid switching, streaming, expanded widgets)
3. `window.__dumpSessionSwitchTrace()` — verify new trace events appear, success metrics met
4. Performance profiling in Safari/WebKit dev tools — P50/P95 switch latency within targets
