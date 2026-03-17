# Content Security Policy (CSP) Configuration

> **Last Updated:** March 2026

This document explains Orbit's CSP configuration in `src-tauri/tauri.conf.json`.
Production builds enforce this policy inside the packaged WebView. `bunx tauri dev`
is useful for iteration, but it is not the authoritative CSP validation path.

## Current CSP Settings

```json
{
  "security": {
    "csp": {
      "default-src": "'self'",
      "script-src": "'self' 'unsafe-eval' https://streamdown.ai http://localhost:5176 http://localhost:5199",
      "style-src": "'self' 'unsafe-inline' https://streamdown.ai http://localhost:*",
      "connect-src": "'self' https://api.anthropic.com ipc://localhost https://streamdown.ai http://localhost:* http://127.0.0.1:* ws://localhost:* https://github.com https://*.githubusercontent.com",
      "img-src": "'self' data: blob: asset: http://asset.localhost",
      "font-src": "'self' data: https://streamdown.ai",
      "worker-src": "'self' blob:",
      "frame-src": "'self' http://localhost:*",
      "object-src": "'none'"
    }
  }
}
```

## Loopback Origin Contract

Orbit currently needs both `localhost` and `127.0.0.1` in CSP.

- The OpenCode frontend client uses `http://127.0.0.1:{port}` as its base URL.
- The Rust backend binds OpenCode to `127.0.0.1` and performs health/dispose calls against
  `http://127.0.0.1:{port}`.
- CSP treats `http://localhost:*` and `http://127.0.0.1:*` as different origins. Allowing one
  does not allow the other.
- `http://localhost:*` remains necessary for local development and other localhost-based tooling.
- `http://127.0.0.1:*` is required for the current OpenCode HTTP + SSE transport in production.

If OpenCode later moves to WebSockets on `127.0.0.1`, add `ws://127.0.0.1:*` to `connect-src`
as well. The current policy only allows `ws://localhost:*`.

## Directive Notes

| Directive     | Value / Examples                                                                           | Purpose                                                        |
| ------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `script-src`  | `'unsafe-eval'`, `https://streamdown.ai`, `http://localhost:5176`, `http://localhost:5199` | Streamdown runtime support plus local dev servers              |
| `style-src`   | `'unsafe-inline'`, `https://streamdown.ai`, `http://localhost:*`                           | Tailwind/runtime styles and local dev stylesheets              |
| `connect-src` | `ipc://localhost`, `https://api.anthropic.com`, `http://localhost:*`, `http://127.0.0.1:*` | Tauri IPC, Anthropic API, local HTTP/SSE backends, dev tooling |
| `img-src`     | `data:`, `blob:`, `asset:`, `http://asset.localhost`                                       | Inline images, screenshots, Tauri asset protocol               |
| `font-src`    | `data:`, `https://streamdown.ai`                                                           | Streamdown-provided fonts                                      |
| `worker-src`  | `blob:`                                                                                    | Browser workers created from bundled code                      |
| `frame-src`   | `'self'`, `http://localhost:*`                                                             | Local preview/dev frames                                       |
| `object-src`  | `'none'`                                                                                   | Disables legacy plugin/embed content                           |

## Why `'unsafe-eval'` Still Exists

Orbit still keeps `'unsafe-eval'` in `script-src` because Streamdown 2.x historically relied on
runtime evaluation for CDN-loaded markdown features. Even though the newer plugin architecture may
allow future simplification, this fix does not change that part of the policy.

## Regression Guard

`src-tauri/tests/csp_config.rs` parses `tauri.conf.json` and asserts that `connect-src` contains
`http://127.0.0.1:*`. This catches production-only regressions where OpenCode's loopback host and
the packaged WebView CSP drift out of sync.

## Changelog

- **March 2026:** Added `http://127.0.0.1:*` to `connect-src` for the OpenCode production transport
- **January 2026:** Added `https://streamdown.ai` to CSP directives for Streamdown assets
- **January 2026:** Added `'unsafe-eval'` after upgrading Streamdown 1.6.11 to 2.0.1
- **January 2026:** Added `ipc://localhost` to `connect-src` for Tauri IPC
