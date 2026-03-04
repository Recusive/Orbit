# Plan: Wire agent-browser Tools Into Orbit's Embedded Browser + iOS Simulator

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
agent-bridge/src/browser/browser-tool-bridge.ts   ← NO CHANGES (already generic)
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
  _refMap: {}, // { "e1": { role, name, selector, nth? } }

  snapshot(opts) {
    // Reset refs
    this._refCounter = 0;
    this._refMap = {};

    // Walk DOM using TreeWalker
    // For each element:
    //   1. Compute role: element.role || getComputedRole(tagName, attributes)
    //   2. Compute name: aria-label || textContent || placeholder || alt || title
    //   3. If interactive (button, link, input, select, etc.) → assign ref
    //   4. If opts.cursor: also check cursor:pointer, onclick, tabindex
    //   5. Build indented text tree with [ref=eN] markers
    //   6. Store in _refMap for resolution

    // Return: { snapshot: "- button \"Submit\" [ref=e1]\n...", refs: {...} }
  },
};
```

**Role detection** (no Playwright `ariaSnapshot()` — we build our own):

- `<button>` → `button`, `<a href>` → `link`, `<input type="text">` → `textbox`
- `<input type="checkbox">` → `checkbox`, `<select>` → `combobox`, `<textarea>` → `textbox`
- `[role="..."]` → use ARIA role directly
- `<h1>`-`<h6>` → `heading` with `[level=N]`
- Elements with `cursor:pointer` + visible text → `clickable` (pseudo-role)

**Interactive roles filter** (matches agent-browser):
`button, link, textbox, checkbox, radio, combobox, listbox, menuitem, option, searchbox, slider, spinbutton, switch, tab, treeitem`

**Ref resolution**:

```js
resolveRef(refOrSelector) {
  // Parse @e1, ref=e1, e1 → look up in _refMap
  // If found: return element via stored CSS selector
  // If not found: treat as CSS selector, use querySelector
}
```

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

**Injection strategy**: Tauri `initialization_script` (runs on every page load), same as existing `browser_init.js`.

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

Also **update existing tools** to accept refs (backward-compatible — still accepts CSS selectors):

- `browser_click` → `{ ref: string }` (was `selector`)
- `browser_type` → `{ ref: string, text: string, clear?: bool }` (was `selector`)
- `browser_get_text` → `{ ref?: string }` (was `selector`)
- `browser_get_html` → `{ ref?: string }` (was `selector`)

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

**New helper**: `ensureOrbitRuntime()` — checks `window.__orbit`, injects if missing.

### Phase 4: Rust Backend Adjustments

**File**: `src-tauri/src/commands/browser/mod.rs`

1. **Inject orbit_runtime.js** in `browser_create()`:

   ```rust
   .initialization_script(include_str!("orbit_runtime.js"))
   ```

2. **Increase result size limit** from 100KB → 500KB (snapshots of complex pages)

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

  // Lifecycle
  async listDevices(): Promise<IOSDevice[]>; // xcrun simctl list --json
  async launch(deviceNameOrUdid?: string): Promise<void>;
  // 1. Find device (fuzzy match name or exact UDID)
  // 2. Boot simulator if needed (simctl boot)
  // 3. Start Appium server (spawn process, wait for ready)
  // 4. Create WebDriver session (capabilities: Safari + device)
  async close(): Promise<void>;
  // 1. Delete WebDriver session
  // 2. Kill Appium process
  // 3. Shutdown simulator (simctl shutdown)

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
}
```

#### 6.3 Key implementation details

**Device discovery** (via `node-simctl`):

```typescript
import Simctl from 'node-simctl';
const simctl = new Simctl();
const devices = await simctl.getDevices(); // All simulators with state/runtime/UDID
```

**Appium server lifecycle**:

- Spawn: `appium --port 4723 --relaxed-security`
- Wait for stdout line: `"Appium REST http interface listener started"`
- 30-second startup timeout
- Managed as child process — killed on `close()`

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

Register `ios-mcp-server` alongside existing `orbit-browser` MCP server:

```typescript
// In _createOptions() or session creation
const iosServer = createIOSMcpServer(iosManager);
this._mcpServers.set('orbit-ios', iosServer);
```

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

**External prerequisites** (documented, not bundled):

- Xcode + Command Line Tools (`xcode-select --install`)
- Appium: `npm install -g appium`
- XCUITest driver: `appium driver install xcuitest`

---

## Files to Create/Modify

### Desktop Browser (Part A)

| File                                                          | Action     | Description                                                         |
| ------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| `src-tauri/src/commands/browser/orbit_runtime.js`             | **CREATE** | ~500 line JS runtime (snapshot, refs, interactions)                 |
| `src-tauri/src/commands/browser/mod.rs`                       | **MODIFY** | Add `initialization_script`, increase size limit, add wait commands |
| `src-tauri/src/lib.rs`                                        | **MODIFY** | Register new `browser_wait_*` commands                              |
| `agent-bridge/src/browser/browser-mcp-server.ts`              | **MODIFY** | Add ~22 new tool definitions                                        |
| `agent-bridge/src/browser/types.ts`                           | **MODIFY** | Add new tool types                                                  |
| `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts` | **MODIFY** | Add ~22 new handler cases                                           |
| `apps/agent/src/lib/api/browser.ts`                           | **MODIFY** | Add `browserWaitForSelector` invoke wrapper                         |

### iOS Simulator (Part B)

| File                                             | Action     | Description                                                               |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------- |
| `agent-bridge/src/ios/ios-manager.ts`            | **CREATE** | ~600 lines: device mgmt, Appium lifecycle, WebDriver session, all actions |
| `agent-bridge/src/ios/ios-mcp-server.ts`         | **CREATE** | ~400 lines: MCP tool definitions (same pattern as browser server)         |
| `agent-bridge/src/ios/ios-actions.ts`            | **CREATE** | ~300 lines: action dispatch (switch on tool name)                         |
| `agent-bridge/src/ios/types.ts`                  | **CREATE** | ~80 lines: IOSDevice, IOSRefMap, command types                            |
| `agent-bridge/src/ios/index.ts`                  | **CREATE** | Barrel export                                                             |
| `agent-bridge/src/agent/core/agent.ts`           | **MODIFY** | Register iOS MCP server                                                   |
| `agent-bridge/src/agent/session/session-mode.ts` | **MODIFY** | Add iOS tool names to allowed lists                                       |
| `agent-bridge/package.json`                      | **MODIFY** | Add `node-simctl`, `webdriverio` deps                                     |

---

## Implementation Order

### Desktop First (Part A — Days 1-3)

1. **`orbit_runtime.js`** — Core JS runtime: snapshot + refs + click/fill/type/select/check. Test in browser DevTools.
2. **Rust `mod.rs`** — Wire `initialization_script`, bump size limit, add wait commands.
3. **`browser-mcp-server.ts`** — Add all new MCP tools.
4. **`browser-tool-handler.ts`** — Add all new handler cases.
5. **`browser.ts` + `lib.rs`** — Invoke wrappers + command registration.
6. **E2E test** — `bunx tauri dev` → snapshot → click via ref.

### iOS Simulator (Part B — Days 4-6)

7. **`ios-manager.ts`** — Device listing + Appium lifecycle + WebDriver session.
8. **`ios-mcp-server.ts` + `ios-actions.ts`** — MCP tool definitions + action handlers.
9. **Wire into agent** — Register MCP server, add tool names to allowed lists.
10. **`package.json`** — Add deps, rebuild sidecar.
11. **E2E test** — Agent uses `ios_launch` → `ios_snapshot` → `ios_tap` → `ios_screenshot`.

---

## Verification

### Desktop Browser

1. Open browser to `https://example.com`, call `browser_snapshot`, verify refs assigned to `<a>` link.
2. Call `browser_click({ ref: "@e1" })`, verify navigation occurs.
3. Navigate to a form, `browser_fill` via ref, verify value set with events.
4. `browser_wait_for_selector` with dynamic content, verify it resolves.
5. Full agent loop: "Go to HN and tell me the top 3 stories" → snapshot → refs → get_text.

### iOS Simulator

6. `ios_device_list` returns available simulators.
7. `ios_launch({ device: "iPhone 16 Pro" })` boots simulator and opens Safari.
8. `ios_navigate({ url: "https://example.com" })` loads page in Safari.
9. `ios_snapshot` returns same format as desktop `browser_snapshot`.
10. `ios_swipe({ direction: "up" })` scrolls the page.
11. `ios_screenshot` returns base64 image.
12. `ios_close` shuts down simulator cleanly.

### Quality

13. `./scripts/lint-all.sh` passes.
14. `bun run check` passes.
15. `cd agent-bridge && bun run typecheck` passes.
16. `cargo clippy` passes.

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
