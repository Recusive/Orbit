# Session Switching Reliability Rebuild

## Summary

This document is **not** a standalone replacement for [REPAIR-SESSION-SWITCHING-PIPELINE-V5.md](./REPAIR-SESSION-SWITCHING-PIPELINE-V5.md). It is an **implementation addendum** that must be merged into V5 before execution.

V5 already owns:

- coordinator/state-machine behavior
- create/remap correlation
- timeout semantics
- shown-session ownership rules
- slow/query/hot path routing

This addendum supplies the missing **render-settle proof layer** that V5 assumes but does not yet specify:

- startup bootstrap sequencing around restore
- explicit tail-render proof for hidden priming
- explicit layout-settle proof for visible verification
- settled-proof invalidation for hot ready-record reuse
- single scroll owner for pending targets
- concrete async layout participation rules for rich message/tool content

Required end state:

- repeat visits reveal instantly only from a live, visible, settled instance
- first visits hydrate, hidden-prime, visible-verify, then commit exactly once
- startup restore is not canceled by workspace/worktree bootstrap
- no overlap, no scrollbar jump, no partial-content landing, no post-commit re-verification

## Key Changes

### 1. Merge Strategy with V5

- Treat this document as **Phase 7A-7E** of V5, not as a separate parallel plan.
- After merging these requirements into V5, archive this file to avoid two active plans for the same subsystem.
- Do not implement from this file in isolation; the implementer must use merged V5 + addendum requirements together.

### 2. Fix startup sequencing

- Order startup as: workspace init -> initial worktree adoption -> restore selection.
- Initial main-worktree adoption must not abort or clear an in-flight restore switch.
- `conversation:loaded` during startup may hydrate the target session, but must not directly activate shown-session ownership outside the coordinator.
- If restore starts before worktree resolution finishes, **retain the pending request across bootstrap and resume it after worktree adoption**.
- Do not use the alternative "delay restore until worktree resolution completes" approach; the existing startup flow already naturally supports request retention and resumption.

### 3. Keep reveal ownership centralized

- `session-switch-coordinator` remains the only path that can mutate shown-session ownership:
  - `chatStore.activeSessionId`
  - `uiStore.activeConversationId/title`
  - `fileStore`
  - `toolStore`
- Remove any fallback activation path from `conversation:loaded` or restore code that bypasses the coordinator.
- Instant reveal remains allowed only for a live, visible, settled instance. Hidden, parked, or stale keep-alive instances must never authorize it.
- Ready-record reuse must require a **settled proof token**, not just `layoutVersion`, message count, and last message ID.
  - Extend `ReadyInstanceRecord` with either:
    - `settledSignature`, or
    - `layoutSettledVersion` plus `tailProofVersion`
  - `recordReadyInstance()` and `hasCurrentReadyInstance()` must both require those fields for visible-ready reuse.
  - Any late async layout mutation must invalidate hot ready reuse even if `messages.length` and `lastMessageId` did not change.

### 4. Split hidden verification and visible verification correctly

- Hidden verification proves only: the target’s real tail has been rendered for this request.
- Hidden verification must not promote from partial render counts, bottom proximity, or offscreen scroll position alone.
- Add a **tail sentinel** as a render-only row in the Virtuoso row model.
  - The sentinel must **not** be stored in `ChatStore.messages`, query cache, hydration snapshots, or render cache.
  - Model it as a UI-only row union inside the message surface, for example `RenderRow = MessageRow | TailSentinelRow`.
  - The sentinel must be appended after the final message/tool region for the session snapshot used by the instance.
  - Hidden-ready requires the sentinel node to exist in the live DOM for the current request and current instance generation.
  - For streaming sessions, the sentinel must track the current tail and be re-evaluated on every append; it may not be treated as a one-time snapshot.
  - For very long conversations, hidden priming must validate that the sentinel can actually enter the rendered range under the hidden overscan/premeasure strategy; the large diff/bash-heavy test case is the required proof that the sentinel is not starved by virtualization.
- Visible verification proves only: the visible candidate is settled at bottom now.
- `visible-ready` requires:
  - current request
  - current instance generation
  - tail sentinel rendered
  - scroller at bottom
  - no pending async layout work
  - quiet window after the last resize/layout mutation
- The shown session must never re-enter switch verification after commit.

### 5. Add explicit async layout settle state

- Extend `ChatSessionData` with layout-settle state:
  - `layoutPendingCount: number`
  - `layoutSettledVersion: number`
  - `lastLayoutMutationAt: number | null`
  - `layoutLeakDeadlineAt: number | null`
- Add concrete ChatStore APIs:
  - `layoutMutationStart(sessionId, source, timeoutMs?) -> mutationToken`
  - `layoutMutationEnd(sessionId, mutationToken)`
  - `markLayoutSettled(sessionId)`
- Maintain a **per-session mutation registry** outside serializable chat state:
  - `Map<sessionId, Map<mutationToken, { source, startedAt, timeoutId, timeoutMs }>>`
  - The scalar fields on `ChatSessionData` remain derived aggregates only.
- `layoutMutationStart()` must allocate a unique opaque token per live renderer instance, increment `layoutPendingCount`, record `lastLayoutMutationAt`, refresh `layoutLeakDeadlineAt`, and register the watchdog in the per-session registry.
- `layoutMutationEnd()` must close by token, not by renderer type string, decrement `layoutPendingCount` without going below zero, record `lastLayoutMutationAt`, and when the count reaches zero bump `layoutSettledVersion`.
- Leak protection:
  - every `layoutMutationStart()` must register a watchdog timeout
  - default watchdog duration: **5000ms**
  - keep the timeout configurable per renderer so unusually slow async renderers can override it later without redesigning the API
  - if a source never ends due to unmount, canceled async work, or load failure, the watchdog must force-close that source and decrement the count
  - visible verification must treat watchdog expiry as a failed settle proof and restart verification rather than hanging forever
- Participating renderers must be enumerated explicitly:
  - bash Shiki command highlight
  - bash Shiki output highlight
  - Pierre diff preload/render in edit widget
  - Pierre diff preload/render in write widget
  - image load and image error paths
  - any future async height-changing renderer added under message/tool content
- Multiple concurrent renderers of the same type in one session must each get their own mutation token. This specifically covers:
  - multiple image tiles
  - multiple bash widgets
  - multiple diff widgets
- Theme flip during hidden or visible verification must be treated as a fresh async layout mutation for Shiki/Pierre-backed renderers.

### 6. Make scroll landing single-owner for pending targets

- Pending targets must not reuse the generic shown-session `session-restore` bottom-placement path.
- Introduce an explicit pending verification/restore mode in the message surface.
- Add `pending-verify` to the `ScrollIntent` union and use it for pending-target verification flows instead of overloading `session-restore`.
- For pending targets:
  - hidden phase may premeasure offscreen
  - visible phase owns final bottom landing
  - no parallel imperative `session-restore` scroll calls
- Delay velocity-scroll attachment/warmup until after reveal commit.
- If velocity-scroll had already attached to a hidden/candidate instance, its warmup state must be reset on reveal commit before the shown session becomes interactive.

## Tests

### Automated

- Startup restore is not aborted by initial worktree adoption.
- `conversation:loaded` during startup does not activate shown-session ownership outside the coordinator.
- Instant reveal is rejected for hidden or parked keep-alive instances even when signatures match.
- Instant reveal is rejected when the live instance’s settled proof token no longer matches the current `layoutSettledVersion` / tail proof state.
- Hidden verification does not emit `hidden-ready` until the tail sentinel is rendered for the current request/generation.
- Visible verification does not emit `visible-ready` until:
  - tail sentinel exists
  - scroller is at bottom
  - pending layout work is zero
  - quiet window passes after the last resize
- Leaked layout work from an unmounted widget is released by watchdog timeout and does not block the switch forever.
- Multiple concurrent renderers of the same type get distinct mutation tokens and clear independently.
- Image `onLoad` and `onError` both decrement pending layout work.
- Theme flip during hidden and visible verification re-runs async renderers and still lands at bottom without reveal corruption.
- First visit to:
  - short plain-text chat
  - medium tool-heavy chat
  - very large diff/bash-heavy chat
    lands at bottom with no follow-up scroll jump.
- Repeat visit to a live visible settled instance still reveals instantly.
- Shown sessions never re-enter verification after commit.
- Pending targets do not use the generic `session-restore` imperative scroll path.
- Velocity-scroll does not attach to the candidate before commit, and warmup state is reset if a candidate becomes shown.
- Tail sentinel remains render-only and never enters persisted `ChatMessage[]`, hydrated snapshots, or render-cache assumptions.

### Manual

- Cold app start restoring the last session.
- First visit to known problematic conversations.
- Revisit of those same conversations.
- Rapid A -> B -> C switching after cold start.
- Capture:
  - requestId
  - hidden-ready timestamp
  - visible-ready timestamp
  - commit timestamp
  - final `scrollTop`, `scrollHeight`, `clientHeight`
  - whether any post-commit scroll event still occurs

## Assumptions

- Keep the current Query cache, render cache, and keep-alive instance strategy.
- Correctness wins over first-visit latency; a slightly slower first reveal is acceptable if it removes jump/flash/overlap.
- No shown-session ownership changes are allowed before reveal commit.
- Tool/file/sidebar state must remain aligned with the actually visible session until commit.
- Remaining timer-driven heuristics should be removed where possible in favor of explicit render-settle state and tail-render proof.
