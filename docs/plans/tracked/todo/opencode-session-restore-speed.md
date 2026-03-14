# Fix: OpenCode session restoration — match Claude backend speed

## Context

When using OpenCode backend: close app → relaunch → pick folder → **empty chat for 2-3 seconds** → skeleton → messages appear. Claude backend restores instantly because it reads local JSONL — no process startup.

**Where the 2-3 seconds go** (profiled from source):
| Step | Time | Description |
|------|------|-------------|
| `opencodeStatus()` | 10-100ms | Check if process running |
| `opencodeStart()` → health poll | **800ms-2s** | Spawn sidecar + 40×250ms retry loop |
| `initClient` + `sseConnect` | ~10ms | Instantaneous |
| `listSessions` + `loadProviders` | 400-800ms | Parallel HTTP calls |
| `restoreSelection` → `validateSession` | 200-300ms | **Extra HTTP call** (GET /session/{id}) |
| `loadSelection` → `loadMessages` | 100-200ms | Fetch messages |

**Three optimizations** eliminate ~90% of the delay:

## Part 1: Pre-warm process (saves 800ms-2s)

The sidecar binary is started with `serve --port {port}` — no workspace path needed. Start it as soon as the backend is OpenCode, even while on the welcome page.

### File: `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts`

Add a pre-warm effect with a generation counter for cancellation, plus a ref to coordinate with `runStartup`. Only pre-warm when there is a persisted session to restore — no point paying the sidecar cost on a fresh first launch.

```typescript
const preWarmRef = useRef<Promise<void> | null>(null);
const preWarmGenerationRef = useRef(0);

// Pre-warm: start OpenCode process while user is on welcome page
useEffect(() => {
  if (activeBackend !== 'opencode') {
    preWarmRef.current = null;
    preWarmGenerationRef.current += 1; // Cancel any in-flight pre-warm
    return;
  }

  // Don't pre-warm if workspace already available (runStartup handles it)
  if (workspacePath) return;

  // Only pre-warm when there is a previous session to restore.
  // Without this gate, every first-time OpenCode user pays the sidecar
  // startup cost while idling on the welcome page with nothing to restore.
  if (useOcSessionStore.getState().activeSessionId === null) return;

  const generation = ++preWarmGenerationRef.current;
  const isStale = (): boolean => preWarmGenerationRef.current !== generation;

  const promise = (async () => {
    try {
      const status = await opencodeStatus().catch(() => ({
        running: false,
        port: null,
        healthy: false,
        binaryPath: null,
        error: null,
      }));
      if (isStale()) return;

      if (status.running && status.port !== null) {
        useBackendStore.getState().setOpencodePort(status.port);
        return;
      }
      const port = await opencodeStart();
      if (isStale()) return; // Backend switched away — don't touch store

      useBackendStore.getState().setOpencodePort(port);
      logger.info('Pre-warmed OpenCode process', { port });
    } catch (error) {
      if (isStale()) return;
      logger.warn('Pre-warm failed, will retry on workspace init', error);
    }
  })();

  preWarmRef.current = promise;
}, [activeBackend, workspacePath]);
```

Then in `runStartup`, await the pre-warm **inside the existing generation envelope**. The generation token is captured first, and `isStale()` is checked after the await:

```typescript
const runStartup = useCallback(
  async (reason: 'activate' | 'workspace' | 'restart'): Promise<void> => {
    if (activeBackend !== 'opencode' || !workspacePath) {
      return;
    }

    // Capture generation BEFORE any async work (including pre-warm wait)
    const generation = startupGenerationRef.current + 1;
    startupGenerationRef.current = generation;
    const isStale = (): boolean => startupGenerationRef.current !== generation;

    // Wait for in-flight pre-warm to complete (avoids double-start race)
    if (preWarmRef.current) {
      await preWarmRef.current.catch(() => {});
      preWarmRef.current = null;
      // Re-check after await — backend/workspace may have changed
      if (isStale()) {
        logger.info('Startup cancelled: stale generation (after pre-warm wait)', { generation });
        return;
      }
    }

    // ...existing startup sequence (opencodeStatus, opencodeStart, initClient, etc.)...
  },
  [activeBackend, workspacePath]
);
```

**Why this works**: By the time the user picks a folder, the sidecar is already running. `runStartup`'s existing `opencodeStatus()` check finds `running: true`, skips `opencodeStart()`, goes straight to `initClient`.

**Why the generation counter is needed in the pre-warm IIFE**: Without cancellation, if the user switches away from OpenCode while pre-warm is in-flight, the async IIFE completes and calls `setOpencodePort(port)` after `opencodeStop()` has already killed the process — leaving a stale port in the store.

**Why the pre-warm await is inside the generation envelope**: The existing `runStartup` captures `generation` before its first async boundary and checks `isStale()` after each await. The pre-warm await is a new async boundary that must follow the same pattern — capture generation first, then check `isStale()` after the await returns.

**Important**: Do NOT set `setOpencodeHealthy(true)` in the pre-warm. The client isn't initialized and SSE isn't connected — only `runStartup` should mark the backend as healthy.

## Part 2: Smarter restore sequencing + skip validate (saves 200-500ms)

### The dependency

`listSessions()` and `restoreSelection()` are **not fully independent**. `ocSessionService.listSessions()` calls `useOcSessionStore.getState().setSessions(...)`, which trims to `MAX_SESSIONS = 30` and nulls any `activeSessionId` not in the retained set (`oc-session-store.ts:52-72`). If `restoreSelection()` runs in parallel and sets `activeSessionId` first via `loadSelection()`, a later `setSessions()` can clear it — even for a valid session that was simply older than the top 30.

### The approach

Run `listSessions` + `loadProviders` in parallel (saves ~400ms), then pass the listed session IDs into `restoreSelection`. This lets restore skip `validateSession` on the happy path (session is in the list) while correctly handling the rare "restored but not listed" case.

### File: `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts`

Change lines 108-117 from sequential:

```typescript
// BEFORE (sequential — restore waits for list+providers, then validate+load)
await Promise.all([ocSessionService.listSessions(), ocSessionService.loadProviders()]);
await getConversationUiBridge('opencode').restoreSelection();
```

To parallel data load, then informed restore. **Crucially, mark the backend healthy after data load succeeds but before session restore** — these are separate concerns:

```typescript
// AFTER: sessions + providers in parallel, then restore with listed-session context
const [sessions] = await Promise.all([
  ocSessionService.listSessions(),
  ocSessionService.loadProviders().catch((error: unknown) => {
    logger.error('Failed to load providers (non-fatal)', error);
  }),
]);
if (isStale()) {
  // ...existing stale cleanup...
  return;
}

// Backend is healthy: process running, client initialized, SSE connected, data loaded.
// Mark healthy HERE — before session restore — because a transient restore failure
// (5xx, network blip) is a conversation-level problem, not a backend-level one.
// The outer catch block should only fire for real backend startup failures.
useBackendStore.getState().setOpencodeHealthy(true);

// Session restore is a separate, non-fatal operation.
// restoreSelection handles all errors internally — it never throws.
logger.info('Data loaded, restoring selection');
await getConversationUiBridge('opencode').restoreSelection({
  listedSessionIds: new Set((sessions ?? []).map((session) => session.id)),
});
```

Move the `setOpencodeHealthy(true)` from its current location (after `restoreSelection`) to here. Remove the old line 125.

**Why `loadProviders` is caught independently**: `Promise.all` rejects on the first rejection. Without the catch, a transient provider API failure would reject the entire group — preventing `setOpencodeHealthy(true)` from running even though session listing succeeded. Provider data is needed for the model selector but not for displaying messages. If providers fail to load, the provider store remains empty and `useOcSelectedModelContextLimit()` falls back to `0` — the model selector will be unusable but the chat still works. Consider adding a visible degraded-state signal or retry path in a follow-up.

### File: `apps/agent/src/services/conversations/oc-ui-bridge.ts`

Remove the `validateSession` call on the happy path. Keep it as an **error-path fallback** to distinguish "session deleted" from "transient failure":

```typescript
// BEFORE
async restoreSelection(): Promise<void> {
  const sessionId = ocConversationRepo.restoreActiveSession();
  if (!sessionId) return;

  const session = await ocSessionService.validateSession(sessionId); // Extra HTTP call!
  if (!session) {
    useOcSessionStore.getState().setActiveSessionId(null);
    localStorage.removeItem(ocConversationRepo.getActiveSessionKey());
    return;
  }
  await loadSelection(sessionId, true);
}

// AFTER
//
// CONTRACT: restoreSelection never throws. All errors are handled internally.
// This is critical because by the time restoreSelection runs, the backend is
// already marked healthy. An escaping error would fall into runStartup's
// generic catch, which sets opcodeHealthy(false) — misclassifying a
// conversation-level failure as a backend failure.
async restoreSelection(
  input?: { listedSessionIds?: Set<string> }
): Promise<void> {
  const sessionId = ocConversationRepo.restoreActiveSession();
  if (!sessionId) {
    logger.info('No session to restore');
    return;
  }

  logger.info('Restoring session selection', { sessionId });

  try {
    // If we have the listed sessions and this session is NOT in the list,
    // validate before attempting to load. This handles the rare case where
    // the restored session is older than the top-30 retention window.
    if (input?.listedSessionIds && !input.listedSessionIds.has(sessionId)) {
      const session = await ocSessionService.validateSession(sessionId);
      if (!session) {
        logger.warn('Restored session not in list and not on server, clearing', { sessionId });
        clearPersistedOcSelection();
        return;
      }
      // Session exists server-side but was pruned from list — add it back
      useOcSessionStore.getState().addSession(session);
    }

    await loadSelection(sessionId, true);
  } catch {
    // loadSelection sets loading/transitioning flags before the HTTP call
    // AND sets activeSessionId. Clear ALL of them on failure.
    useUIStore.getState().setLoadingConversation(false);
    useUIStore.getState().setConversationTransitioning(false);

    // Distinguish "session deleted" from "transient failure" (5xx, network, etc.)
    // validateSession uses session.get() WITHOUT throwOnError — returns null
    // only for confirmed missing sessions, not for transport errors.
    const validation = await ocSessionService.validateSession(sessionId).catch(() => 'unknown' as const);
    if (validation === null) {
      // Confirmed missing — permanently clear persisted selection
      logger.warn('Restored session confirmed deleted, clearing', { sessionId });
      clearPersistedOcSelection();
      return;
    }

    // Transient failure. Clear in-memory selection to prevent the user from
    // sending into a session whose history didn't load. loadSelection() sets
    // activeSessionId BEFORE loadMessages(), so after a transient failure
    // the session is selected but has no visible messages. handleSend() would
    // happily send into it — the AI sees the full server-side history but the
    // user sees nothing. Clearing activeSessionId prevents this and also
    // unblocks sidebar retry: select() calls loadSelection(id, false), which
    // early-returns when id === activeSessionId. With activeSessionId cleared,
    // clicking the same session in the sidebar triggers a fresh load.
    //
    // Trade-off: clearing activeSessionId also clears the Zustand persist key
    // (orbit-oc-sessionId), so auto-restore on next launch is lost. The
    // session is still in the sidebar from listSessions — one click to retry.
    // A separate retry-target key could be added later if auto-restore after
    // transient failure is worth the extra persistence mechanism.
    useOcSessionStore.getState().setActiveSessionId(null);
    logger.warn('Restore failed (transient), cleared selection', { sessionId });
    toast.error('Could not restore your last session');
  }
}
```

Add a small helper to encapsulate clearing the persisted selection:

```typescript
function clearPersistedOcSelection(): void {
  useOcSessionStore.getState().setActiveSessionId(null);
  try {
    localStorage.removeItem(ocConversationRepo.getActiveSessionKey());
  } catch {
    // ignore storage failures
  }
}
```

**Why this is safer than the original proposal**: The original plan caught all `loadSelection` errors and permanently deleted `orbit-oc-sessionId`. But `loadMessages()` uses `throwOnError: true` and throws for transient transport/server/client errors too — not just missing sessions. A 5xx during a sidecar restart would permanently wipe the user's restore state. The error-path `validateSession()` fallback costs one extra HTTP call only on the failure path, which is acceptable since failures are rare.

**Why `restoreSelection` never throws**: By the time `restoreSelection` runs, the backend is fully up (process, client, SSE, data). If it threw, the error would fall into `runStartup`'s generic catch which sets `opcodeHealthy(false)` and shows "Failed to start OpenCode backend" — misreporting a session-level problem as a backend failure. This would incorrectly disable provider actions in `ProvidersSettings.tsx` and show wrong status in `BackendSettings.tsx`. Instead, a single top-level try/catch wraps both the "not in list" validation path AND the `loadSelection` call, so no error can escape — whether the failure originates from the rare pruned-session `validateSession` or from `loadMessages`. Deleted sessions get `clearPersistedOcSelection()`, transient failures clear the in-memory selection and show a specific toast.

**Why transient failure clears `activeSessionId`**: `loadSelection()` sets `activeSessionId` before calling `loadMessages()`. After a transient `loadMessages` failure, the session is selected but has zero visible messages. The chat input is active — `handleSend()` (`use-oc-chat.ts:100`) would send into that session, and the AI would see the full server-side history that the user can't see. Clearing `activeSessionId` prevents this. It also unblocks sidebar retry: `select()` calls `loadSelection(id, false)`, which early-returns when `id === activeSessionId`. With `activeSessionId` cleared, clicking the same session in the sidebar triggers a fresh load.

**Trade-off**: Clearing `activeSessionId` also clears the Zustand persist key (`orbit-oc-sessionId`), so auto-restore on next launch is lost for this specific failure case. The session remains accessible in the sidebar from `listSessions`. A separate `orbit-oc-restore-retry` localStorage key could be added in a follow-up to preserve the auto-restore target without keeping the session dangerously selected.

**Why `restoreSelection` accepts `listedSessionIds`**: This avoids the race where `setSessions()` prunes `activeSessionId` that `loadSelection()` just set. By checking the list before loading, we know the session will survive the prune. For sessions not in the top 30, we validate and `addSession()` to ensure the store retains it.

### Update `ConversationUiBridge` interface

The `restoreSelection` signature changes to accept optional context:

```typescript
// In apps/agent/src/types/backend/conversation-ui-bridge.ts
interface ConversationUiBridge {
  // ...
  restoreSelection(input?: { listedSessionIds?: Set<string> }): Promise<void>;
  // ...
}
```

The Claude UI bridge's `restoreSelection` ignores the parameter (it reads from local JSONL, no server dependency).

## Part 3: Skeleton on mount (eliminates empty chat flash)

### File: `apps/agent/src/components/chat/OcAgentSurface.tsx`

Even with pre-warming, there's a brief window where the startup is still in flight. Show the skeleton instead of an empty chat during this time.

The skeleton must be driven by an "initial restore in progress" signal, **not** by `opcodeHealthy`. The distinction matters: after a transient restore failure, `opcodeHealthy` stays `false` (the backend failed), `sessionId` stays non-null (preserved for retry), and `messages` stays empty — so a condition based on `!opcodeHealthy` would show the skeleton forever. The correct signal is `switchingBackend`, which tracks the actual `runStartup` lifecycle: it goes `true` at the start of `runStartup` (line 62) and `false` in the `finally` block (line 141) regardless of success or failure.

```typescript
import { useIsSwitchingBackend } from '@/stores/backend';

// Inside OcAgentSurface, after useOcChatAdapter():
const isSwitchingBackend = useIsSwitchingBackend();

// Skeleton while startup is in flight AND we have a previous session to restore
const isRestoringSession = isSwitchingBackend && sessionId !== null && messages.length === 0;
```

Update the skeleton condition:

```tsx
{
  isTransitioning || isRestoringSession ? (
    <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none pt-4">
      <ChatSkeleton />
    </div>
  ) : null;
}
```

**Why `switchingBackend` instead of `opcodeHealthy`**: `switchingBackend` tracks the `runStartup` lifecycle — it is `true` from the start of startup and goes `false` in the `finally` block whether startup succeeds or fails. `opcodeHealthy` tracks whether the backend is in a usable state, which lingers at `false` after a transient failure. Using `opcodeHealthy` would wedge the skeleton forever when the session is preserved for retry but the startup has already finished. Other consumers of `opcodeHealthy` (e.g., `ProvidersSettings.tsx:150`) are unaffected — they correctly show degraded state based on backend health, not on restore progress.

**Why `sessionId` is available before startup completes**: `useOcSessionStore` uses Zustand `persist` middleware with the default `localStorage` storage adapter (synchronous). `activeSessionId` is hydrated immediately during store creation — no async hydration race. The adapter's `useOcActiveSessionId()` selector returns the persisted value before any HTTP calls.

**Case analysis:**
| Scenario | `isSwitchingBackend` | `sessionId` | `messages` | Shows |
|----------|:---:|:---:|:---:|:---:|
| Relaunch with previous session | `true` | `"abc"` | `[]` | Skeleton |
| After messages load | `false` | `"abc"` | `[...]` | Messages |
| Restore failed (transient) | `false` | `null` | `[]` | Empty state + session-specific toast |
| Backend startup failed | `false` | `"abc"` | `[]` | Empty state + backend toast |
| First launch (no session) | `true` | `null` | `[]` | Empty state |
| New session (backend ready) | `false` | `"new"` | `[]` | Empty state |
| Sidebar switch | `false` | `"other"` | varies | Existing `isTransitioning` |

**After transient restore failure**: `switchingBackend` goes `false` in the `finally` block, so the skeleton hides. `activeSessionId` is cleared in the catch block, so the user sees empty state with no active session — the chat input won't send into a session with invisible history. The backend is still marked healthy (`opcodeHealthy = true`, set before `restoreSelection`), so provider controls and backend status display correctly. The user sees empty chat + a specific toast ("Could not restore your last session"). The session is still in the sidebar from `listSessions` — clicking it triggers a fresh `loadSelection` (not an early-return, because `activeSessionId` is now `null`).

**After real backend startup failure** (process spawn, health check, client init, or data load): `opcodeHealthy` is set `false` in the catch block, `switchingBackend` goes `false` in `finally`. The user sees the generic "Failed to start OpenCode backend" toast. Provider controls are correctly disabled.

## Expected result

| Phase                   | Before                           | After                                              |
| ----------------------- | -------------------------------- | -------------------------------------------------- |
| Process start           | 800ms-2s (blocking)              | 0ms (pre-warmed on welcome page)                   |
| Data + restore          | ~700ms sequential                | ~400ms (sessions+providers parallel, then restore) |
| Visual flash            | Empty chat → skeleton → messages | Skeleton → messages                                |
| **Total visible delay** | **2-3 seconds**                  | **~400ms**                                         |

## Files to modify

1. `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts` — pre-warm effect + smarter restore sequencing
2. `apps/agent/src/services/conversations/oc-ui-bridge.ts` — skip validate on happy path, error-path fallback, `clearPersistedOcSelection` helper
3. `apps/agent/src/types/backend/conversation-ui-bridge.ts` — add optional `input` param to `restoreSelection`
4. `apps/agent/src/services/conversations/claude-ui-bridge.ts` — update signature (ignore param)
5. `apps/agent/src/components/chat/OcAgentSurface.tsx` — skeleton on mount

## Known edge cases

- **Idle sidecar cost on welcome page**: Pre-warm starts the sidecar while the user is on the welcome page. Gating on `activeSessionId !== null` limits this to relaunch-restore cases. The sidecar idles at ~30MB RSS. Tauri's `RunEvent::Exit` handler (`src-tauri/src/lib.rs:666-688`) disposes the process on app exit — no orphan risk.

- **Health check timeout on concurrent stop**: If `opencodeStop()` kills the process while `opencodeStart()` (called by pre-warm) is inside `wait_for_health`, the Rust health loop runs for up to 10s before timing out. The pre-warm catches this and logs a warning. Mitigated by the generation counter — the stale pre-warm won't mutate store state.

- **Manual Start/Stop/Restart in Backend Settings**: If the user triggers start/stop while pre-warm or `runStartup` is in flight, the Rust `opencode_start` command is process-global (mutex-protected). The generation counter on the frontend ensures only the latest startup touches store state.

- **Provider load failure (degraded state)**: If `loadProviders` fails, the provider store remains empty. `useOcSelectedModelContextLimit()` falls back to `0`, and the model selector will be unusable. `opcodeHealthy` still becomes `true`. Chat works but model selection is broken until next successful provider load. A visible degraded-state indicator and retry mechanism should be added in a follow-up.

- **Transient restore failure**: If `loadMessages` (or the rare pruned-session `validateSession`) fails for transient reasons (5xx, network), `restoreSelection` handles the error internally: clears loading flags, clears `activeSessionId` (preventing sends into invisible history), validates the session to distinguish "deleted" from "transient," and shows a specific toast ("Could not restore your last session"). The error does NOT propagate to `runStartup`'s catch block — `opcodeHealthy` remains `true` because the backend itself is healthy. Provider controls and backend status display correctly. The skeleton hides because `switchingBackend` goes `false` in the `finally` block.

- **Retry after transient failure**: Clearing `activeSessionId` also clears the Zustand persist key (`orbit-oc-sessionId`), so auto-restore on next launch is lost for this failure case. But the session remains in the sidebar from `listSessions`. The user can retry immediately by clicking the session — `select()` calls `loadSelection(id, false)`, which no longer early-returns because `activeSessionId` is `null`. On next launch, there is no auto-restore for that specific session, but it's still visible and clickable in the sidebar. A separate `orbit-oc-restore-retry` localStorage key could be added in a follow-up to preserve auto-restore without keeping the session dangerously selected.

## Verification

1. `bun run check` — typecheck + lint + tests
2. `bunx tauri dev` — full app test:
   - Switch to OpenCode backend, open folder, chat with some messages
   - Quit app completely
   - Relaunch → pick same folder → should see skeleton briefly (~400ms) then messages
   - Compare with Claude backend — should feel comparable
3. Edge cases to verify:
   - First-time OpenCode user (no previous session) → empty state immediately, no skeleton, no sidecar pre-warm
   - Deleted session (server-side) → skeleton briefly, then empty state (graceful fallback via error-path validate)
   - Sidebar session switching still works with skeleton transitions
   - Backend switch: Claude → OpenCode → verify pre-warm activates
   - **Rapid backend toggle**: Claude → OpenCode → Claude → OpenCode — no stale port, no double process
   - **Provider API failure**: Transient `loadProviders` error doesn't prevent session restore
   - **Session older than top 30**: Restored session not in list → validated → added to store → loads correctly
   - **Transient `loadMessages` failure**: Session deselected (can't send into invisible history), toast shown, session clickable in sidebar to retry
