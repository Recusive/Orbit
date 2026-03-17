# Plan: Auto-restart session on OAuth token expiry (401 recovery)

## Context

When an OAuth token expires mid-session, the user's current chat becomes permanently broken — every subsequent message fails with `401 authentication_error`. New chats work fine because they create a fresh SDK `query()` with the refreshed token. The root cause: the Claude Agent SDK's `query()` object caches the OAuth token at creation time. Updating `process.env.CLAUDE_CODE_OAUTH_TOKEN` only affects new queries, not the existing one.

The existing 3-layer defense system (auto-refresh timer, pre-send check, stderr handler) correctly refreshes the token in the Keychain and env var, but the running Query never picks up the new value.

**Goal:** After a 401 + successful token refresh, automatically restart the SDK session (new `query()` with `resume`) so the next message works transparently.

---

## Files Modified

| File                                                | Change                                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `agent-bridge/src/agent/core/agent.ts`              | Add `_needsSessionRestart` flag, `needsSessionRestart()`, `restartSession()` method; set flag in stderr handler |
| `agent-bridge/src/agent/session/session-manager.ts` | Add restart logic in `sendMessage()` with try/catch; improve consumer catch block with auth-aware error         |
| `apps/agent/src/lib/api/agent.ts`                   | Add `'AUTH_RECOVERED'` to `AuthErrorEvent` category union                                                       |
| `apps/agent/src/providers/tauri-provider.tsx`       | Use `event.message` for toast description; hide "Copy command" button for `AUTH_RECOVERED`                      |

---

## Implementation

### 1. Add auth restart flag to `OrbitAgent` (`agent-bridge/src/agent/core/agent.ts`)

- Add `private _needsSessionRestart = false` property
- Add `needsSessionRestart(): boolean` getter
- No separate `clearNeedsRestart()` — `restartSession()` resets the flag directly (audit: avoid dead code)

### 2. Set flag in stderr handler (`agent-bridge/src/agent/core/agent.ts` ~line 947)

In the existing stderr handler, when `AUTH_FAILED`/`SESSION_EXPIRED` is caught and `refreshIfNeeded()` succeeds:

- Set `this._needsSessionRestart = true` (in addition to existing suppression)
- The error is still suppressed from `_onStderrError` (existing behavior)

```typescript
void ClaudeCredentials.refreshIfNeeded().then((result) => {
  if (result.refreshed) {
    logger.info('Auto-refreshed credentials after CLI auth error — suppressing error');
    this._needsSessionRestart = true;
  } else {
    this._onStderrError?.(categorized);
    this._onAuthFailure?.(categorized.message);
  }
});
```

### 3. Add `restartSession()` method to `OrbitAgent` (`agent-bridge/src/agent/core/agent.ts`)

```typescript
async restartSession(): Promise<void> {
  const resumeId = this._currentSessionId;
  if (!resumeId) {
    throw new Error('Cannot restart session: no current session ID');
  }

  logger.info({ resumeId }, 'Restarting session with fresh credentials');

  await this.stopSession();

  // Configure for plain resume (no fork, no replay).
  // shouldEnableReplay evaluates to !resumeSessionId || forkSession = false.
  // This means replay-user-messages is disabled — no slow message replay,
  // and no checkpoint events (acceptable since we're not rewinding).
  this._resumeSessionId = resumeId;
  this._resumeSessionAt = undefined;
  this._forkSession = false;
  this._needsSessionRestart = false;

  await this.startSession();
}
```

Reuses existing `stopSession()` (cleans up query, queue, timers) and `startSession()` (re-reads Keychain credentials, creates new `query()` with `resume`).

### 4. Add restart logic to `SessionManager.sendMessage()` (`agent-bridge/src/agent/session/session-manager.ts` ~line 1740)

After the existing `refreshCredentials()` check. Wrapped in try/catch to handle `restartSession()` failure (audit critical #1: prevents bricked session state).

```typescript
// Layer 3: Restart session if auth was recovered after a 401
if (agent.needsSessionRestart()) {
  logger.info({ sessionId }, 'Restarting session after auth recovery');

  // Cancel old background consumer (its query is dead)
  const consumer = this.sessionConsumers.get(sessionId);
  if (consumer) consumer.cancel();

  // Allow re-initialization for new query
  this.sessionInitFired.delete(sessionId);

  try {
    await agent.restartSession();
    this.startBackgroundConsumer(sessionId, agent);
    logger.info({ sessionId }, 'Session restarted with fresh credentials');
  } catch (restartErr) {
    const errMsg = restartErr instanceof Error ? restartErr.message : String(restartErr);
    logger.error({ sessionId, error: errMsg }, 'Session restart failed');
    this._onAuthError.fire({
      sessionId,
      category: 'REFRESH_FAILED',
      message: `Session restart failed: ${errMsg}. Please start a new chat.`,
      recoverable: false,
    });
    return; // Don't queue message to dead session
  }
}
```

### 5. Improve consumer catch block (`agent-bridge/src/agent/session/session-manager.ts` ~line 1641)

When the consumer loop catches an error and `needsSessionRestart()` is true, fire a specific `AUTH_RECOVERED` error instead of a generic SDK error. Also handles the async race condition (audit critical #2): if the flag isn't set yet but the error looks auth-related, await the refresh explicitly before checking.

```typescript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : 'no stack';
  const isAuthError = /401|unauthorized|authentication|token.*expired/i.test(errorMessage);

  // Guard against async race: stderr handler's refreshIfNeeded() is fire-and-forget.
  // If the consumer catches the error before the refresh resolves, the flag won't be
  // set yet. For auth errors, explicitly await a refresh attempt here.
  if (isAuthError && !agent.needsSessionRestart()) {
    const refreshResult = await ClaudeCredentials.refreshIfNeeded();
    if (refreshResult.refreshed) {
      agent.markNeedsSessionRestart();
    }
  }

  if (agent.needsSessionRestart()) {
    logger.info({ sessionId }, 'Auth recovered — session will restart on next message');
    this._onAuthError.fire({
      sessionId,
      category: 'AUTH_RECOVERED',
      message: 'Session credentials refreshed. Please resend your message.',
      recoverable: true,
    });
  } else {
    logger.error({ sessionId, error: errorMessage }, 'Background consumer error');
    this._onError.fire({ message: `[SDK Error] ${errorMessage}`, stack: errorStack });
  }
}
```

This requires a public `markNeedsSessionRestart()` method on OrbitAgent (called only from session-manager's catch block as the async race fallback).

### 6. Add `AUTH_RECOVERED` category to frontend (`apps/agent/src/lib/api/agent.ts` ~line 124)

```typescript
export interface AuthErrorEvent {
  sessionId: string;
  category:
    | 'TOKEN_EXPIRED'
    | 'REFRESH_FAILED'
    | 'NO_CREDENTIALS'
    | 'INVALID_TOKEN'
    | 'AUTH_RECOVERED';
  message: string;
  recoverable: boolean;
}
```

### 7. Fix frontend toast handler (`apps/agent/src/providers/tauri-provider.tsx` ~line 566)

Use `event.message` from backend for all categories. Hide the "Copy command" action for `AUTH_RECOVERED` since the user doesn't need to run `claude login`.

```typescript
onAgentAuthError((event) => {
  logger.warn('Auth error received', {
    category: event.category,
    recoverable: event.recoverable,
  });

  const showCopyCommand = event.recoverable && event.category !== 'AUTH_RECOVERED';

  toast.error('Authentication Error', {
    description: event.message,
    duration: 10_000,
    action: showCopyCommand
      ? {
          label: 'Copy command',
          onClick: (): void => {
            void navigator.clipboard.writeText('claude login');
          },
        }
      : undefined,
  });
});
```

---

## What happens end-to-end

1. User sends message → 401 from API
2. Stderr handler catches error → `refreshIfNeeded()` → token refreshed → `_needsSessionRestart = true`
3. Consumer `for await` loop throws → catch block detects auth error → confirms flag (or awaits refresh as race guard) → fires `AUTH_RECOVERED` with "Please resend your message"
4. Frontend shows toast: "Session credentials refreshed. Please resend your message." (no "run claude login" link)
5. User sends next message → `sendMessage()` → sees `needsSessionRestart()` → cancels old consumer → `agent.restartSession()` (stop + resume) → starts new consumer → queues message
6. New query has fresh token → API call succeeds → response streams normally

If `restartSession()` fails: unrecoverable `REFRESH_FAILED` error fired, message not queued, user told to start a new chat.

---

## Edge cases addressed

| Edge case                                                       | Handling                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restartSession()` fails (Keychain locked, credentials revoked) | try/catch fires unrecoverable `REFRESH_FAILED`, returns early — session not bricked                                                               |
| Async race: `sendMessage()` runs before stderr refresh resolves | Consumer catch block explicitly awaits `refreshIfNeeded()` for auth errors before checking flag                                                   |
| Two 401s in rapid succession                                    | `_needsSessionRestart` set twice is harmless; double `refreshIfNeeded()` may cause one failed refresh but flag is still set                       |
| User sends message during `restartSession()`                    | `isSessionReady()` returns `false` during restart → throws "not ready" — acceptable                                                               |
| Previous message lost on 401                                    | Expected — it was consumed by the dead query. User resends via toast guidance                                                                     |
| Pending permission requests stale after restart                 | Old `permissionResolvers` entries are orphaned but harmless — resolver callbacks reference the old query. New messages get fresh permission flows |

---

## Verification

1. **Build agent-bridge**: `cd agent-bridge && bun run build:dev`
2. **Start Tauri**: `bunx tauri dev`
3. **Test scenario**:
   - Start a chat, send a message (works)
   - Wait for token to expire (or manually invalidate by clearing Keychain)
   - Send a message → should see "Session credentials refreshed. Please resend your message." toast
   - Send another message → should work normally (session restarted with fresh credentials)
4. **Run existing tests**: `cd agent-bridge && bun test` (ensure no regressions)
5. **Verify toast**: Confirm `AUTH_RECOVERED` toast does NOT show "Copy command" action
