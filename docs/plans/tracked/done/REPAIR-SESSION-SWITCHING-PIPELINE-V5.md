# Repair Session Switching Pipeline (Rebased Revision)

## Summary

Repair the session-switching pipeline by evolving the code that already exists:

- `apps/agent/src/stores/chat/session-switch-store.ts`
- `apps/agent/src/services/conversations/session-switch-coordinator.ts`
- `apps/agent/src/services/conversations/claude-ui-bridge.ts`
- `apps/agent/src/hooks/chat/use-chat-messages.ts`
- `apps/agent/src/services/chat/chat-message-service.ts`
- `apps/agent/src/components/layout/chat-area/ChatContent.tsx`
- `apps/agent/src/components/layout/chat-area/SessionInstanceManager.tsx`
- `apps/agent/src/components/layout/chat-area/SessionInstance.tsx`
- `apps/agent/src/components/chat/chat-messages.tsx`

This plan does **not** introduce a second shown-session authority. The shown session remains:

- `chatStore.activeSessionId`
- `uiStore.activeConversationId`
- `uiStore.activeConversationTitle`

The switch layer remains in-memory coordination state only:

- pending target
- request identity
- readiness records
- pending create/remap state

Required end state:

- A stays visible until B is **visibly** reveal-ready
- header/sidebar/file/tool state stay aligned with the shown session until reveal commit
- the temp-ID create path and `system:init` remap flow use one explicit state machine
- visible verification can succeed, timeout, or abort deterministically
- Query cache, render cache, and keep-alive rendering stay intact

## Non-Negotiable Invariants

- `session-switch-store.ts` is evolved in place; do not add a second `shownSessionId`.
- `session-switch-coordinator.ts` remains the single coordination layer for reveal commit and abort.
- `hydrateConversationSnapshot()` remains the canonical hydration and restore helper.
- `useChatMessages.ts` remains the sole owner of slow-path `conversation:load`.
- `claude-ui-bridge.ts` remains the selector for hot/query/join/slow path routing.
- Query cache remains the canonical data cache.
- render cache remains a separate concern.
- keep-alive session instances remain the rendering strategy.
- `pending*`, readiness records, request IDs, and pending create state stay in memory only.

## Current-State Rebase

The repo already has the core seams this plan needs:

- `session-switch-store.ts` already tracks `pendingSessionId`, `pendingLoadStrategy`, request ID, and ready signatures.
- `session-switch-coordinator.ts` already owns `beginSessionSwitch()`, `commitSessionReveal()`, and `abortSessionSwitch()`.
- `claude-ui-bridge.ts` already routes hot-query, Query-join, and slow-path loads.
- `use-chat-messages.ts` already owns the actual slow-path `conversation:load` dispatch.
- `chat-message-service.ts` already handles `system:init`, `conversation:created`, `conversation:loaded`, rewind, and delete side effects.

The work is therefore a rebased refactor, not a net-new architecture. Every step below modifies these existing seams in place.

## Implementation Changes

### 1. Evolve the existing switch store and coordinator in place

Replace the current `'idle' | 'priming'` switch model with an explicit phase machine in `session-switch-store.ts`:

- `idle`
- `hidden-priming`
- `visible-verifying`

Keep shown state out of this store.

Required switch shape:

- `status`
- `requestId`
- `pending`
  - `sessionId`
  - `title`
  - `sourceSessionId`
  - `loadStrategy: 'none' | 'query' | 'slow'`
- `readyInstances: Record<string, ReadyInstanceRecord>`
- `pendingCreate: PendingCreateState | null`
- `initialRestoreRequested`

`ReadyInstanceRecord` must include:

- `phase: 'hidden' | 'visible'`
- `signature`
- `instanceGeneration`
- `requestId`

`PendingCreateState` must include:

- `createRequestId`
- `draftSessionId: string | null`
- `effectiveSessionId: string | null`
- `title`
- `payload`
- `status`
  - `'awaiting-created'`
  - `'awaiting-first-send'`
  - `'awaiting-system-init'`

Create correlation identifiers are authoritative in this order:

- request phase: `createRequestId`
- draft phase: `createRequestId + draftSessionId`
- effective phase: `createRequestId + effectiveSessionId`

Coordinator responsibilities in `session-switch-coordinator.ts`:

- `beginSessionSwitch(targetSessionId, title)`
- `promotePendingToVisibleVerification(requestId, sessionId, title)`
- `commitSessionReveal(requestId, sessionId, title)`
- `abortSessionSwitch(requestId)`
- create-state helpers for begin/resolve/remap/abort of `pendingCreate`

Rules:

- `beginSessionSwitch()` records pending state and sets loading/transition flags.
- `beginSessionSwitch()` does **not** mutate the shown session.
- `commitSessionReveal()` remains the only path that mutates shown-session UI ownership:
  - `chatStore.activeSessionId`
  - `uiStore.activeConversationId/title`
  - `fileStore`
  - `toolStore`
  - loading/transition flags
  - pending switch cleanup
- create-state helpers may seed cache/sidebar state, but they must not bypass coordinator-owned shown-state commit.

### 2. Make the create and remap path a first-class state machine

The create path must stop relying on `lastCreatedSessionId === activeSessionId`.

Use one explicit correlation strategy:

- `createRequestId` is the outbound `conversation:create.uuid`
- `conversation:created` must echo that identifier as `createRequestId`
- after `conversation:created`, the coordinator stores a durable registry:
  - `createRequestId -> pendingCreate`
  - `draftSessionId -> createRequestId`
- after `system:init` remap, the registry is extended until cleanup:
  - `effectiveSessionId -> createRequestId`

This registry survives until the create flow is fully resolved or explicitly aborted. Late events that do not map to the current active create record are ignored.

Concrete ownership:

1. Before dispatching `conversation:create`, chat actions generate and record `createRequestId` using the outbound message UUID.
2. `conversation-handlers.ts` still creates the frontend temp ID, but `conversation:created` must echo the originating `createRequestId` together with the draft session ID.
3. `chat-message-service.handleConversationCreated()`:
   - seeds the draft session in `ChatStore`
   - marks the draft session loaded/hydrated
   - adds or updates the sidebar entry
   - resolves `pendingCreate.draftSessionId`
   - records `draftSessionId -> createRequestId`
   - starts or retargets the pending reveal through the coordinator
   - does **not** directly call `setActiveSession()`, `setActiveConversation()`, `switchSession()`, or `switchToolSession()`
4. `use-chat-messages.ts` sends the first message from `pendingCreate.effectiveSessionId`, not `lastCreatedSessionId`
5. `chat-message-service.handleSystemInit()` resolves the target create record by `draftSessionId -> createRequestId`, then remaps the same `pendingCreate` record when the SDK session ID differs

Do not use `activeSessionId` as the primary create-correlation key once this flow is migrated. It may remain only as a legacy fallback for old bridge payloads that cannot provide the original draft ID.

Required remap behavior:

- update `pendingCreate.effectiveSessionId`
- add `effectiveSessionId -> createRequestId` only after remap succeeds, while retaining `draftSessionId -> createRequestId` until cleanup
- retarget any pending switch from draft ID to SDK ID
- clear ready records for both old and new IDs before continuing
- remap message-buffer/tool/checkpoint/title state as today
- keep the shown session unchanged unless the remapped target is still the active pending create or shown session

Required create edge handling:

- overlapping creates: last create request wins; superseded requests remain in the registry only long enough to reject late `conversation:created` and `system:init` events deterministically
- create during pending switch: abort the old switch first, then continue the create request
- create after pending switch abort: allowed, independent, no reuse of stale pending state
- first message send, `conversation:created`, and `system:init` remap all update the same `pendingCreate` record
- sidebar `New conversation` is an immediate user-visible reveal: abort any older pending switch, seed the blank draft locally, and reveal that draft through the coordinator as soon as the empty draft surface is mounted; it does not wait for first-send flow to become visible

### 3. Keep slow-path load ownership where it already lives

`claude-ui-bridge.ts` remains responsible for deciding whether a selection is:

- hot visible-ready revisit
- fresh Query-cache reveal
- Query join on an in-flight request
- slow event-path load

`claude-ui-bridge.select()` may:

- inspect existing ready state
- inspect Query cache freshness
- join `loadConversationDetailFresh()`
- set `pendingLoadStrategy`
- hydrate fast/query results through `hydrateConversationSnapshot()`

`claude-ui-bridge.select()` must **not** own slow-path `conversation:load`.

`use-chat-messages.ts` remains the only slow-path owner:

- if `pendingSessionId` exists and `pendingLoadStrategy === 'slow'`, dispatch `conversation:load` for the pending target
- otherwise load the shown session when needed

`message-buffer-store` remains the dedupe guard for slow event loads only.

### 4. Replace success-only readiness with an explicit verification result contract

The current `onReady` / `onStabilized` chain is success-only. That is not enough.

Introduce a result contract from `ChatMessages.tsx` up through `SessionInstance.tsx`, `SessionInstanceManager.tsx`, and `ChatContent.tsx`:

- `hidden-ready`
- `visible-ready`
- `timeout`
- `aborted`

Every result must carry:

- `sessionId`
- `requestId`
- `signature`
- `instanceGeneration`
- `phase`

Callback ownership:

- `ChatMessages.tsx` emits verification results instead of a bare `onReady()`
- `SessionInstance.tsx` attaches signature and instance generation
- `SessionInstanceManager.tsx` routes results for the current pending request only
- `ChatContent.tsx` owns the final action:
  - `hidden-ready` -> `promotePendingToVisibleVerification()`
  - `visible-ready` -> `commitSessionReveal()`
  - `timeout` or `aborted` -> `abortSessionSwitch()`

Timeout contract:

- `READY_TIMEOUT_MS` must not silently commit
- timeout during hidden or visible verification aborts the current request
- abort clears the overlay/candidate state and keeps A shown
- timeout is a first-class result, not a log-only branch

Focus ownership must also be explicit:

- `ChatContent.tsx` owns capture and restore of focus across visible verification
- on abort, focus returns to the previously shown surface
- on commit, focus may move to the candidate only after reveal commit completes

### 5. Add a real visible-verification phase

Hidden warm-up is only phase 1.

Target behavior:

- `hidden-priming`
  - A is in-flow and interactive
  - B is mounted hidden/offscreen
- `visible-verifying`
  - B moves in-flow and becomes the candidate
  - A remains rendered as a non-interactive holdover overlay
  - header/sidebar/file/tool state still point to A

Overlay contract during `visible-verifying`:

- shown holdover uses `position: absolute; inset: 0; z-index: 2`
- holdover uses `pointer-events: none`
- holdover root uses `aria-hidden="true"`
- candidate is the only interactive tree

`SessionInstanceManager.tsx` must take explicit phase-driven inputs:

- `shownSessionId`
- `pendingSessionId`
- `pendingPhase`
- `pendingRequestId`

`SessionInstance.tsx` must track `instanceGeneration` so readiness is tied to a live mount, not just a session ID.

### 6. Tie readiness to live instance lifecycle, not session ID alone

Readiness must stop being `sessionId -> signature`.

Instant reveal is allowed only for a live visible-ready record that matches:

- current request
- current render signature
- current instance generation
- current visible phase

Signature remains:

- `layoutVersion`
- `messageCount`
- `lastMessageId`

Clear readiness when any of the following happens:

- signature change
- unmount
- keep-alive eviction
- delete
- rewind
- workspace/worktree invalidation
- `system:init` remap
- pending create replacement

A ready record must never survive long enough to authorize reveal for an instance that no longer exists.

### 7. Make `conversation:loaded` request-aware and visible-verification safe

`chat-message-service.handleConversationLoaded()` must treat a load as valid if it belongs to:

- the shown session, or
- the pending target for the current switch request

For a pending target:

- hydrate through `hydrateConversationSnapshot()`
- restore usage/tools/cache state into the target session only
- keep `activateToolSession: false`
- update pending title through the coordinator/store
- do **not** switch shown chat/UI/file/tool state

If the pending target resolves empty:

- do not commit immediately
- move the request to `visible-verifying`
- wait for explicit `visible-ready` before commit
- abort on timeout

Any generation, workspace epoch, request ID, or remap mismatch must call `abortSessionSwitch(requestId)`.

### 8. Address startup, restore, invalidation, and stale-localStorage cases explicitly

Startup restore:

- `use-chat-messages.ts` keeps `markInitialRestoreRequested()` as the one-time gate
- `restoreSelection()` still routes through `claude-ui-bridge.select()`
- if the restored session ID is stale and cannot be resolved from Query or slow load, abort cleanly, clear loading state, and leave the neutral shell instead of hanging forever

Navigation restore in `apply-snapshot.ts`:

- must not bypass the coordinator
- if `select()` is triggered while another request is between `hidden-ready` and `visible-ready`, the new request cancels the old one unless the restore is already stale
- last request wins

Invalidation paths:

- worktree switch
- workspace cache invalidation
- delete
- rewind
- keep-alive eviction

Each of these must abort any matching pending switch or pending create before mutating caches or removing session state.

Special cases to cover:

- temp session ID remapped by `system:init` while `pendingCreate` is live
- visible verification timing out after the candidate mounts in-flow
- `applySnapshot()` selecting while another request is already `visible-verifying`
- worktree invalidation firing after `hidden-ready` but before `visible-ready`
- stale localStorage restore leaving no valid shown session
- delete or rewind targeting a pending empty session during `visible-verifying`

### 9. Keep empty-state gating based on the shown session only

The empty state must be derived from the shown session only.

Require all of:

- shown session exists
- shown session is hydrated
- shown session has zero messages
- `!isLoadingConversation`
- `!isConversationTransitioning`
- `pendingSessionId === null`

A pending empty target must never blank A before reveal commit.

### 10. Reuse the existing prefetch path instead of adding a second fetch system

Keep hover and focus prefetch.

Add a bounded visible-row scheduler around the existing prefetch primitive:

- use `loadConversationDetailFresh()` / `useConversationPrefetch()` as the fetch path
- prefetch the first 6 visible recent sidebar sessions after the list settles
- max concurrency: 2
- skip shown, pending, already-fresh, and already-fetching sessions
- cancel or ignore work on workspace/worktree change
- click-triggered fetch/join remains higher priority than background prefetch

### 11. Keep the Phase 6 layout fixes concrete

- keep diff-widget min-height reservations
- keep bash command/output min-height reservation while Shiki is pending
- do not broaden to speculative markdown/image reservations without a concrete reproducer

## Migration Order

Implementation must happen as a rebased refactor against the current tree:

1. Add or update tests around the current seams before changing behavior.
2. Evolve `session-switch-store.ts` and `session-switch-coordinator.ts` in place.
3. Add `pendingCreate` ownership and remap handling across `conversation-handlers.ts`, `chat-message-service.ts`, and `use-chat-messages.ts`.
4. Replace success-only readiness callbacks in `ChatMessages.tsx`, `SessionInstance.tsx`, `SessionInstanceManager.tsx`, and `ChatContent.tsx` with the verification result contract.
5. Make `handleConversationLoaded()` fully request-aware for shown vs pending targets and remove immediate empty-target commit.
6. Rework `claude-ui-bridge.ts` to use the richer phase and live-ready APIs without changing Query/render-cache architecture.
7. Wire abort cleanup into navigation restore, delete, rewind, worktree switch, cache invalidation, and keep-alive eviction.
8. Add the bounded visible-row prefetch scheduler on top of the existing prefetch primitive.
9. Run automated coverage first, then validate in a real Tauri window.

No intermediate phase may leave two competing shown-session writers in place.

## Test Plan

### Automated

- hot revisit with current visible-ready instance reveals instantly
- revisit with stale or hidden-only ready state keeps A shown until visible-ready
- cold first visit: A stays shown, B hidden-primes, B visible-verifies, then commits
- visible verification timeout aborts and keeps A shown
- empty target moves through visible verification and commits only on `visible-ready`
- Query join mismatch on request ID / epoch / generation aborts safely
- temp create ID survives `conversation:created`, first-message send, and `system:init` remap through one `pendingCreate` record
- overlapping creates ignore late `conversation:created` events by `createRequestId` mismatch
- superseded create flows ignore late `system:init` events by draft/effective session registry mismatch
- create during pending switch aborts the old switch and does not strand the UI
- explicit sidebar `New conversation` reveal aborts any older pending switch and shows the blank draft without flashing the previous pending target
- `use-chat-messages.ts` remains the only slow-path `conversation:load` owner
- `handleConversationLoaded()` hydrates pending targets without mutating shown file/tool/UI state
- `applySnapshot()` during `visible-verifying` obeys last-request-wins semantics
- worktree switch or cache invalidation between `hidden-ready` and `visible-ready` aborts cleanly
- ready records clear on signature change, remap, keep-alive eviction, delete, and rewind
- stale localStorage restore resolves to the neutral shell instead of hanging
- delete or rewind of a pending empty session aborts reveal and leaves the shown session intact
- file/tool store alignment stays correct before and after reveal commit
- diff/bash widget height reservations still prevent early jumpiness

### Existing Tests That Must Stay Green

- `apps/agent/src/__tests__/services/conversations/claude-ui-bridge.test.ts`
- `apps/agent/src/__tests__/integration/hooks/chat/use-chat-messages-prime-load.test.tsx`
- `apps/agent/src/__tests__/unit/components/layout/chat-area/session-instance-manager.test.tsx`
- `apps/agent/src/__tests__/unit/components/chat/chat-messages.test.tsx`
- `apps/agent/src/__tests__/services/chat/title-remap-and-retry.test.ts`

### Manual Tauri Validation

- cold first visit without hover prefetch
- first visit after hover/focus prefetch
- hot revisit
- revisit after enough switching to evict the instance
- create new conversation, send first message, and observe remap
- visible verification timeout path
- delete during prefetch
- rewind during pending reveal
- worktree switch during pending reveal
- empty conversation reveal
- startup restore with remembered session
- startup restore with stale remembered session
- history restore while another switch is already pending
- rapid A→B→C→D clicking

Capture:

- click timestamp
- hidden-ready timestamp
- visible-ready timestamp
- timeout or abort timestamp when applicable
- reveal-commit timestamp
- whether any frame goes blank
- whether reveal lands at the bottom when expected
- whether the first upward scroll jumps

## Assumptions

- header/sidebar active state must stay aligned with the visible chat, not the clicked target
- last request wins for overlapping switch and restore requests
- prefetch stays bounded and cancel-safe
- this fix repairs coordinator, readiness, and create/remap semantics without replacing Query cache, render cache, or keep-alive architecture
- repo-wide unrelated failures remain out of scope; acceptance is the session-switching matrix plus real Tauri validation
