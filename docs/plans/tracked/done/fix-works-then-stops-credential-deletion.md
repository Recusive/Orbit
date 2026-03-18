# Fix: Protect Shell Env API Key from OAuth Deletion

## Context

The main credentials plan is implemented. Settings API keys use `credentialOverride` and are fully protected. This fixes a separate bug for **shell/env-only users** where `startSession()` permanently deletes `ANTHROPIC_API_KEY` from `process.env` when OAuth temporarily wins.

## The Bug

**File:** `agent.ts:1212` — `delete process.env.ANTHROPIC_API_KEY` permanently destroys the shell API key when OAuth wins. When OAuth later expires, the fallback is gone.

## Why "Just Keep the Env Var" Doesn't Work

`refreshIfNeeded()` at `credentials.ts:361` uses `getApiKeyFromEnv()` as a signal: if an API key exists in env, it returns `{refreshed: false}` immediately — skipping OAuth refresh entirely. Keeping the env var would disable OAuth auto-refresh.

## Fix: Save-and-Restore Across Three Failure Paths

There are exactly THREE paths where OAuth failure surfaces. Each gets ONE restore attempt. No dual-restore conflict because `_savedEnvApiKey` is set to `null` after the first successful restore.

### Auth failure paths

```
Path 1 (PRE-SEND):
  sendMessage() → refreshCredentials() → refreshIfNeeded() returns error
  → refreshCredentials() returns false → session-manager emits NO_CREDENTIALS

Path 2 (TIMER):
  scheduleAutoRefresh() → doRefresh() → refreshIfNeeded() returns error
  → onFailure callback fires → session-manager emits REFRESH_FAILED

Path 3 (ACTIVE-QUERY — session-manager.ts:1773-1808):
  Background consumer catches auth error mid-stream (401/unauthorized)
  → calls refreshIfNeeded() → if not refreshed AND not needsSessionRestart
  → falls through to generic _onError.fire()
```

### Changes

#### 1. Add save/restore to credentials module

**File:** `agent-bridge/src/common/auth/credentials.ts`

```typescript
let _savedEnvApiKey: string | null = null;

function saveEnvApiKeyFallback(key: string): void {
  _savedEnvApiKey = key;
  logger.debug('Saved shell env API key as OAuth fallback');
}

/** Restore saved key to process.env. Returns true if restored. Clears saved value. */
function restoreEnvApiKeyFallback(): boolean {
  if (_savedEnvApiKey === null) return false;
  process.env.ANTHROPIC_API_KEY = _savedEnvApiKey;
  _savedEnvApiKey = null;
  logger.info('Restored shell env API key after OAuth failure');
  return true;
}
```

Export both from `ClaudeCredentials`.

#### 2. Save before delete in `startSession()`

**File:** `agent-bridge/src/agent/core/agent.ts` (~line 1208)

```typescript
if (credentials.type === 'oauth') {
  if (credentials.token) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = credentials.token;
  }
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey !== undefined && envKey !== '') {
    ClaudeCredentials.saveEnvApiKeyFallback(envKey);
  }
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
}
```

No other changes to `startSession()`.

#### 3. Restore in Path 1: `refreshCredentials()` (pre-send)

**File:** `agent-bridge/src/agent/core/agent.ts` — `refreshCredentials()` (~line 1280)

```typescript
async refreshCredentials(): Promise<boolean> {
  const result = await ClaudeCredentials.refreshIfNeeded();
  if (result.refreshed) {
    logger.info('Credentials refreshed via pre-send check');
    return true;
  }
  if (result.error !== undefined) {
    logger.warn({ error: result.error }, 'Credential refresh failed in pre-send check');
    // Try restoring saved shell API key as last resort
    if (ClaudeCredentials.restoreEnvApiKeyFallback()) {
      logger.info('Restored shell API key fallback, marking session for restart');
      this._needsSessionRestart = true;
      return true;  // Credentials available — session will restart on next send
    }
    return false;
  }
  return true;
}
```

After restore, `_needsSessionRestart = true`. The existing restart logic at `session-manager.ts:1940` handles it: cancels old consumer → `restartSession()` → new `startSession()` sees env API key → uses it.

#### 4. Restore in Path 2: `onAuthFailure` callback (timer)

**File:** `agent-bridge/src/agent/session/session-manager.ts` — where `onAuthFailure` is set (~line 1129)

```typescript
onAuthFailure: (message: string) => {
  if (ClaudeCredentials.restoreEnvApiKeyFallback()) {
    agent.setNeedsSessionRestart(true);
    logger.info(
      { sessionId: agent.effectiveSessionId },
      'Restored shell API key fallback after OAuth timer failure'
    );
    return;  // Don't emit auth error — fallback available
  }
  this._onAuthError.fire({
    sessionId: agent.effectiveSessionId,
    category: 'REFRESH_FAILED',
    message,
    recoverable: true,
  });
},
```

#### 5. Restore in Path 3: background consumer catch (active-query auth error)

**File:** `agent-bridge/src/agent/session/session-manager.ts` (~line 1786)

Current code:

```typescript
if (isAuthError && !agent.needsSessionRestart()) {
  const refreshResult = await ClaudeCredentials.refreshIfNeeded();
  if (refreshResult.refreshed) {
    agent.markNeedsSessionRestart();
  }
}
```

Updated:

```typescript
if (isAuthError && !agent.needsSessionRestart()) {
  const refreshResult = await ClaudeCredentials.refreshIfNeeded();
  if (refreshResult.refreshed) {
    agent.markNeedsSessionRestart();
  } else if (ClaudeCredentials.restoreEnvApiKeyFallback()) {
    // OAuth refresh failed but shell API key fallback restored
    agent.setNeedsSessionRestart(true);
    logger.info({ sessionId }, 'Restored shell API key fallback after active-query auth failure');
  }
}
```

After restore + `needsSessionRestart = true`, the existing block at line 1793-1800 fires `AUTH_RECOVERED` instead of falling through to the generic `_onError.fire()`.

### Why no triple-restore conflict

- `restoreEnvApiKeyFallback()` sets `_savedEnvApiKey = null` on first successful call
- All subsequent calls from any path return `false` — no-op
- Whichever path fires first wins; the other two see the key already in env and behave correctly:
  - Pre-send: `refreshIfNeeded()` sees API key → `{refreshed: false}` (no error) → returns `true`
  - Timer: `doRefresh()` sees API key → skips refresh → timer quiesces
  - Active-query: `refreshIfNeeded()` sees API key → `{refreshed: false}` → no restore branch taken

## Verification

1. Set `ANTHROPIC_API_KEY=sk-ant-...` in shell, ensure Claude Code OAuth also present in Keychain
2. Start app → OAuth wins, log: "Saved shell env API key as OAuth fallback"
3. Verify `ANTHROPIC_API_KEY` deleted from `process.env` (OAuth refresh still works normally)

**Test Path 1 (pre-send failure):**
4a. Corrupt the Keychain OAuth refresh token (or disconnect network right when refresh is needed)
5a. Send a message → `refreshCredentials()` fails → restores saved key → marks restart → message succeeds on API key

**Test Path 2 (timer failure):**
4b. Wait for `scheduleAutoRefresh` timer to fire while OAuth is broken
5b. Timer `onFailure` fires → restores saved key → marks restart → NO auth error emitted to frontend
6b. Send a message → session restarts with API key → succeeds

**Test Path 3 (active-query 401):**
4c. Send a message while OAuth is about to expire (token expires mid-stream)
5c. Background consumer catches 401 → `refreshIfNeeded()` fails → restores saved key → marks restart
6c. Frontend sees `AUTH_RECOVERED` (not generic SDK error) → resend message → succeeds on API key
