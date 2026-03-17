# Fix Sidebar/Header Title Divergence & Reload Revert

## Context

After AI title generation, switching away from a conversation and back causes the header to revert to the stale fallback title. The root cause is two-fold:

1. **`handleConversationLoaded`** calls `setActiveConversation(sid, message.title)` using the disk title from Rust. If the AI title hasn't been persisted yet (fire-and-forget with no retry after `system:init`), the disk still has the fallback → header reverts.
2. **`update_title` returns `Result<()>`** — the frontend cannot distinguish "file not found, nothing written" from "write succeeded", so it has no signal to retry.

**Origin**: Codex-generated plan reviewed and refined. See "Codex Plan Gaps" and "Audit Findings" sections below.

---

## Codex Plan Gaps (corrected in this plan)

| Codex Claim                                             | Reality                                                                             | Fix                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------- |
| Proposes adding stale-title merge in `setConversations` | Already exists at UIStore lines 401-407                                             | Preserve existing guard, no changes |
| `agent:complete` should retry title generation          | Already retries generation (lines 799-811), which no-ops if already generated       | Add **persistence** retry instead   |
| "Alias-aware lookup" needed in `setConversations`       | After `remapConversation`, entries already have new sessionId                       | Not needed for sidebar merge        |
| No specific `getPreferredTitle` design                  | Missing function to guard `handleConversationLoaded`                                | Added with alias resolution         |
| No `freshestTitles` concept                             | `pendingTitles` is cleared by `flushPendingTitle`, leaving no stale-read protection | Added as separate Map               |

---

## Audit Findings (incorporated into this plan)

| Audit Issue                                                                                                                                                                                                                                   | Resolution                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual rename bypasses `freshestTitles` — renamed title can still be overwritten by stale disk read on navigation                                                                                                                             | **Change 6** now routes rename through a new `applyManualSessionTitle()` that populates `freshestTitles`                                                                                                                        |
| Cleanup wired to wrong lifecycle — `destroySession()` only reached from protocol `conversation:deleted`, not sidebar delete or workspace/worktree resets                                                                                      | **Change 5** now hooks `clearSessionTitleState` into sidebar delete (`use-sidebar-actions.ts`) and workspace/worktree reset paths (`ui-store.ts`)                                                                               |
| `clearSessionTitleState` only deletes exact key from `titleSessionAliases`, leaving stale aliases after remap/delete                                                                                                                          | **Change 2** `clearSessionTitleState` now scans `titleSessionAliases` for both keys and values matching the session                                                                                                             |
| `retryPendingPersistence` can fire while previous persist is in flight, producing duplicate JSONL `custom-title` lines                                                                                                                        | **Change 2** `retryPendingPersistence` clears `titlesNeedingRetry` optimistically before starting retry — second call while in flight sees flag cleared and skips; if persist returns `false` again, `.then()` re-adds the flag |
| `agent:error` has no persistence retry path                                                                                                                                                                                                   | **Change 4** now adds `retryPendingPersistence` to both `agent:complete` and `agent:error`                                                                                                                                      |
| `conversation-handlers.ts:127-151` emits `'Untitled'` while claiming to preserve sidebar title                                                                                                                                                | **Change 7** updates the handler comment to match actual behavior                                                                                                                                                               |
| `persistTitle` catching errors and returning `false` hides real backend failures from `applyManualSessionTitle` — rename handler's `.catch()` rollback is dead code                                                                           | **Change 2** `persistTitle` no longer catches — fire-and-forget callers add their own `.catch()`, while `applyManualSessionTitle` lets errors propagate                                                                         |
| `clearAllTitleState()` on `workspacePath` effect wipes active-session state during first `system:init` bootstrap (title set at `use-chat-messages.ts:311` before `initializeWorkspace` sets `workspacePath` at `chat-message-service.ts:544`) | **Change 5** uses a module-level Zustand subscription that skips `null → path` first-init transitions                                                                                                                           |
| `flushPendingTitle` calls `persistTitle` bare — once `persistTitle` stops catching, the `system:init` flush path has an unhandled rejection                                                                                                   | **Change 2** `flushPendingTitle` updated with `.catch()` like other fire-and-forget callers                                                                                                                                     |

---

## Implementation

### Change 1: Rust `update_title` → `Result<bool>`

**File: `crates/common/conversations/src/lib.rs` (lines 824-873)**

- Change signature: `pub fn update_title(...) -> Result<bool>`
- Line 837: `return Ok(());` → `return Ok(false);` (JSONL not found)
- Line 872: `Ok(())` → `Ok(true)` (write succeeded)

**File: `src-tauri/src/commands/agent/conversations.rs` (lines 389-397)**

- Change return type: `Result<()>` → `Result<bool>`

**File: `apps/agent/src/lib/api/conversations.ts` (lines 119-125)**

- Change return type: `Promise<void>` → `Promise<boolean>`
- Change invoke: `invoke<boolean>(...)`

### Change 2: `freshestTitles` Map + retry tracking + new exports in session-title-service

**File: `apps/agent/src/services/session/session-title-service.ts`**

**Add after line 72:**

```typescript
/**
 * Most recent title applied in-memory per session. Cleared when persist returns true.
 *
 * Relationship to `pendingTitles`:
 * - `pendingTitles` = title waiting for JSONL to be created (pre-system:init). Cleared by `flushPendingTitle`.
 * - `freshestTitles` = title that may or may not be on disk yet (post-persist guard). Cleared on confirmed write.
 * Both are checked by `retryPendingPersistence`; only `freshestTitles` is used by `getPreferredTitle`.
 */
const freshestTitles = new Map<string, string>();

/** Sessions where the last persist returned `written === false` (JSONL didn't exist yet). */
const titlesNeedingRetry = new Set<string>();
```

**Modify `persistTitle` (lines 78-83)** — return `Promise<boolean>`, track retry eligibility, clear freshestTitles on success. **Does NOT catch** — callers decide error handling:

```typescript
function persistTitle(sessionId: string, title: string): Promise<boolean> {
  const workspacePath = useUIStore.getState().workspacePath ?? undefined;
  return conversationUpdateTitle(sessionId, title, workspacePath).then((written: boolean) => {
    if (written) {
      titlesNeedingRetry.delete(sessionId);
      if (freshestTitles.get(sessionId) === title) {
        freshestTitles.delete(sessionId);
        pendingTitles.delete(sessionId);
      }
    } else {
      titlesNeedingRetry.add(sessionId);
    }
    return written;
  });
  // No .catch() — fire-and-forget callers add their own; applyManualSessionTitle propagates.
}
```

**Modify `applySessionTitle` (lines 95-104)** — add `freshestTitles.set(sessionId, title)` before persist call. Fire-and-forget with its own catch:

```typescript
void persistTitle(sessionId, title).catch((err: unknown) => {
  logger.warn('Failed to persist session title to disk', { sessionId, err });
});
```

**Modify `flushPendingTitle` (line 127)** — add `.catch()` since `persistTitle` no longer catches internally:

```typescript
void persistTitle(sessionId, title).catch((err: unknown) => {
  logger.warn('Failed to flush pending title to disk', { sessionId, err });
});
```

> `flushPendingTitle` is fire-and-forget (called from `system:init` handler).
> Without this catch, the `system:init` flush path would have an unhandled rejection.

**Modify `remapSessionTitleState` (lines 161-177)** — add migration of `freshestTitles` and `titlesNeedingRetry` entries (same pattern as `pendingTitles`).

**Add new export `getPreferredTitle`:**

```typescript
export function getPreferredTitle(sessionId: string): string | undefined {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  return freshestTitles.get(canonicalId) ?? freshestTitles.get(sessionId);
}
```

**Add new export `retryPendingPersistence`:**

```typescript
export function retryPendingPersistence(sessionId: string): void {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  if (!titlesNeedingRetry.has(canonicalId) && !titlesNeedingRetry.has(sessionId)) return;

  // Clear BEFORE starting the retry — prevents duplicate persists when multiple
  // agent:complete events fire while this persist is still in flight.
  // If persistTitle resolves false again, its .then() re-adds to titlesNeedingRetry.
  titlesNeedingRetry.delete(canonicalId);
  titlesNeedingRetry.delete(sessionId);

  const title =
    freshestTitles.get(canonicalId) ??
    freshestTitles.get(sessionId) ??
    pendingTitles.get(canonicalId) ??
    pendingTitles.get(sessionId);
  if (title !== undefined) {
    void persistTitle(canonicalId, title).catch((err: unknown) => {
      logger.warn('Retry persist failed', { sessionId, err });
    });
  }
}
```

> Optimistic clear-before-call: the flag acts as both "needs retry" and "not currently
> retrying". Second call while in flight sees the flag cleared → skips. If the in-flight
> persist returns `written === false` again, `persistTitle`'s `.then()` re-adds the flag,
> enabling the next retry cycle. No duplicate `custom-title` JSONL appends.
> Symmetric dual-check (both `canonicalId` and `sessionId`) prevents gaps during remap timing.

**Add new export `applyManualSessionTitle`:**

```typescript
export function applyManualSessionTitle(sessionId: string, title: string): Promise<boolean> {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);
  freshestTitles.set(canonicalId, title);
  useUIStore.getState().updateConversationTitle(canonicalId, title);
  return persistTitle(canonicalId, title);
}
```

> Routes manual rename through the same `freshestTitles` guard as AI titles.
> Returns `Promise<boolean>` — resolves `true` (written) or `false` (deferred),
> rejects on real backend errors. Because `persistTitle` does NOT catch,
> errors propagate to the rename handler's `.catch()` for rollback.

**Add new export `clearSessionTitleState`:**

```typescript
export function clearSessionTitleState(sessionId: string): void {
  const canonicalId = resolveCanonicalTitleSessionId(sessionId);

  freshestTitles.delete(canonicalId);
  freshestTitles.delete(sessionId);
  pendingTitles.delete(canonicalId);
  pendingTitles.delete(sessionId);
  aiTitleGenerated.delete(canonicalId);
  aiTitleGenerated.delete(sessionId);
  aiTitleInFlight.delete(canonicalId);
  aiTitleInFlight.delete(sessionId);
  titlesNeedingRetry.delete(canonicalId);
  titlesNeedingRetry.delete(sessionId);

  // Scan alias map for all entries referencing this session (as key or value)
  for (const [alias, target] of titleSessionAliases) {
    if (
      alias === canonicalId ||
      alias === sessionId ||
      target === canonicalId ||
      target === sessionId
    ) {
      titleSessionAliases.delete(alias);
    }
  }
}
```

> Deletes from all Maps/Sets using both `canonicalId` and `sessionId`.
> Scans `titleSessionAliases` for keys AND values to prevent stale alias entries
> after remap/delete sequences.

**File: `apps/agent/src/services/session/index.ts`**

- Add `getPreferredTitle`, `retryPendingPersistence`, `applyManualSessionTitle`, and `clearSessionTitleState` to barrel exports.
- `clearAllTitleState` is NOT exported — it's module-internal, triggered by the workspace subscription.

### Change 3: Guard `handleConversationLoaded` against stale titles

**File: `apps/agent/src/services/chat/chat-message-service.ts`**

**Import** `getPreferredTitle`, `retryPendingPersistence`, and `clearSessionTitleState` from `@/services/session`.

**Line 1076 (streaming guard path):**

```typescript
const preferredTitle = getPreferredTitle(message.session_id);
useUIStore.getState().setActiveConversation(message.session_id, preferredTitle ?? message.title);
```

**Line 1234 (normal path):**

```typescript
const preferredTitle = getPreferredTitle(message.session_id);
useUIStore.getState().setActiveConversation(message.session_id, preferredTitle ?? message.title);
```

### Change 4: Retry persistence on `agent:complete` and `agent:error`

**File: `apps/agent/src/services/chat/chat-message-service.ts`**

**After line 811** (after existing `generateAITitle` retry block in `handleAgentComplete`):

```typescript
retryPendingPersistence(sid);
```

**In `handleAgentError`** (after line 828, after `setStopPending(sid, false)`):

```typescript
retryPendingPersistence(sid);
```

> `agent:error` is terminal for the turn. Without this, sessions where the first turn
> errors out have no retry path for title persistence.

### Change 5: Clean up title state on ALL teardown paths

Title state must be cleaned up wherever client-side conversation state is discarded.
Three distinct teardown paths exist:

**Path A: Protocol `conversation:deleted` (already goes through ChatMessageService)**

**File: `apps/agent/src/services/chat/chat-message-service.ts` — `handleConversationDeleted` (line 1321)**

Add `clearSessionTitleState(message.session_id);` alongside existing `clearSessionTools`/`clearSessionFiles`.

**Path B: Sidebar delete (direct IPC, bypasses protocol path)**

**File: `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` — `handleDeleteConversation` (line 398)**

Add after existing `clearSessionTools`/`clearSessionFiles` calls (line 410):

```typescript
clearSessionTitleState(sessionId);
```

**Path C: Workspace/worktree reset (UIStore clears conversations array)**

These paths clear `conversations`, `activeConversationId`, and `activeConversationTitle` but never clean up module-level Maps in session-title-service. Affected UIStore actions: `initializeWorkspace` (line 322), `removeWorktree` (line 699), `switchToWorktree` (line 730).

**Constraint**: UIStore cannot import from session-title-service (circular dep — session-title-service already imports `useUIStore`). A `useEffect` on `workspacePath` is too blunt: `system:init` calls `initializeWorkspace(cwd)` when `!workspacePath` (first session bootstrap), which would fire the effect and wipe `freshestTitles` for the session whose title was just set at `use-chat-messages.ts:311`.

**Solution**: Module-level Zustand subscription in `session-title-service.ts` that tracks `workspacePath` and skips the `null → path` first-init transition:

```typescript
// In session-title-service.ts — at module scope, after Map declarations

function clearAllTitleState(): void {
  freshestTitles.clear();
  pendingTitles.clear();
  aiTitleGenerated.clear();
  aiTitleInFlight.clear();
  titlesNeedingRetry.clear();
  titleSessionAliases.clear();
}

// Seed from current state — handles late import (module loaded after workspacePath is already set).
let _prevWorkspacePath: string | null | undefined =
  useUIStore.getState().workspacePath ?? undefined;

// HMR guard: store the unsubscribe handle so Vite can clean up on hot reload.
// Without this, each HMR cycle adds another listener, duplicating cleanup calls.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _workspaceUnsub?.();
  });
}

const _workspaceUnsub = useUIStore.subscribe((state) => {
  const wp = state.workspacePath;
  if (
    _prevWorkspacePath !== undefined &&
    _prevWorkspacePath !== null &&
    _prevWorkspacePath !== wp
  ) {
    clearAllTitleState();
  }
  _prevWorkspacePath = wp;
});
```

> **Seed logic**: `_prevWorkspacePath` is initialized from `useUIStore.getState().workspacePath`.
> If the module is imported after `workspacePath` is already set (e.g., lazy import), the first
> observed workspace switch still triggers cleanup correctly. Uses `?? undefined` so `null`
> workspace (no workspace open) is treated as "has a value, track it".
>
> **HMR guard**: Vite's HMR re-executes module scope on hot reload. Without `dispose`, each
> reload adds another `subscribe` listener. The guard tears down the old subscription first.
>
> **Transition rules**:
>
> - `undefined` (module just loaded, no workspace ever set) → any: skip clear
> - `null` (workspace explicitly closed) → path: skip clear (re-init, not switch)
> - `path → different path`: clear — previous workspace's state is stale
> - `path → null`: clear — stale state
>
> `clearAllTitleState` is NOT exported — workspace-level cleanup is fully self-contained.

### Change 6: Manual rename through title service

**File: `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` (lines 372-396)**

Replace the entire `handleRenameConversation` body to route through `applyManualSessionTitle`:

```typescript
const handleRenameConversation = useCallback(
  (sessionId: string, newTitle: string): void => {
    const previousTitle = useUIStore
      .getState()
      .conversations.find((c) => c.sessionId === sessionId)?.title;

    setEditingConversationId(null);

    void applyManualSessionTitle(sessionId, newTitle)
      .then((written: boolean) => {
        toast.success(written ? 'Conversation renamed' : 'Conversation renamed (pending save)');
        if (!written) {
          logger.debug('Rename deferred: JSONL not found yet', { sessionId });
        }
      })
      .catch((err: unknown) => {
        if (previousTitle !== undefined) {
          updateConversationTitle(sessionId, previousTitle);
        }
        logger.error('Failed to persist renamed conversation title', err);
        toast.error('Failed to rename conversation');
      });
  },
  [setEditingConversationId, updateConversationTitle]
);
```

> `applyManualSessionTitle` handles both the optimistic UIStore update and `freshestTitles`
> population, so the renamed title survives stale `conversation:loaded` reads.
> Import `applyManualSessionTitle` from `@/services/session`.
> Remove direct import of `conversationUpdateTitle` if no longer used in this file.

### Change 7: Fix misleading comment in conversation-handlers.ts

**File: `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts` (lines 127-142)**

Update the comment to match actual behavior:

```typescript
// Conversation not found on disk — likely a cache-only session
// (created via "New Session" but SDK hasn't written the JSONL file yet).
// Return empty messages with 'Untitled' fallback. The header will use
// getPreferredTitle() to show the in-memory title (AI or manual) if one exists,
// so this fallback only appears when no title has been applied yet.
```

---

## Do NOT Change

| What                                                                             | Why                                                                               |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `setConversations` merge (UIStore 401-407)                                       | Already guards against stale disk titles by exact sessionId                       |
| `generateAITitle` dedup logic (193-214)                                          | Working correctly with alias resolution                                           |
| `handleConversationCreated` title (line 994)                                     | Title from create request, not disk                                               |
| `handleConversationRewound` title (line 1288)                                    | Hardcoded "Rewind" is intentional                                                 |
| `agent:complete` generation retry (799-811)                                      | Correctly retries _generation_; we add _persistence_ retry after it               |
| Send-time title flow (`chat-actions.ts:145-156`, `use-chat-messages.ts:311-312`) | Already routes through `applySessionTitle` → `freshestTitles` populated correctly |

---

## Files Modified

| File                                                                            | Change                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/common/conversations/src/lib.rs`                                        | `update_title` → `Result<bool>`                                                                                                                                                                                              |
| `src-tauri/src/commands/agent/conversations.rs`                                 | Tauri command → `Result<bool>`                                                                                                                                                                                               |
| `apps/agent/src/lib/api/conversations.ts`                                       | API → `Promise<boolean>`                                                                                                                                                                                                     |
| `apps/agent/src/services/session/session-title-service.ts`                      | `freshestTitles`, `titlesNeedingRetry`, `getPreferredTitle`, `retryPendingPersistence`, `applyManualSessionTitle`, `clearSessionTitleState`, internal `clearAllTitleState` + workspace subscription, modified `persistTitle` |
| `apps/agent/src/services/session/index.ts`                                      | Export new functions (not `clearAllTitleState`)                                                                                                                                                                              |
| `apps/agent/src/services/chat/chat-message-service.ts`                          | Guard `handleConversationLoaded`, add `retryPendingPersistence` in `agent:complete` and `agent:error`, add `clearSessionTitleState` in `handleConversationDeleted`                                                           |
| `apps/agent/src/components/layout/primary-sidebar/hooks/use-sidebar-actions.ts` | Rename via `applyManualSessionTitle`, add `clearSessionTitleState` in delete handler                                                                                                                                         |
| `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts`                  | Fix misleading comment on load-miss path                                                                                                                                                                                     |

---

## Implementation Sequence

1. Rust: `update_title` → `Result<bool>` + update Tauri command → `cargo test`
2. Frontend API: `conversationUpdateTitle` → `Promise<boolean>`
3. `session-title-service.ts`: Add `freshestTitles`, `titlesNeedingRetry`, modify `persistTitle` (return `Promise<boolean>`, no catch), add workspace subscription, add all new exports
4. `session/index.ts`: Update barrel exports
5. `chat-message-service.ts`: Guard `handleConversationLoaded` + add `retryPendingPersistence` in `agent:complete` and `agent:error` + add `clearSessionTitleState` in `handleConversationDeleted`
6. `use-sidebar-actions.ts`: Rename via `applyManualSessionTitle` + add `clearSessionTitleState` in delete handler
7. `conversation-handlers.ts`: Fix misleading comment
8. Tests (including updating existing mock type from `Promise<void>` to `Promise<boolean>`)
9. Verify: `bun run check` + `cargo test` + `cargo clippy` + manual testing

---

## Test Plan

### Rust tests (`crates/common/conversations/src/lib.rs`)

- `update_title` on non-existent session → `Ok(false)`
- `update_title` on existing session → `Ok(true)` + title readable via `read_last_summary`

### Frontend unit tests (`apps/agent/src/__tests__/unit/services/session/session-title-service.test.ts`)

**Prerequisite**: Update existing mock type from `vi.fn<[string, string, string | undefined], Promise<void>>()` to `vi.fn<[string, string, string | undefined], Promise<boolean>>()` with `.mockResolvedValue(true)` as default. Existing tests should continue to pass after this change.

- `getPreferredTitle`: returns undefined with no title applied; returns title after `applySessionTitle`; returns undefined after persist confirms write; follows alias chain after remap
- `retryPendingPersistence`: only retries when `titlesNeedingRetry` has the session; no-op when persist succeeded; no-op when empty; resolves aliases; finds entries under original sessionId when canonicalId has no entry (pre-remap timing)
- `retryPendingPersistence` with in-flight persist: does NOT fire a duplicate persist (gate via `titlesNeedingRetry`)
- `applyManualSessionTitle`: populates `freshestTitles`; calls `persistTitle`; resolves `true`/`false` on success/deferred; **rejects** on real backend error (error propagation — not swallowed)
- `clearSessionTitleState`: clears all Maps/Sets for the given session; scans `titleSessionAliases` for both keys and values; does not affect other sessions
- `clearSessionTitleState` after remap: clears aliases where the session appears as a value (not just as a key)
- `persistTitle` with `written=false`: `freshestTitles` is NOT cleared (title still guards against stale reads); `titlesNeedingRetry` IS populated
- `persistTitle` with backend error: rejects (does NOT return `false`) — callers must catch
- `flushPendingTitle` with backend error: does NOT produce unhandled rejection (has `.catch()`)
- Workspace subscription: `null → path` (first init) does NOT clear title state; `path → different path` DOES clear all title state; late-import seeding (module loaded when `workspacePath` already set) tracks the initial value correctly

### Integration tests (`apps/agent/src/__tests__/services/chat/title-remap-and-retry.test.ts`)

- Apply AI title → send `conversation:loaded` with stale disk title → assert header shows AI title
- Manual rename → send `conversation:loaded` with old disk title → assert header shows renamed title
- `agent:complete` fires → assert `retryPendingPersistence` called
- `agent:error` fires → assert `retryPendingPersistence` called
- Delete from sidebar → assert `clearSessionTitleState` called

### Integration tests (`apps/agent/src/__tests__/integration/hooks/primary-sidebar/use-sidebar-actions.test.tsx`)

- Rename uses `applyManualSessionTitle` (not direct `conversationUpdateTitle`)
- Delete calls `clearSessionTitleState`

### Manual verification

1. Create conversation, send message → observe fallback then AI title
2. Switch to another conversation, switch back → title stays as AI title (not fallback)
3. Rename conversation, switch away and back → renamed title persists (not reverted to fallback)
4. Rename conversation immediately after creation → toast shows success, persists on restart
5. Delete a remapped session → no console errors from stale alias state
6. Switch worktree → previous session titles do not leak into new workspace
7. First session in fresh app → title survives `system:init` bootstrap (workspace subscription doesn't wipe it)
