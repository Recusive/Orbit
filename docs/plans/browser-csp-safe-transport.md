# Plan: CSP-Safe Browser Tool Transport

> **Status**: Draft
> **Date**: 2026-03-06
> **Companion**: `docs/plans/agent-browser-integration.md` (original plan), `docs/specs/agent-browser-integration-spec.md` (spec)

---

## Context

The browser tool integration (38 MCP tools) was implemented per the agent-browser-integration plan and is working on standard pages. However, **CSP-hardened sites like Hacker News block all tool execution** — including basic tools like `browser_get_url` and `browser_get_title` that should never require `new Function()`.

The root cause: every tool call flows through `browser_eval_inner()` (mod.rs:773) which wraps scripts in `new Function(__scriptSource)()`. Sites with `script-src` CSP policies that omit `'unsafe-eval'` block `new Function()`. Even though Tauri's native `WebviewWindow.eval()` can inject JS past CSP, the _inner_ `new Function()` call runs in the page's JS context where CSP applies.

The Orbit runtime (`window.__orbit`) IS available on CSP sites because it's injected via `initialization_script()` which runs before CSP takes effect. The problem is exclusively in the transport used to call runtime methods at tool execution time.

---

## Root Cause Chain

```
Frontend: evalScript(script)                    [browser-tool-handler.ts:216]
  → browserEval(script) or browserEvalAsync()   [browser.ts:142]
    → Rust: browser_eval_inner(script)           [mod.rs:773]
      → Wraps in: new Function(__scriptSource)() [mod.rs:816]  ← CSP BLOCKS THIS
      → Injects via: window.eval(&wrapped)       [mod.rs:848]  ← This part works fine
```

**The fix**: Replace `new Function(scriptString)()` with a direct `async function() { SCRIPT_BODY }()` expression. The script body is embedded inline in the IIFE, not passed as a string. Since it's injected by Tauri's native `eval()`, CSP cannot block it.

---

## Goals

1. All 38 MCP browser tools work on CSP-hardened sites (e.g., news.ycombinator.com)
2. Zero changes to MCP tool names, input schemas, or agent-bridge layer
3. `browser_eval` (user-facing tool) keeps `new Function()` for backward compat (`return` keyword support)
4. The existing Orbit runtime/ref model is preserved, not replaced

## Non-Goals

- Switching to Playwright or any external browser engine
- Changing the agent-bridge MCP tool definitions
- Removing `browser_eval` or its `new Function()` wrapper
- Modifying `orbit_runtime.js`

---

## Proposed Architecture

### New: `browser_eval_direct_inner()` (CSP-safe eval)

A sibling to `browser_eval_inner()` that wraps scripts in `async function() { SCRIPT }()` instead of `new Function(scriptString)()`:

```
browser_eval_inner:        (new Function(__scriptSource))()     ← BLOCKED by CSP
browser_eval_direct_inner: (async function() { SCRIPT_BODY })() ← CSP-safe
```

Both use the same result transport (orbit-eval:// URL scheme + large-result Tauri event). The difference is ONLY in how the user script is embedded:

| Aspect           | `browser_eval_inner`               | `browser_eval_direct_inner`         |
| ---------------- | ---------------------------------- | ----------------------------------- |
| Script embedding | JSON string → `new Function()`     | Inline in function body             |
| `return` keyword | Yes (FunctionBody)                 | Yes (`async function()`)            |
| CSP-safe         | No (`new Function` = dynamic code) | Yes (static inline function)        |
| User script safe | Yes (JSON-encoded, no injection)   | Internal-only (callers are trusted) |
| Use case         | User-provided `browser_eval` tool  | All internal tool scripts           |

**Security model**: `browser_eval_direct_inner` embeds the script directly (not as a string), so its callers MUST construct scripts from trusted code only. This is safe because all callers are Orbit-internal functions that build scripts from JSON-serialized parameters. The user-facing `browser_eval` tool continues to use the JSON-encoded `new Function()` path for injection safety.

### New: `browser_invoke_runtime` command

A dedicated Rust command that calls `window.__orbit[method](...args)` via `browser_eval_direct_inner`. Replaces the current pattern where the frontend builds a script string and passes it through generic `evalScript()`.

### New: `browser_get_url` / `browser_get_title` commands

`browser_get_url` uses Tauri's native `window.url()` API (already proven in `browser_info()` at mod.rs:752) — zero JavaScript needed. `browser_get_title` uses `browser_eval_direct_inner` with a trivial inline script.

---

## Phases

### Phase 1: Core Transport — `browser_eval_direct_inner` + `browser_eval_direct` command

**Rust** (`src-tauri/src/commands/browser/mod.rs`):

1. Add `browser_eval_direct_inner()` after `browser_eval_inner` (~line 869). Identical to `browser_eval_inner` except:
   - Wraps script as: `(async function() { SCRIPT })()` instead of `(new Function(__scriptSource))()`
   - Script body is embedded inline via `format!()`, not JSON-encoded as a string
   - Same evalId, same orbit-eval:// result transport, same timeout

2. Add public `#[tauri::command] browser_eval_direct(script, app, state, result_state)` that calls `browser_eval_direct_inner`. This is the Tauri-invoke equivalent for frontend use.

**Frontend** (`apps/agent/src/lib/api/browser.ts`):

3. Add `browserEvalDirect(script: string): Promise<string>` — `invoke('browser_eval_direct', { script })`

**Registration** (`src-tauri/src/lib.rs`):

4. Add `browser::browser_eval_direct` to `generate_handler![]` after line 598

**AC**: `browserEvalDirect('return document.title')` works on CSP-hardened sites. `cargo test` passes.

---

### Phase 2: Runtime Invoke Command

**Rust** (`src-tauri/src/commands/browser/mod.rs`):

1. Add `#[tauri::command] browser_invoke_runtime(method: String, args_json: String, app, state, result_state) -> Result<String>`. Builds this script:
   ```js
   const __orbit = window.__orbit;
   if (!__orbit || typeof __orbit[METHOD_JSON] !== 'function') {
     throw new Error('Orbit runtime unavailable. Page CSP may block script injection.');
   }
   return __orbit[METHOD_JSON](...JSON.parse(ARGS_JSON));
   ```
   Where METHOD_JSON and ARGS_JSON are `serde_json::to_string()` encoded. Passes to `browser_eval_direct_inner`.

**Frontend** (`apps/agent/src/lib/api/browser.ts`):

2. Add `browserInvokeRuntime(method: string, argsJson: string): Promise<string>` — `invoke('browser_invoke_runtime', { method, argsJson })`

**Frontend** (`apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`):

3. Replace `invokeOrbitRuntimeMethod()` (lines 303-318): Instead of building a script and calling `evalScript()`, call `browserInvokeRuntime(methodName, JSON.stringify(args))` and parse the result.

4. Replace `getOrbitRuntimeVersion()` (lines 259-263): Use `browserEvalDirect('return window.__orbit?.VERSION ?? null')` instead of `evalScript()`.

5. Replace `ensureOrbitRuntime()` injection path (lines 271-274): Use `browserEvalDirect(injectScript)` instead of `evalScript()`.

**Registration** (`src-tauri/src/lib.rs`):

6. Add `browser::browser_invoke_runtime` to `generate_handler![]`

**AC**: `browser_snapshot` works on Hacker News. All ref-based tools (click, fill, type, getText, getHtml, check, uncheck, select, hover, focus, scroll, scrollIntoView, isVisible, isEnabled, getAttribute, boundingBox, cookies, storage, network, consoleLogs, runtimeInfo) work on CSP sites.

---

### Phase 3: Dedicated URL/Title Commands

**Rust** (`src-tauri/src/commands/browser/mod.rs`):

1. Add `#[tauri::command] browser_get_url(app, state) -> Result<String>`:
   - Reuse the pattern from `browser_info()` at line 751-753: `window.url().map_or_else(...)`
   - Return `serde_json::json!({ "url": url }).to_string()`
   - **Zero JavaScript** — pure Tauri native API

2. Add `#[tauri::command] browser_get_title(app, state, result_state) -> Result<String>`:
   - Use `browser_eval_direct_inner("return { title: document.title ?? '' }", ...)`
   - CSP-safe

**Frontend** (`apps/agent/src/lib/api/browser.ts`):

3. Add `browserGetUrl(): Promise<string>` and `browserGetTitle(): Promise<string>` wrappers

**Frontend** (`apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`):

4. Replace `browser_get_url` case (line 578-580): Use `browserGetUrl()` instead of `evalScript()`
5. Replace `browser_get_title` case (line 583-585): Use `browserGetTitle()` instead of `evalScript()`

**Registration** (`src-tauri/src/lib.rs`):

6. Add both commands to `generate_handler![]`

**AC**: `browser_get_url` and `browser_get_title` work on Hacker News.

---

### Phase 4: Fix Wait Commands

**Rust** (`src-tauri/src/commands/browser/mod.rs`):

1. In `browser_wait_for_selector` (line 1370): Change `browser_eval_inner(...)` to `browser_eval_direct_inner(...)`
2. In `browser_wait_for_url` (line 1404): Same change

The poll scripts built by `build_wait_for_selector_script()` and `build_wait_for_url_script()` both use `return (...)();` which is valid inside `async function() {}`. No script changes needed.

**AC**: `browser_wait_for_selector` and `browser_wait_for_url` work on CSP sites. Timeout behavior unchanged.

---

### Phase 5: Fix Selector Fallbacks

**Frontend** (`apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`):

Replace all remaining `evalScript()` calls for internal scripts with `browserEvalDirect()`:

| Tool case                         | Line | Script source                                  |
| --------------------------------- | ---- | ---------------------------------------------- |
| `browser_click` selector fallback | 594  | `createClickSelectorScript()`                  |
| `browser_type` selector fallback  | 607  | `createTypeSelectorScript()`                   |
| `browser_fill` selector fallback  | 622  | `createFillSelectorScript()`                   |
| `browser_get_text` (no target)    | 634  | `createGetTextSelectorScript('body')`          |
| `browser_get_text` (selector)     | 638  | `createGetTextSelectorScript(selector)`        |
| `browser_get_html` (no target)    | 649  | `createGetHtmlSelectorScript('body', outer)`   |
| `browser_get_html` (selector)     | 653  | `createGetHtmlSelectorScript(selector, outer)` |
| `browser_count`                   | 862  | inline selector count script                   |

All `create*SelectorScript()` functions use `return` statements, which are valid in `async function() {}`. No script rewriting needed.

After this phase, `evalScript()` is only used by the `browser_eval` tool case (line 725) — the user-facing eval tool that intentionally needs `new Function()` for arbitrary user scripts with `return` statements.

**AC**: All selector-based fallbacks work on CSP sites. `browser_eval` (user tool) unchanged.

---

### Phase 6: Test Fixture + Validation

**Local CSP test fixture**: Create `src-tauri/src/commands/browser/test-fixtures/csp-test.html`:

- Serves as a local page with strict CSP: `<meta http-equiv="Content-Security-Policy" content="script-src 'self'">`
- Contains interactive elements: form inputs, buttons, links, checkboxes, selects
- Can be served via `file://` or a local HTTP server

**Unit test updates** (`apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts`):

- Add mocks for `browserEvalDirect`, `browserInvokeRuntime`, `browserGetUrl`, `browserGetTitle`
- Update existing tests that assert on `browserEval` to assert on the correct new function
- Add test: `invokeOrbitRuntimeMethod` calls `browserInvokeRuntime` with correct method and args
- Add test: `browser_get_url` calls `browserGetUrl` (no eval)
- Add test: `browser_get_title` calls `browserGetTitle` (no eval)

**Rust tests** (`src-tauri/src/commands/browser/mod.rs`):

- Add unit test verifying `browser_eval_direct_inner` wrapped script does NOT contain `new Function`

**Manual validation**:

1. `bunx tauri dev`
2. Open Hacker News via browser tool
3. Verify `browser_snapshot` returns accessibility tree with refs
4. Verify `browser_get_url` returns `https://news.ycombinator.com/`
5. Verify `browser_get_title` returns page title
6. Verify `browser_click` with ref works (click a story link)
7. Verify `browser_wait_for_selector` works

**Commands**:

```bash
bun run test                          # Frontend tests
cargo test                            # Rust tests
bun run check                         # Full typecheck + lint + test
./scripts/lint-all.sh --no-test       # Lint all
```

---

## File-by-File Change List

### Modified files

| File                                                                     | Changes                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/browser/mod.rs`                                  | Add `browser_eval_direct_inner()`, `browser_eval_direct`, `browser_invoke_runtime`, `browser_get_url`, `browser_get_title` commands. Modify `browser_wait_for_selector` and `browser_wait_for_url` to use `browser_eval_direct_inner`. |
| `src-tauri/src/lib.rs`                                                   | Register 4 new commands: `browser_eval_direct`, `browser_invoke_runtime`, `browser_get_url`, `browser_get_title`                                                                                                                       |
| `apps/agent/src/lib/api/browser.ts`                                      | Add `browserEvalDirect()`, `browserInvokeRuntime()`, `browserGetUrl()`, `browserGetTitle()` invoke wrappers                                                                                                                            |
| `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`            | Replace `evalScript()` calls with CSP-safe alternatives across all tool cases (except user-facing `browser_eval`). Replace `invokeOrbitRuntimeMethod()` internals with `browserInvokeRuntime()`.                                       |
| `apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts` | Update mocks, update assertions, add CSP-safe path tests                                                                                                                                                                               |

### New files

| File                                                         | Purpose                                                |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| `src-tauri/src/commands/browser/test-fixtures/csp-test.html` | Local CSP test fixture with strict `script-src 'self'` |

### Unchanged files

| File                                              | Why unchanged                                           |
| ------------------------------------------------- | ------------------------------------------------------- |
| `src-tauri/src/commands/browser/orbit_runtime.js` | Already CSP-safe (injected via `initialization_script`) |
| `agent-bridge/src/browser/browser-mcp-server.ts`  | MCP tool definitions unchanged                          |
| `agent-bridge/src/browser/browser-tool-bridge.ts` | Bridge protocol unchanged                               |
| `agent-bridge/src/browser/types.ts`               | Type definitions unchanged                              |

---

## Existing Code to Reuse

| Pattern                                | Location                              | Reuse                                          |
| -------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| `window.url()` native API              | mod.rs:751-753 (`browser_info`)       | Reuse for `browser_get_url` — zero JS eval     |
| Result transport (orbit-eval://)       | mod.rs:820-840 (`browser_eval_inner`) | Copy to `browser_eval_direct_inner`            |
| `BrowserResultState` + register/cancel | mod.rs:145-218                        | Shared by both eval paths                      |
| `serializeForInjection()`              | browser-tool-handler.ts:132-133       | Continue using for script parameter safety     |
| `parseEvalResult()`                    | browser-tool-handler.ts:136-143       | Shared by all eval paths                       |
| `isCspRuntimeErrorMessage()`           | browser-tool-handler.ts:88-90         | Retained for `browser_eval` fallback detection |

---

## Risk Mitigation

| Risk                                                       | Severity | Mitigation                                                                      |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| Script injection in `browser_eval_direct_inner`            | High     | Only called by trusted internal code; user scripts stay on `browser_eval_inner` |
| Breaking non-CSP sites                                     | Low      | Same JS execution semantics; only wrapper changes                               |
| `return` keyword in `async function()` vs `new Function()` | Low      | Both treat body as FunctionBody; `return` valid in both                         |
| Tauri `window.url()` returning stale URL                   | Low      | Already used by `browser_info()` in production                                  |
| Result transport race                                      | None     | Same evalId + oneshot channel mechanism                                         |

---

## Spec Drift Corrections

The original spec (agent-browser-integration-spec.md) should be updated to note:

1. `browser_get_url` and `browser_get_title` are NOT eval-dependent — they have dedicated native commands
2. CSP-hardened sites are supported, not a known limitation
3. The internal eval path uses `browser_eval_direct_inner` (no `new Function`); only the user-facing `browser_eval` tool uses `new Function`

---

## Verification Checklist

- [ ] `cargo check` — Rust compiles
- [ ] `cargo test` — Rust tests pass
- [ ] `bun run test` — Frontend tests pass
- [ ] `bun run check` — Full quality check
- [ ] Manual: `browser_snapshot` on Hacker News returns valid tree
- [ ] Manual: `browser_get_url` on Hacker News returns correct URL
- [ ] Manual: `browser_get_title` on Hacker News returns correct title
- [ ] Manual: `browser_click` with ref on Hacker News works
- [ ] Manual: `browser_wait_for_selector` on Hacker News works
- [ ] Manual: `browser_eval` (user tool) still works on non-CSP sites
- [ ] Manual: All tools still work on example.com (regression check)
