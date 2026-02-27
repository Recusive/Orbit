# Fix: Stale OAuth Token After Settings Refresh + Auth Toast UX

## Context

When an OAuth token expires and the user refreshes it via Settings (`trigger_claude_auth`), subsequent messages in the same conversation still fail with 401. Only a rewind (which creates a new SDK session) picks up the fresh token. This is because:

1. `trigger_claude_auth` writes a fresh token to macOS Keychain externally
2. The agent-bridge's `refreshIfNeeded()` sees the Keychain token is valid → returns `{ refreshed: false }` **without updating `process.env.CLAUDE_CODE_OAUTH_TOKEN`**
3. The SDK CLI subprocess inherits the stale env var → 401

Additionally, the auth error toast only has "Copy command" — users need a "Refresh Token" button to fix auth without opening Settings.

---

## Changes

### 1. Fix `refreshIfNeeded()` to sync env var with Keychain

**File:** `agent-bridge/src/common/auth/credentials.ts`

In the "token still valid" branch (lines 340-344), after confirming the Keychain token is valid, compare `process.env.CLAUDE_CODE_OAUTH_TOKEN` against the Keychain token. If they differ (external refresh happened), update the env var and return `{ refreshed: true }`.

Refactor `refreshIfNeeded()` to read Keychain credentials once (via `readKeychainCredentials()`) and share the result between the expiry check and the env-var sync, avoiding the double `spawnSync` call.

### 2. Add `sync_credentials` IPC request (Rust → Bridge)

After `trigger_claude_auth` succeeds, notify the agent-bridge to force a credential re-sync and mark active sessions for restart.

**Files to modify:**

- `agent-bridge/src/protocol/protocol.ts` — Add `SyncCredentialsRequest` to `BridgeRequest` union
- `agent-bridge/src/protocol/schemas.ts` — Add `SyncCredentialsRequestSchema` to `BridgeRequestSchema` discriminated union
- `agent-bridge/src/protocol/index.ts` — Export new type
- `agent-bridge/src/index.ts` — Handle `sync_credentials` request (call `sessionManager.syncCredentials()`)
- `agent-bridge/src/agent/session/session-manager.ts` — Add `syncCredentials()` method that calls `refreshIfNeeded()` and marks all active sessions for restart via `agent.markNeedsSessionRestart()`
- `src-tauri/src/agent/protocol.rs` — Add `SyncCredentials` variant to `BridgeRequest` enum
- `src-tauri/src/agent/session.rs` — Add `sync_credentials(&self) -> Result<()>` method
- `src-tauri/src/commands/common/providers.rs` — Add `sync_agent_credentials` Tauri command + wire `trigger_claude_auth` to auto-call `sync_credentials` after success (requires `State<'_, Arc<SessionManager>>` parameter)
- `src-tauri/src/lib.rs` — Register `sync_agent_credentials` command in `generate_handler![]`

### 3. Custom auth error toast with "Refresh Token" button

**New file:** `apps/agent/src/components/ui/auth-error-toast.tsx`

Custom toast component using `toast.custom()` (following `update-toast.tsx` pattern with scoped CSS and `!p-0 !bg-transparent` wrapper). Shows:

- Error icon + "Authentication Error" title + description
- Two action buttons:
  - **"Copy command"** — copies `claude login` to clipboard (existing behavior)
  - **"Refresh Token"** — calls `invoke('trigger_claude_auth')`, shows loading spinner, dismisses toast on success and shows success toast

**File:** `apps/agent/src/providers/tauri-provider.tsx`

- Replace `toast.error()` in `onAgentAuthError` handler (lines 508-519) with `showAuthErrorToast()` from new component
- Skip toast for `AUTH_RECOVERED` category (token was auto-refreshed)
- In the `onAgentError` handler, detect 401/auth patterns in error messages and show auth toast instead of generic error

### 4. Frontend API wrapper

**File:** `apps/agent/src/lib/api/agent.ts`

Add `syncAgentCredentials()` invoke wrapper for the new Tauri command, reusing existing `AuthTriggerResult` type from providers. The toast component uses `invoke<AuthTriggerResult>('trigger_claude_auth')` directly.

---

## Implementation Order

1. **credentials.ts** — Fix `refreshIfNeeded()` env var sync (core bug fix)
2. **protocol.ts + schemas.ts + index.ts** — Add `sync_credentials` IPC type
3. **session-manager.ts** — Add `syncCredentials()` method
4. **index.ts (bridge entry)** — Handle `sync_credentials` request
5. **protocol.rs + session.rs** — Rust-side bridge request + session method
6. **providers.rs + lib.rs** — Tauri command + registration
7. **auth-error-toast.tsx** — New custom toast component
8. **tauri-provider.tsx** — Wire toast + detect 401 in error path

---

## Key Files Reference

| File                                                | Role                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `agent-bridge/src/common/auth/credentials.ts`       | Core fix: `refreshIfNeeded()` env var sync                                     |
| `agent-bridge/src/agent/session/session-manager.ts` | `syncCredentials()` + marks sessions for restart                               |
| `agent-bridge/src/agent/core/agent.ts`              | Reuse: `markNeedsSessionRestart()`, `restartSession()`, `refreshCredentials()` |
| `agent-bridge/src/protocol/protocol.ts`             | IPC type: `BridgeRequest` union (line 437)                                     |
| `agent-bridge/src/protocol/schemas.ts`              | IPC schema: `BridgeRequestSchema` (line 608)                                   |
| `agent-bridge/src/index.ts`                         | IPC handler: `handleRequest` switch                                            |
| `src-tauri/src/agent/protocol.rs`                   | Rust `BridgeRequest` enum (line 290)                                           |
| `src-tauri/src/agent/session.rs`                    | Rust `SessionManager` methods                                                  |
| `src-tauri/src/commands/common/providers.rs`        | `trigger_claude_auth` + new `sync_agent_credentials`                           |
| `src-tauri/src/lib.rs`                              | Command registration (line 345)                                                |
| `apps/agent/src/components/ui/auth-error-toast.tsx` | **NEW** custom toast                                                           |
| `apps/agent/src/components/ui/update-toast.tsx`     | Pattern reference for custom toast                                             |
| `apps/agent/src/providers/tauri-provider.tsx`       | Auth toast wiring (line 495-530)                                               |
| `apps/agent/src/lib/api/agent.ts`                   | `AuthErrorEvent` type, event listeners                                         |

---

## Verification

1. **Rebuild agent-bridge:** `cd agent-bridge && bun run build:dev`
2. **Restart Tauri:** `bunx tauri dev`
3. **Manual test:**
   - Wait for token expiry (or manually set a stale `CLAUDE_CODE_OAUTH_TOKEN` in the bridge process)
   - Send a message → should see auth error toast with both "Copy command" and "Refresh Token" buttons
   - Click "Refresh Token" → should show loading → success toast
   - Send another message → should work (session restarts with fresh token)
4. **Type checks:** `bun run typecheck` + `cargo check`
5. **Lint:** `bun run lint` + `cargo clippy`
