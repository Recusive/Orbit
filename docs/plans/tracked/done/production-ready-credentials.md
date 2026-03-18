# Plan: Production-Ready Credential System + Startup Health Checks

## Context

API key authentication is completely broken for end users. The Settings UI stores keys in `~/.orbit/credentials.enc` (Rust AES-256-GCM), but the agent-bridge sidecar only checks (1) macOS Keychain OAuth and (2) `process.env.ANTHROPIC_API_KEY`. The two systems were never connected. Works on developer machines because of shell env vars and Claude Code CLI.

---

## Audit Findings (All 3 Rounds)

### Round 4 Critical Fix (current)

| #   | Blocker                                                            | Root Cause                                                                                                                                                                                         | Resolution                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | Cold-start: stored API key loses to Keychain OAuth on fresh launch | `_credentialOverride` is only set via `update_credentials` IPC, which hasn't been sent yet at cold start. Env var injection at spawn isn't enough — `getCredentials()` checks Keychain before env. | **Two-part fix**: (a) Rust sends `UpdateCredentials` IPC immediately after sidecar spawn when a stored key exists, (b) sidecar also initializes override from `ANTHROPIC_API_KEY` env var on startup if the env var was set by Rust (detected via a companion flag `ORBIT_SETTINGS_API_KEY=1`). Belt-and-suspenders — both the IPC and the env var path set the override. |

### Round 3 (previously resolved)

| #   | Blocker                                          | Root Cause                                  | Resolution                                                                       |
| --- | ------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Settings API key doesn't actually override OAuth | `getCredentials()` hardcoded Keychain-first | Module-level `_credentialOverride` in `credentials.ts`                           |
| 2   | Credential changes don't affect active sessions  | `query()` reads env at creation time        | `markAllSessionsForRestart()` + existing 401-recovery path                       |
| 3   | Plan mutates private `AgentBridge` fields        | `child`, `ready` are private                | Public methods on `AgentBridge`: `check_and_recover()`, `spawn_with_extra_env()` |

### Round 1+2 (previously resolved)

| #   | Issue                                                    | Resolution                                                     |
| --- | -------------------------------------------------------- | -------------------------------------------------------------- |
| 4   | Plain `String` API key in memory                         | `secrecy::SecretString` with Zeroize on drop                   |
| 5   | Mixed concerns on SessionManager                         | Standalone `CredentialBridge`                                  |
| 6   | `spawn_env` HashMap leaks plaintext                      | `inject_at_spawn()` takes `&mut Command` — no HashMap          |
| 7   | Stale `CLAUDE_CODE_OAUTH_TOKEN` on source switch         | `update_credentials` clears all 3 auth env vars before setting |
| 8   | Banner uses phantom auth categories                      | Only use `NO_CREDENTIALS`, `REFRESH_FAILED`, `AUTH_RECOVERED`  |
| 9   | `AccountBanner` not mounted                              | Bootstrap from `tauri-provider.tsx`                            |
| 10  | Dead sidecar not detected                                | `check_and_recover()` via `try_wait()`                         |
| 11  | Build verification wrong artifact names                  | Platform-aware, matches actual `build:sidecar` output          |
| 12  | "run `claude login`" wrong for API key users             | Credential-type-aware error message                            |
| 13  | Race between async cred push and ensure_running          | Synchronous `send_request`                                     |
| 14  | Concurrent `store_api_key`/`delete_api_key` clobber      | `Mutex<()>` file lock                                          |
| 15  | Preflight calls private `check_macos_keychain_validated` | Extract shared `pub fn check_keychain_status()` helper         |

### Edge Cases

- **Cold start with both Keychain OAuth and stored API key**: Override initialized from `ORBIT_SETTINGS_API_KEY=1` env flag at sidecar startup AND reinforced by `UpdateCredentials` IPC immediately after spawn. Settings API key wins.
- **Valid Keychain OAuth + newly saved API key (mid-session)**: `update_credentials` IPC sets override + marks sessions for restart. Settings key wins.
- **User wants OAuth back after using API key**: Delete API key in Settings → `update_credentials(None)` → override cleared → Keychain resumes
- **Credential change with active session**: `_needsSessionRestart` flag → session-manager restarts on next `sendMessage` (reuses existing 401-recovery path)
- **Revoked but well-formed API key**: Preflight can't detect this (format-only check). First API call fails → auth error banner surfaces it
- **Dead sidecar**: `check_and_recover()` detects via `try_wait()` → clears internal state → `ensure_running()` respawns with credential injection
- **Frontend auth store precedence**: Bootstrap checks stored API key FIRST, then Keychain. If both exist, reports `apikey` — matching runtime behavior

---

## Track 1: Wire Credentials to Sidecar (Critical Fix)

### Phase 1.1: Sidecar credential override mechanism (with cold-start init)

**This is the key architectural change.** A module-level override in the sidecar that takes priority over Keychain. Initialized at TWO points to cover the cold-start gap:

1. **At sidecar startup** — from env var (`ANTHROPIC_API_KEY` + companion flag `ORBIT_SETTINGS_API_KEY=1`)
2. **Via IPC** — from `update_credentials` message (for mid-session changes)

**`agent-bridge/src/common/auth/credentials.ts`** — Add override state:

```typescript
// Module-level credential source override.
// When set, getCredentials() returns this INSTEAD of checking Keychain/env.
// Initialized at startup from ORBIT_SETTINGS_API_KEY env flag,
// and updated live via `update_credentials` IPC from Rust.
let _credentialOverride: CredentialResult | null = null;

/** Set or clear the credential override (called by IPC handler). */
export function setCredentialOverride(apiKey: string | undefined): void {
  if (apiKey !== undefined && apiKey !== '') {
    _credentialOverride = { type: 'apikey', hasCredentials: true, token: apiKey };
    logger.info('Credential override set: API key from Settings');
  } else {
    _credentialOverride = null;
    logger.info('Credential override cleared — will use Keychain/env fallback');
  }
}

/**
 * Initialize override from env var at sidecar startup.
 * Called once from index.ts before the IPC loop starts.
 * ORBIT_SETTINGS_API_KEY=1 is a companion flag set by Rust to distinguish
 * "Rust injected this key from Settings" from "user had it in their shell env".
 */
export function initOverrideFromEnv(): void {
  if (process.env.ORBIT_SETTINGS_API_KEY === '1' && process.env.ANTHROPIC_API_KEY) {
    setCredentialOverride(process.env.ANTHROPIC_API_KEY);
    logger.info('Credential override initialized from startup env (Settings API key)');
  }
}
```

Export `initOverrideFromEnv` and `setCredentialOverride` from `ClaudeCredentials`.

**`agent-bridge/src/index.ts`** — Call at startup (before IPC loop, after PATH setup):

```typescript
ClaudeCredentials.initOverrideFromEnv();
```

**Modify `getCredentials()`** (~line 475):

```typescript
async function getCredentials(): Promise<CredentialResult> {
  // 1. Check for explicit override from Settings (highest priority)
  if (_credentialOverride !== null) {
    logger.info('Using credential override (Settings API key)');
    return _credentialOverride;
  }

  // 2. Try OAuth token from Keychain
  const oauthToken = await getOAuthTokenFromKeychain();
  if (oauthToken !== null) {
    return { type: 'oauth', hasCredentials: true, token: oauthToken };
  }

  // 3. Fall back to API key from environment
  const apiKey = getApiKeyFromEnv();
  if (apiKey !== null) {
    return { type: 'apikey', hasCredentials: true, token: apiKey };
  }

  return { type: 'apikey', hasCredentials: false };
}
```

Export `setCredentialOverride` from `ClaudeCredentials`.

### Phase 1.2: `update_credentials` IPC message

**Rust protocol** — `src-tauri/src/agent/protocol.rs`

```rust
UpdateCredentials {
    #[serde(rename = "apiKey", skip_serializing_if = "Option::is_none")]
    api_key: Option<String>,
},
```

**TypeScript protocol** — `agent-bridge/src/protocol/protocol.ts`

```typescript
export interface UpdateCredentialsRequest {
  type: 'update_credentials';
  apiKey?: string;
}
```

Add to `BridgeRequest` union type. Add Zod schema in `schemas.ts`.

**IPC handler** — `agent-bridge/src/index.ts` (in `handleRequest` switch):

```typescript
case 'update_credentials': {
  // 1. Set the credential override (takes priority over Keychain)
  ClaudeCredentials.setCredentialOverride(request.apiKey);

  // 2. Also update env vars for the SDK subprocess
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  if (request.apiKey !== undefined && request.apiKey !== '') {
    process.env.ANTHROPIC_API_KEY = request.apiKey;
  }

  // 3. Mark all active sessions for restart on next message
  sessionManager.markAllSessionsForRestart();

  sendResponse({ type: 'success', requestType: request.type });
  break;
}
```

### Phase 1.3: Active session restart on credential change

**`agent-bridge/src/agent/session/session-manager.ts`** — Add method:

```typescript
/** Mark all active sessions so they restart with new credentials on next sendMessage. */
markAllSessionsForRestart(): void {
  for (const [sessionId, agent] of this.activeSessions) {
    agent.setNeedsSessionRestart(true);
    logger.info({ sessionId }, 'Marked session for restart after credential change');
  }
}
```

**`agent-bridge/src/agent/core/agent.ts`** — Add public setter:

```typescript
/** Force a session restart on next send (used after credential changes). */
setNeedsSessionRestart(value: boolean): void {
  this._needsSessionRestart = value;
}
```

The existing pre-send check in `session-manager.ts:1930-1957` already handles `needsSessionRestart()`:

- Cancels old background consumer
- Calls `agent.restartSession()` (creates fresh `query()` with new env vars)
- Starts new background consumer
- **No new code needed here** — we reuse the 401-recovery path

### Phase 1.4: AgentBridge public API (Rust)

All changes inside `src-tauri/src/agent/bridge.rs` — no external field mutation:

**Add `check_and_recover(&mut self) -> bool`:**

```rust
/// Check if the sidecar process is still alive.
/// If it died, clean up internal state so `spawn` can be called again.
/// Returns true if alive, false if dead (and cleaned up).
pub fn check_and_recover(&mut self) -> bool {
    if let Some(ref mut child) = self.child {
        match child.try_wait() {
            Ok(None) => return true,  // still running
            Ok(Some(status)) => {
                log::warn!("Sidecar process exited with status: {status}");
            },
            Err(e) => {
                log::warn!("Failed to check sidecar status: {e}");
            },
        }
    } else {
        return false;
    }
    // Process is dead — clean up
    self.child = None;
    self.stdin = None;
    self.response_rx = None;
    self.ready = false;
    false
}
```

**Add `spawn_with_extra_env(&mut self, path, env_fn)`:**

```rust
/// Spawn the sidecar with an env-injection callback.
/// The callback receives `&mut Command` to add env vars before spawn.
pub fn spawn_with_extra_env(
    &mut self,
    sidecar_path: &str,
    env_fn: impl FnOnce(&mut Command),
) -> Result<()> {
    if self.child.is_some() {
        return Ok(());
    }
    // ... same as spawn() but calls env_fn(&mut child_cmd) after the
    // .env("CLAUDE_CLI_PATH", ...) and .env("CLAUDE_CODE_...", ...) lines
    // and before .stdin(Stdio::piped())
}
```

Refactor existing `spawn()` to call `spawn_with_extra_env(path, |_| {})`.

**Update `is_running()`:**

```rust
pub fn is_running(&mut self) -> bool {
    self.ready && self.check_and_recover()
}
```

Note: this changes `&self` to `&mut self`. Since `SessionManager` holds `Mutex<AgentBridge>`, callers already have `&mut` access through the lock.

### Phase 1.5: CredentialBridge (Rust managed state)

**New file** — `src-tauri/src/agent/credential_bridge.rs`

```rust
use parking_lot::Mutex;
use secrecy::{ExposeSecret, SecretString};
use std::process::Command;

pub struct CredentialBridge {
    api_key: Mutex<Option<SecretString>>,
    /// Guards concurrent read-modify-write on credentials.enc
    pub file_lock: Mutex<()>,
}

impl CredentialBridge {
    pub fn new() -> Self {
        Self {
            api_key: Mutex::new(None),
            file_lock: Mutex::new(()),
        }
    }

    pub fn set_api_key(&self, key: Option<String>) {
        *self.api_key.lock() = key.map(SecretString::from);
    }

    pub fn has_api_key(&self) -> bool {
        self.api_key.lock().is_some()
    }

    /// Inject stored API key into a Command builder at spawn time.
    /// Sets both the key AND a companion flag so the sidecar knows
    /// this key came from Settings (not the user's shell env).
    pub fn inject_at_spawn(&self, cmd: &mut Command) {
        let guard = self.api_key.lock();
        if let Some(ref secret) = *guard {
            cmd.env("ANTHROPIC_API_KEY", secret.expose_secret());
            cmd.env("ORBIT_SETTINGS_API_KEY", "1");
        }
    }

    /// Push credential update to running sidecar (synchronous).
    pub fn push_to_running(
        &self,
        bridge: &super::bridge::AgentBridge,
    ) -> super::bridge::Result<()> {
        let guard = self.api_key.lock();
        let api_key = guard.as_ref().map(|s| s.expose_secret().to_owned());
        drop(guard);
        bridge.send_request(
            &super::protocol::BridgeRequest::UpdateCredentials { api_key },
        )?;
        Ok(())
    }
}
```

### Phase 1.6: Wire into SessionManager and startup

**`src-tauri/src/agent/session.rs`** — Modify `SessionManager`:

```rust
pub struct SessionManager {
    bridge: Mutex<AgentBridge>,
    sidecar_path: PathBuf,
    active_sessions: Mutex<HashSet<String>>,
    credential_bridge: Arc<CredentialBridge>,  // NEW
}

impl SessionManager {
    pub fn new(sidecar_path: PathBuf, credential_bridge: Arc<CredentialBridge>) -> Self {
        Self {
            bridge: Mutex::new(AgentBridge::new()),
            sidecar_path,
            active_sessions: Mutex::new(HashSet::new()),
            credential_bridge,
        }
    }

    fn ensure_running(&self) -> Result<()> {
        let mut bridge = self.bridge.lock();
        if !bridge.is_running() {  // is_running now calls check_and_recover
            let cred = Arc::clone(&self.credential_bridge);
            let path = self.sidecar_path.to_str().unwrap_or("agent-bridge");
            bridge.spawn_with_extra_env(path, |cmd| {
                cred.inject_at_spawn(cmd);  // Sets env var + ORBIT_SETTINGS_API_KEY=1 flag
            })?;
            // Belt-and-suspenders: also send UpdateCredentials IPC after spawn.
            // The env var + flag handles the sidecar startup path (initOverrideFromEnv),
            // and this IPC handles the case where the sidecar startup code runs
            // before the env-based init (defensive, costs one JSON message).
            if self.credential_bridge.has_api_key() {
                let _ = self.credential_bridge.push_to_running(&bridge);
            }
        }
        Ok(())
    }

    pub fn update_credentials(&self, api_key: Option<&str>) -> Result<()> {
        self.credential_bridge.set_api_key(api_key.map(String::from));
        let bridge = self.bridge.lock();
        if bridge.is_running() {
            self.credential_bridge.push_to_running(&bridge)?;
        }
        Ok(())
    }
}
```

Note: `is_running()` is now `&mut self`, but we hold the `Mutex` lock so this is fine. Actually — `push_to_running` takes `&AgentBridge`, but `is_running()` takes `&mut self`. We need to split: check running first (`is_running` needs `&mut`), then push (needs `&`). Solve by: `let is_up = bridge.check_and_recover(); if is_up { self.credential_bridge.push_to_running(&bridge)?; }`.

**`src-tauri/src/lib.rs`** — Startup:

```rust
let credential_bridge = Arc::new(CredentialBridge::new());
if let Some(key) = credentials::load_api_key("claude") {
    credential_bridge.set_api_key(Some(key));
}
let session_manager = Arc::new(SessionManager::new(sidecar_path, Arc::clone(&credential_bridge)));
// ...
.manage(credential_bridge)
.manage(session_manager_for_state)
```

**`src-tauri/src/commands/common/credentials.rs`** — Add shared helpers:

```rust
/// Sync helper to load a stored API key (for startup).
pub fn load_api_key(provider: &str) -> Option<String> {
    match load_credentials() {
        Ok(creds) => match provider {
            "claude" | "anthropic" => creds.anthropic_api_key,
            "openai" => creds.openai_api_key,
            "google" => creds.google_api_key,
            _ => None,
        },
        Err(e) => {
            log::warn!("Failed to load credentials: {e}");
            None
        }
    }
}
```

Modify `store_api_key` and `delete_api_key` to accept `State<'_, Arc<CredentialBridge>>` + `State<'_, Arc<SessionManager>>`. After save, use `credential_bridge.file_lock` for the load→modify→save pipeline, then call `session_manager.update_credentials(...)`.

### Phase 1.7: Auth store + recovery UI

**New file** — `apps/agent/src/stores/agent/auth-store.ts`

```typescript
interface AuthState {
  status: 'unknown' | 'authenticated' | 'expired' | 'no_credentials' | 'error';
  credentialType: 'oauth' | 'apikey' | null;
  lastError: string | null;
  lastErrorCategory: 'NO_CREDENTIALS' | 'REFRESH_FAILED' | 'AUTH_RECOVERED' | null;
  recoverable: boolean;
}
// Actions: setAuthenticated, setError, setRecovered, clearError
```

**Bootstrap** — `apps/agent/src/providers/tauri-provider.tsx` on mount:

- Call BOTH `invoke('retrieve_api_key', { provider: 'claude' })` and `invoke('check_claude_keychain')` via `Promise.all`
- **Precedence matches runtime**: stored API key wins over Keychain (mirrors `_credentialOverride` logic)
  ```typescript
  const [apiKeyResult, keychainStatus] = await Promise.all([
    invoke<RetrieveResult>('retrieve_api_key', { provider: 'claude' }),
    invoke<KeychainStatus>('check_claude_keychain'),
  ]);
  const authStore = useAuthStore.getState();
  if (apiKeyResult.key) {
    // Settings API key takes precedence (matches sidecar _credentialOverride)
    authStore.setAuthenticated('apikey', null);
  } else if (keychainStatus.hasCredentials) {
    authStore.setAuthenticated('oauth', keychainStatus.expiresAt);
  } else {
    authStore.setError('NO_CREDENTIALS', 'No credentials configured', true);
  }
  ```
- Wire existing `onAgentAuthError` handler to update auth store

**New file** — `apps/agent/src/components/chat/status/auth-error-banner.tsx`

- **Mount point**: `ChatContent.tsx` (~line 97, before the vault ternary)
- Reads `useAuthStore((s) => s.status)` + `useAuthStore((s) => s.credentialType)`
- Shows credential-type-aware recovery actions

**Fix** — `apps/agent/src/services/chat/chat-message-service.ts` (~line 882):

- Read `useAuthStore.getState().credentialType` to show "Update API key in Settings" vs "Re-authenticate"

### Phase 1.8: Extract shared keychain helper for preflight

**`src-tauri/src/commands/common/providers.rs`**:

- Extract the core logic from `check_macos_keychain_validated()` into a `pub fn` that `preflight.rs` can call:
  ```rust
  /// Check keychain status without Tauri async context.
  /// Extracted from check_macos_keychain_validated() for reuse by preflight.
  pub fn keychain_status_sync() -> KeychainStatus { ... }
  ```
- `check_claude_keychain` Tauri command calls `keychain_status_sync()` internally

---

## Track 2: Production Readiness System

### Phase 2.1: Startup preflight checks

**New file** — `src-tauri/src/core/preflight.rs`

- Types: `PreflightReport`, `PreflightCheck`, `PreflightStatus`, `CheckCategory`, `CheckStatus`, `RecoveryAction`
- `pub fn run_preflight(sidecar_path: &Path) -> PreflightReport`:
  - Binary checks: agent-bridge, claude, orbit-server (warn-only)
  - Credential checks: `providers::keychain_status_sync()` + `credentials::load_api_key("claude")`
  - Environment checks: `HOME`, `~/.orbit/` writable
- Non-blocking — window always opens

**`src-tauri/src/lib.rs`**: Run in `.setup()`, store as `PreflightState`, emit `preflight:report` event.

**`src-tauri/src/commands/common/diagnostics.rs`**: Add `get_preflight_report` command.

### Phase 2.2: Frontend health indicator

- `apps/agent/src/types/health.ts` — TS mirrors of preflight types
- `apps/agent/src/stores/health/health-store.ts` — Zustand store
- `apps/agent/src/components/shared/health-indicator.tsx` — Status dot in header
  - **Mount point**: `App.tsx` alongside `ContentTopBar` (~line 886)
- `tauri-provider.tsx` — Listen for `preflight:report` event

### Phase 2.3: Build-time binary verification

**New file** — `scripts/verify-binaries.ts`

- Computes triple from `process.arch` + `process.platform`
- Accepts `--platform <triple>` for CI
- Required: `agent-bridge-{triple}`, `claude-{triple}`. Warn-only: `orbit-server-{triple}`
- Validates: exists, size > 1MB, executable bit

**`package.json`**: Insert `bun run verify:binaries` after `build:sidecar` + `build:opencode` and before `build-with-env.sh`.

**`src-tauri/build.rs`**: Non-fatal `cargo:warning=` for missing binaries.

### Phase 2.4: Error classification

**New file** — `apps/agent/src/lib/error-classifier.ts`

- Pattern-matches known errors → category + recovery action
- Credential-type-aware messaging

**`tauri-provider.tsx`**: Classify `agent:error` before showing toast; route auth errors through auth store.

---

## New Dependencies

- `secrecy` (Rust crate) — Add to `src-tauri/Cargo.toml`

## Implementation Order

| Step | What                                                                                                  | Files                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 0    | Add `secrecy` crate                                                                                   | `src-tauri/Cargo.toml`                                                                                       |
| 1    | Credential override in sidecar (`setCredentialOverride`, modified `getCredentials`)                   | `credentials.ts`                                                                                             |
| 2    | `UpdateCredentials` IPC message (protocol + handler + env var cleanup + override set + mark sessions) | `protocol.rs`, `protocol.ts`, `schemas.ts`, `index.ts`                                                       |
| 3    | `markAllSessionsForRestart` + `setNeedsSessionRestart`                                                | `session-manager.ts`, `agent.ts`                                                                             |
| 4    | `AgentBridge` public API (`check_and_recover`, `spawn_with_extra_env`, `is_running` fix)              | `bridge.rs`                                                                                                  |
| 5    | `CredentialBridge` struct + `inject_at_spawn` + `push_to_running`                                     | `credential_bridge.rs` (new)                                                                                 |
| 6    | Wire into `SessionManager` + startup + credential commands                                            | `session.rs`, `lib.rs`, `credentials.rs`                                                                     |
| 7    | Extract `keychain_status_sync`                                                                        | `providers.rs`                                                                                               |
| 8    | Auth store + banner + credential-aware error messages                                                 | `auth-store.ts`, `auth-error-banner.tsx`, `tauri-provider.tsx`, `ChatContent.tsx`, `chat-message-service.ts` |
| 9    | Preflight checks                                                                                      | `preflight.rs`, `lib.rs`, `diagnostics.rs`                                                                   |
| 10   | Health indicator                                                                                      | `health.ts`, `health-store.ts`, `health-indicator.tsx`, `App.tsx`                                            |
| 11   | Build verification                                                                                    | `verify-binaries.ts`, `package.json`, `build.rs`                                                             |
| 12   | Error classification                                                                                  | `error-classifier.ts`, `tauri-provider.tsx`                                                                  |

Steps 0-8 are the critical fix. Steps 9-12 are production-readiness infrastructure.

---

## Verification

### Cold-start precedence (Steps 1-2, the key test)

1. Log in to Claude Code CLI (OAuth in Keychain) AND add API key in Settings
2. **Restart the app** (cold start — both credential sources present)
3. Send first message → sidecar stderr should show "Credential override initialized from startup env (Settings API key)"
4. Message should use API key, NOT OAuth
5. Delete API key in Settings → restart app → send message → should use OAuth from Keychain

### Mid-session precedence (Steps 1-2)

1. Start with only OAuth (no stored API key)
2. Send message → uses OAuth
3. Add API key in Settings (mid-session)
4. Send message → logs show "Credential override set: API key from Settings", session restarts, uses API key
5. Delete API key → send message → falls back to OAuth

### Active session restart (Step 3)

1. Start a chat session, send a message (session active)
2. Change API key in Settings
3. Send another message → session-manager should log "Restarting session after credential change"
4. Message should succeed with new credentials

### Dead sidecar recovery (Step 4)

1. Start app, create a session
2. `kill -9 <sidecar-pid>`
3. Send message → `check_and_recover` detects dead child → respawn → succeeds

### Full credential flow (Steps 5-8)

1. Fresh app, no env vars, no Claude Code CLI
2. App starts → preflight shows "No credentials"
3. Add API key in Settings → auth store updates → banner dismisses
4. Send message → works
5. Restart app → message works (key loaded from `credentials.enc`)
6. Delete key → banner shows "No credentials configured — set up in Settings"

### Auth error messages (Step 8)

1. With API key: use invalid key → error says "Update your API key in Settings" (NOT "run claude login")
2. With OAuth: expired token → error says "Re-authenticate in Settings"

### Build verification (Step 11)

1. Delete `agent-bridge-aarch64-apple-darwin` → `bun run build` fails
2. Delete `orbit-server-*` → `bun run build` warns but succeeds
