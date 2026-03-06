# Fix: OAuth Token Expiry Breaks App — Session Never Recovers

## Context

When a user's OAuth token expires (8-hour window), Orbit becomes completely broken. Other apps (Claude Code CLI, Conductor) handle this gracefully by refreshing the token, but Orbit shows "Authentication Error — No credentials found" repeatedly, even after the user re-authenticates via `claude login`.

**The app is non-functional** on affected systems — every message fails with "Failed to send error".

## Root Cause: 3-Bug Chain

The failure is a chain of three bugs that compound:

### Bug 1: `refreshIfNeeded()` misses externally-refreshed tokens

**File:** `agent-bridge/src/common/auth/credentials.ts:340-344`

When Claude Code CLI (or another app) refreshes the token and writes to Keychain, `refreshIfNeeded()` reads the NEW expiry, sees "token still valid", and returns `{ refreshed: false }` — **without updating `process.env.CLAUDE_CODE_OAUTH_TOKEN`**. The running CLI subprocess still has the OLD expired token.

```
refreshIfNeeded() flow:
1. Read Keychain expiry → fresh token, not expired → "still valid"
2. Return { refreshed: false } — env var NOT updated
3. CLI subprocess uses stale CLAUDE_CODE_OAUTH_TOKEN → 401
```

### Bug 2: Consumer error handler doesn't mark session for restart

**File:** `agent-bridge/src/agent/session/session-manager.ts:1725-1735`

When the consumer catches a 401, it calls `refreshIfNeeded()`. Because of Bug 1, this returns `{ refreshed: false }` (no error). The code only marks restart when `refreshResult.refreshed === true`, so the session is **never marked for restart**.

```
Consumer catch:
1. isAuthError = true
2. refreshIfNeeded() → { refreshed: false } (Bug 1 false-negative)
3. refreshResult.refreshed is false → session NOT marked for restart
4. Falls to generic error handler → consumer loop ENDS
```

### Bug 3: Session becomes a zombie

After the consumer loop ends (from the error), the session is left in a broken state:

- `sessionActive` is still `true`
- `messageQueue` still exists
- `createdSessions` Set has the sessionId
- But the consumer loop is dead — no one processes messages

Every subsequent `sendMessage()`:

1. `ensureSession()` → "already created" → skip
2. `refreshCredentials()` → Keychain has fresh token → "valid" → returns true
3. `agent.queueMessage()` → message pushed to dead queue → never processed
4. Frontend hangs → "Failed to send error"

### Secondary: `restartSession()` clears flag too early

**File:** `agent-bridge/src/agent/core/agent.ts:1262`

`_needsSessionRestart = false` is set BEFORE `startSession()`. If `startSession()` throws (credentials still expired), the flag is cleared and subsequent retries skip the restart path.

### Secondary: Stderr auth-refresh path is dead code

**File:** `agent-bridge/src/agent/session/session-manager.ts` ~line 1069-1092

`onStderrError` is defined in `OrbitAgentConfig` (agent.ts:147) but session-manager **never passes it** when creating agents. Since `this._onStderrError` is `undefined`, the `if (this._onStderrError)` guard at agent.ts:948 always evaluates to `false`. The entire stderr categorization + `refreshIfNeeded()` + `_needsSessionRestart = true` block (lines 948-989) never executes. This means auth errors are currently detected **only** through the consumer catch path — the stderr early-detection is disabled.

## Fix Plan

### Fix 1: Always mark session for restart on auth errors

**File:** `agent-bridge/src/agent/session/session-manager.ts` ~lines 1725-1753

In the consumer catch block, when `isAuthError` is true, **always** mark the session for restart. The 401 is definitive proof the running session's token is dead — the `refreshIfNeeded()` result is irrelevant for this decision.

```typescript
// BEFORE (broken):
if (isAuthError && !agent.needsSessionRestart()) {
  const refreshResult = await ClaudeCredentials.refreshIfNeeded();
  if (refreshResult.refreshed) {
    agent.markNeedsSessionRestart();
  }
}

// AFTER (fixed):
if (isAuthError) {
  // Only refresh if stderr handler hasn't already done it (avoid double Keychain spawn)
  let refreshResult: TokenRefreshResult | undefined;
  if (!agent.needsSessionRestart()) {
    refreshResult = await ClaudeCredentials.refreshIfNeeded();
  }
  // ALWAYS mark for restart — 401 proves the current session is broken
  agent.markNeedsSessionRestart();
  agent.onAuthFailureDetected(); // Track consecutive auth failures (Fix 2)

  // Split event: AUTH_RECOVERED only when credentials are confirmed refreshed.
  // TOKEN_EXPIRED when restart is planned but credentials may still be stale —
  // frontend keeps "Copy command" (claude login) visible for manual recovery.
  //
  // When stderr handler already refreshed (needsSessionRestart was true),
  // refreshResult is undefined. Use _lastAuthRefreshConfirmed to emit the
  // correct category — avoids showing unnecessary manual-login CTA when
  // the token was actually refreshed successfully by the stderr path.
  //
  // IMPORTANT: Always consume BEFORE combining. Short-circuit (a || b())
  // skips b() when a is true, leaving the flag unconsumed. A stale true
  // would leak into the next auth error and incorrectly emit AUTH_RECOVERED.
  const stderrConfirmed = agent.consumeLastAuthRefreshConfirmed();
  const refreshConfirmed = refreshResult?.refreshed === true || stderrConfirmed;
  if (refreshConfirmed) {
    this._onAuthError.fire({
      sessionId,
      category: 'AUTH_RECOVERED',
      message: 'Credentials refreshed. Session will restart on next message.',
      recoverable: true,
    });
  } else {
    this._onAuthError.fire({
      sessionId,
      category: 'TOKEN_EXPIRED',
      message: 'Authentication failed. Session restart required.',
      recoverable: true,
    });
  }
}
```

**Event semantics:** The frontend (`tauri-provider.tsx:510`) suppresses the "Copy command" button for `AUTH_RECOVERED` — correct when credentials were actually refreshed. When refresh failed or was skipped (stderr handler already handled it), we emit `TOKEN_EXPIRED` instead so the manual `claude login` path remains visible.

This ensures the next `sendMessage()` call triggers `restartSession()`, which spawns a new CLI subprocess with fresh credentials from the Keychain.

### Fix 2: Move `_needsSessionRestart` clear to after successful restart

**File:** `agent-bridge/src/agent/core/agent.ts` ~lines 1245-1265

Move the flag clear to AFTER `startSession()` succeeds. This way, if restart fails (e.g., credentials still expired), the flag stays set and the next attempt retries.

```typescript
// BEFORE (broken):
async restartSession(): Promise<void> {
  // ...
  this._needsSessionRestart = false;  // Cleared BEFORE startSession
  await this.startSession();
}

// AFTER (fixed):
private _consecutiveAuthFailures = 0;
private _authTerminalFailure = false;
private _lastAuthRefreshConfirmed = false;
private static readonly MAX_CONSECUTIVE_AUTH_FAILURES = 3;

/** Called by session-manager on each auth-failure consumer catch (Fix 1) */
onAuthFailureDetected(): void {
  this._consecutiveAuthFailures++;
}

/** Called by session-manager after a successful assistant result turn */
onTurnSucceeded(): void {
  this._consecutiveAuthFailures = 0;
}

/** Check if session is in terminal auth-failure state (fast-fail path) */
isAuthTerminalFailure(): boolean {
  return this._authTerminalFailure;
}

/** Set by stderr handler after successful refresh (before markNeedsSessionRestart).
 *  Consumed once by Fix 1's consumer catch to emit AUTH_RECOVERED instead of
 *  TOKEN_EXPIRED when stderr already confirmed the refresh. */
markAuthRefreshConfirmed(): void {
  this._lastAuthRefreshConfirmed = true;
}

/** Consume-once: returns true if stderr confirmed a refresh, then resets flag. */
consumeLastAuthRefreshConfirmed(): boolean {
  const confirmed = this._lastAuthRefreshConfirmed;
  this._lastAuthRefreshConfirmed = false;
  return confirmed;
}

async restartSession(): Promise<void> {
  if (this._consecutiveAuthFailures >= OrbitAgent.MAX_CONSECUTIVE_AUTH_FAILURES) {
    // Terminal state: stop session explicitly, set terminal flag, clear restart flag.
    // After this, isSessionReady() returns false AND isAuthTerminalFailure() returns true,
    // giving sendMessage() a deterministic fast-fail path with a clear error message.
    this._needsSessionRestart = false;
    this._authTerminalFailure = true;
    await this.stopSession();
    throw new Error(
      `Authentication repeatedly failed (${this._consecutiveAuthFailures} consecutive). Please start a new chat.`
    );
  }

  // ...
  try {
    await this.startSession();
    this._needsSessionRestart = false;  // Clear only AFTER successful start
  } finally {
    // Always clear stale stderr-refresh confirmation after a restart attempt,
    // regardless of success/failure. Without this, a stale true from a previous
    // stderr refresh cycle could leak into the next auth error's event classification
    // and incorrectly emit AUTH_RECOVERED instead of TOKEN_EXPIRED.
    this._lastAuthRefreshConfirmed = false;
  }
}
```

**Important:** This fix only works in combination with Fix 5 (reorder `sendMessage()` checks). Currently `isSessionReady()` is checked BEFORE `needsSessionRestart()` in `sendMessage()`. After a failed restart, `stopSession()` sets `sessionActive = false`, so `isSessionReady()` returns false and throws "Session not ready" before the restart block is ever reached — the preserved flag has no effect. Fix 5 addresses this.

**Terminal state enforcement:** When the auth-failure threshold is hit, `restartSession()` calls `stopSession()` explicitly and sets `_authTerminalFailure = true`. This ensures:

- `isSessionReady()` returns `false` (session is stopped)
- `isAuthTerminalFailure()` returns `true` (sendMessage checks this first for a clear error)
- `_needsSessionRestart` is `false` (no more restart attempts)
- Subsequent `sendMessage()` calls fast-fail with "Authentication permanently failed" instead of the ambiguous "Session not ready"

**Auth failure loop protection:** The counter tracks consecutive auth-failure _turns_, not just restart exceptions. This catches the dangerous loop where `restartSession()` itself succeeds but the first API call immediately 401s again (e.g., upstream token revocation). The counter increments in the consumer catch (Fix 1) and resets only after a successful `result` message is received from the SDK — NOT after a successful `startSession()`. After 3 consecutive auth failures, the session is permanently stopped with `recoverable: false`.

### Fix 3: Sync env var when Keychain token differs (single-read optimization)

**File:** `agent-bridge/src/common/auth/credentials.ts` — rewrite `refreshIfNeeded()`

Refactor `refreshIfNeeded()` to read the Keychain **once** via `readKeychainCredentials()` and extract both expiry and access token from the same result. Then compare the access token with the env var. If they differ (another app refreshed), update the env var and return `refreshed: true`.

This is a **detection** fix: it identifies when another app has refreshed the Keychain token and syncs the env var. However, syncing `process.env` alone does NOT update an already-running CLI subprocess — the subprocess read the env var at spawn time. To actually prevent the next 401, the `sendMessage()` pre-send check must force a session restart when an env sync is detected (see the `reason: 'env_synced'` handling in Fix 5).

The original approach called `getTokenExpiry()` (1 Keychain spawn) then `getOAuthTokenFromKeychain()` (2nd Keychain spawn), doubling latency on every message. This version reads once. Note: the current valid-token path already uses a single Keychain read via `getTokenExpiry()`. The improvement eliminates the second spawn on the expired path and adds env-var comparison on the valid path.

```typescript
// Updated TokenRefreshResult with typed reason:
type RefreshReason = 'no_change' | 'refreshed' | 'env_synced' | 'failed';

interface TokenRefreshResult {
  refreshed: boolean;
  reason: RefreshReason;
  token?: string;
  error?: string;
}

// AFTER (fixed — single Keychain read):
async function refreshIfNeeded(): Promise<TokenRefreshResult> {
  // API key users don't need refresh
  const apiKey = getApiKeyFromEnv();
  if (apiKey !== null) {
    return { refreshed: false, reason: 'no_change' };
  }

  // Single Keychain read — extract both expiry and access token
  const credentials = readKeychainCredentials();
  if (credentials === null) {
    return { refreshed: false, reason: 'failed', error: 'No valid credentials found in keychain' };
  }

  const claudeAuth = credentials.claudeAiOauth;
  if (claudeAuth === undefined) {
    return { refreshed: false, reason: 'failed', error: 'No OAuth credentials in keychain' };
  }

  const expiresAt = claudeAuth.expiresAt;
  const expiryMs = expiresAt !== undefined && expiresAt !== '' ? parseExpiryMs(expiresAt) : null;

  // No expiry info — do a full token load
  if (expiryMs === null) {
    const creds = await getOAuthTokenFromKeychain();
    if (creds !== null) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = creds;
      return { refreshed: true, reason: 'refreshed', token: creds };
    }
    return { refreshed: false, reason: 'failed', error: 'No valid credentials found in keychain' };
  }

  // Token still valid — check if env var is stale (external refresh detection)
  if (Date.now() + EXPIRY_BUFFER_MS < expiryMs) {
    const currentEnvToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const keychainToken = claudeAuth.accessToken;
    if (
      currentEnvToken !== undefined &&
      currentEnvToken !== '' &&
      keychainToken !== undefined &&
      keychainToken !== '' &&
      keychainToken !== currentEnvToken
    ) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = keychainToken;
      logger.info('Keychain token differs from env var — synced (external refresh detected)');
      return { refreshed: true, reason: 'env_synced', token: keychainToken };
    }
    return { refreshed: false, reason: 'no_change' };
  }

  // Token expired or expiring soon — attempt refresh via full Keychain read
  logger.info('Token expired or expiring soon, attempting refresh');
  const refreshedToken = await getOAuthTokenFromKeychain();
  if (refreshedToken !== null) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = refreshedToken;
    logger.info('OAuth token refreshed and env var updated');
    return { refreshed: true, reason: 'refreshed', token: refreshedToken };
  }

  logger.warn('OAuth token refresh failed');
  return { refreshed: false, reason: 'failed', error: 'OAuth token refresh failed' };
}
```

**`reason` field:** Distinguishes 3 cases that need different downstream handling:

- `'no_change'` — token valid, env var matches → no action needed
- `'refreshed'` — actual token refresh performed → env var updated, restart recommended
- `'env_synced'` — Keychain had a different (newer) token → env var updated, restart **required** (current CLI subprocess still has the old token)
- `'failed'` — no valid credentials available → surface auth error to user

**Performance:** The happy path (token valid, no external refresh) does ONE synchronous `readKeychainCredentials()` spawn (~100ms). The current valid-token path also does one spawn via `getTokenExpiry()`, so this is equivalent. The improvement adds env-var comparison (negligible) and eliminates the second spawn on the expired path.

### Fix 4: Detect zombie consumer in sendMessage (with race guard)

**File:** `agent-bridge/src/agent/session/session-manager.ts` — `_startBackgroundConsumer` and `sendMessage`

Add a mechanism to detect when the consumer loop has ended unexpectedly:

1. In `_startBackgroundConsumer`: Add a `finally` block that removes the consumer entry — but **only if it hasn't been replaced** by a restart. Without the identity check, the old consumer's `finally` can race with `_startBackgroundConsumer` during restart and delete the NEW consumer entry.
2. In `sendMessage`: Before queueing, check if consumer is alive. If dead and NOT marked for restart, force mark for restart.

This is a safety net — with Fix 1, the restart flag should already be set. But this catches edge cases where the consumer dies for non-auth reasons.

```typescript
// In _startBackgroundConsumer:
private _startBackgroundConsumer(initialSessionId: string, agent: OrbitAgent): void {
  let sessionId = initialSessionId;
  const state: { cancelled: boolean } = { cancelled: false };
  const cancel = (): void => { state.cancelled = true; };

  // Capture a reference to THIS consumer entry for identity checking
  const consumerEntry = { cancel, state };
  this.sessionConsumers.set(sessionId, consumerEntry);

  void (async () => {
    try {
      // ... existing consumer loop ...
    } catch (error) {
      // ... existing error handling (with Fix 1 changes) ...
    } finally {
      // RACE GUARD: Only delete if we're still the current consumer.
      // During restart, _startBackgroundConsumer sets a NEW entry before
      // this finally runs. Without this check, we'd delete the new entry.
      const current = this.sessionConsumers.get(sessionId);
      if (current === consumerEntry) {
        this.sessionConsumers.delete(sessionId);
      }
    }
  })();
}

// In sendMessage, before queueMessage:
if (!this.sessionConsumers.has(sessionId) && !agent.needsSessionRestart()) {
  logger.warn({ sessionId }, 'Consumer dead but not marked for restart — forcing restart');
  agent.markNeedsSessionRestart();
}
```

### Fix 5: Reorder `sendMessage()` checks so restart can recover a stopped session

**File:** `agent-bridge/src/agent/session/session-manager.ts` — `sendMessage`

Currently, `sendMessage()` checks `isSessionReady()` at line 1844 BEFORE `needsSessionRestart()` at line 1866. After a failed restart (where `stopSession()` ran but `startSession()` threw), `sessionActive = false` → `isSessionReady()` returns false → throws "Session not ready" → the restart block is never reached even though the flag is set.

Move the restart check and zombie detection BEFORE the `isSessionReady()` check:

```typescript
async sendMessage(message: string, sessionId: string, attachments?: AttachmentContentBlock[]): Promise<void> {
  const agent = this.activeSessions.get(sessionId);
  if (agent === undefined) {
    throw new Error(`Session ${sessionId} not found. Call createSession() first.`);
  }

  // Terminal auth failure — fast-fail with clear message (Fix 2)
  if (agent.isAuthTerminalFailure()) {
    throw new Error(`Session ${sessionId} authentication permanently failed. Please start a new chat.`);
  }

  if (this.rewindingSessionIds.has(sessionId)) {
    throw new Error(`Session ${sessionId} is currently rewinding — message rejected`);
  }

  // Zombie consumer detection (Fix 4) — BEFORE isSessionReady
  if (!this.sessionConsumers.has(sessionId) && !agent.needsSessionRestart()) {
    logger.warn({ sessionId }, 'Consumer dead but not marked for restart — forcing restart');
    agent.markNeedsSessionRestart();
  }

  // Pre-send credential re-validation (Fix 3 reason field).
  // Run BEFORE restart check so env_synced can feed into the restart block below.
  if (!agent.needsSessionRestart()) {
    const precheck = await ClaudeCredentials.refreshIfNeeded();
    if (precheck.reason === 'failed') {
      this._onAuthError.fire({
        sessionId,
        category: 'NO_CREDENTIALS',
        message: 'No valid credentials available. Please re-authenticate with "claude login".',
        recoverable: true,
      });
      throw new Error('No valid credentials available.');
    }
    // env_synced: Keychain has a newer token than the running CLI subprocess.
    // Mark for restart — the block below will execute it in the same pass.
    //
    // NOTE: 'refreshed' is intentionally excluded. When refreshIfNeeded() returns
    // 'refreshed', it means the token was expired and we just refreshed it. The env
    // var is already updated. But the running CLI subprocess was spawned with the OLD
    // token — same as env_synced, right? The difference: 'refreshed' means the token
    // was genuinely expired, so the running subprocess will 401 naturally, triggering
    // the consumer catch path (Fix 1) which marks restart. We don't need to pre-empt.
    // 'env_synced' means the token is valid but different — the subprocess might
    // succeed with the old token if it hasn't expired yet, creating silent staleness.
    // Pre-emptive restart on env_synced prevents that ambiguity.
    if (precheck.reason === 'env_synced') {
      logger.info({ sessionId }, 'Env/Keychain mismatch detected — marking session for restart');
      agent.markNeedsSessionRestart();
    }
  }

  // Restart check (moved from after isSessionReady) — can recover a stopped session.
  // Single-pass: no recursion. Both zombie detection and env_synced feed into this block.
  if (agent.needsSessionRestart()) {
    logger.info({ sessionId }, 'Restarting session after auth recovery');
    const consumer = this.sessionConsumers.get(sessionId);
    if (consumer) consumer.cancel();
    this.sessionInitFired.delete(sessionId);

    try {
      await agent.restartSession();
      this._startBackgroundConsumer(sessionId, agent);
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
      // MUST throw — not return. The frontend sets isAgentRunning=true when the
      // user sends a message. Running state is only cleared by agent:error or
      // agent:complete events, NOT by auth toasts. If we return silently,
      // isAgentRunning stays true and the UI appears permanently stuck.
      // Throwing propagates through Rust IPC → agent-sdk-handlers.ts catch →
      // emits agent:error → handleAgentError → setAgentRunning(false).
      throw new Error(`Session restart failed: ${errMsg}`);
    }
  }

  if (!agent.isSessionReady()) {
    throw new Error(`Session ${sessionId} is not ready.`);
  }

  // ... rest of sendMessage unchanged (turnStartTimes, queueMessage) ...
}
```

### Fix 6: Wire stderr path and tighten consumer auth regex

**File:** `agent-bridge/src/agent/session/session-manager.ts` — `createSession`, `_startBackgroundConsumer`

#### 6a: Enable the stderr auth-refresh path

The stderr categorization + `refreshIfNeeded()` path in agent.ts (lines 948-989) is currently dead code because session-manager never passes `onStderrError` when creating agents. Wire it by adding `onStderrError` to the agent config in `createSession()`:

```typescript
// In createSession() finalConfig (~line 1069):
const finalConfig: OrbitAgentConfig = {
  // ... existing config ...
  onStderrError: (error: StderrError) => {
    // Only surface auth/session errors as agent:error — these are terminal for the turn.
    // Rate-limit and overloaded errors are transient and handled by SDK retry logic;
    // emitting agent:error for these would prematurely terminate the turn and clear
    // isAgentRunning before the SDK has exhausted its retry budget.
    if (error.category === 'AUTH_FAILED' || error.category === 'SESSION_EXPIRED') {
      this._onError.fire({
        message: error.message,
        stack: error.raw,
        sessionId: agent.effectiveSessionId,
      });
    } else {
      // RATE_LIMIT, OVERLOADED: log as warning, don't emit agent:error
      logger.warn(
        { sessionId: agent.effectiveSessionId, category: error.category },
        `CLI stderr: ${error.message}`
      );
    }
  },
  onAuthFailure: (message: string) => {
    // ... existing handler ...
  },
};
```

This enables the stderr handler's `refreshIfNeeded()` + `_needsSessionRestart = true` path, making it the **first line of defense** for auth errors (fires before the consumer catch). Also add the `markAuthRefreshConfirmed()` call inside the stderr success path (agent.ts ~line 971):

```typescript
// agent.ts stderr success path (line ~965-971):
if (result.refreshed) {
  logger.info('Auto-refreshed credentials after CLI auth error — marking restart needed');
  this._lastAuthRefreshConfirmed = true; // NEW: signal to consumer catch for correct event category
  this._needsSessionRestart = true;
}
```

#### 6b: Tighten consumer auth regex to reduce false positives

The current consumer catch regex (`/401|unauthorized|authentication|token.*expired/i`, line 1725) is broad and can match non-auth transport errors (e.g., "401" in a URL, "authentication" in a log line, "token bucket expired" in rate-limit messages). Replace with tighter patterns that require auth-specific context:

```typescript
// BEFORE (broad — false positive risk):
const isAuthError = /401|unauthorized|authentication|token.*expired/i.test(errorMessage);

// AFTER (context-aware — avoids URL/path false positives):
const isAuthError = isConsumerAuthError(errorMessage);

// Shared helper function (can be co-located with categorizeStderrError):
function isConsumerAuthError(message: string): boolean {
  const lower = message.toLowerCase();

  // 1. Check explicit auth-context patterns FIRST — these always win,
  //    even if the message also contains a URL with "401".
  const hasAuthContext =
    // "status code: 401", "status code 401" (context before code)
    /\bstatus(?:\s*code)?\s*[:=]?\s*401\b/.test(lower) ||
    // "401 status code (no body)" — SDK's APIError.makeMessage format when response body is empty.
    // The SDK puts the status code BEFORE "status code", not after.
    /\b401\s+status\s*code\b/.test(lower) ||
    // "401 Unauthorized", "401 unauthorized"
    /\b401\s+unauthorized\b/.test(lower) ||
    /\bunauthorized\b/.test(lower) ||
    /auth(?:entication|orization)?\s+(?:failed|error|invalid)/.test(lower) ||
    /(?:oauth|access|session)\s+token.*expired/.test(lower);

  if (hasAuthContext) return true;

  // 2. URL-only 401 with no auth context — suppress (not an auth error).
  //    e.g., "GET https://api.example.com/v1/401/error-page returned 200"
  // 3. No auth context at all — not an auth error.
  return false;
}

// Negative test cases (must NOT match):
// - "GET https://api.example.com/v1/401/error-page returned 200"  → URL-only 401, no auth context
// - "token bucket expired"  → rate limiting, not auth
// - "re-authentication completed"  → mentions auth but not a failure
//
// Positive test cases (must match):
// - "HTTP 401 Unauthorized"
// - "status code: 401"
// - "401 status code (no body)"  → SDK APIError.makeMessage format (empty response body)
// - "401 {error message}"  → SDK format with body (body usually contains "unauthorized")
// - "authentication failed"
// - "oauth token expired"
// - "unauthorized"
//
// Mixed test cases (must match — auth context overrides URL presence):
// - "status code: 401 - see https://api.example.com/401/docs"  → has "status code: 401"
// - "401 unauthorized at https://api.example.com/auth/401"  → has "401 unauthorized"
```

**Why a helper function instead of inline regex:** The same auth-detection patterns are used in three places — consumer catch (session-manager.ts), stderr categorizer (agent.ts:241-271), and frontend error handler (chat-message-service.ts:721-724). A shared helper reduces drift between these and makes the pattern testable independently.

## Files to Modify

| File                                                     | Change                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-bridge/src/agent/session/session-manager.ts`      | Fix 1 (split event, auth failure tracking), Fix 4 (zombie detection with race guard), Fix 5 (reorder sendMessage, env_synced restart, onTurnSucceeded call), Fix 6a (wire onStderrError in createSession), Fix 6b (tighten consumer auth regex)                                                                                                                                 |
| `agent-bridge/src/agent/core/agent.ts`                   | Fix 2 (move flag clear, consecutiveAuthFailures counter, authTerminalFailure flag, onAuthFailureDetected/onTurnSucceeded/isAuthTerminalFailure methods, \_lastAuthRefreshConfirmed/markAuthRefreshConfirmed/consumeLastAuthRefreshConfirmed). Fix 6a: add `markAuthRefreshConfirmed()` call in stderr success path (~line 971). Fix 6b: extract `isConsumerAuthError()` helper. |
| `agent-bridge/src/common/auth/credentials.ts`            | Fix 3 (single-read env var sync, RefreshReason type)                                                                                                                                                                                                                                                                                                                            |
| `agent-bridge/src/__tests__/credentials-refresh.test.ts` | Update stale token test, add empty-string guard test, update for `reason` field                                                                                                                                                                                                                                                                                                 |
| `agent-bridge/src/__tests__/auth-recovery-e2e.test.ts`   | **New:** Integration tests for restart marking, restart ordering, consumer race guard, auth failure loop cap                                                                                                                                                                                                                                                                    |
| `apps/agent/src/lib/api/agent.ts`                        | No change needed — `TOKEN_EXPIRED` already in `AuthErrorEvent.category` union                                                                                                                                                                                                                                                                                                   |

## Edge Cases

### Token expires during `restartSession()`

If the token expires between `getCredentials()` in `startSession()` and the first API call, the new session immediately 401s again, re-entering the same cycle. **Mitigation:** Fix 2's `_consecutiveAuthFailures` counter tracks auth-failure turns. After 3 consecutive auth failures (where no successful assistant turn intervenes), `restartSession()` throws and the session is permanently stopped with `recoverable: false`. The counter resets only after a successful `result` message from the SDK.

### Auth keeps failing after successful restart

If the token is revoked upstream, `startSession()` can succeed (it just spawns a CLI subprocess) but the first API call immediately 401s. This creates a loop: restart → start → 401 → restart → start → 401. **Mitigation:** `_consecutiveAuthFailures` counts these as auth-failure turns. After 3 cycles, the session hard-stops. The counter does NOT reset on successful `startSession()` — only on a successful assistant result turn.

### Concurrent `sendMessage()` during restart

If two messages are sent rapidly while the restart flag is set, both could attempt `restartSession()` simultaneously. The second would find `sessionActive = true` (set by the first's `startSession()`) and return early — but the first might still be awaiting. **Mitigation:** The restart block in `sendMessage()` is an `await`, so the second call is blocked at the IPC layer. In practice, the frontend disables input during pending sends, so this is unlikely.

### `stopSession()` throws inside `restartSession()`

If `stopSession()` itself throws (e.g., `withRetry` for `interrupt()` exhausts retries), the error propagates to `sendMessage()`'s catch block. `_needsSessionRestart` stays true (Fix 2), but `sessionActive` may be in an inconsistent state. **Mitigation:** `stopSession()` catches its own `interrupt()` errors (line 1624), so this is unlikely. If it does throw, the "Please start a new chat" message is the correct recovery.

### Double-fire from stderr + consumer catch

**Requires Fix 6a (stderr wiring) to be active.** Before Fix 6a, the stderr path is dead code (`onStderrError` never passed). After Fix 6a, the stderr handler at agent.ts:963-971 fire-and-forgets `refreshIfNeeded()` and sets `_needsSessionRestart = true`. The consumer catch (Fix 1) also awaits `refreshIfNeeded()` and calls `markNeedsSessionRestart()`. Both fire for the same 401. **Mitigation:** Fix 1 already guards with `if (!agent.needsSessionRestart())` — skipping the redundant `refreshIfNeeded()` when the stderr handler already set the flag. The `markNeedsSessionRestart()` call is idempotent (boolean flag). When stderr successfully refreshes, it also calls `markAuthRefreshConfirmed()` — the consumer catch then calls `consumeLastAuthRefreshConfirmed()` and emits `AUTH_RECOVERED` instead of the less-specific `TOKEN_EXPIRED`.

### Stale `_lastAuthRefreshConfirmed` across restart cycles

If stderr sets `_lastAuthRefreshConfirmed = true` but the consumer catch's `refreshResult?.refreshed` is also `true` (both paths refreshed), a naive short-circuit (`a || b()`) would skip consuming the flag. The stale `true` would persist and incorrectly emit `AUTH_RECOVERED` on a later, unrelated auth error. **Mitigation (two-layer):** (1) Fix 1 always evaluates `consumeLastAuthRefreshConfirmed()` _before_ combining with `refreshResult` — no short-circuit. (2) Fix 2's `restartSession()` clears `_lastAuthRefreshConfirmed = false` in a `finally` block after every restart attempt, whether it succeeds or fails. Both layers are needed: consume-first handles the same-cycle race, finally-clear handles cross-cycle leakage.

### Env sync feeds into restart block (single-pass)

When `precheck.reason === 'env_synced'` in `sendMessage()`, we mark restart. The restart block executes in the same pass — no recursion needed. The pre-send check runs BEFORE the restart block, so `env_synced` → `markNeedsSessionRestart()` → restart block → `restartSession()` all happen in one `sendMessage()` call. If restart fails, the catch fires `REFRESH_FAILED` and **throws** (propagating to `agent:error`).

### Restart failure and frontend running state

When `sendMessage()` is called, the frontend sets `isAgentRunning = true`. Running state is cleared by `agent:error` or `agent:complete` events — NOT by auth toasts (`_onAuthError`). If the restart catch block returned silently instead of throwing, `isAgentRunning` would stay true permanently. The throw ensures the error propagates through: Rust IPC → `agent-sdk-handlers.ts` catch → `window.postMessage({ type: 'agent:error' })` → `handleAgentError` → `setAgentRunning(false)`. The `_onAuthError` toast and the throw serve complementary purposes: toast shows the user-facing recovery message, throw clears the running state.

### Max auth failures reached, then user re-authenticates

After `_consecutiveAuthFailures >= 3`, `restartSession()` calls `stopSession()` and sets `_authTerminalFailure = true`. Subsequent `sendMessage()` calls hit the `isAuthTerminalFailure()` fast-fail at the top and throw "authentication permanently failed." The `recoverable: false` toast tells the user to start a new chat. A new chat creates a fresh session (with `_authTerminalFailure = false`) that picks up the new credentials. This is the correct behavior — a dead session should stay dead and fail deterministically.

### Rapid external token rotations with intermittent restart failure

If another app keeps refreshing the Keychain token between messages, each `sendMessage()` may detect `env_synced` and attempt a restart. If the restart fails (e.g., credentials still invalid), `_consecutiveAuthFailures` increments. After 3 rounds, the session terminates. Since the pre-send check only runs when `!agent.needsSessionRestart()`, a pending restart flag skips the pre-send check entirely — no double-restart from `env_synced` during a pending restart.

### `'refreshed'` precheck with no pre-emptive restart (intended UX tradeoff)

When `refreshIfNeeded()` returns `reason: 'refreshed'` in the pre-send check, the env var is updated but no restart is triggered. The running CLI subprocess still has the old (expired) token. The next API call will 401, entering the consumer catch → Fix 1 path, which marks restart. The user sees one failed turn followed by automatic recovery on the next send. **This is intentional:** `'refreshed'` means the token was genuinely expired, so the 401 is imminent and unavoidable. Pre-emptive restart would avoid the visible error but adds complexity (restart before any failure signal) and masks the root cause. With Fix 6a (stderr path enabled), the stderr handler may fire before the consumer catch and call `markAuthRefreshConfirmed()` + `_needsSessionRestart = true`, pre-empting the visible 401.

**Timing analysis (confirmed by codebase investigation):** Stderr and the consumer async iterator are independent asynchronous systems reading from separate file descriptors (stderr vs stdout/protocol). When the CLI subprocess encounters a 401:

- **Scenario A (stderr pre-empts):** CLI writes auth error to stderr first → callback fires → `refreshIfNeeded()` starts (fire-and-forget via `void`) → may set `_needsSessionRestart = true` before consumer catches. If refresh completes fast enough, the consumer catch sees the flag already set.
- **Scenario B (consumer pre-empts):** CLI writes error to the protocol stream first → async iterator throws → consumer catch runs before stderr callback.
- **Scenario C (concurrent):** Both fire roughly simultaneously — outcome depends on event loop scheduling.

Since the stderr `refreshIfNeeded()` is fire-and-forget (`void`), even in Scenario A the async refresh may not complete before the consumer catch runs. The `if (!agent.needsSessionRestart())` guard in Fix 1 handles both orderings: if stderr set the flag first, consumer skips the redundant refresh; if consumer runs first, it performs its own refresh. Either way, the session is marked for restart. The one-failed-turn is visible to the user only when the consumer catch fires first AND the refresh + restart happen on the _next_ `sendMessage()`.

### Transient stderr errors (RATE_LIMIT, OVERLOADED) — log-only by design

Fix 6a's `onStderrError` callback only emits `_onError` (→ `agent:error`) for `AUTH_FAILED` and `SESSION_EXPIRED`. Transient categories (`RATE_LIMIT`, `OVERLOADED`) are logged as warnings only. **Rationale (confirmed by investigation):** The Claude SDK does not have built-in retry for 429/503/529, but the CLI subprocess (spawned by the SDK) handles its own HTTP retry logic internally. A `RATE_LIMIT` stderr line does not mean the turn has failed — the CLI may retry and succeed. Emitting `agent:error` would prematurely terminate the turn and clear `isAgentRunning` before the CLI exhausts its retries. There is currently no UI mechanism for warning-level status messages from the bridge (only `toast.error` via `auth_error` events). Adding a transient status indicator (e.g., "Rate limited, retrying...") is a future enhancement, not required for auth recovery.

### SDK error format: `"401 status code (no body)"`

The Claude Agent SDK's `APIError.makeMessage(status, error, message)` produces `"{status} {msg}"` when both are present, or `"{status} status code (no body)"` when the response body is empty. For 401 errors, this means the consumer catch may receive `"401 status code (no body)"` — where "401" appears _before_ "status code", not after. Fix 6b's `isConsumerAuthError()` includes a dedicated pattern `/\b401\s+status\s*code\b/` for this SDK-specific format. The more common `"401 Unauthorized"` or `"401 {error body}"` formats are caught by `/\b401\s+unauthorized\b/` and `/\bunauthorized\b/` respectively.

### Non-macOS platforms (Linux/Windows)

`readKeychainCredentials()` spawns `security` (macOS-only). On Linux/Windows, the spawn returns null. Fix 3's env var comparison uses `claudeAuth.accessToken` from the null result, so the entire block is safely skipped. No impact.

## Secondary Issue: Sentry CSP Errors

The `SyntaxError: Unexpected token '{'` and Sentry CSP errors (`connect-src` blocking `sentry.io`) are **separate from the auth bug**. They're cosmetic console errors from Sentry's telemetry being blocked by the Tauri CSP policy. Not fixing in this PR — they don't affect functionality.

## Verification

### Manual Test

1. Build agent-bridge: `cd agent-bridge && bun run build:dev`
2. Start app: `bunx tauri dev`
3. Send a message (verify it works)
4. Simulate token expiry: manually edit Keychain to set `expiresAt` to a past timestamp
5. Send a message → should get auth error, then recovery toast
6. Send another message → should trigger session restart and succeed
7. Alternative: wait for real 8-hour expiry, verify recovery works

### Automated Tests

```bash
cd agent-bridge && bun test src/__tests__/credentials-refresh.test.ts
```

The existing credential refresh tests cover the Keychain read/write paths. The `refreshIfNeeded()` rewrite (Fix 3) requires updating the stale token test:

**Update required:** `'refreshIfNeeded returns valid credentials even when env var holds stale token'` (line 736) should be strengthened to:

1. Assert `process.env.CLAUDE_CODE_OAUTH_TOKEN !== 'stale-expired-token-from-session-start'` unconditionally (not just when `result.refreshed` is true)
2. When the token is valid (>5 min until expiry), assert `result.refreshed === true` — Fix 3 should detect the env var difference and sync

**New test needed:** Add a test verifying that `refreshIfNeeded()` does NOT sync when `keychainToken` is `""` (empty string) — the `keychainToken !== ''` guard from Fix 3 prevents overwriting a valid env var with empty string.

**Required integration tests** (in `agent-bridge/src/__tests__/auth-recovery-e2e.test.ts`):

These tests use real Claude SDK sessions (same pattern as existing `file-rewind.test.ts`). Add `TESTED:` warning comments to modified source functions per repo policy.

```typescript
// auth-recovery-e2e.test.ts — real session integration tests
describe('OAuth token expiry recovery', () => {
  // Fix 1: Consumer catch marks restart on auth error
  it('marks session for restart when consumer catches auth error', async () => {
    // Create session → verify needsSessionRestart() === false
    // Provoke auth failure (set stale CLAUDE_CODE_OAUTH_TOKEN)
    // Send message → consumer catches 401
    // Verify needsSessionRestart() === true
    // Verify onAuthError event emitted with correct category
  });

  // Fix 2: Consecutive auth failure cap
  it('hard-stops after 3 consecutive auth failures', async () => {
    // Create session → trigger 3 consecutive auth failures
    // Verify restartSession() throws on 4th attempt
    // Verify onAuthError fires REFRESH_FAILED with recoverable: false
  });

  // Fix 4: Consumer race guard
  it('new consumer survives old consumer finally block', async () => {
    // Create session → start consumer → kill consumer
    // Start new consumer (restart path)
    // Verify old consumer's finally does NOT delete new consumer entry
    // Verify sessionConsumers.has(sessionId) === true after both settle
  });

  // Fix 5: Restart ordering — restart before isSessionReady
  it('restarts session when needsSessionRestart and session not ready', async () => {
    // Create session → stop session (sessionActive = false)
    // Set needsSessionRestart = true
    // Call sendMessage → should trigger restart (not throw "not ready")
    // Verify session recovered and message was sent
  });

  // Fix 3: env_synced forces restart in pre-send check
  it('forces restart when env/keychain mismatch detected', async () => {
    // Create session → set CLAUDE_CODE_OAUTH_TOKEN to stale value
    // Call sendMessage → pre-send check detects mismatch
    // Verify restart triggered before message queued
  });

  // Fix 2: Counter resets on successful turn
  it('resets auth failure counter after successful assistant turn', async () => {
    // Create session → trigger 2 auth failures → restore valid credentials
    // Send message → should succeed (assistant result)
    // Verify consecutiveAuthFailures reset to 0
  });

  // Fix 5: Restart failure throws (not returns) — clears frontend running state
  it('restart failure throws so agent:error clears isAgentRunning', async () => {
    // Create session → mark for restart with invalid credentials
    // Call sendMessage → restart fails
    // Verify sendMessage THROWS (not returns silently)
    // Verify _onAuthError fired with REFRESH_FAILED + recoverable: false
    // Frontend assertion: the throw propagates through IPC → agent-sdk-handlers
    // catch → emits agent:error → handleAgentError → setAgentRunning(false)
  });

  // Fix 1: stderr refresh signal avoids stale TOKEN_EXPIRED
  it('emits AUTH_RECOVERED when stderr already confirmed refresh', async () => {
    // Create session → agent.markAuthRefreshConfirmed() + markNeedsSessionRestart()
    // Trigger consumer catch (auth error)
    // Verify consumeLastAuthRefreshConfirmed() returns true
    // Verify onAuthError emits AUTH_RECOVERED (not TOKEN_EXPIRED)
    // Verify second call to consumeLastAuthRefreshConfirmed() returns false (consumed)
  });
});
```

**`onTurnSucceeded()` call site:** In the consumer loop, after processing a `result` message (the SDK sends this when a turn completes successfully), call `agent.onTurnSucceeded()` to reset the consecutive auth failure counter. This goes at ~line 1708 in the consumer loop, inside the `result` message handler, after emitting the turn-complete event.

### Key Behaviors to Verify

- [ ] After token expiry + 401, session is marked for restart (not left as zombie)
- [ ] Next message after 401 triggers `restartSession()` with fresh credentials
- [ ] If `restartSession()` fails, the flag stays set for retry (Fix 2)
- [ ] If `restartSession()` fails, the NEXT `sendMessage()` retries restart (Fix 5 reordering)
- [ ] If another app refreshes the Keychain token, `refreshIfNeeded()` detects the change and returns `reason: 'env_synced'`
- [ ] `env_synced` in pre-send check marks restart, restart block executes in same pass (no recursion)
- [ ] Dead consumer is detected and triggers restart
- [ ] Old consumer's `finally` does NOT delete a newly-created consumer entry (Fix 4 race guard)
- [ ] `refreshIfNeeded()` only spawns `security` once on the happy path (Fix 3 single-read)
- [ ] `refreshIfNeeded()` does NOT sync env var when Keychain `accessToken` is empty string
- [ ] `restartSession()` calls `stopSession()` and sets `_authTerminalFailure = true` after 3 consecutive auth-failure turns (Fix 2)
- [ ] `sendMessage()` fast-fails with clear message when `isAuthTerminalFailure()` is true
- [ ] Auth failure counter resets after successful assistant `result` turn (not after successful restart)
- [ ] Consumer catch emits `AUTH_RECOVERED` when `refreshResult.refreshed === true` OR when `consumeLastAuthRefreshConfirmed()` returns true; emits `TOKEN_EXPIRED` otherwise
- [ ] Consumer catch skips `refreshIfNeeded()` when stderr handler already set flag (Fix 1 double-fire guard)
- [ ] `TOKEN_EXPIRED` category keeps "Copy command" (claude login) visible in frontend toast
- [ ] Restart failure **throws** (not returns) — error propagates to `agent:error` which clears `isAgentRunning`
- [ ] `consumeLastAuthRefreshConfirmed()` returns true once after stderr refresh, then resets to false
- [ ] `consumeLastAuthRefreshConfirmed()` is always evaluated before combining with `refreshResult` (no short-circuit skip)
- [ ] `_lastAuthRefreshConfirmed` is cleared in `restartSession()`'s `finally` block (no cross-cycle leakage)
- [ ] `'refreshed'` precheck reason does NOT trigger pre-emptive restart (only `'env_synced'` does)
- [ ] `onStderrError` is wired in `createSession()` config (Fix 6a — enables stderr auth-refresh path)
- [ ] Stderr success path calls `markAuthRefreshConfirmed()` before setting `_needsSessionRestart = true`
- [ ] Consumer auth regex uses `isConsumerAuthError()` helper with word-boundary-anchored patterns (Fix 6b)
- [ ] `isConsumerAuthError()` does NOT match "token bucket expired", URL-only "401" with no auth context, or "re-authentication completed"
- [ ] `isConsumerAuthError()` DOES match "HTTP 401 Unauthorized", "status code: 401", "401 status code (no body)", "authentication failed", "oauth token expired"
- [ ] `isConsumerAuthError()` DOES match mixed URL+auth-context messages like "status code: 401 - see https://api.example.com/401/docs"
- [ ] `onStderrError` only emits `agent:error` for `AUTH_FAILED`/`SESSION_EXPIRED` categories; `RATE_LIMIT`/`OVERLOADED` are logged as warnings only
- [ ] Integration tests pass: `cd agent-bridge && bun test src/__tests__/auth-recovery-e2e.test.ts`
