# Plan: Wire agent-browser Tools Into Orbit's Embedded Browser + iOS Simulator

> **Audit Status**: APPROVED — reworked per three audit rounds (2026-03-04). See `reviews/audit-plan.md`.
>
> - **Audit v1**: 5 critical, 5 recommended, 9 edge cases → all addressed
> - **Audit v2**: 3 critical, 5 recommended, 5 edge cases → all addressed
> - **Audit v3**: 0 critical, 3 recommended, 3 edge cases → all addressed (final pass)
> - **Key design decisions**: dual-channel eval transport, process-level IOSService with leases, async shutdown, scoped DOM invalidation, try/finally lease cleanup

## Context

Orbit's embedded browser (WKWebView via Tauri multiwebview) currently has 13 basic MCP tools (click, type, get_text, etc.) that use simple CSS selectors and `document.querySelector()`. Vercel's `agent-browser` reference implementation has 100+ tools with a powerful **accessibility snapshot + ref system** that makes AI browser automation dramatically more reliable. It also includes **iOS Simulator support** via Appium + WebDriverAgent.

We want to adopt agent-browser's tool interface and key features — executing them inside our **existing embedded WKWebView** for desktop, and adding a **new iOS Simulator control layer** for mobile testing. No separate Playwright/Chromium process needed.

**Two execution targets, one unified MCP tool surface:**

| Target              | Engine                           | Connection                       |
| ------------------- | -------------------------------- | -------------------------------- |
| **Desktop browser** | Embedded WKWebView               | JS injection via `window.eval()` |
| **iOS Simulator**   | Safari via Appium/WebDriverAgent | WebDriver protocol over HTTP     |

---

## Part A: Desktop Browser Enhancement

### Architecture

```
Claude Agent SDK
    │ tool_use: browser_snapshot
    ▼
agent-bridge/src/browser/browser-mcp-server.ts   ← EXPAND (13 → ~35 tools)
    │ bridge.sendRequest()
    ▼
agent-bridge/src/browser/browser-tool-bridge.ts   ← MODIFY (add AsyncQueue + per-tool timeouts)
    │ IPC event → Tauri
    ▼
apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts  ← EXPAND (add new tool cases)
    │ evalScript() → browserEval()
    ▼
src-tauri/src/commands/browser/mod.rs              ← MINOR (increase result size limit)
    │ window.eval(wrapped_script)
    ▼
WKWebView page context
    │ window.__orbit.snapshot() / .click() / .fill() / etc.
    ▼
__orbit_runtime.js (INJECTED ONCE)                 ← NEW FILE (~500 lines)
```

### Phase 1: Injected Browser Runtime (`__orbit_runtime.js`)

**New file**: `src-tauri/src/commands/browser/orbit_runtime.js`
(Loaded via `include_str!()` alongside existing `browser_init.js`)

#### 1.1 Accessibility Snapshot Engine

The **killer feature**. Builds an accessibility tree with `@ref` handles.

```js
window.__orbit = {
  _refCounter: 0,
  _refMap: {}, // { "e1": { element, role, name, selector, nth } }
  _epoch: 0, // Incremented on navigation/mutation, invalidates stale refs

  snapshot(opts) {
    // Increment epoch — all previous refs are now stale
    this._epoch += 1;
    this._refCounter = 0;
    this._refMap = {};

    // Walk DOM using TreeWalker (document + open shadow roots)
    // For each element:
    //   1. Compute role: element.role || getComputedRole(tagName, attributes)
    //   2. Compute name: aria-label || textContent || placeholder || alt || title
    //   3. If interactive (button, link, input, select, etc.) → assign ref
    //   4. If opts.cursor: also check cursor:pointer, onclick, tabindex
    //   5. DUPLICATE DISAMBIGUATION: if same role+name already seen,
    //      append nth index (e.g., button "Save" [ref=e3] [nth=2])
    //   6. Build indented text tree with [ref=eN] markers
    //   7. Store direct element reference + metadata in _refMap
    //   8. For iframes with same-origin: recursively walk, prefix refs with frame index
    //      (cross-origin iframes are opaque — noted in snapshot output as "[cross-origin iframe]")
    //   9. For shadow DOM: walk open shadow roots via element.shadowRoot
    //      (closed shadow roots are opaque — noted as "[closed shadow root]")

    // Return: { epoch, snapshot: "- button \"Submit\" [ref=e1]\n...", refCount: N }
  },
};
```

**Ref determinism contract** (addresses audit Critical #4):

| Invariant                    | Rule                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Uniqueness**               | Each ref ID (`e1`, `e2`, ...) maps to exactly one DOM element per epoch                                                                                           |
| **Duplicate disambiguation** | Elements with identical role+name get `nth` index (e.g., 2nd "Save" button → `[nth=2]`)                                                                           |
| **Stale ref detection**      | Every ref carries an `epoch` stamp. Using a ref from epoch N in epoch N+1 returns an error: `"Ref is stale (epoch N, current N+1). Call browser_snapshot again."` |
| **Epoch boundaries**         | Epoch increments on: `snapshot()` call and page navigation (`popstate`/`hashchange`). **NOT** on every DOM mutation — see scoped invalidation below               |
| **iframe handling**          | Same-origin iframes: walked recursively, refs prefixed with frame index. Cross-origin: opaque, noted in output                                                    |
| **Shadow DOM**               | Open shadow roots: walked via `element.shadowRoot`. Closed: opaque, noted in output                                                                               |
| **Element storage**          | Refs store direct `WeakRef<Element>` to avoid GC-preventing leaks. If element is GC'd, ref resolution returns "element no longer in DOM"                          |

**Scoped DOM invalidation** (addresses audit v2 Recommended #3 — over-invalidation on dynamic SPAs):

Invalidating refs on every DOM mutation would make them unusable on SPAs with chat streams, live feeds, or animations. Instead:

- **Navigation events** (`popstate`, `hashchange`, full page load): increment epoch immediately — all refs are stale.
- **DOM mutations**: do NOT auto-increment epoch. Instead, use **lazy validation** at ref resolution time:
  1. Dereference `WeakRef<Element>` — if GC'd, return "element removed from DOM"
  2. Check `element.isConnected` — if `false`, return "element no longer in DOM"
  3. If both pass, the ref is still valid regardless of surrounding DOM changes
- **Re-snapshot**: `snapshot()` always increments epoch (assigns fresh refs). This is the explicit "refresh" mechanism.
- **Practical result**: On a dynamic SPA, refs from the last snapshot remain valid as long as the referenced elements haven't been removed. The agent calls `browser_snapshot` when it needs a fresh view, not on every unrelated DOM change.

**Role detection** (no Playwright `ariaSnapshot()` — we build our own):

- `<button>` → `button`, `<a href>` → `link`, `<input type="text">` → `textbox`
- `<input type="checkbox">` → `checkbox`, `<select>` → `combobox`, `<textarea>` → `textbox`
- `[role="..."]` → use ARIA role directly
- `<h1>`-`<h6>` → `heading` with `[level=N]`
- Elements with `cursor:pointer` + visible text → `clickable` (pseudo-role)

**Interactive roles filter** (matches agent-browser):
`button, link, textbox, checkbox, radio, combobox, listbox, menuitem, option, searchbox, slider, spinbutton, switch, tab, treeitem`

**Ref resolution** (backward-compatible — addresses audit Critical #3):

```js
resolveRef(refOrSelector, currentEpoch) {
  // 1. Parse @e1, ref=e1, e1 → look up in _refMap
  // 2. If found: validate epoch (stale → throw with clear message)
  //    Then: dereference WeakRef, verify element is still in DOM
  // 3. If NOT a ref pattern: treat as CSS selector → querySelector
  //    (preserves full backward compatibility with existing selector-based tools)
  // 4. If neither resolves: throw with both interpretations tried
}
```

**Migration strategy**: All tool inputs accept BOTH `ref` and `selector` fields during migration.
Resolution order: `ref` takes priority if both provided. `selector` is a fallback for legacy callers.
AI tool descriptions will teach the snapshot→ref workflow but note selector still works.

#### 1.2 Enhanced Interaction Methods

All methods accept either `@ref` or CSS selector:

- `click(ref)` — scrollIntoView + click()
- `fill(ref, value)` — focus + clear + set value + dispatch input/change events
- `type(ref, text, opts)` — character-by-character with keydown/keypress/keyup events
- `select(ref, values)` — set selected options on `<select>`
- `check(ref)` / `uncheck(ref)` — toggle checkboxes
- `hover(ref)` — dispatch mouseenter/mouseover
- `focus(ref)` — element.focus()
- `scroll(ref?, direction, amount)` — scrollBy on element or window
- `scrollIntoView(ref)` — element.scrollIntoViewIfNeeded()
- `boundingBox(ref)` — getBoundingClientRect()
- `styles(ref, properties)` — getComputedStyle()
- `isVisible(ref)` / `isEnabled(ref)` / `isChecked(ref)` — state queries
- `count(selector)` — querySelectorAll().length
- `getAttribute(ref, attr)` — element.getAttribute()
- `getCookies()` / `setCookie()` / `clearCookies()` — document.cookie
- `storageGet/Set/Clear(type, key)` — localStorage/sessionStorage
- `startNetworkCapture()` / `getNetworkRequests()` — fetch/XHR monkeypatch
- `injectAnnotationOverlay()` / `removeAnnotationOverlay()` — DOM overlay with numbered boxes

**Injection strategy** (addresses audit Recommended #3 — single source of truth):

- **Primary path**: Tauri `initialization_script` (runs on every page load), same as existing `browser_init.js`. This is the canonical injection point.
- **Fallback**: `ensureOrbitRuntime()` checks `window.__orbit?.version` before injecting. If the runtime is missing (e.g., page navigated via WebDriver in iOS), it injects the same source via `eval()`.
- **Version check**: The runtime exports `window.__orbit.VERSION` (semver string). `ensureOrbitRuntime()` compares against expected version and re-injects if outdated, preventing runtime drift.
- **iOS reuse**: The same `orbit_runtime.js` source is injected into iOS Safari via `wdioClient.execute()`. One canonical source, two injection paths.

**CSP handling** (addresses audit edge case):

- If a page's Content-Security-Policy blocks inline script execution, `ensureOrbitRuntime()` catches the error and returns a clear diagnostic: `"Page CSP blocks script injection. Runtime unavailable."` Tools that depend on the runtime will fail with this message rather than silently returning empty results.
- Snapshot will still report page URL and title (available without script injection) so the agent has context.

### Phase 2: Expand MCP Server (agent-bridge)

**File**: `agent-bridge/src/browser/browser-mcp-server.ts`

Add ~22 new tools. All follow existing pattern (delegate to `bridge.sendRequest()`):

| Tool                        | Input Schema                                             | Description                       |
| --------------------------- | -------------------------------------------------------- | --------------------------------- |
| `browser_snapshot`          | `{ interactive?: bool, cursor?: bool, compact?: bool }`  | **Accessibility tree with @refs** |
| `browser_fill`              | `{ ref: string, value: string }`                         | Fill input (proper events)        |
| `browser_check`             | `{ ref: string }`                                        | Check checkbox                    |
| `browser_uncheck`           | `{ ref: string }`                                        | Uncheck checkbox                  |
| `browser_select`            | `{ ref: string, values: string[] }`                      | Select dropdown option(s)         |
| `browser_hover`             | `{ ref: string }`                                        | Hover over element                |
| `browser_focus`             | `{ ref: string }`                                        | Focus element                     |
| `browser_scroll`            | `{ ref?: string, direction: string, amount?: number }`   | Scroll page or element            |
| `browser_scroll_into_view`  | `{ ref: string }`                                        | Scroll element into viewport      |
| `browser_wait_for_selector` | `{ selector: string, state?: string, timeout?: number }` | Wait for element                  |
| `browser_wait_for_url`      | `{ url: string, timeout?: number }`                      | Wait for URL match                |
| `browser_is_visible`        | `{ ref: string }`                                        | Check element visibility          |
| `browser_is_enabled`        | `{ ref: string }`                                        | Check if element is enabled       |
| `browser_get_attribute`     | `{ ref: string, attribute: string }`                     | Get HTML attribute                |
| `browser_bounding_box`      | `{ ref: string }`                                        | Get element dimensions            |
| `browser_count`             | `{ selector: string }`                                   | Count matching elements           |
| `browser_cookies_get`       | `{}`                                                     | Get cookies                       |
| `browser_cookies_clear`     | `{}`                                                     | Clear cookies                     |
| `browser_storage_get`       | `{ type: string, key?: string }`                         | Get storage value                 |
| `browser_storage_set`       | `{ type: string, key: string, value: string }`           | Set storage value                 |
| `browser_storage_clear`     | `{ type: string }`                                       | Clear storage                     |
| `browser_network_requests`  | `{}`                                                     | Get captured network requests     |

Also **update existing tools** with dual-input migration schema (addresses audit Critical #3):

All existing tools accept BOTH `ref` and `selector` via a shared `TargetSchema`:

```typescript
// Shared input schema for all element-targeting tools
const TargetSchema = z
  .object({
    ref: z.string().optional().describe('Element ref from browser_snapshot (preferred)'),
    selector: z.string().optional().describe('CSS selector (legacy, still supported)'),
  })
  .refine(
    (v) => v.ref !== undefined || v.selector !== undefined,
    'Provide ref (from snapshot) or selector (CSS)'
  );

function resolveTarget(input: { ref?: string; selector?: string }): string {
  return input.ref ?? input.selector!; // ref takes priority
}
```

Updated tools:

- `browser_click` → `{ ref?: string, selector?: string }` (was `selector` only)
- `browser_type` → `{ ref?: string, selector?: string, text: string, clear?: bool }` (was `selector` only)
- `browser_get_text` → `{ ref?: string, selector?: string }` (was `selector` only)
- `browser_get_html` → `{ ref?: string, selector?: string }` (was `selector` only)

New tools use `ref` as primary input but also accept `selector` for consistency.

### Phase 3: Expand Frontend Tool Handler

**File**: `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`

Add handler cases for each new tool. Pattern:

```typescript
case 'browser_snapshot': {
  await ensureOrbitRuntime();
  const script = `return window.__orbit.snapshot({
    interactive: ${String(toolInput['interactive'] !== false)},
    cursor: ${String(toolInput['cursor'] === true)},
    compact: ${String(toolInput['compact'] === true)}
  })`;
  const raw = await evalScript(script);
  return { success: true, result: parseEvalResult(raw) };
}
```

**New helper**: `ensureOrbitRuntime()` — checks `window.__orbit?.VERSION`, injects if missing or outdated.

**Request serialization** (addresses audit Recommended #1):

Stateful tools (`browser_snapshot`, `browser_click`, `browser_fill`, `browser_wait_for_*`) share ref map state. Concurrent execution can corrupt refs or produce race conditions. Add a per-session execution queue:

```typescript
// browser-tool-bridge.ts
private executionQueue = new AsyncQueue(); // serialize stateful tool calls

async sendRequest(tool: string, input: Record<string, unknown>): Promise<unknown> {
  if (isStatefulTool(tool)) {
    return this.executionQueue.enqueue(() => this._sendRequest(tool, input));
  }
  return this._sendRequest(tool, input); // read-only tools run concurrently
}
```

Stateful tools: `browser_snapshot`, `browser_click`, `browser_fill`, `browser_type`, `browser_check`, `browser_uncheck`, `browser_select`, `browser_hover`, `browser_focus`, `browser_scroll`, `browser_navigate`.
Read-only tools (concurrent OK): `browser_get_text`, `browser_get_html`, `browser_is_visible`, `browser_get_attribute`, `browser_count`, `browser_cookies_get`, `browser_storage_get`.

**Per-tool timeout configuration** (addresses audit Recommended #2):

Replace the fixed 30s timeout with per-tool budgets:

| Tool category                         | Timeout                              | Rationale                  |
| ------------------------------------- | ------------------------------------ | -------------------------- |
| `browser_snapshot`                    | 15s                                  | DOM walk + serialization   |
| `browser_click`, `browser_fill`, etc. | 10s                                  | Single element interaction |
| `browser_wait_for_selector`           | Configurable (default 30s, max 120s) | User-specified wait        |
| `browser_wait_for_url`                | Configurable (default 30s, max 120s) | Navigation wait            |
| `browser_navigate`                    | 30s                                  | Page load                  |
| iOS tools                             | 60s                                  | Simulator latency          |

Timeout errors include the tool name and elapsed time for clear diagnostics.

### Phase 4: Rust Backend Adjustments

**File**: `src-tauri/src/commands/browser/mod.rs`

1. **Inject orbit_runtime.js** in `browser_create()`:

   ```rust
   .initialization_script(include_str!("orbit_runtime.js"))
   ```

2. **Large payload transport** (addresses audit v2 Critical #1 — `orbit-eval://` URL transport limit):

   **Problem**: Current eval results flow through `orbit-eval://result?data=<encodeURIComponent(json)>` URL navigation. URL-based transport has practical limits (~2MB on WebKit, but `encodeURIComponent` triples the size, and URLs are parsed by the navigation stack). The existing 100KB cap exists for a reason — simply raising it to 500KB on the URL path is unreliable.

   **Solution**: Dual-channel transport — small results use the fast URL path, large results use a Tauri event channel:

   ```rust
   // In the wrapped JS eval script (mod.rs):
   const __json = JSON.stringify(__result ?? null);
   const SMALL_LIMIT = 100000; // 100KB — stays on fast URL path

   if (__json.length <= SMALL_LIMIT) {
       // Fast path: existing orbit-eval:// URL callback (unchanged)
       const __data = encodeURIComponent(__json);
       window.location.href = `orbit-eval://result?id=${__evalId}&success=true&data=${__data}`;
   } else if (__json.length <= 500000) {
       // Large path: signal via URL, deliver payload via postMessage
       window.location.href = `orbit-eval://result?id=${__evalId}&success=true&large=true`;
       // Post the full payload to __orbit_eval_channel (Tauri event listener)
       window.__orbit_eval_channel?.postResult(__evalId, __json);
   } else {
       // Too large even for event path — report error with diagnostics
       const __errorMsg = encodeURIComponent(
           `Result too large (${__json.length} chars, max 500000). Use compact:true or target a subtree.`
       );
       window.location.href = `orbit-eval://result?id=${__evalId}&success=false&error=${__errorMsg}`;
   }
   ```

   **Rust side**: Add a `browser:eval-large-result` Tauri event listener registered in `browser_create()`. When the URL callback arrives with `large=true`, the Rust oneshot waits for the event payload instead of parsing from the URL. The event channel has no URL-encoding overhead and no URL length limits.

   ```rust
   // In browser_create() setup:
   let result_state_for_event = result_state.clone();
   app.listen("browser:eval-large-result", move |event| {
       // Parse { evalId, data } from event payload
       // Complete the pending oneshot via result_state_for_event
   });
   ```

   **JS-side channel**: Injected via `initialization_script` alongside the runtime:

   ```js
   window.__orbit_eval_channel = {
     postResult(evalId, json) {
       // Use __TAURI__.event.emit for direct IPC (available in Tauri webview context)
       window.__TAURI__?.event?.emit('browser:eval-large-result', { evalId, data: json });
     },
   };
   ```

   **Truncation strategy** (defense-in-depth for the 500KB cap):
   - If snapshot output exceeds 500KB after serialization, truncate the tree at depth and append `"[truncated: {N} more elements]"`.
   - The runtime tracks `totalElements` vs `emittedElements` and includes truncation stats in the response.
   - If the result STILL exceeds the limit after truncation (pathological pages), return a diagnostic with page URL, element count, and suggestion to use `compact: true` or target a specific subtree via `ref`.

   **Note**: The embedded WKWebView IS a Tauri webview (created via `WebviewBuilder`), so `__TAURI__` IPC is available. This is NOT an external browser — Tauri's IPC infrastructure is already injected.

   **Large-result handshake timeout** (addresses audit v3 Recommended #2 / edge case):

   When `large=true` arrives via the URL callback, the Rust side switches to waiting for the `browser:eval-large-result` event. But that event could be dropped or delayed (page navigation, JS error, Tauri IPC hiccup). Handling:

   ```rust
   // In handle_eval_result_url, when large=true:
   // 1. Don't complete the oneshot yet — mark as "awaiting_large_payload"
   // 2. The existing JS_EVAL_TIMEOUT (in browser_eval) still applies to the
   //    outer `timeout(JS_EVAL_TIMEOUT, result_rx).await` — so the large-result
   //    event must arrive within the same timeout window
   // 3. If timeout fires: cancel the pending entry, return error:
   //    "Large eval result not received within timeout. The page may have
   //     navigated or script execution was interrupted."
   // 4. The event listener ignores unknown/stale evalIds (no entry in result_state)
   ```

   No new timeout constant needed — the existing `JS_EVAL_TIMEOUT` covers both paths. The event listener is stateless: it looks up the evalId in `BrowserResultState`, completes the oneshot if found, silently drops if not (stale/unknown). Test: `browser-snapshot-truncation.test.ts` includes a case for large-result timeout.

3. **Add `browser_wait_for_selector`** — Rust-side polling via `tokio::time::interval` (survives page navigations unlike JS `setInterval`)

4. Register new commands in `lib.rs`

### Phase 5: Update AI Tool Descriptions

Rich descriptions teaching the **snapshot → ref → action** workflow:

```
WORKFLOW: Call browser_snapshot first → get @refs → use refs in click/fill/type.
```

---

## Part B: iOS Simulator Support

### Architecture

```
Claude Agent SDK
    │ tool_use: ios_snapshot / ios_tap / ios_swipe
    ▼
agent-bridge/src/ios/ios-mcp-server.ts             ← NEW MCP SERVER
    │ iosManager.execute()
    ▼
agent-bridge/src/ios/ios-manager.ts                 ← NEW: Simulator orchestrator
    │
    ├─→ node-simctl (npm)                           ← Device listing & lifecycle
    │     │ xcrun simctl list/boot/shutdown
    │     ▼
    │   iOS Simulator.app
    │
    └─→ webdriverio (npm)                           ← Browser automation in simulator
          │ WebDriver protocol (HTTP :4723)
          ▼
        Appium Server                                ← Spawned by ios-manager
          │ XCUITest driver
          ▼
        WebDriverAgent (on simulator)
          │
          ▼
        Safari (in iOS Simulator)
```

**Key decision**: iOS simulator runs in the **agent-bridge sidecar** (not Rust), because:

- `node-simctl` and `webdriverio` are Node/Bun packages
- Agent-bridge already spawns as a sidecar process
- Appium is a Node.js server — natural to manage from the bridge
- The MCP server pattern is already proven (browser tools, canvas tools)

**Platform gating** (addresses audit v1 Critical #2 — Bun sidecar risk):

iOS tooling is **macOS-only** and **opt-in**. Registration is guarded by platform + feature flag + dependency detection:

```typescript
async function canEnableIOS(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  if (process.env.ORBIT_ENABLE_IOS_TOOLS !== '1') return false;
  // Verify prerequisites exist (non-blocking — just checks, doesn't install)
  try {
    await execAsync('xcrun simctl help', { timeout: 5000 });
    await execAsync('which appium', { timeout: 5000 });
    return true;
  } catch {
    return false; // Missing prerequisites — iOS tools silently unavailable
  }
}
```

**Lazy imports are critical**: `node-simctl` and `webdriverio` are loaded ONLY when iOS is enabled. This prevents Bun compile failures on non-macOS platforms and avoids bloating the sidecar startup path.

**Mandatory build validation** (addresses audit v2 Critical #3 — corrected commands):

Before merge, the following must pass from the **repo root**:

1. `bun run build:sidecar` — compiled binary includes iOS deps without error (root script, not agent-bridge local)
2. `cd agent-bridge && bun run typecheck && bun test` — type checking + tests pass in agent-bridge
3. `ORBIT_ENABLE_IOS_TOOLS=0 bun run build:sidecar` — binary works WITHOUT iOS deps loaded
4. Cross-platform build validation (if CI supports Linux runners) — iOS code path never touched

**Note on build:sidecar**: This is a **root-level** script defined in `package.json` (not `agent-bridge/package.json`). It runs `cd agent-bridge && bun build --compile ...` with the correct output path (`src-tauri/binaries/`). The agent-bridge local scripts are `build` (JS bundle) and `build:dev` (debug binary to `target/debug/`).

**Process-level iOS service** (addresses audit v2 Critical #2 — multi-session ownership):

`IOSManager` is NOT per-agent. It's a **process-level singleton** (`IOSService`) owned by the `index.ts` entrypoint, shared across all active sessions via lease-based access:

```typescript
// agent-bridge/src/ios/ios-service.ts — NEW FILE
class IOSService {
  private manager: IOSManager | null = null;
  private leaseholders = new Set<string>(); // session IDs with active leases
  private _state: 'idle' | 'launching' | 'ready' | 'closing' | 'disposed' = 'idle';

  /**
   * Acquire a lease on the iOS simulator for a session.
   * First acquirer triggers launch. Subsequent acquirers share the session.
   */
  async acquire(sessionId: string): Promise<void> {
    if (this._state === 'disposed') throw new Error('IOSService disposed');
    this.leaseholders.add(sessionId);
    if (this._state === 'ready') return; // Already running, share it
    if (this._state === 'launching') {
      // Wait for existing launch to complete
      await this._launchPromise;
      return;
    }
    // First acquirer — launch
    this._state = 'launching';
    this.manager = new IOSManager();
    this._launchPromise = this.manager.launch();
    await this._launchPromise;
    this._state = 'ready';
  }

  /**
   * Release a session's lease. Last release triggers cleanup.
   */
  async release(sessionId: string): Promise<void> {
    this.leaseholders.delete(sessionId);
    if (this.leaseholders.size === 0 && this._state === 'ready') {
      await this.shutdown();
    }
    // If other sessions still hold leases, simulator stays alive
  }

  /**
   * Force shutdown regardless of leases (for process exit).
   */
  async shutdown(): Promise<void> {
    if (this._state === 'idle' || this._state === 'disposed') return;
    this._state = 'closing';
    await this.manager?.close().catch((e) => logger.warn('iOS close error', e));
    this.manager = null;
    this.leaseholders.clear();
    this._state = 'idle';
  }

  async dispose(): Promise<void> {
    await this.shutdown();
    this._state = 'disposed';
  }

  /** Get the manager (only valid while lease held) */
  getManager(sessionId: string): IOSManager {
    if (!this.leaseholders.has(sessionId)) throw new Error('No iOS lease for session');
    if (!this.manager) throw new Error('iOS not ready');
    return this.manager;
  }

  /**
   * Force-release a session's lease (for crash/unexpected termination).
   * Called from deleteSession's finally-equivalent paths.
   * Idempotent — safe if session never acquired or already released.
   */
  async forceRelease(sessionId: string): Promise<void> {
    if (this.leaseholders.has(sessionId)) {
      await this.release(sessionId);
    }
  }
}
```

**Key design decisions**:

- **One Appium, one simulator, shared by all sessions** — Appium + WebDriverAgent is expensive to launch. Sessions share the running instance.
- **Lease-based cleanup** — When the LAST session releases its lease, the simulator shuts down. No session can pull the rug from under another.
- **Process-level lifecycle** — `IOSService` is created once in `index.ts`, passed to session manager, disposed on SIGTERM/SIGINT.
- **Edge case: session A closes iOS while session B is using it** — `release()` only triggers shutdown when `leaseholders.size === 0`. Session A's release is a no-op if session B still holds a lease.

**Registration flow** (addresses audit v2 Recommended #1 — `_createOptions()` is sync):

```typescript
// index.ts — process-level setup (async is fine here)
let iosService: IOSService | undefined;
if (await canEnableIOS()) {
  const { IOSService } = await import('./ios/ios-service.js');
  iosService = new IOSService();
}

// Pass to SessionManager constructor
const sessionManager = new SessionManager({ iosService });

// SessionManager passes to OrbitAgent at session creation time (BEFORE _createOptions)
// agent.ts — _createOptions() remains sync, iOS MCP server is pre-configured
```

This avoids the async-in-sync problem flagged in audit v2 Recommended #1.

### Phase 6: iOS Manager (`agent-bridge/src/ios/`)

#### 6.1 New files

| File                                     | Purpose                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `agent-bridge/src/ios/ios-manager.ts`    | Core orchestrator: device listing, Appium lifecycle, WebDriver session |
| `agent-bridge/src/ios/ios-mcp-server.ts` | MCP tool definitions (same pattern as browser-mcp-server.ts)           |
| `agent-bridge/src/ios/ios-actions.ts`    | Action handlers: snapshot, tap, fill, swipe, screenshot                |
| `agent-bridge/src/ios/types.ts`          | Type definitions for iOS devices, commands, responses                  |

#### 6.2 IOSManager class

```typescript
class IOSManager {
  private appiumProcess: ChildProcess | null = null;
  private wdioClient: WebdriverIO.Browser | null = null;
  private refMap: Record<string, RefData> = {};
  private _state: 'idle' | 'launching' | 'ready' | 'closing' | 'disposed' = 'idle';
  private _launchAbortController: AbortController | null = null;

  // Lifecycle (addresses audit Critical #1)
  async listDevices(): Promise<IOSDevice[]>; // xcrun simctl list --json
  async launch(deviceNameOrUdid?: string): Promise<void>;
  // 1. Guard: if _state !== 'idle', throw (no concurrent launches)
  // 2. Set _state = 'launching', create AbortController
  // 3. Find device (fuzzy match name or exact UDID)
  // 4. Boot simulator if needed (simctl boot)
  // 5. Start Appium server (spawn process, wait for ready)
  //    - PORT CONFLICT: Try port 4723 first. If EADDRINUSE, try 4724-4729.
  //      If all occupied, throw with clear message listing PIDs on those ports.
  //    - EXISTING APPIUM: Check if Appium is already running on target port.
  //      If version matches, reuse. If mismatch, throw with version info.
  // 6. Create WebDriver session (capabilities: Safari + device)
  // 7. Set _state = 'ready'
  // 8. If AbortController was aborted during any step, call close() and throw

  async close(): Promise<void>;
  // Idempotent — safe to call multiple times
  // 1. Set _state = 'closing'
  // 2. Abort _launchAbortController (cancels in-progress launch)
  // 3. Delete WebDriver session (catch + log errors)
  // 4. Kill Appium process (SIGTERM, then SIGKILL after 5s)
  // 5. Shutdown simulator (simctl shutdown) — catch + log errors
  // 6. Null out all references
  // 7. Set _state = 'idle'

  async dispose(): Promise<void>;
  // Terminal — no further operations allowed after dispose
  // 1. await close()
  // 2. Set _state = 'disposed'
  // 3. All subsequent method calls throw "IOSManager disposed"

  // Automation (via WebDriver + JS injection)
  async snapshot(opts): Promise<SnapshotResult>; // Execute JS in Safari, build a11y tree
  async tap(refOrSelector): Promise<void>; // WebDriver pointer action
  async fill(refOrSelector, value): Promise<void>; // JS injection: set value + events
  async type(refOrSelector, text): Promise<void>; // JS char-by-char with events
  async swipe(direction, distance?): Promise<void>; // WebDriver touch action sequence
  async screenshot(path?): Promise<string>; // WebDriver takeScreenshot → base64
  async navigate(url): Promise<void>; // WebDriver navigate
  async evaluate(script): Promise<unknown>; // Execute JS in browser context
  async back(): Promise<void>; // WebDriver back
  async forward(): Promise<void>; // WebDriver forward
  async getUrl(): Promise<string>; // Execute JS: location.href
  async getTitle(): Promise<string>; // Execute JS: document.title

  // Internal
  private async ensureAppium(): Promise<void>; // Start Appium if not running
  private async findDevice(query?: string): Promise<IOSDevice>;
  private assertReady(): void; // Throws if _state !== 'ready'
}
```

**Lifecycle integration with session management** (addresses audit v1 Critical #1 + audit v2 Critical #2):

iOS lifecycle is now managed at the **process level**, not per-agent:

```typescript
// session-manager.ts — guaranteed lease release on all cleanup paths
// (addresses audit v3 Recommended #3 — stale lease on crash)
async deleteSession(sessionId: string): Promise<void> {
  // ... existing cleanup ...
  try {
    await agent.stopSession();
  } finally {
    // ALWAYS release iOS lease — even if stopSession throws
    // forceRelease is idempotent (no-op if session never acquired)
    await this.iosService?.forceRelease(sessionId).catch((e) =>
      logger.warn({ sessionId, error: e }, 'iOS lease release failed')
    );
  }
  this.activeSessions.delete(sessionId);
}

// dispose() — sync fallback also cleans up leases
override dispose(): void {
  // ... existing cleanup ...
  for (const [sessionId] of this.activeSessions.entries()) {
    // Fire-and-forget release for each session
    void this.iosService?.forceRelease(sessionId).catch(() => {});
  }
  // ... rest of existing dispose ...
}
```

**Process-level shutdown** (addresses audit v2 Recommended #2 — `dispose()` is sync):

The current `SessionManager.dispose()` is synchronous (`override dispose(): void`) and fire-and-forgets async stops. iOS teardown needs stronger guarantees. Solution: add an explicit async shutdown path used by `index.ts`, keep `dispose()` as sync fallback:

```typescript
// session-manager.ts
async shutdownAsync(): Promise<void> {
  // Async shutdown — used by gracefulShutdown() in index.ts
  // Stop all sessions and release iOS leases with proper awaiting
  for (const [sessionId, agent] of this.activeSessions.entries()) {
    await agent.stopSession().catch((err: unknown) => {
      logger.error({ sessionId, error: err }, 'Error stopping session');
    });
    await this.iosService?.release(sessionId).catch(() => {});
  }
  this.activeSessions.clear();
  // ... rest of existing dispose() logic ...
}

override dispose(): void {
  // Sync fallback — fire-and-forget, used as safety net
  // (existing behavior unchanged)
}

// index.ts — graceful shutdown uses async path
async function gracefulShutdown(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${reason}, shutting down...`);
  try {
    await sessionManager.shutdownAsync();
  } catch (e) {
    logger.error({ error: e }, 'shutdownAsync failed');
  }
  try {
    await iosService?.dispose();
  } catch (e) {
    logger.error({ error: e }, 'iOS dispose failed');
  }
  // Grace period for any remaining async work
  setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
}
```

**Edge case: app shutdown while async iOS teardown is still in flight**:

- `gracefulShutdown` is async and awaits `iosService.dispose()` BEFORE starting the grace timer.
- `SHUTDOWN_GRACE_MS` (existing constant) provides a hard deadline after the await.
- If `dispose()` hangs (Appium unresponsive), the `setTimeout` hard-exits after the grace period.
- `IOSManager.close()` has its own SIGKILL escalation (SIGTERM → wait 5s → SIGKILL) for the Appium process.

**Edge case: session deletion during `ios_launch`**:

- `_launchAbortController` is aborted by `close()`, which is called by `IOSService.shutdown()`.
- Each async step in `launch()` checks `_launchAbortController.signal.aborted` before proceeding.
- If aborted mid-launch: partially-started Appium process is killed, partially-booted simulator is shut down.
- `close()` is idempotent — safe to call even if `launch()` never completed.

**Edge case: iOS prerequisites disappear mid-session** (audit v2 edge case):

- If Appium crashes during a session, `IOSManager` detects the dead child process on the next tool call.
- Returns error: `"Appium process exited unexpectedly (code N). Call ios_launch to restart."` — does NOT auto-restart.
- The agent (Claude) decides whether to retry via `ios_launch` or report the failure to the user.
- `IOSService` state transitions to `idle`, allowing re-acquisition.

#### 6.3 Key implementation details

**Device discovery** (via `node-simctl`):

```typescript
import Simctl from 'node-simctl';
const simctl = new Simctl();
const devices = await simctl.getDevices(); // All simulators with state/runtime/UDID
```

**Appium server lifecycle** (with port conflict handling — addresses audit edge case):

- **Port selection**: Try 4723 first. If `EADDRINUSE`, scan 4724–4729. If all occupied, throw with diagnostic listing PIDs on each port (`lsof -ti :4723`).
- **Existing Appium detection**: Before spawning, check if Appium is already listening on the target port. If version matches, reuse the existing server. If version mismatches, throw with both versions for the user to resolve.
- Spawn: `appium --port <selected_port> --relaxed-security`
- Wait for stdout line: `"Appium REST http interface listener started"`
- 30-second startup timeout. On timeout: kill spawned process, throw with last 10 lines of stderr.
- Managed as child process — killed on `close()` (SIGTERM, then SIGKILL after 5s)
- **Non-macOS behavior** (addresses audit edge case): iOS tools are never registered on non-macOS platforms (see platform gating above). If someone bypasses the gate, all iOS tools return `"iOS tools require macOS with Xcode and Appium installed."`

**WebDriverIO session**:

```typescript
const client = await remote({
  port: 4723,
  capabilities: {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    browserName: 'Safari',
    'appium:deviceName': device.name,
    'appium:udid': device.udid,
    'appium:noReset': true,
    'appium:newCommandTimeout': 300,
  },
});
```

**Snapshot in iOS Safari** — reuses the **same `__orbit` runtime** JS:

```typescript
async snapshot(opts) {
  // Inject __orbit_runtime.js into Safari via WebDriver executeScript
  await this.wdioClient.execute(ORBIT_RUNTIME_JS);
  // Run snapshot
  const result = await this.wdioClient.execute(
    'return window.__orbit.snapshot(arguments[0])', opts
  );
  this.refMap = result.refs;
  return result;
}
```

This means the **same snapshot engine** works on desktop WKWebView AND iOS Safari.

**Touch actions (iOS-specific)**:

```typescript
async swipe(direction: string, distance = 300) {
  const { width, height } = await this.wdioClient.getWindowSize();
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);

  const vectors = {
    up:    { startY: cy + distance/2, endY: cy - distance/2 },
    down:  { startY: cy - distance/2, endY: cy + distance/2 },
    left:  { startX: cx + distance/2, endX: cx - distance/2 },
    right: { startX: cx - distance/2, endX: cx + distance/2 },
  };

  await this.wdioClient.performActions([{
    type: 'pointer',
    id: 'finger1',
    parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: startX, y: startY },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', duration: 500, x: endX, y: endY },
      { type: 'pointerUp', button: 0 },
    ]
  }]);
}
```

### Phase 7: iOS MCP Tools

**File**: `agent-bridge/src/ios/ios-mcp-server.ts`

Separate MCP server (not merged with browser tools — different execution target):

| Tool                    | Input Schema                                           | Description                          |
| ----------------------- | ------------------------------------------------------ | ------------------------------------ |
| `ios_device_list`       | `{}`                                                   | List all simulators + real devices   |
| `ios_launch`            | `{ device?: string }`                                  | Boot simulator + start Safari        |
| `ios_close`             | `{}`                                                   | Shutdown simulator + cleanup         |
| `ios_navigate`          | `{ url: string }`                                      | Navigate Safari to URL               |
| `ios_snapshot`          | `{ interactive?: bool, cursor?: bool }`                | **Same a11y tree + refs** as desktop |
| `ios_tap`               | `{ ref: string }`                                      | Tap element (touch)                  |
| `ios_fill`              | `{ ref: string, value: string }`                       | Fill input field                     |
| `ios_type`              | `{ ref: string, text: string }`                        | Type with keyboard events            |
| `ios_swipe`             | `{ direction: string, distance?: number }`             | **iOS-native swipe gesture**         |
| `ios_scroll`            | `{ ref?: string, direction: string, amount?: number }` | Scroll via JS                        |
| `ios_screenshot`        | `{ path?: string }`                                    | Capture screenshot (base64 or file)  |
| `ios_get_text`          | `{ ref?: string }`                                     | Get text content                     |
| `ios_get_html`          | `{ ref?: string }`                                     | Get HTML content                     |
| `ios_eval`              | `{ script: string }`                                   | Execute JavaScript in Safari         |
| `ios_back`              | `{}`                                                   | Navigate back                        |
| `ios_forward`           | `{}`                                                   | Navigate forward                     |
| `ios_reload`            | `{}`                                                   | Reload page                          |
| `ios_select`            | `{ ref: string, values: string[] }`                    | Select dropdown                      |
| `ios_check`             | `{ ref: string }` / `ios_uncheck`                      | Toggle checkbox                      |
| `ios_wait_for_selector` | `{ selector: string, timeout?: number }`               | Wait for element                     |
| `ios_console_logs`      | `{}`                                                   | Get captured console logs            |

### Phase 8: Wire iOS MCP Server Into Agent

**File**: `agent-bridge/src/agent/core/agent.ts`

Register `ios-mcp-server` **conditionally** — iOS is opt-in, with process-level `IOSService`:

```typescript
// session-manager.ts — createSession()
// iosService is injected at SessionManager construction (process-level singleton)
if (this.iosService) {
  // Create MCP server that delegates to process-level IOSService
  const iosServer = createIOSMcpServer(this.iosService, sessionId);
  // Pass to OrbitAgent constructor — no async needed in _createOptions()
  agentConfig.mcpServers = { ...agentConfig.mcpServers, 'orbit-ios': iosServer };
  // NOTE: No capability:ios event emitted (addresses audit v3 Recommended #1).
  // iOS availability is discoverable via the MCP tool list — if ios_* tools appear
  // in the agent's tool surface, iOS is available. No separate protocol message needed.
  // This avoids adding a new protocol schema + frontend handler for a one-bit signal.
}
```

The MCP server wraps `iosService.acquire(sessionId)` / `iosService.release(sessionId)` around the actual tool calls, so lease management is transparent to the agent.

**iOS settings persistence** (addresses audit v1 Recommended #5):

No persistent iOS-specific settings in this iteration. Rationale:

- Device selection is per-session (simulator state is ephemeral)
- Appium port is auto-detected (no user config needed)
- Feature flag (`ORBIT_ENABLE_IOS_TOOLS=1`) is the only persistent control
- Future: if users want "last used device" or preferred runtime, add to `crates/common/settings/` as an `ios_preferences` struct

**No frontend changes needed** — iOS tools execute entirely in agent-bridge (Appium is a Node process). Unlike desktop browser tools, there's no roundtrip to the Tauri frontend.

### Phase 9: Dependencies

**File**: `agent-bridge/package.json`

```json
{
  "dependencies": {
    "node-simctl": "^7.4.0", // iOS simulator lifecycle (xcrun simctl wrapper)
    "webdriverio": "^9.15.0" // WebDriver client for Appium
  }
}
```

**External tool prerequisites** (not project dependencies — system-level tools):

These are external CLI tools installed outside the project. They do NOT use the project's Bun workspace:

- Xcode + Command Line Tools: `xcode-select --install`
- Appium (system-level CLI tool): `npm install -g appium` (global install — this is an external tool, not a project dependency; using npm here is correct per Appium's own docs)
- XCUITest driver: `appium driver install xcuitest`

**Note**: `npm install -g` for Appium does NOT conflict with the project's Bun-only policy. Appium is an external test infrastructure tool (like Xcode or Git), not a project workspace dependency. The project's `node-simctl` and `webdriverio` deps in `agent-bridge/package.json` ARE installed via Bun.

---

## Files to Create/Modify

### Desktop Browser (Part A)

| File                                                             | Action     | Description                                                                                |
| ---------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `src-tauri/src/commands/browser/orbit_runtime.js`                | **CREATE** | ~600 line JS runtime (snapshot w/ epoch, WeakRef, shadow DOM, iframes, interactions)       |
| `src-tauri/src/commands/browser/mod.rs`                          | **MODIFY** | Add `initialization_script`, increase size limit to 500KB w/ truncation, add wait commands |
| `src-tauri/src/lib.rs`                                           | **MODIFY** | Register new `browser_wait_*` commands                                                     |
| `agent-bridge/src/browser/browser-mcp-server.ts`                 | **MODIFY** | Add ~22 new tool definitions with `TargetSchema` (dual ref/selector input)                 |
| `agent-bridge/src/browser/browser-tool-bridge.ts`                | **MODIFY** | Add `AsyncQueue` for stateful tool serialization, per-tool timeout config                  |
| `agent-bridge/src/browser/types.ts`                              | **MODIFY** | Add new tool types, `TargetSchema`                                                         |
| `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`    | **MODIFY** | Add ~22 new handler cases, `ensureOrbitRuntime()` with version check                       |
| `apps/agent/src/lib/api/browser.ts`                              | **MODIFY** | Add `browserWaitForSelector` invoke wrapper                                                |
| `agent-bridge/src/__tests__/browser-ref-flow.test.ts`            | **CREATE** | Snapshot → ref → click, selector fallback, dual-input tests                                |
| `agent-bridge/src/__tests__/browser-ref-epoch.test.ts`           | **CREATE** | Stale ref detection, epoch increment on navigation                                         |
| `agent-bridge/src/__tests__/browser-backward-compat.test.ts`     | **CREATE** | All 13 existing tools work with selector-only input                                        |
| `agent-bridge/src/__tests__/browser-snapshot-truncation.test.ts` | **CREATE** | Large DOM truncation, payload size enforcement                                             |
| `agent-bridge/src/__tests__/browser-timeout.test.ts`             | **CREATE** | Per-tool timeout enforcement, error diagnostics                                            |

### iOS Simulator (Part B)

| File                                                       | Action     | Description                                                                                            |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `agent-bridge/src/ios/ios-service.ts`                      | **CREATE** | ~200 lines: process-level singleton, lease-based ownership, shared Appium/simulator                    |
| `agent-bridge/src/ios/ios-manager.ts`                      | **CREATE** | ~600 lines: state machine lifecycle, AbortController, port conflict, cleanup hooks                     |
| `agent-bridge/src/ios/ios-mcp-server.ts`                   | **CREATE** | ~400 lines: MCP tool definitions with per-session lease acquire/release wrapping                       |
| `agent-bridge/src/ios/ios-actions.ts`                      | **CREATE** | ~300 lines: action dispatch (switch on tool name)                                                      |
| `agent-bridge/src/ios/types.ts`                            | **CREATE** | ~100 lines: IOSDevice, IOSRefMap, command types, state enum                                            |
| `agent-bridge/src/ios/index.ts`                            | **CREATE** | Barrel export                                                                                          |
| `agent-bridge/src/index.ts`                                | **MODIFY** | Process-level `IOSService` creation (lazy, gated), async `gracefulShutdown`, dispose in SIGTERM/SIGINT |
| `agent-bridge/src/agent/session/session-manager.ts`        | **MODIFY** | Accept `iosService` in constructor, `release()` in `deleteSession`, add `shutdownAsync()` method       |
| `agent-bridge/src/agent/session/session-mode.ts`           | **MODIFY** | Add iOS tool names to allowed lists                                                                    |
| `agent-bridge/package.json`                                | **MODIFY** | Add `node-simctl`, `webdriverio` deps                                                                  |
| `agent-bridge/src/__tests__/ios-service-lease.test.ts`     | **CREATE** | Lease acquire/release, multi-session sharing, last-release shutdown, concurrent launch                 |
| `agent-bridge/src/__tests__/ios-manager-lifecycle.test.ts` | **CREATE** | State transitions, idempotent close, dispose semantics, abort, port conflict                           |
| `agent-bridge/src/__tests__/ios-platform-gate.test.ts`     | **CREATE** | `canEnableIOS()` false on non-macOS, lazy import gating                                                |
| `agent-bridge/src/__tests__/ios-e2e.test.ts`               | **CREATE** | Local-gated E2E: real simulator lifecycle (auto-skips in CI)                                           |

---

## Implementation Order

### Desktop First (Part A)

1. **`orbit_runtime.js`** — Core JS runtime: snapshot engine with epoch + WeakRef + duplicate disambiguation + shadow DOM/iframe handling. Ref resolution with dual-input (ref/selector) support. All interaction methods. Test in browser DevTools.
2. **Rust `mod.rs`** — Wire `initialization_script`, bump size limit to 500KB with truncation strategy, add wait commands.
3. **`browser-mcp-server.ts`** — Add all new MCP tools with `TargetSchema` (dual ref/selector input). Update existing tools for backward compat.
4. **`browser-tool-bridge.ts`** — Add `AsyncQueue` for stateful tool serialization. Add per-tool timeout configuration.
5. **`browser-tool-handler.ts`** — Add all new handler cases. Add `ensureOrbitRuntime()` with version check and CSP error handling.
6. **`browser.ts` + `lib.rs`** — Invoke wrappers + command registration.
7. **Automated tests** — All desktop browser test files listed in Verification section.
8. **E2E test** — `bunx tauri dev` → snapshot → click via ref → verify selector fallback.

### iOS Simulator (Part B)

9. **`ios-manager.ts`** — Full lifecycle: state machine (`idle`→`launching`→`ready`→`closing`→`disposed`), `AbortController` for cancellable launch, idempotent `close()`, port conflict handling, SIGTERM/SIGINT cleanup hooks.
10. **`ios-mcp-server.ts` + `ios-actions.ts`** — MCP tool definitions + action handlers.
11. **Wire into agent** — Conditional registration with `canEnableIOS()` gate, lazy imports, `dispose()` integration into session deletion path. Process-level cleanup hooks.
12. **`package.json`** — Add deps, rebuild sidecar. **Mandatory build validation**: `bun run build:sidecar` with and without `ORBIT_ENABLE_IOS_TOOLS`.
13. **Automated tests** — All iOS test files listed in Verification section (platform-gated).
14. **E2E test** — Agent uses `ios_launch` → `ios_snapshot` → `ios_tap` → `ios_screenshot` → `ios_close`. Session deletion during active iOS → verify cleanup.

---

## Verification

### Automated Test Suite (addresses audit Critical #5)

The manual verification below is SUPPLEMENTARY. The following automated tests are **mandatory before merge**:

#### Desktop Browser — Automated Tests

| Test File                                                                | Runner     | What it covers                                                                                                                    |
| ------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `agent-bridge/src/__tests__/browser-ref-flow.test.ts`                    | Bun test   | Snapshot → ref assignment → click by ref → verify state change. Selector fallback. Dual-input (`ref` + `selector`) normalization. |
| `agent-bridge/src/__tests__/browser-ref-epoch.test.ts`                   | Bun test   | Stale ref detection after epoch change. Epoch increment on navigation. Error messages for stale refs.                             |
| `agent-bridge/src/__tests__/browser-backward-compat.test.ts`             | Bun test   | All 13 existing browser tools still work with `selector`-only input. No regressions.                                              |
| `agent-bridge/src/__tests__/browser-snapshot-truncation.test.ts`         | Bun test   | Large DOM → truncation at depth limit. Truncation stats in response. Payload under 500KB.                                         |
| `agent-bridge/src/__tests__/browser-timeout.test.ts`                     | Bun test   | Per-tool timeout enforcement. Timeout error includes tool name + elapsed time.                                                    |
| `apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts` | Vitest     | Updated: new tool handler cases, `ensureOrbitRuntime()` version check, CSP error path.                                            |
| `src-tauri/src/commands/browser/tests.rs`                                | Cargo test | `orbit_runtime.js` inclusion. Dual-channel transport (URL path ≤100KB, event path ≤500KB). Wait command serialization.            |

#### iOS Simulator — Automated Tests (local-gated)

| Test File                                                  | Runner   | What it covers                                                                                                                                                                       |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent-bridge/src/__tests__/ios-service-lease.test.ts`     | Bun test | IOSService lease model: acquire/release, multi-session sharing, last-release triggers shutdown, concurrent acquire waits for launch, release during launch.                          |
| `agent-bridge/src/__tests__/ios-manager-lifecycle.test.ts` | Bun test | `launch()` → `close()` → `dispose()` state transitions. Double-close idempotency. Dispose prevents further ops. Abort during launch. Port conflict handling. Appium crash detection. |
| `agent-bridge/src/__tests__/ios-platform-gate.test.ts`     | Bun test | `canEnableIOS()` returns false on non-macOS. Lazy import not triggered. iOS tools return clear error if gate bypassed.                                                               |
| `agent-bridge/src/__tests__/ios-e2e.test.ts`               | Bun test | **Local-gated** (requires macOS + Xcode + Appium). Real simulator: launch → navigate → snapshot → tap → screenshot → close. Multi-session lease sharing. Auto-skips in CI.           |

**Test gating**: iOS E2E tests check `process.platform === 'darwin'` + Appium availability. Skip with clear message on other platforms. Same pattern as existing agent-bridge integration tests.

#### Quality Gates (corrected per audit v2 Critical #3)

All from **repo root** unless otherwise noted:

- `./scripts/lint-all.sh` passes
- `bun run check` passes (typecheck + lint + tests)
- `cd agent-bridge && bun run typecheck` passes
- `cd agent-bridge && bun test` passes
- `cargo clippy` passes
- `bun run build:sidecar` produces valid binary (**root-level** script — NOT `cd agent-bridge && bun run build:sidecar`)
- `ORBIT_ENABLE_IOS_TOOLS=0 bun run build:sidecar` produces valid binary without iOS deps loaded

### Manual Verification (supplementary — not a substitute for automated tests)

#### Desktop Browser

1. Open browser to `https://example.com`, call `browser_snapshot`, verify refs assigned to `<a>` link.
2. Call `browser_click({ ref: "@e1" })`, verify navigation occurs.
3. Call `browser_click({ selector: "a" })` — verify legacy selector path still works.
4. Navigate to a form, `browser_fill` via ref, verify value set with events.
5. `browser_wait_for_selector` with dynamic content, verify it resolves.
6. Use a stale ref (from before navigation) — verify clear error message about epoch mismatch.
7. Full agent loop: "Go to HN and tell me the top 3 stories" → snapshot → refs → get_text.

#### iOS Simulator

8. `ios_device_list` returns available simulators.
9. `ios_launch({ device: "iPhone 16 Pro" })` boots simulator and opens Safari.
10. `ios_navigate({ url: "https://example.com" })` loads page in Safari.
11. `ios_snapshot` returns same format as desktop `browser_snapshot`.
12. `ios_swipe({ direction: "up" })` scrolls the page.
13. `ios_screenshot` returns base64 image.
14. `ios_close` shuts down simulator cleanly.
15. Delete session while iOS is active — verify simulator shuts down, Appium killed, no orphaned processes.

---

---

## Edge Case Handling (from audit v1 + v2 + v3)

All 17 edge cases from all three audits have been addressed:

| Edge Case                                                      | Where Addressed                                         | Handling                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Stale refs after navigation/DOM mutation**                   | Phase 1.1 (ref epoch + scoped invalidation)             | Epoch increments on navigation + snapshot. DOM mutations use lazy validation (WeakRef + isConnected) — no over-invalidation     |
| **Concurrent tool execution with shared ref state**            | Phase 3 (request serialization)                         | `AsyncQueue` serializes stateful tools. Read-only tools run concurrently                                                        |
| **CSP/page constraints block runtime injection**               | Phase 1.2 (injection strategy, CSP handling)            | Catch injection error → diagnostic message. Snapshot degrades to URL+title only                                                 |
| **iframes/shadow DOM**                                         | Phase 1.1 (snapshot engine)                             | Same-origin iframes: recursive walk. Shadow DOM: open roots walked. Cross-origin/closed: marked opaque in output                |
| **Appium already running with incompatible state/version**     | Phase 6.3 (Appium lifecycle)                            | Version check on existing Appium. Match → reuse. Mismatch → throw with both versions                                            |
| **Port 4723 already occupied**                                 | Phase 6.3 (Appium lifecycle)                            | Scan ports 4723–4729. All occupied → throw with PID diagnostics                                                                 |
| **Session deletion during `ios_launch`**                       | Phase 6.2 (IOSManager lifecycle)                        | `AbortController` cancels in-progress launch. Partial resources cleaned up by `close()`                                         |
| **Non-macOS hosts**                                            | Part B (platform gating)                                | `canEnableIOS()` checks `process.platform === 'darwin'`. iOS tools never registered on other platforms                          |
| **Snapshot payload exceeds transport limits**                  | Phase 4 (dual-channel transport)                        | Small payloads use fast URL path. Large payloads use Tauri event channel. Truncation as defense-in-depth                        |
| **Two sessions both using iOS, one closes**                    | IOSService (lease model)                                | `release()` only triggers shutdown when `leaseholders.size === 0`. Session A's close is a no-op while B holds a lease           |
| **App shutdown while async iOS teardown in flight**            | index.ts (async gracefulShutdown)                       | `gracefulShutdown` awaits `iosService.dispose()` then starts grace timer. SIGKILL escalation for hung Appium                    |
| **Snapshot under 500KB but exceeds URL callback limits**       | Phase 4 (dual-channel transport)                        | `SMALL_LIMIT = 100KB` stays on URL path. 100KB–500KB uses Tauri event channel. Never encodes large payloads as URLs             |
| **Dynamic SPAs causing frequent epoch invalidation**           | Phase 1.1 (scoped invalidation)                         | Epoch does NOT increment on DOM mutations. Refs validated lazily via WeakRef + isConnected. Stable between snapshots            |
| **iOS prerequisites disappear mid-session**                    | IOSManager + IOSService                                 | Dead Appium detected on next tool call → clear error → agent decides to retry `ios_launch` or report failure                    |
| **`large=true` URL arrives but event payload dropped/delayed** | Phase 4 (large-result handshake timeout)                | Existing `JS_EVAL_TIMEOUT` covers both channels. Event listener ignores stale evalIds. Timeout → clear transport error          |
| **Session crashes after iOS lease acquire, before release**    | IOSService (`forceRelease`) + session-manager `finally` | `deleteSession` uses `try/finally` to guarantee `forceRelease`. `dispose()` iterates all sessions. `forceRelease` is idempotent |
| **`capability:ios` event with no frontend handler**            | Phase 8 (removed from scope)                            | No `capability:ios` event emitted. iOS availability discoverable via MCP tool list presence                                     |

---

## Nice-to-Haves (from audit — optional enhancements)

| Enhancement                                                          | Benefit                                     | Effort |
| -------------------------------------------------------------------- | ------------------------------------------- | ------ |
| Add `executionTarget: 'desktop' \| 'ios'` metadata in tool responses | Easier debugging in mixed-target sessions   | Low    |
| Add `browser_runtime_info` tool (version + capabilities + epoch)     | Faster triage when runtime injection fails  | Low    |
| Add snapshot size telemetry + truncation stats to tool response      | Prevents silent token/transport regressions | Low    |

---

## What We're NOT Doing (Deferred)

- Pixel screenshots on desktop (requires `WKWebView.takeSnapshot` via objc)
- PDF generation (requires `WKWebView.createPDF` via objc)
- Multi-tab support (architecture change)
- Real iOS device support (requires USB + signing — needs separate setup flow)
- iOS video recording (Appium supports but adds complexity)
- iOS multi-touch gestures (Appium supports but not needed yet)
- iOS network throttling (Appium plugin available)
- Annotated screenshots with pixel capture (DOM overlay works, but pixel capture needs native)
