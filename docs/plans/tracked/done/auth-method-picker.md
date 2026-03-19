# Plan: Auth Method Picker for Claude Backend

## Context

The credential system was just wired end-to-end (production-ready-credentials plan), but there's no way for users to **choose** between OAuth and API Key. Currently, if both exist, the stored API key always wins via `credentialOverride` — the user can't say "I have both, but use OAuth." The Account Settings page shows both sections independently, but doesn't surface which one is _active_ or let the user switch.

**Goal:** Add a radio-card selector to Account Settings so users can explicitly pick OAuth or API Key as their preferred Claude auth method.

---

## Architecture

The sidecar already supports both modes via the existing `update_credentials` IPC:

- Send API key → sets `credentialOverride` → API key used
- Send `undefined` → clears override, **deletes all auth env vars** → sidecar's `getCredentials()` tries OAuth from Keychain

**No new IPC messages needed.** The entire feature is: persist a preference, respect it at startup, let the user toggle it.

### Runtime Contract

The preference is a **UI-level selection that controls what Rust pushes to the sidecar**. It is NOT a sidecar-level enforcement — the sidecar has no concept of "preferred method." It always runs its `getCredentials()` chain: override → Keychain → env. What we control is whether an override is set.

- `preferred = "apikey"` → Rust pushes the stored API key as the sidecar override (if a key exists). If no key is stored, Rust pushes nothing — the sidecar falls through to its normal chain (Keychain → env). **The sidecar may succeed via OAuth even though the user "preferred" API key.** The UI reports this honestly: the auth method selector shows "API Key" selected, but the status shows "No API key configured" and the auth store sets `credentialType` based on what is _actually_ working (OAuth in this case).
- `preferred = "oauth"` → Rust clears the override (`update_credentials(None)`), deleting env vars. The sidecar reads Keychain via `getOAuthTokenFromKeychain()`. If Keychain empty/expired → auth error.
- `preferred = null` (legacy) → API key wins if present, else OAuth.

**Why not enforce?** Adding sidecar enforcement (a new IPC to disable the Keychain path) would require protocol changes, sidecar rebuilds, and a new failure mode where the sidecar has working credentials but refuses to use them. The preference is simpler and more useful as "which credential do I _want_ to use" — the UI guides the user to set it up, and when both exist, the preferred one is what gets used.

### Shell env `ANTHROPIC_API_KEY` — unmodeled third path

The sidecar's `getCredentials()` has three fallback steps: override → Keychain → `process.env.ANTHROPIC_API_KEY`. The picker manages the first two (Settings API key → override, OAuth → Keychain). The third — a shell env var from the user's `.bashrc`/`.zshrc` — is invisible to the picker.

**How it can leak through:**

- `update_credentials(None)` deletes `process.env.ANTHROPIC_API_KEY` at runtime, so it's gone for the current sidecar process.
- But if the sidecar crashes and `ensure_running()` respawns it, the new process inherits the parent env (Tauri app → shell env) — including any shell-level `ANTHROPIC_API_KEY`.
- `initOverrideFromEnv()` only activates when `ORBIT_SETTINGS_API_KEY=1` (Rust-injected), so the shell key won't become an _override_. But `getApiKeyFromEnv()` (third fallback) reads it unconditionally.

**Consequence:** With `preferred = "oauth"`, no override, expired/missing Keychain, but a shell env key: the sidecar succeeds via the env key. The user chose OAuth, the UI reports auth error, but messages work. This only happens on sidecar restart (not during normal operation) and only for developers who have the env var set.

**Decision:** Out of scope for the picker. The shell env key is a developer escape hatch, not a user-facing credential source. A future fix could have Rust explicitly unset `ANTHROPIC_API_KEY` at spawn time when `preferred = "oauth"` and no Settings key exists, but that's a separate concern.

---

## Phase 1: Rust Backend

### 1.1 Add `preferred_auth_method` to `StoredCredentials`

**File:** `src-tauri/src/commands/common/credentials.rs:69-81`

Add a new optional field to `StoredCredentials`:

```rust
struct StoredCredentials {
    anthropic_api_key: Option<String>,
    openai_api_key: Option<String>,
    google_api_key: Option<String>,
    /// User's preferred auth method: "oauth" or "apikey".
    /// None = legacy behavior (API key wins if present).
    preferred_auth_method: Option<String>,
}
```

Backwards compatible — existing `credentials.enc` files deserialize with `None` (serde default for `Option`).

### 1.2 Add `load_preferred_auth_method` helper

**File:** `src-tauri/src/commands/common/credentials.rs` (after `load_api_key` at line ~244)

```rust
pub fn load_preferred_auth_method() -> Option<String> {
    match load_credentials() {
        Ok(creds) => creds.preferred_auth_method,
        Err(e) => {
            log::warn!("Failed to load preferred auth method: {e}");
            None
        }
    }
}
```

### 1.3 Add two new Tauri commands

**File:** `src-tauri/src/commands/common/credentials.rs` (after `delete_api_key`)

`get_preferred_auth_method` — reads the preference from `credentials.enc`:

```rust
#[tauri::command]
pub async fn get_preferred_auth_method() -> Result<Option<String>, String> {
    let credentials = load_credentials()?;
    Ok(credentials.preferred_auth_method)
}
```

`set_preferred_auth_method` — persists the preference AND pushes the credential state change to the running sidecar. **Must acquire `file_lock`** to prevent concurrent corruption with `store_api_key`/`delete_api_key`:

```rust
#[tauri::command]
pub async fn set_preferred_auth_method(
    method: String,
    credential_bridge: State<'_, Arc<CredentialBridge>>,
    session_manager: State<'_, Arc<SessionManager>>,
) -> StoreResult {
    let result = (|| -> Result<(), String> {
        // CRITICAL: Acquire file_lock to prevent concurrent read-modify-write
        // corruption with store_api_key / delete_api_key.
        let _file_guard = credential_bridge.file_lock.lock();

        if method != "oauth" && method != "apikey" {
            return Err(format!("Invalid auth method: {method}"));
        }

        let mut credentials = load_credentials()?;
        credentials.preferred_auth_method = Some(method.clone());
        save_credentials(&credentials)?;

        // Push to sidecar based on the new preference
        if method == "apikey" {
            if let Some(ref key) = credentials.anthropic_api_key {
                credential_bridge.set_api_key(Some(key.clone()));
                session_manager
                    .update_credentials(Some(key))
                    .map_err(|e| format!("Failed to push credentials to sidecar: {e}"))?;
            }
        } else {
            // "oauth" — clear override so sidecar falls back to Keychain
            credential_bridge.set_api_key(None);
            session_manager
                .update_credentials(None)
                .map_err(|e| format!("Failed to clear credentials in sidecar: {e}"))?;
        }
        Ok(())
    })();

    match result {
        Ok(()) => StoreResult { success: true, error: None },
        Err(e) => {
            let _ = capture_command_error("set_preferred_auth_method", &e);
            StoreResult { success: false, error: Some(e) }
        }
    }
}
```

### 1.4 Update startup logic

**File:** `src-tauri/src/lib.rs:265-268`

Currently:

```rust
if let Some(api_key) = credentials::load_api_key("claude") {
    credential_bridge.set_api_key(Some(api_key));
}
```

Change to:

```rust
let stored_api_key = credentials::load_api_key("claude");
let preferred = credentials::load_preferred_auth_method();

// Sanitize: only "oauth" and "apikey" are valid. Treat anything else as None (legacy).
let sanitized = match preferred.as_deref() {
    Some("oauth") => Some("oauth"),
    Some("apikey") => Some("apikey"),
    _ => None, // None, empty, corrupted, or unknown values → legacy behavior
};

// Only inject API key if preferred method is "apikey" (or no preference = legacy)
let should_inject = match sanitized {
    Some("oauth") => false,
    _ => stored_api_key.is_some(), // "apikey" or None (legacy)
};
if should_inject {
    if let Some(key) = stored_api_key {
        credential_bridge.set_api_key(Some(key));
    }
}
```

### 1.5 Guard sidecar push in `store_api_key` only

**File:** `src-tauri/src/commands/common/credentials.rs`

In `store_api_key` (~line 276): Only push the key to sidecar if preferred method is NOT "oauth":

```rust
if provider == "claude" || provider == "anthropic" {
    let preferred = credentials.preferred_auth_method.as_deref();
    if preferred != Some("oauth") {
        session_manager.update_credentials(Some(&key)).map_err(...)?;
    }
}
```

**`delete_api_key` is NOT guarded** — always call `session_manager.update_credentials(None)` regardless of preference. Reason: `session_manager.update_credentials(None)` calls `credential_bridge.set_api_key(None)` internally. If we skip this, a stale API key remains in `CredentialBridge`'s in-memory state. When the sidecar crashes and `ensure_running()` respawns it, `inject_at_spawn()` reads this stale in-memory key and re-injects it — resurrecting a deleted credential. The cost of sending one harmless `update_credentials(None)` to a sidecar that already has no override is negligible.

### 1.6 Register new commands

**File:** `src-tauri/src/lib.rs` (in `generate_handler![]`, after line 631)

```rust
credentials::get_preferred_auth_method,
credentials::set_preferred_auth_method,
```

---

## Phase 2: Frontend State

### 2.1 Add `preferredMethod` to auth store

**File:** `apps/agent/src/stores/agent/auth-store.ts`

```typescript
export type PreferredAuthMethod = 'oauth' | 'apikey' | null;

interface AuthState {
  // ... existing fields ...
  preferredMethod: PreferredAuthMethod;
  setPreferredMethod: (method: PreferredAuthMethod) => void;
}
```

### 2.2 Update bootstrap to respect preference

**File:** `apps/agent/src/providers/tauri-provider.tsx:186-233` (`bootstrapRuntimeHealth`)

Add `get_preferred_auth_method` to the parallel `Promise.allSettled` call (line 187-191):

```typescript
const results = await Promise.allSettled([
  invoke<RetrieveResult>('retrieve_api_key', { provider: 'claude' }),
  invoke<KeychainStatus>('check_claude_keychain'),
  getPreflightReport(),
  invoke<string | null>('get_preferred_auth_method'), // NEW
]);
```

Then replace the auth store logic (lines 199-221) to respect the preference. The sidecar may fall through to a non-preferred credential (see Runtime Contract), so the auth store must reflect what is **actually working**, not just what's preferred:

The bootstrap determines what the sidecar will **actually use** (not just what's preferred) and sets `credentialType` accordingly. The preference controls what Rust pushed to the sidecar, but the auth store must reflect reality:

```typescript
// Sanitize on the frontend too — only "oauth" and "apikey" are valid.
// Corrupted or unknown values from credentials.enc become null (legacy).
const rawPref = prefResult.status === 'fulfilled' ? prefResult.value : null;
const preferred: PreferredAuthMethod = rawPref === 'oauth' || rawPref === 'apikey' ? rawPref : null;
const hasApiKey = apiKeyResult.status === 'fulfilled' && apiKeyResult.value.key !== null;
const hasOAuth = keychainResult.status === 'fulfilled' && keychainResult.value.hasCredentials;
const keychainExpired =
  keychainResult.status === 'fulfilled' &&
  keychainResult.value.entryExists &&
  !keychainResult.value.hasCredentials;

authStore.setPreferredMethod(preferred as PreferredAuthMethod);

if (preferred === 'apikey') {
  if (hasApiKey) {
    authStore.setAuthenticated('apikey', null);
  } else if (hasOAuth) {
    // User prefers API key but has none — sidecar falls through to OAuth.
    // Report OAuth as the actual credential type so banners are correct.
    authStore.setAuthenticated('oauth', keychainResult.value.expiresAt);
  } else if (keychainExpired) {
    // No API key, and OAuth exists but is expired. Sidecar will attempt
    // auto-refresh via getOAuthTokenFromKeychain(). Report as expired OAuth
    // so the banner shows "Re-authenticate" rather than "Add API key."
    authStore.setExpired(
      keychainResult.value.error ?? 'OAuth token expired. No API key configured.',
      true,
      keychainResult.value.expiresAt
    );
  } else {
    // No API key AND no OAuth at all.
    authStore.setError('NO_CREDENTIALS', 'No API key configured. Add one below.', true, 'apikey');
  }
} else if (preferred === 'oauth') {
  if (hasOAuth) {
    authStore.setAuthenticated('oauth', keychainResult.value.expiresAt);
  } else if (keychainExpired) {
    authStore.setExpired(
      keychainResult.value.error ?? 'OAuth expired',
      true,
      keychainResult.value.expiresAt
    );
  } else {
    authStore.setError(
      'NO_CREDENTIALS',
      'No OAuth credentials. Sign in with Claude Code.',
      true,
      'oauth'
    );
  }
} else {
  // Legacy (no preference): API key wins, then OAuth, then error
  if (hasApiKey) authStore.setAuthenticated('apikey', null);
  else if (hasOAuth) authStore.setAuthenticated('oauth', keychainResult.value.expiresAt);
  else if (keychainExpired)
    authStore.setExpired(
      keychainResult.value.error ?? 'OAuth expired',
      true,
      keychainResult.value.expiresAt
    );
  else authStore.setError('NO_CREDENTIALS', 'No credentials configured.', true, null);
}
```

---

## Phase 3: UI

### 3.1 Redesign `AccountSettings.tsx`

**File:** `apps/agent/src/components/modals/settings/pages/AccountSettings.tsx`

**New layout:**

1. **SectionHeader:** "Authentication" — "Choose your preferred Claude authentication method"
2. **Auth Method Selector:** Two radio-card buttons side-by-side (following BackendSettings.tsx pattern)
   - **OAuth (Claude Code)** — radio dot + "OAuth" label + status badge (Connected/Not connected)
   - **API Key** — radio dot + "API Key" label + status badge (Configured/Not configured)
   - Active card: `ring-1 ring-foreground/8 bg-foreground/5` + "Preferred" badge
   - Inactive card: `hover:bg-foreground/3`
   - **"Using" indicator:** When `preferredMethod !== credentialType` (e.g. preferred API key but actually using OAuth because no key exists), show a subtle inline note on the active card: `"Using OAuth — no API key configured"`. This makes the Preferred vs Using distinction explicit without adding visual clutter when they match.
3. **SectionDivider**
4. **OAuth Status Card** — existing card, unchanged. If OAuth is not the preferred method, add `opacity-60` with "(not preferred)" label
5. **SectionDivider**
6. **API Key Section** — existing input/display, unchanged. Same opacity treatment if not preferred

**New state:**

```typescript
const [preferredMethod, setPreferredMethod] = useState<'oauth' | 'apikey' | null>(null);
const [isSwitching, setIsSwitching] = useState(false);
```

**On mount:** Fetch `get_preferred_auth_method` alongside existing `fetchStatus`.

**On selection change — must update BOTH `preferredMethod` AND `credentialType`:**

The auth store's `credentialType` drives error banners, error classification messages, and recovery actions (e.g. "Update your API key in Settings" vs "Re-authenticate"). If we only update `preferredMethod` without refreshing `credentialType`, the user switches to OAuth but error banners still say "Update your API key."

```typescript
const handleMethodChange = async (method: 'oauth' | 'apikey') => {
  setIsSwitching(true);
  try {
    const result = await invoke<StoreResult>('set_preferred_auth_method', { method });
    if (!result.success) return;

    setPreferredMethod(method);
    const authStore = useAuthStore.getState();
    authStore.setPreferredMethod(method);

    // Re-fetch actual credential status and update credentialType.
    // The sidecar has already been reconfigured by set_preferred_auth_method.
    if (method === 'oauth') {
      const status = await invoke<KeychainStatus>('check_claude_keychain');
      if (status.hasCredentials) {
        authStore.setAuthenticated('oauth', status.expiresAt);
      } else if (status.entryExists) {
        authStore.setExpired(status.error ?? 'OAuth expired', true, status.expiresAt);
      } else {
        authStore.setError(
          'NO_CREDENTIALS',
          'No OAuth credentials. Sign in with Claude Code.',
          true,
          'oauth'
        );
      }
    } else {
      // "apikey" — check if key exists
      if (storedApiKey !== null) {
        authStore.setAuthenticated('apikey', null);
      } else {
        // No API key stored. Sidecar falls through to OAuth — check if that works.
        const oauthStatus = await invoke<KeychainStatus>('check_claude_keychain');
        if (oauthStatus.hasCredentials) {
          // Messages will work via OAuth even though user prefers API key.
          // Report actual credential type so banners are correct.
          authStore.setAuthenticated('oauth', oauthStatus.expiresAt);
        } else if (oauthStatus.entryExists) {
          // OAuth exists but expired — sidecar will attempt auto-refresh.
          authStore.setExpired(
            oauthStatus.error ?? 'OAuth expired. No API key configured.',
            true,
            oauthStatus.expiresAt
          );
        } else {
          authStore.setError('NO_CREDENTIALS', 'No API key configured.', true, 'apikey');
        }
      }
    }

    // Refresh the OAuth status card too (expiry may have changed)
    await fetchStatus();
  } finally {
    setIsSwitching(false);
  }
};
```

---

## Edge Cases

### Core Scenarios

| Scenario                                 | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First launch (no preference stored)      | `preferred_auth_method = null`. Legacy behavior: API key wins. UI derives initial selection from `authStore.credentialType` (the _actual_ active method) so the visual always matches reality. A subtle hint encourages the user to explicitly pick.                                                                                                                                                                                                                      |
| Both OAuth + API key available           | Whichever is preferred is pushed to sidecar. Both sections show their status independently.                                                                                                                                                                                                                                                                                                                                                                               |
| Select "API Key" but no key stored       | Preference saved. `set_preferred_auth_method` skips the `if let Some(ref key)` branch — no override pushed to sidecar. Sidecar's `getCredentials()` falls through to Keychain → may succeed via OAuth. Auth store sets `credentialType` based on what's actually available (OAuth if present, else `NO_CREDENTIALS`). UI shows "API Key" selected but status shows "No API key configured" — the API Key section prompts to enter one. Messages may still work via OAuth. |
| Select "OAuth" but OAuth expired         | Preference saved. Override cleared. Sidecar's `getOAuthTokenFromKeychain()` detects expiry → attempts auto-refresh → if fails, auth error banner with `credentialType = 'oauth'` shows "Re-authenticate" (not "Update API key").                                                                                                                                                                                                                                          |
| Save new API key while "OAuth" preferred | Key stored in `credentials.enc` but NOT pushed to sidecar (guarded `store_api_key`). Available when user switches preference.                                                                                                                                                                                                                                                                                                                                             |
| Delete API key while "API Key" preferred | Key cleared. `delete_api_key` always calls `session_manager.update_credentials(None)` (unguarded) → clears `CredentialBridge` in-memory + sidecar override. Sidecar falls back to OAuth via Keychain.                                                                                                                                                                                                                                                                     |
| Demo mode (`?demo=true`)                 | New invoke calls must be skipped (return mock data). Existing `fetchStatus` already guards for this — add same guard around `get_preferred_auth_method`.                                                                                                                                                                                                                                                                                                                  |
| OpenCode backend active                  | Picker is irrelevant when Engine v2 is selected — hide or disable the auth method selector when `activeBackend === 'opencode'`.                                                                                                                                                                                                                                                                                                                                           |

### Reliability Scenarios

| Scenario                                                       | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidecar crash + restart                                        | Safe: `set_preferred_auth_method` and `delete_api_key` both update `CredentialBridge.api_key` in-memory. When `ensure_running()` respawns the sidecar, `inject_at_spawn` reads this in-memory state. Preference survives restarts without re-reading `credentials.enc`.                                                                                                                                                                                                                 |
| Cold start: `preferred = oauth`, expired OAuth, stored API key | Startup skips API key injection (`should_inject = false`). Sidecar starts without override. `getCredentials()` tries Keychain → expired → auto-refresh attempted. If refresh succeeds → OAuth used. If refresh fails → auth error. User sees "Re-authenticate" banner with `credentialType = 'oauth'`. The stored API key exists but no override was set — sidecar won't use it because env vars were not injected either. User can switch preference to API key to use the stored key. |
| Delete API key after prior API-key session, OAuth preferred    | `delete_api_key` always clears `CredentialBridge` (unguarded). No stale key survives in memory. Sidecar already had override cleared when user switched to OAuth. Clean state.                                                                                                                                                                                                                                                                                                          |
| Switch method mid-session → auth error before refetch          | `handleMethodChange` calls `fetchStatus()` at the end to refresh both OAuth and API key status. But if an auth error fires between `set_preferred_auth_method` and the refetch, the error classifier reads `authStore.credentialType` — which was already updated by `setAuthenticated`/`setError` in `handleMethodChange`. Error messages will be correct for the new method.                                                                                                          |
| Corrupted/unknown `preferred_auth_method` value                | Rust `set_preferred_auth_method` validates `method != "oauth" && method != "apikey"` → rejects unknown values. For corrupted values already in `credentials.enc`: startup `match preferred.as_deref()` falls through to `_ =>` (legacy behavior). Frontend treats any non-`"oauth"`/`"apikey"` value as `null`. Add explicit sanitization: `if preferred is not "oauth" or "apikey" → treat as null`.                                                                                   |
| Concurrent `set_preferred_auth_method` + `store_api_key`       | Both acquire `credential_bridge.file_lock` before read-modify-write. Serialized. No corruption.                                                                                                                                                                                                                                                                                                                                                                                         |
| Switch Engine v2 → Claude while settings mounted               | AccountSettings reads `activeBackend` from `useBackendStore`. If backend changes while mounted, the selector should re-render (reactive via Zustand selector). Picker hides when `activeBackend === 'opencode'`, shows when `activeBackend === 'claude'`.                                                                                                                                                                                                                               |

---

## Thread Safety Note

All commands that **write** `credentials.enc` (`store_api_key`, `delete_api_key`, `set_preferred_auth_method`) **must** acquire `credential_bridge.file_lock` before the `load_credentials()` → modify → `save_credentials()` sequence to prevent concurrent read-modify-write corruption.

**Read-only callers** (`get_preferred_auth_method`, `load_preferred_auth_method` at startup, `retrieve_api_key`) do NOT acquire `file_lock`. There is a race window: `fs::write` internally calls `File::create` (truncates to 0 bytes) then `write_all`. A concurrent read during that window can observe:

1. **Empty file** (read lands after truncation, before any bytes written) → `serde_json::from_str("")` fails → `load_credentials()` returns `Err` → caller gets `None` (legacy fallback).
2. **Partial JSON** (read lands mid-write, `write_all` issued multiple syscalls or was interrupted) → `serde_json::from_str` fails on invalid JSON → same `Err` → same `None` fallback.
3. **Complete old content** (read completes before truncation) → valid, returns previous value.
4. **Complete new content** (read starts after write finishes) → valid, returns new value.

Cases 1 and 2 both produce `Err` from `load_credentials()` → callers return `None`/default. This is a benign transient failure — it cannot corrupt data or produce a wrong-but-valid value, and the next read will see the completed write.

Not worth fixing with write-to-temp-then-rename for this use case — the preference is read once at startup and once per Settings page mount. The probability of hitting the race is negligible, and the consequence is a single fallback to legacy behavior.

---

## Critical Files

| File                                                                  | Changes                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src-tauri/src/commands/common/credentials.rs`                        | Add field to `StoredCredentials`, new helper, 2 new commands, guard sidecar pushes |
| `src-tauri/src/lib.rs`                                                | Conditional API key injection at startup, register 2 commands                      |
| `apps/agent/src/stores/agent/auth-store.ts`                           | Add `preferredMethod` field + setter                                               |
| `apps/agent/src/providers/tauri-provider.tsx`                         | Fetch preference in bootstrap, respect it                                          |
| `apps/agent/src/components/modals/settings/pages/AccountSettings.tsx` | Radio-card selector UI, wire to new commands                                       |

**No sidecar changes.** The existing `update_credentials` IPC handles everything.

---

## Verification

### Happy Path

1. **Fresh start, no preference:** App uses legacy behavior (API key wins). Settings derive selection from actual `credentialType`.
2. **Select "OAuth" with both available:** Sidecar logs "Credential override cleared." Send a message → uses OAuth. Auth banner says "Connected" with OAuth type.
3. **Select "API Key" with both available:** Sidecar logs "Credential override set." Send a message → uses API key. Auth banner says "Connected" with API key type.
4. **Switch mid-session:** Change OAuth → API Key → sessions restart. Next message succeeds with new credentials.
5. **Cold restart:** Kill and reopen. Preference persists. Sidecar starts with correct credential mode.

### Error Paths

6. **Select "API Key" with no key, OAuth available:** Preference saved. Sidecar falls through to OAuth — messages still work. Auth store reports `credentialType = 'oauth'` (actual). UI shows "API Key" selected but status shows "No API key configured." API Key section shows input form. No false auth error.
7. **Select "OAuth" with expired token:** Preference saved. Auto-refresh attempted. If fails, banner says "Re-authenticate" with `credentialType = 'oauth'` (not "Update API key").
8. **Cold start with preferred=oauth, expired OAuth, stored API key:** App does NOT silently use API key. Auth error surfaces. User must refresh OAuth or switch preference.
9. **Delete API key, then sidecar crashes:** `CredentialBridge` is cleared (unguarded `delete_api_key`). Sidecar restart does NOT re-inject deleted key.
10. **Switch to Engine v2 → open Settings → switch back to Claude:** Auth method picker re-appears with correct state (reactive via `useBackendStore` selector).

---

## Test Plan

### Rust tests (`cargo test`)

**File:** `src-tauri/src/commands/common/credentials.rs` (inline `#[cfg(test)]` module)

| Test                                         | What it verifies                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test_stored_credentials_backwards_compat`   | Deserialize a `StoredCredentials` JSON without `preferred_auth_method` field → field is `None`. Ensures existing `credentials.enc` files don't break.                                                                                      |
| `test_stored_credentials_with_preference`    | Round-trip serialize/deserialize with `preferred_auth_method: Some("oauth")` and `Some("apikey")`.                                                                                                                                         |
| `test_set_preferred_auth_method_validates`   | Call with `"invalid"` → returns `StoreResult { success: false }`. Call with `"oauth"` and `"apikey"` → returns success.                                                                                                                    |
| `test_startup_injection_respects_preference` | Unit test for the startup logic: given `(stored_key, preferred)` tuples, assert `should_inject` is correct. Covers: `(Some, Some("oauth"))` → false, `(Some, Some("apikey"))` → true, `(Some, None)` → true (legacy), `(None, _)` → false. |
| `test_sanitize_corrupted_preference`         | `preferred = Some("garbage")` → `sanitized` is `None` (legacy).                                                                                                                                                                            |

### Frontend tests (Vitest)

**File:** `apps/agent/src/__tests__/components/modals/settings/account-settings.test.tsx`

| Test                                                 | What it verifies                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `renders radio cards for oauth and apikey`           | Mount `AccountSettings` → two radio-card buttons exist with labels "OAuth" and "API Key".             |
| `shows Preferred badge on selected method`           | Set `preferredMethod = 'oauth'` → OAuth card has "Preferred" badge, API Key card does not.            |
| `shows Using indicator when preferred !== actual`    | Set `preferredMethod = 'apikey'`, `credentialType = 'oauth'` → API Key card shows "Using OAuth" note. |
| `handleMethodChange calls set_preferred_auth_method` | Click API Key card → `invoke('set_preferred_auth_method', { method: 'apikey' })` called.              |
| `hides picker when OpenCode backend active`          | Set `activeBackend = 'opencode'` → picker is not rendered.                                            |

**File:** `apps/agent/src/__tests__/providers/tauri-provider-auth.test.ts`

| Test                                                     | What it verifies                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `bootstrap with preferred=apikey, key exists`            | Mock invokes → `authStore.credentialType === 'apikey'`, `preferredMethod === 'apikey'`.           |
| `bootstrap with preferred=apikey, no key, oauth exists`  | Mock invokes → `credentialType === 'oauth'` (actual fallthrough), `preferredMethod === 'apikey'`. |
| `bootstrap with preferred=apikey, no key, oauth expired` | Mock invokes → `status === 'expired'`, `credentialType` not `'apikey'`.                           |
| `bootstrap with preferred=oauth, oauth exists`           | Mock invokes → `credentialType === 'oauth'`, `preferredMethod === 'oauth'`.                       |
| `bootstrap with preferred=null (legacy), both exist`     | Mock invokes → `credentialType === 'apikey'` (legacy: key wins).                                  |
| `bootstrap sanitizes corrupted preference`               | Mock `get_preferred_auth_method` returns `"garbage"` → `preferredMethod === null`.                |
