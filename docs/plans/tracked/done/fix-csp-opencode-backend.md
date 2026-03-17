# Fix CSP blocking OpenCode backend in production builds

> **Audit status**: Reviewed 2026-03-16 — `APPROVE` ([reviews/audit-plan.md](../../../../reviews/audit-plan.md))

## Context

When building with `bun run build` and switching to the OpenCode backend, the app fails because the Content Security Policy (CSP) in `src-tauri/tauri.conf.json` blocks all HTTP connections to `127.0.0.1:4097` (the OpenCode sidecar port).

The CSP `connect-src` currently allows `http://localhost:*` but NOT `http://127.0.0.1:*`. In CSP, `localhost` and `127.0.0.1` are treated as **different origins**. The OpenCode client (`apps/agent/src/services/opencode/client.ts:13`) explicitly uses `http://127.0.0.1:{port}`, and the Rust backend (`src-tauri/src/opencode/process.rs`) binds to `127.0.0.1`.

This causes every OpenCode API call (sessions, providers, SSE events) to be refused by the browser, resulting in empty providers, empty models, and a non-functional backend despite the health check showing "healthy" (health check runs in Rust, bypassing CSP).

## Root Cause

**Single file, single line** — `src-tauri/tauri.conf.json` line 40:

```json
"connect-src": "'self' https://api.anthropic.com ipc://localhost https://streamdown.ai http://localhost:* ws://localhost:* https://github.com https://*.githubusercontent.com"
```

Missing: `http://127.0.0.1:*`

## Fix

Add `http://127.0.0.1:*` to the `connect-src` directive:

```json
"connect-src": "'self' https://api.anthropic.com ipc://localhost https://streamdown.ai http://localhost:* http://127.0.0.1:* ws://localhost:* https://github.com https://*.githubusercontent.com"
```

### Files to modify

- `src-tauri/tauri.conf.json` (line 40) — add `http://127.0.0.1:*` to `connect-src`
- `docs/architecture/CSP-SECURITY.md` — update to reflect actual CSP directives and explain why both `localhost` and `127.0.0.1` are needed

### Automated regression guard

Add a Rust contract test that parses `tauri.conf.json` and asserts the CSP/host contract holds. This prevents silent regression — CSP failures are production-only (dev mode doesn't enforce CSP), so manual testing is insufficient as the sole guard.

**Test location:** `src-tauri/tests/csp_config.rs` — the `include_str!("../tauri.conf.json")` path resolves correctly from `src-tauri/tests/` to `src-tauri/tauri.conf.json`.

```rust
// src-tauri/tests/csp_config.rs
use serde_json::Value;

#[test]
fn csp_allows_opencode_loopback_origin() {
    let config: Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid tauri.conf.json");
    let connect_src = config["app"]["security"]["csp"]["connect-src"]
        .as_str()
        .expect("connect-src string");

    assert!(
        connect_src.contains("http://127.0.0.1:*"),
        "OpenCode client and Rust lifecycle use 127.0.0.1; CSP must allow it"
    );
}
```

### Secondary CSP issues (pre-existing, not blocking OpenCode)

- Google Fonts (`https://fonts.googleapis.com`) blocked by `style-src` — cosmetic
- Sentry (`https://*.sentry.io`) blocked by `connect-src` — error reporting only
- `SyntaxError: Unexpected token '{'` — from streamdown's runtime `eval()` CDN loading, not from import assertions in the bundle (confirmed: zero import assertions in all production JS chunks)

These are separate issues and NOT part of this fix.

## Out of Scope — Future Transport Changes

This fix covers the current HTTP + SSE transport only. If any of the following change, CSP must be revisited:

- **WebSocket transport**: If OpenCode moves from HTTP/SSE to WebSocket on `127.0.0.1`, `ws://127.0.0.1:*` must be added to `connect-src` (currently only `ws://localhost:*` is allowed)
- **IPv6 loopback**: If the sidecar or client switches to `[::1]`, the same origin-parity mismatch will recur under a different host string
- **Host string changes**: If anyone removes `http://127.0.0.1:*` because `http://localhost:*` "looks equivalent", the contract test above will catch it

## Verification

1. `bun run build` — build sanity check only (does NOT validate CSP)
2. `cargo test` — contract test must pass (asserts `127.0.0.1` in CSP)
3. `bunx tauri build` — **authoritative** CSP validation path (packaged webview enforces CSP)
   - Optional: `bunx tauri dev` as a quicker smoke test during iteration
4. Switch to OpenCode backend in Settings
5. Confirm: providers list populated, models dropdown populated, can send messages
6. No `connect-src` CSP errors in DevTools console for `127.0.0.1:*`
