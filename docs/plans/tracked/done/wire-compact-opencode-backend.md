# Plan: Wire `/compact` for OpenCode Backend

## Context

The `/compact` slash command works for the Claude backend (sent to SDK → processed internally → `agent:compact_complete` event clears indicator), but does nothing useful for the OpenCode backend. Currently, `/compact` is sent as plain text via `promptAsync()`, causing the LLM to respond to it literally instead of triggering session compaction.

The OpenCode engine **already has** full compaction support via `session.summarize({ sessionID, providerID, modelID })` — a dedicated HTTP endpoint that prunes old tool outputs, generates an AI summary, and emits `session.compacted` via SSE. The frontend event coordinator **already reloads messages** on `session.compacted` but doesn't trigger the UI indicator.

**Goal**: Intercept `/compact` in the OpenCode send path, call the dedicated summarize endpoint, and show the existing CompactIndicator UI.

---

## Files to Modify

| File                                                          | Change                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/orbit-sdk/src/v2/client.d.ts`                       | Add `summarize()` to the `session` interface (types only)                                     |
| `apps/agent/src/stores/chat/chat-store.ts`                    | Replace `compactingMessageId: string \| null` with per-session `activeCompactions` map        |
| `apps/agent/src/services/opencode/oc-session-service.ts`      | Add `compactSession()` method                                                                 |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`            | Intercept `/compact` in `handleSend`, inject synthetic user message                           |
| `apps/agent/src/services/opencode/oc-event-coordinator.ts`    | Settle compaction on `session.compacted`, `session.deleted`, `session.error`                  |
| `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts`     | Clear OpenCode compaction state in `cleanupOpenCodeState()`, Claude in `cleanupClaudeState()` |
| `apps/agent/src/components/chat/status/compact-indicator.tsx` | Read from per-session compaction state                                                        |
| `apps/agent/src/hooks/agent/handlers/agent-sdk-handlers.ts`   | Migrate Claude compact call to new store shape                                                |
| `apps/agent/src/services/chat/chat-message-service.ts`        | Migrate `handleCompactComplete` to new store shape                                            |

### Test files to add

| File                                                                                   | Coverage                                                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/agent/src/__tests__/unit/stores/chat/compact-state.test.ts`                      | Per-session state transitions, settlement, timeout scoping                    |
| `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter-compact.test.ts`         | `/compact` interception, guards, synthetic message injection                  |
| `apps/agent/src/__tests__/unit/services/opencode/oc-event-coordinator-compact.test.ts` | `session.compacted`, `session.deleted`, `session.error` settlement            |
| `apps/agent/src/__tests__/integration/services/opencode/oc-compact-flow.test.ts`       | End-to-end: real ChatStore + event coordinator, coordinated state transitions |

### Existing test files to update (mechanical rename: `compactingMessageId: null` → `activeCompactions: {}`)

| File                                                                                 | Change  |
| ------------------------------------------------------------------------------------ | ------- |
| `apps/agent/src/__tests__/services/chat/thinking-persistence.test.ts`                | Line 21 |
| `apps/agent/src/__tests__/services/chat/agent-running-timer.test.ts`                 | Line 94 |
| `apps/agent/src/__tests__/services/chat/title-remap-and-retry.test.ts`               | Line 54 |
| `apps/agent/src/__tests__/integration/hooks/chat/use-chat-messages-title.test.tsx`   | Line 59 |
| `apps/agent/src/__tests__/unit/hooks/chat/chat-actions-thinking-persistence.test.ts` | Line 53 |
| `apps/agent/src/__tests__/unit/hooks/chat/chat-actions-title-generation.test.ts`     | Line 54 |

All 6 files have the same pattern in `useChatStore.setState()` test setup blocks. No logic changes needed — just the field name and initial value.

---

## Step 0: Add `summarize()` to the frontend SDK types

The frontend SDK lives at `packages/orbit-sdk/`. Its structure:

- `src/v2/client.js` — **one-line re-export**: `export * from '../../../../Agent-backend/packages/sdk/js/src/v2/client.ts'`
- `src/v2/client.d.ts` — **hand-written type overlay** defining `OrbitClient` interface

At runtime, `client.js` re-exports the auto-generated `OpencodeClient` class, which already has `summarize()` (at `Agent-backend/packages/sdk/js/src/v2/gen/sdk.gen.ts:1745`). The runtime works. The problem is TypeScript: `client.d.ts` defines the `OrbitClient` interface without `summarize()`, so `getClient().session.summarize(...)` won't typecheck.

**Fix: only update `client.d.ts`** — add `summarize()` to the `session` interface. Do NOT touch `client.js` (it's a re-export; the runtime method already exists).

Add after `unrevert()` in the `session` interface (`client.d.ts:755-758`):

```typescript
session: {
  // ... existing methods ...
  unrevert(
    parameters: { sessionID: string; directory?: string; workspace?: string },
    options?: { throwOnError?: boolean }
  ): Promise<ApiResponse<Session>>;
  summarize(
    parameters: { sessionID: string; providerID: string; modelID: string },
    options?: { throwOnError?: boolean }
  ): Promise<ApiResponse<boolean>>;
};
```

**Drift risk:** If the auto-generated SDK adds/removes/renames parameters, this hand-written type will silently drift. The `client.d.ts` file already has this risk for all 11 existing methods. This plan does not fix the systemic drift issue — it matches the existing pattern.

---

## Step 1: Replace `compactingMessageId` with per-session compaction map

The current `compactingMessageId: string | null` is a global singleton with no session scoping, no backend tagging, and no concurrent compaction support. Replace with a per-session map so users can compact any number of sessions independently.

### Retry-safety design

The server's `session.compacted` SSE event carries only `{ sessionID }` — no request ID, no attempt number. This means the SSE handler cannot distinguish between events from different attempts on the same session.

**Solution: don't allow same-session retry.** On timeout, transition to `timed_out` status instead of clearing. The per-session guard checks `activeCompactions[sessionId]`, so the user cannot retry that specific session until cleared by a real settlement event (`session.compacted`, `session.deleted`, `session.error`) or lifecycle teardown. Other sessions are unaffected — the user can compact session B while session A is pending or timed out.

### 1a. Define the type in `chat-store.ts`

```typescript
interface ActiveCompaction {
  /** Which backend initiated this compaction */
  backend: 'opencode' | 'claude';
  /** Synthetic message ID for CompactIndicator binding */
  messageId: string;
  /** Current phase: pending while waiting for settlement, timed_out after safety timeout */
  status: 'pending' | 'timed_out';
}
```

No `sessionId` field inside the record — the session ID is the map key.

### 1b. Replace the state field

```typescript
// Old:
compactingMessageId: string | null;

// New:
activeCompactions: Record<string, ActiveCompaction>;
```

Initialize as `{}`.

### 1c. Replace the actions

```typescript
// Old:
markCompacting: (messageId: string) => void;
markCompacted: () => void;

// New:
markCompacting: (sessionId: string, compaction: ActiveCompaction) => void;
markCompactionTimedOut: (sessionId: string, messageId: string) => void;
settleCompaction: (sessionId: string) => void;
clearCompactionsByBackend: (backend: 'opencode' | 'claude') => void;
```

Implementation:

```typescript
markCompacting: (sessionId, compaction): void => {
  set((draft) => {
    draft.activeCompactions[sessionId] = compaction;
  });
},

markCompactionTimedOut: (sessionId, messageId): void => {
  set((draft) => {
    const entry = draft.activeCompactions[sessionId];
    if (
      entry !== undefined &&
      entry.messageId === messageId &&
      entry.status === 'pending'
    ) {
      draft.activeCompactions[sessionId] = { ...entry, status: 'timed_out' };
    }
  });
},

settleCompaction: (sessionId): void => {
  set((draft) => {
    if (sessionId in draft.activeCompactions) {
      const { [sessionId]: _, ...rest } = draft.activeCompactions;
      draft.activeCompactions = rest;
    }
  });
},

clearCompactionsByBackend: (backend): void => {
  set((draft) => {
    const next: Record<string, ActiveCompaction> = {};
    for (const [sid, entry] of Object.entries(draft.activeCompactions)) {
      if (entry.backend !== backend) {
        next[sid] = entry;
      }
    }
    draft.activeCompactions = next;
  });
},
```

Key behaviors:

- `markCompacting(sessionId, compaction)` — sets compaction for a specific session
- `markCompactionTimedOut(sessionId, messageId)` — transitions `pending` → `timed_out` only if `messageId` matches (scopes timeout to the compaction that created it)
- `settleCompaction(sessionId)` — removes the entry for that session (works for both `pending` and `timed_out`)
- `clearCompactionsByBackend(backend)` — removes all entries for a backend (for lifecycle teardown)
- **Per-session guard**: callers check `activeCompactions[sessionId]` — blocks retry on that session only, other sessions unaffected

### 1d. Update Claude backend compact path

In `agent-sdk-handlers.ts`, replace:

```typescript
// Old:
useChatStore.getState().markCompacting(message.uuid);

// New:
useChatStore.getState().markCompacting(message.session_id, {
  backend: 'claude',
  messageId: message.uuid,
  status: 'pending',
});
```

In `chat-message-service.ts` `handleCompactComplete`, replace:

```typescript
// Old:
useChatStore.getState().markCompacted();

// New:
const { session_id } = message;
const entry = useChatStore.getState().activeCompactions[session_id];
if (entry !== undefined && entry.backend === 'claude') {
  useChatStore.getState().settleCompaction(session_id);
}
```

### 1e. Update `compact-indicator.tsx`

The component receives `messageId` as a prop. Look up compaction status by finding the entry whose `messageId` matches:

```typescript
// Old:
const isCompacting = useChatStore((s) => s.compactingMessageId === messageId);

// New:
const compactionStatus = useChatStore((s) => {
  for (const entry of Object.values(s.activeCompactions)) {
    if (entry.messageId === messageId) {
      return entry.status;
    }
  }
  return null;
});
const isCompacting = compactionStatus === 'pending';
const isTimedOut = compactionStatus === 'timed_out';
```

Add a timed-out visual state:

```tsx
{
  isCompacting ? (
    <>
      <ThinkingDots size={10} speed={1.2} />
      <span className="text-[11px] font-medium text-lg-text-secondary">Context compacting</span>
    </>
  ) : isTimedOut ? (
    <>
      <Minimize2 className="h-3 w-3 text-lg-text-secondary" />
      <span className="text-[11px] font-medium text-lg-text-secondary">
        Context compaction timed out
      </span>
    </>
  ) : (
    <>
      <Minimize2 className="h-3 w-3 text-lg-text-secondary" />
      <span className="text-[11px] font-medium text-lg-text-secondary">Context compacted</span>
    </>
  );
}
```

---

## Step 2: Add `compactSession()` to `oc-session-service.ts`

**Note:** `providerID` and `modelID` are **required** by the server route's Zod validator (`session.ts:512-514`). They must not be optional here — the server returns 400 without them.

```typescript
async compactSession(sessionId: string, providerId: string, modelId: string): Promise<void> {
  logger.info('Compacting session', { sessionId, providerId, modelId });
  await getClient().session.summarize(
    {
      sessionID: sessionId,
      providerID: providerId,
      modelID: modelId,
    },
    { throwOnError: true }
  );
  logger.info('Session compact request sent', { sessionId });
},
```

This calls `POST /session/{sessionID}/summarize` — the same endpoint the OpenCode TUI uses when the user selects "Compact session" from the command palette.

---

## Step 3: Intercept `/compact` in `use-oc-chat-adapter.ts`

### 3a. Add reactive compacting state for current session

Subscribe to the compaction entry for the active session:

```typescript
const activeCompaction = useChatStore(
  (s) => (sessionId !== null ? s.activeCompactions[sessionId] : undefined) ?? null
);
```

### 3b. Modify `handleSend` to intercept `/compact`

```typescript
const handleSend = useCallback(
  (text: string): void => {
    const trimmed = text.trim();
    if (trimmed === '/compact' || trimmed === '/summarize') {
      // Guard: compacting a non-existent session is nonsensical — there's nothing to summarize.
      // Without this, the command falls through to send(), which auto-creates a session via
      // useOcChat.handleSend() and sends "/compact" as literal text to the LLM.
      if (sessionId === null) {
        return;
      }

      // Guard: provider + model are required by the server's Zod validator.
      // Matches TUI behavior: shows toast "Connect a provider to summarize this session".
      if (!providerId || !modelId) {
        toast.warning('Connect a provider to compact this session');
        return;
      }

      // Guard: per-session — don't allow double-compact on this session
      // (blocks both 'pending' and 'timed_out'). Other sessions can compact independently.
      if (useChatStore.getState().activeCompactions[sessionId] !== undefined) {
        return;
      }

      const syntheticId = `oc-compact-${crypto.randomUUID()}`;
      useChatStore.getState().markCompacting(sessionId, {
        backend: 'opencode',
        messageId: syntheticId,
        status: 'pending',
      });

      // Safety timeout: transition to 'timed_out' if session.compacted SSE event
      // never arrives (server crash, SSE reconnect gap, etc.).
      // Does NOT remove the entry — user cannot retry on THIS session because the
      // SSE event has no request correlation. Settlement comes from a real event
      // (session.compacted, session.deleted, session.error) or lifecycle teardown.
      // Other sessions are unaffected.
      //
      // Scoped by messageId: if this compaction settles and a new one starts
      // before the timer fires, the messageId won't match → no-op.
      window.setTimeout(() => {
        useChatStore.getState().markCompactionTimedOut(sessionId, syntheticId);
      }, 30_000);

      void ocSessionService
        .compactSession(sessionId, providerId, modelId)
        .catch((error: unknown) => {
          logger.error('Failed to compact OpenCode session', error, { sessionId });
          useChatStore.getState().settleCompaction(sessionId);
        });
      return; // Don't send as regular message
    }

    void send(text, {
      agent,
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
      ...(variant ? { variant } : {}),
    });
  },
  [agent, modelId, providerId, send, sessionId, variant]
);
```

**Key design decisions (aligned with OpenCode TUI):**

- **`/summarize` alias restored** — the TUI registers both `/compact` and `/summarize` (`aliases: ["summarize"]`)
- **Toast for no provider/model** — matches TUI behavior exactly: `"Connect a provider to summarize this session"`. The TUI shows this as a warning toast, so we do the same via sonner.
- **No agent-busy guard** — the TUI does not check idle/busy before compacting. Removed to match.
- **Per-session guard** — checks `activeCompactions[sessionId]`; blocks retry on THIS session, allows compacting other sessions concurrently
- **Timeout transitions to `timed_out` instead of clearing** — since the server's `session.compacted` event has no request ID, we cannot distinguish late events from different attempts on the same session
- **Timeout scoped by `messageId`** — `markCompactionTimedOut(sessionId, syntheticId)` only transitions if `syntheticId` matches the entry's `messageId`. If compaction A settles and B starts before A's timer fires, `A.messageId !== B.messageId` → A's timer is a no-op.
- `.catch` settles immediately on HTTP error (server rejected the request — no SSE event will arrive)

### 3c. Inject synthetic `/compact` user message into adapted messages

Session-scoped — only appends if this session has an active compaction:

```typescript
const chatMessages = useMemo(() => {
  const msgs = adapted.map((entry) => entry.chat);
  if (activeCompaction !== null) {
    msgs.push({
      id: activeCompaction.messageId,
      role: 'user' as const,
      content: '/compact',
      displayedContent: '/compact',
    });
  }
  return msgs;
}, [adapted, activeCompaction]);
```

The synthetic message renders in both `pending` and `timed_out` states (the CompactIndicator shows different text for each). It disappears only when `settleCompaction(sessionId)` removes the entry.

**UX flow:**

1. User sends `/compact` → synthetic message + "Context compacting" (animated)
   2a. `session.compacted` arrives → synthetic message vanishes → `loadMessages()` shows inline `*Context compacted*`
   2b. 30s passes → indicator changes to "Context compaction timed out" → user navigates away or waits for late settlement
   2c. HTTP error → synthetic message vanishes immediately

---

## Step 4: Wire settlement in `oc-event-coordinator.ts`

### 4a. `session.compacted` handler (line 196-202)

Settle compaction by sessionId:

```typescript
case 'session.compacted':
  logger.info('Session compacted, reloading messages', {
    sessionId: payload.properties.sessionID,
  });
  useChatStore.getState().settleCompaction(payload.properties.sessionID);
  void ocSessionService.loadMessages(payload.properties.sessionID).catch((error: unknown) => {
    logger.error('Failed to reload compacted OpenCode session', error);
  });
  break;
```

### 4b. `session.deleted` handler (line 62-71)

Settle compaction if the deleted session had one in progress:

```typescript
case 'session.deleted':
  // ... existing code ...
  useOcSessionStore.getState().clearPendingSend(payload.properties.info.id);
  useChatStore.getState().settleCompaction(payload.properties.info.id);
  break;
```

### 4c. `session.error` handler (line 91-98)

Settle compaction immediately on session error instead of waiting for timeout:

```typescript
case 'session.error':
  if (payload.properties.sessionID && payload.properties.error) {
    // ... existing error handling ...
    useChatStore.getState().settleCompaction(payload.properties.sessionID);
  }
  break;
```

---

## Step 5: Symmetric compaction cleanup in lifecycle teardown

In `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts`, both cleanup functions must clear compaction state for their respective backend. Without this:

- A backend switch from OpenCode → Claude leaves OpenCode compaction entries orphaned
- A backend switch from Claude → OpenCode leaves Claude compaction entries orphaned

### 5a. Update `cleanupOpenCodeState()` (line 27-42)

```typescript
function cleanupOpenCodeState(): void {
  ocSseManager.disconnect();
  destroyClient();
  useChatStore.getState().clearCompactionsByBackend('opencode');
  const sessionState = useOcSessionStore.getState();
  // ... rest of existing cleanup ...
}
```

### 5b. Update `cleanupClaudeState()` (line 18-25)

```typescript
function cleanupClaudeState(): void {
  useQueuedMessageStore.getState().clearQueue();
  useToolStore.getState().clearPermissions();
  useChatStore.getState().clearCompactionsByBackend('claude');
  const activeSession = useChatStore.getState().activeSessionId;
  if (activeSession) {
    useCheckpointStore.getState().clearSessionCheckpoints(activeSession);
  }
}
```

**Note:** `useChatStore` is already imported in this file (line 11).

---

## Step 6: Tests

### 6a. Store state transitions (`compact-state.test.ts`)

```
describe('per-session compaction state')
  ✓ markCompacting adds entry for sessionId with status 'pending'
  ✓ markCompacting on different sessionId adds a second entry (concurrent compaction)
  ✓ markCompactionTimedOut transitions pending → timed_out when messageId matches
  ✓ markCompactionTimedOut is no-op when messageId does not match (stale timeout)
  ✓ markCompactionTimedOut is no-op when sessionId has no entry
  ✓ markCompactionTimedOut is no-op when status is already timed_out
  ✓ settleCompaction removes entry for matching sessionId (pending)
  ✓ settleCompaction removes entry for matching sessionId (timed_out)
  ✓ settleCompaction is no-op when sessionId has no entry
  ✓ settleCompaction does not affect other sessions' entries
  ✓ clearCompactionsByBackend removes all entries for that backend
  ✓ clearCompactionsByBackend does not affect entries from other backend
  ✓ stale timeout: A settles → B starts on same session → A's timer fires → B unaffected
```

### 6b. `/compact` interception (`use-oc-chat-adapter-compact.test.ts`)

```
describe('/compact interception')
  ✓ '/compact' calls compactSession and does not call send()
  ✓ '/summarize' calls compactSession (alias)
  ✓ '/compact' with no active session returns early (does not fall through to send)
  ✓ '/compact' with no providerId shows toast warning and returns early
  ✓ '/compact' with no modelId shows toast warning and returns early
  ✓ '/compact' while this session has activeCompaction returns early (per-session guard)
  ✓ '/compact' while timed_out on this session returns early (no same-session retry)
  ✓ '/compact' on session B while session A is compacting succeeds (independent)
  ✓ markCompacting is called with backend='opencode' and correct sessionId
  ✓ compactSession error calls settleCompaction
  ✓ non-compact text calls send() normally
  ✓ synthetic message appears when this session has activeCompaction
  ✓ synthetic message does NOT appear when viewing a session without activeCompaction
```

### 6c. Event coordinator settlement (`oc-event-coordinator-compact.test.ts`)

```
describe('compaction settlement via SSE')
  ✓ session.compacted calls settleCompaction with sessionID
  ✓ session.compacted calls loadMessages after settlement
  ✓ session.deleted settles compaction for matching session
  ✓ session.error settles compaction for matching session
  ✓ session.compacted for session A does not affect session B's compaction
```

### 6d. Lifecycle teardown (symmetric cleanup)

Add to existing `use-opencode-lifecycle.test.tsx`:

```
describe('cleanupOpenCodeState')
  ✓ clears all opencode compaction entries
  ✓ does NOT clear claude compaction entries

describe('cleanupClaudeState')
  ✓ clears all claude compaction entries
  ✓ does NOT clear opencode compaction entries
```

### 6e. Claude backward compatibility

```
describe('Claude /compact backward compatibility')
  ✓ markCompacting with backend='claude' works
  ✓ handleCompactComplete settles claude compaction
  ✓ handleCompactComplete does NOT settle opencode compaction
```

### 6f. Integration: store + event coordinator coordinated flow

`apps/agent/src/__tests__/integration/services/opencode/oc-compact-flow.test.ts`

Exercises the real ChatStore + `oc-event-coordinator.handleGlobalEvent()` path with actual Zustand state:

```
describe('OpenCode /compact coordinated flow')
  ✓ happy path: markCompacting → session.compacted → entry removed
  ✓ timeout path: markCompacting → fake timer → timed_out → late session.compacted → removed
  ✓ error path: markCompacting → session.error → entry removed
  ✓ delete path: markCompacting → session.deleted → entry removed
  ✓ concurrent: compact A + compact B → session.compacted(A) → only A removed, B still pending
  ✓ backend switch: markCompacting(opencode) → cleanupOpenCodeState() → entry removed
  ✓ cross-backend: markCompacting(claude, session1) → session.compacted(opencode, session2) → claude entry unaffected
  ✓ stale timeout: markCompacting(A) → settleCompaction(A) → markCompacting(B same session) → A timer → B unaffected
```

---

## Data Flow

```
User types "/compact" → Enter
     ↓
handleSend() intercepts (text === '/compact')
     ↓
Guards: provider/model selected? agent idle? activeCompactions[sessionId] === undefined?
     ↓  (any guard fails → early return, no-op)
markCompacting(sessionId, { backend: 'opencode', messageId, status: 'pending' })
  → entry added to activeCompactions map
  → CompactIndicator shows "Context compacting"
Start 30s safety timeout → markCompactionTimedOut(sessionId, messageId)
     ↓
ocSessionService.compactSession(sessionId, providerId, modelId)
     ↓  (HTTP POST /session/{id}/summarize)
OpenCode engine: prunes old tool outputs, generates AI summary
     ↓  (SSE event)
session.compacted event fires
     ↓
oc-event-coordinator:
  1. settleCompaction(sessionId)  →  entry removed from map, synthetic message vanishes
  2. loadMessages(sessionId)     →  Message list refreshes with inline *Context compacted*

     ↓  (on HTTP error)
.catch: settleCompaction(sessionId)  →  Entry removed immediately, logs error

     ↓  (if SSE event never arrives — server crash, reconnect gap)
30s timeout → markCompactionTimedOut(sessionId, messageId)
  → status: 'timed_out'
  → CompactIndicator shows "Context compaction timed out"
  → User CANNOT retry on THIS session (per-session guard blocks)
  → User CAN compact OTHER sessions (independent entries)
  → Cleared by: late session.compacted, session.deleted, session.error, lifecycle teardown

     ↓  (stale timeout: A settles, B starts on same session, A's timer fires)
markCompactionTimedOut(sessionId, A.messageId) → A.messageId !== B.messageId → no-op ✓

     ↓  (concurrent compaction: sessions A and B both compacting)
session.compacted(A) → settleCompaction(A) → only A removed, B still pending ✓

     ↓  (if backend switch / workspace removal / crash restart)
cleanupOpenCodeState() → clearCompactionsByBackend('opencode')
cleanupClaudeState()   → clearCompactionsByBackend('claude')
```

---

## Import additions

**`use-oc-chat-adapter.ts`**: Add `useChatStore` and `toast` imports:

```typescript
import { toast } from 'sonner';

import { useChatStore } from '@/stores/chat/chat-store';
```

Note: `useOcSessionStore` is already imported in this file (line 27).

**`oc-event-coordinator.ts`**: Add `useChatStore` import:

```typescript
import { useChatStore } from '@/stores/chat/chat-store';
```

---

## What NOT to touch

- `MessageItem.tsx` — Already has `/compact` detection logic (line 367)
- `packages/orbit-sdk/src/v2/client.js` — One-line re-export; runtime `summarize()` already exists via auto-generated SDK

## What to update (backward-compatible)

- `agent-sdk-handlers.ts` — Claude backend `/compact` call updated to `markCompacting(sessionId, { backend: 'claude', ... })`
- `chat-message-service.ts` — `handleCompactComplete` updated to use `settleCompaction(sessionId)`
- `compact-indicator.tsx` — Read from per-session map, add `timed_out` visual state
- `use-opencode-lifecycle.ts` — Both cleanup functions clear compaction entries for their backend

---

## Verification

### Happy path

1. Start the app with OpenCode backend: `bunx tauri dev`
2. Open a conversation with some messages
3. Type `/compact` and press Enter
4. Expect: CompactIndicator shows "Context compacting" (animated dots)
5. After a few seconds: synthetic message vanishes, messages reload with inline `*Context compacted*`
6. Messages in the chat should reflect the compacted state (pruned tool outputs, summary)
7. Verify Claude backend `/compact` still works unchanged
8. Run `bun run check` to verify types and lint
9. Run `bun run test` to verify all new and existing tests pass

### Edge case verification

10. Type `/compact` with no provider/model selected → should show toast warning
11. Type `/summarize` → should work identically to `/compact` (alias)
12. Type `/compact` twice quickly on same session → second should no-op
13. Switch sessions during compaction → synthetic message only in originating session
14. Type `/compact` on an empty session → verify server handles gracefully
15. Delete session during compaction → entry removed, next `/compact` works
16. Kill the OpenCode server during compaction → indicator changes to "timed out" after 30s
17. After timeout on session A, retry `/compact` on session A → should be blocked
18. After timeout on session A, `/compact` on session B → should succeed (independent)
19. After timeout, if late `session.compacted` arrives → should settle and clear
20. Switch backend to Claude during compaction → `cleanupOpenCodeState()` clears OpenCode entries
21. Switch Claude → OpenCode with Claude compaction active → `cleanupClaudeState()` clears it
22. Remove workspace during compaction → cleanup clears entries
23. `session.error` during compaction → indicator clears immediately
24. Compaction A settles quickly, B starts on same session, A's 30s timer fires → B unaffected
25. Compact sessions A, B, C simultaneously → each gets independent indicator and settles independently
26. Type `/compact` with no active session (brand-new conversation) → should no-op, must NOT fall through to send() and create a session
