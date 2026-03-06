# Implementation Plan: 12 New Browser Tool Features

## Context

The existing embedded browser has 35 MCP tools (snapshot/ref system, click/fill/type, cookies/storage, etc.). A gap analysis against a Playwright-based reference (`reference/agent-browser/`) identified 12 missing features that are feasible on WKWebView and critical for production-grade agent browsing. This plan adds those 12 features across 4 implementation phases.

**Problem:** Agents hit dead ends when encountering dialogs, file inputs, iframes, drag-and-drop UIs, or multi-tab flows. Missing clipboard, keyboard compound actions, and snapshot diffing limit agent intelligence.

**Outcome:** 47 total browser tools (from 35), covering all common web interaction patterns.

---

## Architecture (Unchanged)

```
Agent SDK -> MCP tool -> agent-bridge/browser-mcp-server.ts (createBridgeTool)
  -> BrowserToolBridge (stateful queue / read-only concurrent)
  -> 'browser:tool_request' event -> frontend
  -> browser-tool-handler.ts (executeBrowserTool switch)
  -> invokeOrbitRuntimeMethod() or evalScript() or Tauri command
  -> orbit_runtime.js in WKWebView -> result flows back
```

All 12 features follow this exact pipeline. No architecture changes.

---

## Phase 1: Pure JS Tools (No Rust Changes)

**Scope:** 4 features, ~10 new tools. Implemented entirely in orbit_runtime.js + MCP/bridge/handler.

### Feature 7: Semantic Locators

**Tools:** `browser_get_by_role`, `browser_get_by_text`, `browser_get_by_label`, `browser_get_by_placeholder`

**Files to modify:**

- `agent-bridge/src/browser/browser-mcp-server.ts` — Add 4 tools to `BROWSER_TOOL_NAMES`, register via `createBridgeTool()`
- `agent-bridge/src/browser/types.ts` — Add 4 command interfaces to `BrowserCommand` union
- `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts` — Add 4 switch cases calling `invokeOrbitRuntimeMethod()`
- `src-tauri/src/commands/browser/orbit_runtime.js` — Add 4 methods: `getByRole()`, `getByText()`, `getByLabel()`, `getByPlaceholder()`

**Classification:** Read-only (not in `STATEFUL_BROWSER_TOOLS`). Default timeout.

**Schemas:**

- `browser_get_by_role`: `{ role: z.string(), name: z.string().optional(), exact: z.boolean().optional() }`
- `browser_get_by_text`: `{ text: z.string(), exact: z.boolean().optional() }`
- `browser_get_by_label`: `{ label: z.string(), exact: z.boolean().optional() }`
- `browser_get_by_placeholder`: `{ placeholder: z.string(), exact: z.boolean().optional() }`

**Runtime implementation:**

- `getByRole(role, options)`: Query `[role="<role>"]` + TAG_ROLE_MAP implicit roles. Filter by accessible name if `options.name`. Return `{ elements: [{ ref, role, name, selector }], count: N }`.
- `getByText(text, options)`: TreeWalker over text nodes, match `textContent.trim()`. Exact vs includes.
- `getByLabel(label, options)`: Find `<label>` elements by text -> resolve `for` attribute. Also check `aria-label`, `aria-labelledby`.
- `getByPlaceholder(placeholder, options)`: Query `input[placeholder], textarea[placeholder]`, filter by match.

---

### Feature 11: Keyboard Compound Actions

**Tool:** `browser_keyboard`

**Files to modify:** Same 4 files as above.

**Schema:**

```
{
  actions: z.array(z.object({
    type: z.enum(['press', 'type', 'insertText', 'keyDown', 'keyUp']),
    key: z.string().optional(),
    text: z.string().optional(),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).optional(),
  })).min(1),
  ...BrowserTargetShape  // optional target
}
```

**Classification:** Stateful. `ACTION_TIMEOUT_MS`.

**Runtime `keyboard(actions, target)`:** Resolve optional target, focus it. Iterate actions:

- `press`: dispatch keydown + keypress + keyup with modifiers
- `type`: character-by-character (reuse existing type logic)
- `insertText`: `document.execCommand('insertText', false, text)`
- `keyDown`/`keyUp`: single event dispatch with modifiers

---

### Feature 12: Script/Style Injection

**Tools:** `browser_add_script`, `browser_add_style`

**Schemas:**

- `browser_add_script`: `{ content: z.string().optional(), url: z.string().optional() }` (at least one required)
- `browser_add_style`: `{ content: z.string().optional(), url: z.string().optional() }`

**Classification:** Stateful. `ACTION_TIMEOUT_MS` for inline, `DEFAULT_TIMEOUT_MS` for URL.

**Runtime:** `addScript(options)` creates `<script>` tag (inline or src). `addStyle(options)` creates `<style>` or `<link rel="stylesheet">`. Append to `<head>`.

---

### Feature 10: Clipboard Operations

**Tools:** `browser_clipboard_copy`, `browser_clipboard_paste`, `browser_clipboard_read`

**Schemas:**

- `browser_clipboard_copy`: `{ text: z.string() }`
- `browser_clipboard_paste`: `{ ...BrowserTargetShape }`
- `browser_clipboard_read`: `{}`

**Classification:** copy/paste = stateful, read = read-only. `ACTION_TIMEOUT_MS`.

**Runtime:** Use `navigator.clipboard` API with `document.execCommand` fallback for WKWebView restrictions.

---

### Phase 1 Verification

```bash
cd agent-bridge && bun run typecheck && bun test
bun run typecheck && bun run lint && bun run test
bunx tauri dev  # manual test: open browser, use each new tool
```

---

## Phase 2: Bridge + Handler Layer (Moderate Complexity)

**Scope:** 3 features. More complex frontend handler logic, new orbit_runtime.js methods, still no Rust changes.

### Feature 5: Drag and Drop

**Tool:** `browser_drag`

**Schema:**

```
{
  source: z.object(BrowserTargetShape),
  target: z.object(BrowserTargetShape),
}
```

**Classification:** Stateful. `ACTION_TIMEOUT_MS`.

**Runtime `drag(source, target)`:**

1. Resolve both elements via `_resolveTarget()`
2. Create `DataTransfer` polyfill (constructor may not be available in WKWebView)
3. Dispatch on source: `dragstart`, `drag`
4. Dispatch on target: `dragenter`, `dragover`, `drop`
5. Dispatch on source: `dragend`

---

### Feature 4: Frame/iframe Management

**Tools:** `browser_frame`, `browser_mainframe`

**Schemas:**

- `browser_frame`: `{ index: z.number().int().nonnegative() }`
- `browser_mainframe`: `{}`

**Classification:** Both stateful. `ACTION_TIMEOUT_MS`.

**Runtime:**

- Add `_activeFrameDocument` / `_activeFrameIndex` tracking (default: `null` = main frame)
- `switchFrame(index)`: Find iframe by index, verify same-origin via `iframe.contentDocument`. Store. Modify `_resolveTarget()` to use active frame document.
- `switchToMainFrame()`: Reset to null.
- **Cross-origin guard:** Catch security errors, return `"Cannot switch to cross-origin iframe (index N, src: ...)"`

---

### Feature 8: Snapshot Diffing

**Tool:** `browser_diff_snapshot`

**Schema:** `{ snapshot1: z.string(), snapshot2: z.string() }`

**Classification:** Read-only. `DEFAULT_TIMEOUT_MS`.

**Implementation:** Runs entirely in the frontend handler (NOT in orbit_runtime.js). Implement a Myers diff on lines:

- Split by `\n`, compare line-by-line
- Output unified diff: `+` added, `-` removed, ` ` unchanged
- Collapse unchanged runs with 3-line context
- Return `{ diff: '...', additions: N, removals: N, unchanged: N }`

New utility function `diffSnapshots()` in `browser-tool-handler.ts` (or separate file if >100 lines).

---

### Phase 2 Verification

```bash
# Same as Phase 1 checks plus:
# Manual: drag test on sortable list page
# Manual: frame switch test on page with same-origin iframes
# Manual: take 2 snapshots, diff them
```

---

## Phase 3: Rust + WKWebView Layer (Higher Complexity)

**Scope:** 3 features. Requires new Rust commands and/or WKWebView delegate handling.

### Feature 1: Dialog Handling

**Tool:** `browser_dialog`

**Schema:** `{ action: z.enum(['accept', 'dismiss']), text: z.string().optional() }`

**Classification:** Stateful. `ACTION_TIMEOUT_MS`.

**Approach:** JS override (not WKUIDelegate) — simpler, no Rust changes.

**Runtime:**

- Override `window.alert`, `window.confirm`, `window.prompt` during init
- Queue dialog info in `_dialogQueue` array on runtime
- Since `confirm`/`prompt` are synchronous but agent response is async, override makes them non-blocking:
  - `alert(msg)`: queue info, return immediately
  - `confirm(msg)`: queue info, return `false` (default deny, agent can re-trigger)
  - `prompt(msg, default)`: queue info, return `null` (default cancel)
- `handleDialog(action, text)`: pop queue, return handled info
- `getDialogInfo()`: peek queue without modification (exposed via `browser_runtime_info` enhancement)

**No Rust changes** — pure JS override approach.

---

### Feature 2: File Upload

**Tool:** `browser_upload`

**Schema:** `{ ...BrowserTargetShape, paths: z.array(z.string()).min(1) }`

**Classification:** Stateful. `DEFAULT_TIMEOUT_MS`.

**Handler implementation:**

1. Validate target is `<input type="file">`
2. For each path, read file via existing `readFile` Tauri API (base64 encode)
3. Call `invokeOrbitRuntimeMethod('uploadFiles', [target, filesData])`

**Runtime `uploadFiles(target, filesData)`:**

- Resolve target, verify `input[type=file]`
- Create `DataTransfer`, create `File` objects from base64 data
- Set `input.files = dt.files` via `Object.defineProperty` (standard assignment is read-only)
- Dispatch `change` + `input` events

**Rust:** No new commands (uses existing `read_file_bytes`).

---

### Feature 9: Screenshot Diffing

**Tool:** `browser_diff_screenshot`

**Schema:** `{ screenshot1: z.string(), screenshot2: z.string(), threshold: z.number().min(0).max(1).optional() }`

**Classification:** Read-only. `DEFAULT_TIMEOUT_MS`.

**New Rust command `browser_diff_screenshots`:**

1. Read both JPEG files
2. Decode to RGBA with `image` crate
3. Pixel-level comparison (RGB channel diff within threshold, default 0.1)
4. Generate diff image highlighting changed pixels in red
5. Save to temp file
6. Return `{ matchPercentage, diffPixels, totalPixels, diffImagePath }`

**Files:**

- `src-tauri/src/commands/browser/mod.rs` — Add `browser_diff_screenshots` command
- `src-tauri/src/lib.rs` — Register in `generate_handler![]`
- `apps/agent/src/lib/api/browser.ts` — Add `browserDiffScreenshots()` invoke wrapper

---

### Phase 3 Verification

```bash
cargo check && cargo clippy && cargo test
cd agent-bridge && bun run typecheck && bun test
bun run check
# Manual: test dialog override on alert/confirm/prompt page
# Manual: test file upload on a form
# Manual: take 2 screenshots, diff them
```

---

## Phase 4: Tauri Window Management (Highest Complexity)

**Scope:** 2 features. Requires Rust refactoring for multi-tab and download handling.

### Feature 6: Tab Management

**Tools:** `browser_tab_list`, `browser_tab_new`, `browser_tab_switch`, `browser_tab_close`

**Schemas:**

- `browser_tab_list`: `{}`
- `browser_tab_new`: `{ url: z.string().optional() }`
- `browser_tab_switch`: `{ tabId: z.string() }`
- `browser_tab_close`: `{ tabId: z.string().optional() }`

**Classification:** list = read-only; new/switch/close = stateful.

**Rust refactoring (`mod.rs`):**

- Refactor `BrowserWindowState` from single `exists: bool` to `tabs: HashMap<String, TabState>` + `active_tab: Option<String>`
- Each `TabState`: `label, url, hidden`
- `browser_create` becomes first tab creation
- All existing single-browser commands (`browser_eval`, `browser_navigate`, etc.) operate on **active tab** — backward compatible
- 4 new commands: `browser_tab_list`, `browser_tab_new` (new child window), `browser_tab_switch` (show/hide windows), `browser_tab_close`

**Files:**

- `src-tauri/src/commands/browser/mod.rs` — Refactor state + add 4 commands
- `src-tauri/src/lib.rs` — Register 4 new commands
- `apps/agent/src/lib/api/browser.ts` — Add 4 invoke wrappers
- `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts` — Add 4 switch cases

---

### Feature 3: File Download

**Tools:** `browser_download`, `browser_wait_for_download`

**Schemas:**

- `browser_download`: `{ url: z.string() }`
- `browser_wait_for_download`: `{ timeout: z.number().int().positive().max(120000).optional() }`

**Classification:** Both stateful. `browser_download` = `DEFAULT_TIMEOUT_MS`. `browser_wait_for_download` = `clampWaitTimeout()`.

**Rust (`mod.rs`):**

- New managed state `BrowserDownloadState` with pending/completed download tracking + oneshot waiters
- `browser_download(url)`: HTTP client download to temp dir, return path
- `browser_wait_for_download(timeout)`: Register oneshot receiver, resolve when download completes
- Modify `on_navigation` callback to detect download responses (Content-Disposition, binary MIME) and route to download state

**Files:**

- `src-tauri/src/commands/browser/mod.rs` — Add state + 2 commands
- `src-tauri/src/lib.rs` — Manage state + register commands
- `apps/agent/src/lib/api/browser.ts` — Add 2 wrappers
- Handler — Add 2 switch cases

---

### Phase 4 Verification

```bash
cargo check && cargo clippy && cargo test
cd agent-bridge && bun run typecheck && bun test
bun run check
# Manual: test tab create/switch/close
# Manual: test existing browser tools still work (backward compat)
# Manual: test direct URL download + button-triggered download
```

---

## File Modification Summary

| File                                              | Ph1         | Ph2 | Ph3    | Ph4                | Total       |
| ------------------------------------------------- | ----------- | --- | ------ | ------------------ | ----------- |
| `agent-bridge/src/browser/browser-mcp-server.ts`  | +10 tools   | +3  | +2     | +6                 | +21         |
| `agent-bridge/src/browser/types.ts`               | +10 ifaces  | +3  | +2     | +6                 | +21         |
| `agent-bridge/src/browser/browser-tool-bridge.ts` | +3 stateful | +3  | +1     | +4                 | +11 entries |
| `browser-tool-handler.ts`                         | +10 cases   | +3  | +2     | +6                 | +21         |
| `orbit_runtime.js`                                | +8 methods  | +3  | +2     | 0                  | +13         |
| `src-tauri/src/commands/browser/mod.rs`           | 0           | 0   | +1 cmd | +6 cmds + refactor | +7          |
| `src-tauri/src/lib.rs`                            | 0           | 0   | +1     | +6                 | +7          |
| `apps/agent/src/lib/api/browser.ts`               | 0           | 0   | +1     | +6                 | +7          |

---

## Risk Mitigation

| Risk                                                        | Likelihood | Mitigation                                                                                           |
| ----------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `confirm`/`prompt` are synchronous, agent response is async | High       | Non-blocking override returns default (false/null). Agent retriggers if needed. Document limitation. |
| `DataTransfer` constructor unavailable in WKWebView         | Medium     | Polyfill with `{ setData, getData, types, files }` object                                            |
| Cross-origin iframes inaccessible                           | Expected   | Clear error message. Same limitation as Playwright.                                                  |
| WKWebView clipboard restrictions (no user gesture)          | Medium     | `document.execCommand` fallback + document limitation                                                |
| Tab refactoring breaks existing tools                       | Medium     | All existing commands operate on `active_tab`. Full regression test.                                 |
| `image` crate adds binary size                              | Low        | Already used transitively. Minimal impact.                                                           |

---

## Out of Scope (Deferred)

**Tier 3 (Future):** Domain allowlist, action policies, credential vault, state persistence, element highlighting, emulation controls, HTTP basic auth, setcontent, dispatch events, URL comparison, expose functions, nth selection.

**Tier 4 (Not Applicable to WKWebView):** CDP raw input, screencast, video recording, CPU profiling, tracing, route interception, HAR recording, PDF export, WebSocket streaming.
