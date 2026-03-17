# Plan: CSP-Safe Browser Tool Transport

> **Status**: Approved
> **Date**: 2026-03-06
> **Audit**: `reviews/audit-plan.md` (2026-03-06 — APPROVE)
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

### New: `browser_invoke_runtime` command (typed)

A dedicated Rust command that calls `window.__orbit[method](...args)` via `browser_eval_direct_inner`. **Method names are validated against a Rust `OrbitRuntimeMethod` enum** — unknown methods are rejected before any JavaScript is constructed. Replaces the current pattern where the frontend builds script strings and passes them through generic `evalScript()`.

### New: `browser_runtime_version` / `browser_ensure_runtime` commands

Move runtime version checking and re-injection from the frontend into Rust. The runtime source is already available in Rust via `include_str!("orbit_runtime.js")` (part of `BROWSER_BOOTSTRAP_SCRIPT`). This gives runtime bootstrap a single owner and removes the `orbit_runtime.js?raw` import from the frontend.

### New: `browser_get_url` / `browser_get_title` commands

`browser_get_url` uses Tauri's native `window.url()` API (already proven in `browser_info()` at mod.rs:752) — zero JavaScript needed. URL parity with `window.location.href` must be verified for same-document navigations before shipping. `browser_get_title` uses `browser_eval_direct_inner` with a trivial inline script.

### Removed: Selector fallback scripts → unified through runtime

The current codebase has a split path: ref targets go through `invokeOrbitRuntimeMethod()` while selector-only targets go through separate `evalScript(create*SelectorScript())` functions. This split is unnecessary — the runtime's `_resolveTarget()` (orbit_runtime.js:989) already handles both refs and CSS selectors via `getTargetParts()`. The selector fallback scripts (`createClickSelectorScript`, `createTypeSelectorScript`, etc.) duplicate runtime behavior with semantic drift (e.g., `getText` using `.textContent?.trim()` vs the runtime's `collapseWhitespace()`).

**Fix**: Remove the selector branching in the frontend. Pass ALL targets through `browserInvokeRuntime` — the runtime resolves both. For `count` (raw selector, not a target object), add `Count` to `OrbitRuntimeMethod` (the runtime already has `count(selector)` at line 1382). No new Rust command needed.

---

## Phases

### Phase 1: Core Transport — private `browser_eval_direct_inner` + testable wrapper builder

**Rust** (`src-tauri/src/commands/browser/mod.rs`):

1. Add a **pure helper** `build_browser_eval_direct_wrapper(eval_id_json, script_body, small_limit, large_limit) -> String` that constructs the wrapped JavaScript string. This function is the testable seam — it contains no async, no state, and no side effects. The wrapper embeds the script body inline in `(async function() { SCRIPT_BODY })()` instead of using `new Function()`.

   **Must use named `format!()` arguments** (e.g., `{script_body}`) — not positional `{}` — to ensure Rust's formatter never parses the script contents as format specifiers. This matters because `browser_ensure_runtime` (Phase 2) passes ~10KB of `orbit_runtime.js` through this path.

2. Add **private** `browser_eval_direct_inner()` after `browser_eval_inner` (~line 869). Calls `build_browser_eval_direct_wrapper()` to construct the script, then uses the same evalId + orbit-eval:// result transport + timeout as `browser_eval_inner`. Must include `state.exists` guard (same as `browser_eval_inner` at line 779).

**No public `browser_eval_direct` command.** The direct-eval helper stays private to Rust — only narrow purpose-built commands (Phases 2-5) call it. This keeps the CSP-bypassing capability out of the frontend's generic invoke surface.

**No frontend changes.** No registration in `lib.rs`.

**AC**: `build_browser_eval_direct_wrapper()` unit tests pass — wrapper does NOT contain `new Function`, round-trips `orbit_runtime.js` source without panic. `cargo test` passes.

---

### Phase 2: Typed Runtime Invoke + Runtime Management

**Rust** (`src-tauri/src/commands/browser/mod.rs`):

1. Add `OrbitRuntimeMethod` enum with an exhaustive allowlist of supported runtime methods. Reject unknown method names before building JavaScript. The enum maps each variant to its JS method name via `as_js_name() -> &'static str`:

   ```rust
   enum OrbitRuntimeMethod {
       Snapshot, Click, Type, Fill, GetText, GetHtml, Count,
       Check, Uncheck, Select, Hover, Focus,
       Scroll, ScrollIntoView, IsVisible, IsEnabled,
       GetAttribute, BoundingBox, GetCookies, ClearCookies,
       StorageGet, StorageSet, StorageClear,
       GetNetworkRequests, GetConsoleLogs, RuntimeInfo,
   }
   ```

   Add `from_input(value: &str) -> Result<Self>` that returns an error for unknown methods.

2. Add `#[tauri::command] browser_invoke_runtime(method: String, args_json: String, app, state, result_state) -> Result<String>`. Validates `method` via `OrbitRuntimeMethod::from_input()`, then builds this script using the validated `as_js_name()` output:

   ```js
   const __orbit = window.__orbit;
   if (!__orbit || typeof __orbit[METHOD_NAME] !== 'function') {
     throw new Error('Orbit runtime unavailable.');
   }
   return __orbit[METHOD_NAME](...JSON.parse(ARGS_JSON));
   ```

   Where `METHOD_NAME` is a `&'static str` from the enum (not user input) and `ARGS_JSON` is `serde_json::to_string(&args_json)` (double-encoded: frontend JSON-stringifies args → Rust JSON-encodes that string into a safe JS literal → script JSON-parses it back). Add a code comment documenting this double-encoding pattern. Passes to `browser_eval_direct_inner`.

3. Add `#[tauri::command] browser_runtime_version(app, state, result_state) -> Result<Option<String>>`. Uses `browser_eval_direct_inner("return window.__orbit?.VERSION ?? null", ...)`. Replaces the frontend's `getOrbitRuntimeVersion()`.

4. Add `#[tauri::command] browser_ensure_runtime(app, state, result_state) -> Result<()>`. Checks version via `browser_runtime_version` logic, re-injects the runtime from the existing `include_str!("orbit_runtime.js")` (already available as part of `BROWSER_BOOTSTRAP_SCRIPT`) if the version doesn't match. This moves runtime bootstrap ownership fully into Rust — the frontend no longer ships `orbit_runtime.js?raw`.

**Frontend** (`apps/agent/src/lib/api/browser.ts`):

5. Add typed wrappers:

   ```ts
   type OrbitRuntimeMethod =
     | 'snapshot' | 'click' | 'type' | 'fill'
     | 'getText' | 'getHtml' | 'count'
     | 'check' | 'uncheck' | 'select' | 'hover' | 'focus'
     | 'scroll' | 'scrollIntoView' | 'isVisible' | 'isEnabled'
     | 'getAttribute' | 'boundingBox'
     | 'getCookies' | 'clearCookies'
     | 'storageGet' | 'storageSet' | 'storageClear'
     | 'getNetworkRequests' | 'getConsoleLogs' | 'runtimeInfo';

   browserInvokeRuntime(method: OrbitRuntimeMethod, args: unknown[]): Promise<string>
   browserRuntimeVersion(): Promise<string | null>
   browserEnsureRuntime(): Promise<void>
   ```

**Frontend** (`apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`):

6. Replace `invokeOrbitRuntimeMethod()` (lines 303-318): Call `browserInvokeRuntime(methodName, args)` and parse the result.

7. Replace `getOrbitRuntimeVersion()` (lines 259-263): Call `browserRuntimeVersion()`.

8. Replace `ensureOrbitRuntime()` (lines 265-287): Call `browserEnsureRuntime()`. Remove the `orbit_runtime.js?raw` import (line 3) — the frontend no longer needs the raw runtime source.

**Side effect**: `warmOrbitRuntimeIfPossible()` (called in `browser_open`, `browser_navigate`, `browser_reload`) now **succeeds on CSP sites** — previously it failed because the version check itself used `new Function()`. On CSP sites the runtime is already present from `initialization_script()` (runs on every page load via `WKUserContentController.addUserScript()`), so this is verification-only with no re-injection.

**Registration** (`src-tauri/src/lib.rs`):

9. Add `browser::browser_invoke_runtime`, `browser::browser_runtime_version`, `browser::browser_ensure_runtime` to `generate_handler![]`

**AC**: `browser_snapshot` works on Hacker News. All ref-based tools (click, fill, type, getText, getHtml, count, check, uncheck, select, hover, focus, scroll, scrollIntoView, isVisible, isEnabled, getAttribute, boundingBox, cookies, storage, network, consoleLogs, runtimeInfo) work on CSP sites. Unknown method names are rejected with a clear error.

---

### Phase 3: Dedicated URL/Title Commands

**Rust** (`src-tauri/src/commands/browser/mod.rs`):

1. Add `#[tauri::command] browser_get_url(app, state) -> Result<String>`:
   - **Must include `state.exists` guard** (same as `browser_info()` at line 742) — without it, accessing a nonexistent window panics
   - Reuse the pattern from `browser_info()` at line 751-753: `window.url().map_or_else(...)`
   - Return `serde_json::json!({ "url": url }).to_string()`
   - If `window.url()` fails, return `Err` (do NOT silently return `"unknown"` — the frontend handler can fall back to stored state if needed)
   - **Zero JavaScript** — pure Tauri native API

2. Add `#[tauri::command] browser_get_title(app, state, result_state) -> Result<String>`:
   - Use `browser_eval_direct_inner("return { title: document.title ?? '' }", ...)`
   - CSP-safe (existence guard provided by `browser_eval_direct_inner` internally)

**URL parity requirement**: Before shipping, **verify that `window.url()` stays in sync** after same-document navigations. The CSP test fixture (Phase 6) must include `pushState`, `replaceState`, and hash-only navigation triggers. Compare `browser_get_url` output against `window.location.href` after each.

**Binary decision — no hybrid detector.** The frontend's `navigation.url` (BrowserStore) only updates from `browser:navigated` native events, which don't fire for same-document navigations. This means there is no reliable "last-known URL" to compare against at runtime. Instead:

- **If parity passes** for all three cases → ship the native `window.url()` path (zero JS, maximum reliability)
- **If parity fails** for any case → replace the native path entirely with `browser_eval_direct_inner('return { url: location.href }', ...)` (CSP-safe JS). Do NOT attempt a hybrid that tries to detect staleness — there is no observable signal for same-document drift.

**Frontend** (`apps/agent/src/lib/api/browser.ts`):

3. Add `browserGetUrl(): Promise<string>` and `browserGetTitle(): Promise<string>` wrappers

**Frontend** (`apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`):

4. Replace `browser_get_url` case (line 578-580): Use `browserGetUrl()` instead of `evalScript()`
5. Replace `browser_get_title` case (line 583-585): Use `browserGetTitle()` instead of `evalScript()`

**Registration** (`src-tauri/src/lib.rs`):

6. Add both commands to `generate_handler![]`

**AC**: `browser_get_url` and `browser_get_title` work on Hacker News. URL parity verified for `pushState`, `replaceState`, and hash-only navigation.

---

### Phase 4: Fix Wait Commands

**Rust** (`src-tauri/src/commands/browser/mod.rs`):

1. In `browser_wait_for_selector` (line 1370): Change `browser_eval_inner(...)` to `browser_eval_direct_inner(...)`
2. In `browser_wait_for_url` (line 1404): Same change

The poll scripts built by `build_wait_for_selector_script()` and `build_wait_for_url_script()` both use `return (...)();` which is valid inside `async function() {}`. No script changes needed.

**AC**: `browser_wait_for_selector` and `browser_wait_for_url` work on CSP sites. Timeout behavior unchanged.

---

### Phase 5: Unify Selector Fallbacks Through Runtime

The runtime's `_resolveTarget()` (orbit_runtime.js:989) already handles CSS selectors via `getTargetParts()`. The current selector branching in `browser-tool-handler.ts` is redundant — it duplicates runtime behavior with semantic drift (e.g., `getText` using `.textContent?.trim()` vs the runtime's `collapseWhitespace()`). No new Rust command is needed.

**Frontend** (`apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`):

1. Extract a **default DOM target helper** to prevent future no-target regressions:

   ```ts
   /** Default to document body when no ref or selector is provided */
   function getTargetOrBody(toolInput: Record<string, unknown>): {
     ref?: string;
     selector: string;
   } {
     return getOptionalTarget(toolInput) ?? { selector: 'body' };
   }
   ```

   Use in `browser_get_text` and `browser_get_html` instead of inline `?? { selector: 'body' }` fallbacks.

2. Remove the selector-vs-ref branching. Pass ALL targets (ref or selector) through `browserInvokeRuntime`:

   | Tool case                         | Line | Before (selector path)                                   | After                                                              |
   | --------------------------------- | ---- | -------------------------------------------------------- | ------------------------------------------------------------------ |
   | `browser_click` selector fallback | 590  | `evalScript(createClickSelectorScript(...))`             | Remove branch — `browserInvokeRuntime('click', [target])`          |
   | `browser_type` selector fallback  | 603  | `evalScript(createTypeSelectorScript(...))`              | Remove branch — `browserInvokeRuntime('type', [target, text])`     |
   | `browser_fill` selector fallback  | 618  | `evalScript(createFillSelectorScript(...))`              | Remove branch — `browserInvokeRuntime('fill', [target, value])`    |
   | `browser_get_text` (no target)    | 630  | `evalScript(createGetTextSelectorScript('body'))`        | `browserInvokeRuntime('getText', [{ selector: 'body' }])`          |
   | `browser_get_text` (selector)     | 634  | `evalScript(createGetTextSelectorScript(...))`           | Remove branch — `browserInvokeRuntime('getText', [target])`        |
   | `browser_get_html` (no target)    | 645  | `evalScript(createGetHtmlSelectorScript('body', outer))` | `browserInvokeRuntime('getHtml', [{ selector: 'body' }, outer])`   |
   | `browser_get_html` (selector)     | 649  | `evalScript(createGetHtmlSelectorScript(...))`           | Remove branch — `browserInvokeRuntime('getHtml', [target, outer])` |
   | `browser_count`                   | 860  | `evalScript(... querySelectorAll ...)`                   | `browserInvokeRuntime('count', [selector])`                        |

3. Remove `createClickSelectorScript()`, `createTypeSelectorScript()`, `createFillSelectorScript()`, `createGetTextSelectorScript()`, `createGetHtmlSelectorScript()` — the runtime handles all these operations.

**Dead code cleanup**:

4. After this phase, `evalScript()` is only used by the `browser_eval` tool case (line 725). Simplify `evalScript()` to just `return browserEval(script)`. Remove `detectBrowserTauriApi()`, `browserHasTauriApi`, `detectionPromise`, `serializeForInjection()`, and the `browserEvalAsync` import. These are all dead code — `browserEvalAsync` is an alias for `browserEval` (mod.rs:1273), and `serializeForInjection` was only used by the now-deleted script builders and `invokeOrbitRuntimeMethod`.

**No Rust changes.** No new command registration.

**AC**: All selector-based tool cases route through `browserInvokeRuntime` → runtime's `_resolveTarget`. `getText` uses `collapseWhitespace()` (runtime behavior) for both ref and selector targets. `browser_eval` (user tool) unchanged. `evalScript()` simplified. `browser_count` uses runtime's `count()` method via `browserInvokeRuntime('count', [selector])`.

---

### Phase 6: Test Fixture + Validation

**Local CSP test fixture**: Create `src-tauri/src/commands/browser/test-fixtures/csp-test.html`:

- Serves as a local page with strict CSP: `<meta http-equiv="Content-Security-Policy" content="script-src 'self'">`
- Contains interactive elements: form inputs, buttons, links, checkboxes, selects
- **URL parity navigation triggers**: buttons for `history.pushState`, `history.replaceState`, and `location.hash = ...` to verify `browser_get_url` parity (see Phase 3)
- **Prefer serving via local HTTP server** (e.g., `python3 -m http.server`) rather than `file://` — some browsers restrict `file://` origins differently, making CSP behavior less realistic

**Rust tests** (`src-tauri/src/commands/browser/mod.rs`):

- `build_browser_eval_direct_wrapper()` tests (pure helper — no async needed):
  - Wrapper output does NOT contain `new Function`
  - Round-trips `orbit_runtime.js` source via `include_str!()` without panic
  - Adversarial script body with `})();` does not break wrapper structure (valid JS output)
- `OrbitRuntimeMethod` tests:
  - `from_input("snapshot")` → Ok, `from_input("count")` → Ok, `from_input("unknown")` → Err
  - Script built with adversarial method name (e.g., `"'); process.exit(1); //"`) is rejected by `from_input` before reaching script construction
  - All 26 variants round-trip through `as_js_name()` → `from_input()` correctly
- `browser_get_url` tests:
  - Returns error when `state.exists` is false
- **Allowlist parity test** (`src-tauri/src/commands/browser/mod.rs` or dedicated test file):
  - Collect all `OrbitRuntimeMethod` variants via `strum::IntoEnumIterator` (or manual exhaustive match) and compare against the public methods on `window.__orbit` extracted from `orbit_runtime.js` source (e.g., regex or static list). Assert the Rust enum and runtime expose the same method set. This catches drift when a method is added to one side but not the other.

**Frontend test updates** (`apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts`):

- Add mocks for `browserInvokeRuntime`, `browserGetUrl`, `browserGetTitle`, `browserEnsureRuntime`, `browserRuntimeVersion`
- Update existing tests that assert on `browserEval` to assert on the correct new function
- Add test: `invokeOrbitRuntimeMethod` calls `browserInvokeRuntime` with correct typed method and args
- Add test: `browser_get_url` calls `browserGetUrl` (no eval)
- Add test: `browser_get_title` calls `browserGetTitle` (no eval)
- Add test: `browser_click` with selector target calls `browserInvokeRuntime('click', [target])` — NOT a separate selector path
- Add test: `browser_get_text` with no target calls `browserInvokeRuntime('getText', [{ selector: 'body' }])`
- Add test: `browser_get_text` with selector target calls `browserInvokeRuntime('getText', [target])` — uses runtime's `collapseWhitespace()`
- Add test: `browser_get_html` with no target calls `browserInvokeRuntime('getHtml', [{ selector: 'body' }, false])` — NOT `undefined`
- Add test: `browser_get_html` with selector target calls `browserInvokeRuntime('getHtml', [target, outer])`
- Add test: `browser_count` calls `browserInvokeRuntime('count', [selector])`
- Add test: `ensureOrbitRuntime` calls `browserEnsureRuntime` (no `orbit_runtime.js?raw` import needed)
- Add test: `browser_get_text` with no target uses `getTargetOrBody()` helper (returns `{ selector: 'body' }`)
- Add test: `browser_get_html` with no target uses `getTargetOrBody()` helper (returns `{ selector: 'body' }`)

**Manual validation**:

1. `bunx tauri dev`
2. Open Hacker News via browser tool
3. Verify `browser_snapshot` returns accessibility tree with refs
4. Verify `browser_get_url` returns `https://news.ycombinator.com/`
5. Verify `browser_get_title` returns page title
6. Verify `browser_click` with ref works (click a story link)
7. Verify `browser_wait_for_selector` works
8. URL parity: open CSP test fixture, click pushState/replaceState/hash buttons, verify `browser_get_url` matches `window.location.href` after each
9. Verify `browser_invoke_runtime` rejects unknown method name with clear error

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

| File                                                                     | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/browser/mod.rs`                                  | Add `build_browser_eval_direct_wrapper()` pure helper, private `browser_eval_direct_inner()`, `OrbitRuntimeMethod` enum (26 variants incl. `Count`). Add 5 public commands: `browser_invoke_runtime`, `browser_runtime_version`, `browser_ensure_runtime`, `browser_get_url`, `browser_get_title`. Modify `browser_wait_for_selector` and `browser_wait_for_url` to use `browser_eval_direct_inner`.                                                                                                                                    |
| `src-tauri/src/lib.rs`                                                   | Register 5 new commands: `browser_invoke_runtime`, `browser_runtime_version`, `browser_ensure_runtime`, `browser_get_url`, `browser_get_title`                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/agent/src/lib/api/browser.ts`                                      | Add typed wrappers: `browserInvokeRuntime()`, `browserRuntimeVersion()`, `browserEnsureRuntime()`, `browserGetUrl()`, `browserGetTitle()`. Add `OrbitRuntimeMethod` union type (26 members incl. `'count'`).                                                                                                                                                                                                                                                                                                                            |
| `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`            | Remove selector-vs-ref branching — all targets route through `browserInvokeRuntime()`. Replace `invokeOrbitRuntimeMethod()` with `browserInvokeRuntime()`. Replace `ensureOrbitRuntime()` with `browserEnsureRuntime()`. Replace `getOrbitRuntimeVersion()` with `browserRuntimeVersion()`. Replace `browser_count` with `browserInvokeRuntime('count', ...)`. Remove `orbit_runtime.js?raw` import, `detectBrowserTauriApi()`, `browserHasTauriApi`, `detectionPromise`, `create*SelectorScript()` functions. Simplify `evalScript()`. |
| `apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts` | Update mocks for all new wrappers, update assertions, add CSP-safe path tests for runtime invoke, URL/title, unified selector path, and runtime management                                                                                                                                                                                                                                                                                                                                                                              |

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

| Pattern                                | Location                              | Reuse                                                                                                                  |
| -------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `window.url()` native API              | mod.rs:751-753 (`browser_info`)       | Reuse for `browser_get_url` — zero JS eval                                                                             |
| Result transport (orbit-eval://)       | mod.rs:820-840 (`browser_eval_inner`) | Copy to `browser_eval_direct_inner`                                                                                    |
| `BrowserResultState` + register/cancel | mod.rs:145-218                        | Shared by both eval paths                                                                                              |
| `serializeForInjection()`              | browser-tool-handler.ts:132-133       | **Removed** — all callers deleted (script builders + `invokeOrbitRuntimeMethod`). Double-encoding now happens in Rust. |
| `parseEvalResult()`                    | browser-tool-handler.ts:136-143       | Shared by all eval paths                                                                                               |
| `isCspRuntimeErrorMessage()`           | browser-tool-handler.ts:88-90         | Retained for `browser_eval` fallback detection                                                                         |

---

## Risk Mitigation

| Risk                                                       | Severity | Mitigation                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Script injection in `browser_eval_direct_inner`            | High     | Private to Rust — no public command. Only called by trusted internal code; user scripts stay on `browser_eval_inner`                                                                                                                                                                                                                                    |
| Unknown method names reaching script construction          | High     | `OrbitRuntimeMethod` enum rejects unknown values before any JavaScript is built                                                                                                                                                                                                                                                                         |
| `window.url()` parity with `window.location.href`          | Medium   | Phase 3 requires explicit parity verification in CSP test fixture. **Binary decision**: if parity passes → ship native path; if parity fails for any same-document navigation → replace entirely with `browser_eval_direct_inner('return { url: location.href }')`. No hybrid detector — frontend has no observable signal for same-document URL drift. |
| Orphaned eval IDs on browser close/navigation              | Medium   | `browser_eval_direct_inner` uses same timeout + `BrowserResultState` cancel mechanism as `browser_eval_inner` — validate in Phase 6 manual testing                                                                                                                                                                                                      |
| Selector behavior drift (resolved)                         | N/A      | Eliminated — selector targets now route through runtime's `_resolveTarget()`, same code path as ref targets                                                                                                                                                                                                                                             |
| Breaking non-CSP sites                                     | Low      | Same JS execution semantics; only wrapper changes                                                                                                                                                                                                                                                                                                       |
| `return` keyword in `async function()` vs `new Function()` | Low      | Both treat body as FunctionBody; `return` valid in both                                                                                                                                                                                                                                                                                                 |
| `format!()` misinterpreting JS `{` as format specifier     | Low      | Named arguments (`{script_body}`) — positional `{}` is prohibited. `build_browser_eval_direct_wrapper` tested with runtime source                                                                                                                                                                                                                       |
| Result transport race                                      | None     | Same evalId + oneshot channel mechanism                                                                                                                                                                                                                                                                                                                 |

---

## Spec Drift Corrections

The original spec (agent-browser-integration-spec.md) should be updated to note:

1. `browser_get_url` and `browser_get_title` are NOT eval-dependent — they have dedicated native commands
2. CSP-hardened sites are supported, not a known limitation
3. The internal eval path uses `browser_eval_direct_inner` (no `new Function`); only the user-facing `browser_eval` tool uses `new Function`
4. The user-facing `browser_eval` tool remains CSP-unsafe — it will fail on CSP-hardened sites with a clear error. The agent should use runtime-backed tools (`browser_snapshot`, `browser_click`, etc.) instead of `browser_eval` on such sites

---

## Verification Checklist

- [ ] `cargo check` — Rust compiles
- [ ] `cargo test` — Rust tests pass (includes `build_browser_eval_direct_wrapper` and `OrbitRuntimeMethod` unit tests)
- [ ] `bun run test` — Frontend tests pass
- [ ] `bun run check` — Full quality check
- [ ] Manual: `browser_snapshot` on Hacker News returns valid tree
- [ ] Manual: `browser_get_url` on Hacker News returns correct URL
- [ ] Manual: `browser_get_title` on Hacker News returns correct title
- [ ] Manual: `browser_click` with ref on Hacker News works
- [ ] Manual: `browser_click` with CSS selector (no ref) on Hacker News works — verifies unified runtime path
- [ ] Manual: `browser_get_text` with selector on Hacker News uses `collapseWhitespace()` (not raw `.trim()`)
- [ ] Manual: `browser_get_html` with no target returns `<body>` HTML (not runtime error from `undefined` target)
- [ ] Manual: `browser_count` on Hacker News works via `browserInvokeRuntime('count', [selector])`
- [ ] Manual: `browser_wait_for_selector` on Hacker News works
- [ ] Manual: `browser_invoke_runtime` rejects unknown method name with clear error
- [ ] Manual: `browser_ensure_runtime` re-injects runtime successfully after manual `delete window.__orbit`
- [ ] Manual: `browser_eval` (user tool) still works on non-CSP sites
- [ ] Manual: `browser_eval` (user tool) fails gracefully with CSP error on Hacker News
- [ ] Manual: All tools still work on example.com (regression check)
- [ ] Manual: URL parity — `browser_get_url` matches `window.location.href` after pushState, replaceState, and hash navigation in CSP test fixture AND at least one real SPA (not only local fixture)
- [ ] Manual: Browser close during `browser_eval_direct_inner` — verify eval ID is cancelled (not orphaned)
- [ ] Manual: If URL parity fails and JS fallback is used, verify `browser_get_url` Rust signature includes `result_state` parameter
- [ ] Code: `browser_get_url` includes `state.exists` guard
- [ ] Code: `browser_eval_direct_inner` uses named `format!()` arguments
- [ ] Code: `build_browser_eval_direct_wrapper` has `// SAFETY:` comment explaining internal-only usage
- [ ] Code: `orbit_runtime.js?raw` import removed from browser-tool-handler.ts
- [ ] Code: `detectBrowserTauriApi()`, `create*SelectorScript()`, `serializeForInjection()`, selector branching, and related dead code removed from browser-tool-handler.ts
- [ ] Code: No `SelectorAction` enum or `browser_selector_action` command exists — all selector targets go through `browserInvokeRuntime`
- [ ] Code: `getTargetOrBody()` helper used by `browser_get_text` and `browser_get_html` no-target paths
- [ ] Test: Allowlist parity test passes — `OrbitRuntimeMethod` variants match `window.__orbit` public methods
