# Plan: Bulletproof Rewind/Fork Session Error Handling

## Context

Production error: user rewound to a message in a session that never received `system:init` from the SDK. The fork failed with "No SDK session ID available", but the frontend ignored the failure and continued sending `set_model` + `send_message` to the broken session. The dead ProcessTransport caused unhandled promise rejections that crashed the bridge.

This has been a recurring pain point — the fix needs to be defense-in-depth across all layers so no single failure point causes a cascade.

### Error Chain (from logs)

1. `fork_session_at` for session `2828d0b4-...` → "No SDK session ID available" (session exists but `_currentSessionId` is undefined)
2. Frontend ignores fork error, sends `set_model` → "ProcessTransport is not ready for writing" (3 retries, all fail)
3. Frontend sends `send_message` → unhandled promise rejection crashes bridge

---

## Phase 1: Bridge Transport Guards (Prevent Crash)

**Goal:** Make it impossible for a dead transport to crash the bridge. Even if everything else fails, no unhandled rejections.

### 1A. Harden `isSessionReady()` — `agent.ts:1322`

Add `_currentSessionId` check so operations are blocked on sessions that never initialized:

```typescript
isSessionReady(): boolean {
  return this.sessionActive && this.messageQueue !== null && this._currentSessionId !== undefined;
}
```

This automatically protects `sendMessage()` (session-manager.ts:1910) which already checks `agent.isSessionReady()`.

### 1B. Wrap `setModel()` transport write — `agent.ts:1821`

Currently, if `currentQuery.setModel()` rejects (dead transport), `withRetry` exhausts retries and throws. This propagates to the IPC handler but the error message is confusing.

**Change:** Catch the transport error inside `setModel()` itself. The model preference is saved either way (line 1822 `this.model = model`), so a failed transport write is non-fatal:

```typescript
async setModel(model: string): Promise<void> {
  this.model = model;
  if (this.currentQuery && this.sessionActive) {
    try {
      await withRetry(async () => currentQuery.setModel(model), { ...RetryPresets.quick, operationName: 'setModel' });
    } catch (err) {
      logger.warn({ model, error: err instanceof Error ? err.message : String(err) },
        'setModel transport write failed — preference saved for next session');
    }
  }
}
```

### 1C. Guard `setModel()` in session-manager — `session-manager.ts:2049`

Save preference FIRST, then attempt transport write. Never propagate transport errors from model changes:

```typescript
async setModel(sessionId, model): Promise<void> {
  // Always save preference (survives transport failure)
  const prefs = this.modePreferences.get(sessionId) ?? {};
  prefs.model = model;
  this.modePreferences.set(sessionId, prefs);

  const agent = this.activeSessions.get(sessionId);
  if (!agent) return;

  await agent.setModel(model); // agent.setModel already catches internally (1B)
}
```

### 1D. Guard `queueMessage()` in sendMessage — `session-manager.ts:1962`

The `agent.queueMessage()` call is synchronous but can trigger async SDK processing that rejects. Wrap in try/catch:

```typescript
try {
  agent.queueMessage(message, attachments);
} catch (queueErr) {
  const errMsg = queueErr instanceof Error ? queueErr.message : String(queueErr);
  logger.error({ sessionId, error: errMsg }, 'queueMessage failed — transport may be dead');
  this._onError.fire({ message: `Message send failed: ${errMsg}`, sessionId });
  throw new Error(`Failed to queue message: ${errMsg}`);
}
```

### 1E. Add `_currentSessionId` check to `sendMessage()` — `session-manager.ts` after line 1912

After `isSessionReady()` passes, also verify SDK session ID exists (belt + suspenders with 1A):

```typescript
if (!agent.getCurrentSessionId()) {
  throw new Error(`Session ${sessionId} has no SDK session ID — CLI may have failed to start`);
}
```

**Files:** `agent-bridge/src/agent/core/agent.ts`, `agent-bridge/src/agent/session/session-manager.ts`

---

## Phase 2: Bridge SDK Session ID Wait (Fix Root Cause)

**Goal:** Don't fail immediately when `_currentSessionId` is undefined — wait for `system:init` with a timeout.

### 2A. Add polling wait in `forkSessionAt()` — `session-manager.ts:2225`

Replace the immediate throw with a polling loop (pattern already exists at `forkSession()` line 2356):

```typescript
const WAIT_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 100;
let sdkSessionId = agent.getCurrentSessionId();

if (!sdkSessionId) {
  logger.info({ sessionId }, 'Waiting for SDK session ID (system:init may be in flight)...');
  const start = Date.now();
  while (!sdkSessionId && Date.now() - start < WAIT_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    sdkSessionId = agent.getCurrentSessionId();
  }
}

if (!sdkSessionId) {
  throw new Error(
    `Session ${sessionId} never received SDK session ID after ${WAIT_TIMEOUT_MS}ms. ` +
      'The CLI subprocess may have failed to start. Please start a new conversation.'
  );
}
```

**File:** `agent-bridge/src/agent/session/session-manager.ts`

---

## Phase 3: Bridge Transaction Safety (Prevent Session Orphaning)

**Goal:** If `createSession()` fails after `deleteSession()`, recover the original session instead of orphaning.

### 3A. Add recovery path in `forkSessionAt()` — `session-manager.ts:2259-2276`

Wrap the `createSession` call in try/catch with rollback to original:

```typescript
// Step 4: Delete the current session
await this.deleteSession(sessionId);

// Step 5: Create new session. If this fails, recover the original.
try {
  await this.createSession(sessionId, {
    resumeSessionId: newSdkSessionId,
    forkSession: true,
    cwd: savedCwd,
    ...savedPrefs,
  });
} catch (createErr) {
  logger.error(
    { sessionId, error: createErr },
    'forkSessionAt: createSession failed — recovering original'
  );
  try {
    await this.createSession(sessionId, {
      resumeSessionId: sdkSessionId,
      cwd: savedCwd,
      ...savedPrefs,
    });
    logger.info({ sessionId }, 'forkSessionAt: original session recovered');
  } catch (recoveryErr) {
    logger.error(
      { sessionId, error: recoveryErr },
      'forkSessionAt: RECOVERY FAILED — session orphaned'
    );
  }
  // Clean up intermediate copy
  void deleteSessionJsonl(newSdkSessionId, savedCwd).catch(() => {});
  throw createErr;
}
```

**File:** `agent-bridge/src/agent/session/session-manager.ts`

---

## Phase 4: Frontend Fork Failure Propagation (UX Recovery)

**Goal:** When fork fails, tell the user instead of silently proceeding into a broken state.

### 4A. Add `fork_failed` to protocol — `protocol.ts`

Add optional fields to `ConversationRewoundSchema`:

```typescript
fork_failed: z.boolean().optional(),
fork_error: z.string().optional(),
```

### 4B. Propagate fork failure — `conversation-handlers.ts:328-337`

Track fork result, include in `conversation:rewound` event:

```typescript
let forkFailed = false;
let forkError: string | undefined;

if (sdkMessageId && !useFrontendMessages) {
  try {
    await agentForkSessionAt(session_id, sdkMessageId);
    checkpointStore.setPendingConversationFork(session_id, sdkMessageId);
  } catch (forkErr) {
    forkFailed = true;
    forkError = forkErr instanceof Error ? forkErr.message : String(forkErr);
    logger.error('Session fork FAILED — session may be unhealthy', { error: forkError, session_id });
  }
}

// In ALL three window.postMessage calls below, add:
...(forkFailed ? { fork_failed: true, fork_error: forkError } : {}),
```

### 4C. Add `unhealthyReason` to ChatSessionData — `chat-store.ts:58`

```typescript
export interface ChatSessionData {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  isStopPending: boolean;
  /** If set, the session is broken — sends are blocked until recreated */
  unhealthyReason?: string;
}
```

Add actions:

- `setSessionUnhealthy(id: string, reason: string)` — sets `draft.sessions[id].unhealthyReason = reason`
- `clearSessionUnhealthy(id: string)` — deletes `draft.sessions[id].unhealthyReason`

### 4D. Handle fork failure in `handleConversationRewound` — `chat-message-service.ts:1320`

After existing logic, add fork failure handling:

```typescript
if (message.fork_failed) {
  useChatStore.getState().setSessionUnhealthy(sid, message.fork_error ?? 'Rewind fork failed');
  // Visual rewind still applies (messages truncated in UI), but sends are blocked
}
```

### 4E. Block sends to unhealthy sessions — `chat-actions.ts`

In `handleSend()`, before the first `postMessage`:

```typescript
const session = chatStore.sessions[sessionId];
if (session?.unhealthyReason) {
  toast.error('Session unavailable', {
    description: 'This session encountered an error. Please start a new conversation.',
  });
  return;
}
```

### 4F. Block queued auto-sends — `use-queued-message.ts:41`

In the useEffect that processes queued messages:

```typescript
const session = useChatStore.getState().sessions[sessionId];
if (session?.unhealthyReason) {
  clearQueue();
  return;
}
```

**Files:**

- `apps/agent/src/types/protocol/protocol.ts`
- `apps/agent/src/hooks/agent/handlers/conversation-handlers.ts`
- `apps/agent/src/stores/chat/chat-store.ts`
- `apps/agent/src/services/chat/chat-message-service.ts`
- `apps/agent/src/hooks/chat/handlers/chat-actions.ts`
- `apps/agent/src/components/chat/queued-message/use-queued-message.ts`

---

## Implementation Order

1. **Phase 1** (bridge guards) — immediately stops crashes. No frontend changes needed. Deploy independently.
2. **Phase 2** (SDK session ID wait) — fixes the root cause of the fork failure. Pure bridge change.
3. **Phase 3** (transaction safety) — prevents session orphaning on partial failure. Pure bridge change.
4. **Phase 4** (frontend UX) — gives users a clear error. Requires Phase 1-3 deployed first.

Each phase is independently deployable and beneficial.

---

## Verification

### Bridge

```bash
cd agent-bridge && bun test           # Existing integration tests
cd agent-bridge && bun run typecheck  # Type safety
```

### Frontend

```bash
bun run test          # Vitest unit tests
bun run typecheck     # TypeScript
bun run lint          # ESLint
```

### Manual Testing

1. **Happy path:** Rewind a message → fork succeeds → send new message → works
2. **Kill CLI subprocess** mid-session → try to rewind → should show error toast, not crash
3. **Rapid rewind:** Rewind → immediately rewind again → should not orphan sessions
4. **Model set on dead transport:** Kill CLI → try to change model → should log warning, not crash
5. **Queued message after failed rewind:** Queue a message → rewind fails → queue should be cleared

### Full Rebuild

```bash
cd agent-bridge && bun run build:dev  # Rebuild sidecar binary
bunx tauri dev                        # Test in full app
```
