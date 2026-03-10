# iOS Simulator Runtime Backend Completion

## Context

The iOS simulator tool surface in the Orbit agent-bridge is fully scaffolded as a dependency-injection shell — 22 MCP tools are registered with Zod schemas, the lease system works, session wiring is complete, and 6 test files pass with mocks. But every runtime call fails with `"IOSManager dependencies are not configured"` because `IOSManager` defaults to placeholder dependencies that reject all calls. This plan completes the real adapter layer so the iOS simulator feature works end-to-end in production.

**Triggered by:** All 5 `IOSManagerDependencies` functions are stubs. No real simctl, Appium, or WebDriver integration exists.

**Intended outcome:** An Orbit user on macOS with Xcode + Appium can use `ios_launch`, navigate to a page, take snapshots with refs, interact via tap/fill/type, take screenshots, and close the simulator — all via the agent's MCP tools.

---

## Current-State Audit

### DONE (do not re-implement)

| File                                                | Status                     | What it does                                                                                        |
| --------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `agent-bridge/src/ios/types.ts`                     | Complete (260 lines)       | All interfaces: `IOSManagerDependencies`, `IOSAutomationSession`, `IOSAppiumProcess`, 22 tool names |
| `agent-bridge/src/ios/ios-service.ts`               | Complete (307 lines)       | Lease manager with state machine, acquire/release, Appium crash recovery                            |
| `agent-bridge/src/ios/ios-manager.ts`               | Complete shell (447 lines) | Lifecycle manager with DI placeholder. Device finding, abort signals, SIGTERM→SIGKILL               |
| `agent-bridge/src/ios/ios-actions.ts`               | Complete (197 lines)       | Exhaustive switch dispatcher for all 22 tools                                                       |
| `agent-bridge/src/ios/ios-mcp-server.ts`            | Complete (338 lines)       | MCP server with Zod schemas, registered as `orbit-ios`                                              |
| `agent-bridge/src/index.ts`                         | Complete                   | Dynamic import of IOSService, passed to SessionManager, dispose on shutdown                         |
| `agent-bridge/src/agent/session/session-manager.ts` | Complete                   | Conditional `orbit-ios` MCP registration, `forceRelease` on session delete                          |
| `agent-bridge/src/agent/core/agent.ts`              | Complete                   | iOS system prompt appended when `orbit-ios` MCP server exists                                       |
| 6 test files                                        | All passing                | Platform gate, manager lifecycle, service lease, MCP server, session wiring, E2E skeleton           |

### MISSING (the actual work)

1. **simctl adapter** — Real `listDevices`, `bootDevice`, `shutdownDevice` via `xcrun simctl`
2. **Appium process manager** — Real `startAppium` returning `IOSAppiumProcess` with port/pid/onExit/terminate/waitForExit
3. **WebDriver client** — Lightweight W3C WebDriver HTTP client (no npm dependencies, uses `fetch`)
4. **Automation session** — Real `IOSAutomationSession` (18 methods) using WebDriver client + injected `orbit_runtime.js`
5. **Dependency wiring** — Factory function + integration into `IOSManager` default constructor
6. **XCUITest driver check** — Add `appium driver list --installed | grep xcuitest` to `canEnableIOS()`

### Root Cause

`ios-manager.ts:48-68` — `createUnconfiguredDependencies()` returns functions that reject with `"IOSManager dependencies are not configured"`. `IOSService` creates `new IOSManager()` (line 95 of `ios-service.ts`) without injecting real dependencies.

---

## Architecture Decisions

### 1. Raw HTTP to Appium's W3C WebDriver endpoints (no new npm deps)

**Justification:** The W3C WebDriver protocol is a simple REST API (~15 endpoints). Bun has built-in `fetch`. Adding `webdriverio` would bring 50+ transitive deps and bloat the sidecar binary. A lightweight typed client wrapping `fetch` is ~200 lines and fully sufficient.

**Zero new `package.json` dependencies.**

### 2. simctl via `child_process.execFile`

The only viable approach. `canEnableIOS()` already validates `xcrun simctl` availability. JSON output from `simctl list devices -j` provides structured device data. Pattern matches existing `execFile` usage in `ios-service.ts`.

### 3. Snapshot parity via `orbit_runtime.js` injection

**Justification:** The desktop browser snapshot engine (`src-tauri/src/commands/browser/orbit_runtime.js`, 1552 lines) already produces the `SnapshotResponse` shape. It handles ref generation, epoch tracking, tree walking, truncation, console capture, and all action methods (click, fill, type, select, check, uncheck, scroll, etc.).

Inject via Appium's `executeScript`. Re-inject after each navigation. All iOS tool methods call `window.__orbit.methodName(...)` — exact parity with desktop browser, agent's learned workflow transfers directly.

Alternative (XCUITest accessibility tree) rejected: incompatible output shape, no CSS selector support, requires separate parser.

### 4. Dynamic port allocation

Find a free port via `Bun.listen({ port: 0 })`, record port, close socket, start Appium with `--port <N>`. Retry up to 3 times on collision. Avoids conflicts when multiple Orbit instances run simultaneously.

### 5. WebView context switching

After Appium creates a session with Safari, the default context is `NATIVE_APP`. Must switch to `WEBVIEW_*` to execute JavaScript. Poll `GET /session/{id}/contexts` and select the first `WEBVIEW_*` context.

---

## Goals / Non-Goals

### Goals

- Wire real simctl/Appium/WebDriver implementations into `IOSManagerDependencies`
- All 22 iOS MCP tools work live on macOS with Xcode + Appium
- Snapshot parity with desktop browser (same `orbit_runtime.js` engine)
- Crash recovery when Appium exits unexpectedly (leverages existing `IOSService` state machine)
- XCUITest driver check in platform gate
- Setup documentation for Appium prerequisites
- Zero new npm dependencies

### Non-Goals

- Windows/Linux support (iOS Simulator is macOS-only)
- Physical device support (simulator only)
- Native app testing (Safari only)
- Auto-installing Appium or XCUITest driver
- Rust/Tauri backend changes (everything is in the TS sidecar)

---

## Prerequisite Setup (Appium is NOT installed)

```bash
# Install Appium 2.x globally
npm install -g appium

# Install XCUITest driver
appium driver install xcuitest

# Verify installation
appium --version          # Should show 2.x
appium driver list --installed  # Should show xcuitest

# Xcode + simulators (already installed on this machine)
xcrun simctl list devices available
```

---

## Phased Implementation

### Phase 1: simctl Adapter

**Create:** `agent-bridge/src/ios/adapters/simctl.ts`

Three functions wrapping `xcrun simctl` via `execFile`:

| Function                           | Shell command                  | Notes                                                                                                  |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `simctlListDevices(signal)`        | `xcrun simctl list devices -j` | Parse JSON, flatten runtimes, map to `IOSDevice` interface                                             |
| `simctlBootDevice(device, signal)` | `xcrun simctl boot <udid>`     | Ignore exit code 149 (already booted). Then `xcrun simctl openurl <udid> about:blank` to launch Safari |
| `simctlShutdownDevice(device)`     | `xcrun simctl shutdown <udid>` | Best-effort, errors logged and swallowed                                                               |

**Key details:**

- JSON output shape from simctl: `{ devices: { "com.apple.CoreSimulator.SimRuntime.iOS-26-0": Device[] } }` — flatten all runtime arrays
- Map `deviceTypeIdentifier` to readable names, pass through `name`, `udid`, `state`, `isAvailable`
- Extract runtime version from key (e.g. `iOS-26-0` → `iOS 26.0`)
- All operations check `signal.aborted` before each child process call
- Attach abort listener to kill spawned child processes

**AC:**

- `listDevices` returns array matching `IOSDevice` interface
- `bootDevice` is idempotent (already-booted devices don't error)
- `shutdownDevice` is best-effort
- AbortSignal cancellation terminates child processes

### Phase 2: Appium Process Manager

**Create:** `agent-bridge/src/ios/adapters/appium-process.ts`

`startAppiumProcess(signal)` function + `AppiumProcessImpl` class implementing `IOSAppiumProcess`:

**Startup sequence:**

1. Find free port: `Bun.listen({ port: 0 })` → record port → close
2. Spawn: `appium --port <port> --base-path /wd/hub --relaxed-security --log-level warn`
3. Health poll: `GET http://localhost:<port>/wd/hub/status` every 500ms for up to 30s
4. Return `AppiumProcessImpl` wrapping the `ChildProcess`

**`AppiumProcessImpl` implements:**

- `port`: assigned port number
- `pid`: `process.pid`
- `onExit(callback)`: attach to child `exit` event, return unsubscribe function
- `terminate(signal)`: `process.kill(signal)` wrapped in Promise
- `waitForExit(timeoutMs)`: Promise resolving with exit code or `null` on timeout

**Port collision handling:** If port is taken between discovery and Appium start, retry up to 3 times.

**AC:**

- Appium starts and is accessible on assigned port
- Health check confirms readiness before returning
- `terminate('SIGTERM')` gracefully stops Appium
- `onExit` callback fires when process exits
- AbortSignal stops startup sequence

### Phase 3: WebDriver Client

**Create:** `agent-bridge/src/ios/adapters/webdriver-client.ts`

Lightweight typed client for W3C WebDriver protocol using `fetch()`. All methods target `http://localhost:<port>/wd/hub/session/<sessionId>/...`.

**Core methods:**

| Method                                          | HTTP   | Endpoint                            |
| ----------------------------------------------- | ------ | ----------------------------------- |
| `createSession(capabilities, port, signal)`     | POST   | `/wd/hub/session`                   |
| `deleteSession(sessionId, port)`                | DELETE | `/wd/hub/session/{id}`              |
| `navigateTo(sessionId, port, url)`              | POST   | `/wd/hub/session/{id}/url`          |
| `back(sessionId, port)`                         | POST   | `/wd/hub/session/{id}/back`         |
| `forward(sessionId, port)`                      | POST   | `/wd/hub/session/{id}/forward`      |
| `refresh(sessionId, port)`                      | POST   | `/wd/hub/session/{id}/refresh`      |
| `executeScript(sessionId, port, script, args?)` | POST   | `/wd/hub/session/{id}/execute/sync` |
| `takeScreenshot(sessionId, port)`               | GET    | `/wd/hub/session/{id}/screenshot`   |
| `getContexts(sessionId, port)`                  | GET    | `/wd/hub/session/{id}/contexts`     |
| `setContext(sessionId, port, contextName)`      | POST   | `/wd/hub/session/{id}/context`      |
| `performActions(sessionId, port, actions)`      | POST   | `/wd/hub/session/{id}/actions`      |

**Session capabilities for iOS Safari:**

```json
{
  "capabilities": {
    "alwaysMatch": {
      "platformName": "iOS",
      "appium:automationName": "XCUITest",
      "browserName": "Safari",
      "appium:udid": "<device-udid>",
      "appium:webviewConnectTimeout": 30000,
      "appium:newCommandTimeout": 300,
      "appium:includeSafariInWebviews": true,
      "appium:fullReset": false,
      "appium:noReset": true
    }
  }
}
```

**Error handling:** W3C errors have shape `{ value: { error, message, stacktrace } }`. Throw structured errors with WebDriver error type + message.

**Request timeout:** 30s default, configurable per-call.

**AC:**

- All endpoints correctly mapped
- Errors include WebDriver error type and message
- Timeouts respected
- Session creation returns valid session ID

### Phase 4: Automation Session

**Create:** `agent-bridge/src/ios/adapters/automation-session.ts`
**Create:** `agent-bridge/src/ios/adapters/orbit-runtime-source.ts`

The largest piece. `IOSAutomationSessionImpl` implements all 18 methods of `IOSAutomationSession`.

#### orbit_runtime.js injection strategy

`orbit-runtime-source.ts` exports the runtime source as a string constant, generated at build time from `src-tauri/src/commands/browser/orbit_runtime.js`.

The session tracks injection state. Lazy-inject on first method needing it. Re-inject after every navigation (new page context destroys `window.__orbit`).

After injection, switch to `WEBVIEW_*` context (poll `getContexts`, select first `WEBVIEW_*`).

#### Method mapping

| IOSAutomationSession method            | Implementation                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `deleteSession()`                      | `webdriver.deleteSession()`                                                                                                     |
| `navigate(url)`                        | `webdriver.navigateTo()` → re-inject runtime                                                                                    |
| `back()`                               | `webdriver.back()` → re-inject runtime                                                                                          |
| `forward()`                            | `webdriver.forward()` → re-inject runtime                                                                                       |
| `reload()`                             | `webdriver.refresh()` → re-inject runtime                                                                                       |
| `snapshot(options)`                    | Ensure runtime → `executeScript('return window.__orbit.snapshot(arguments[0])', [options])`                                     |
| `getText(target)`                      | Ensure runtime → `executeScript('return window.__orbit.getText(arguments[0])', [target])` → return `.text`                      |
| `getHtml(target, outer)`               | Ensure runtime → `executeScript('return window.__orbit.getHtml(arguments[0], arguments[1])', [target, outer])` → return `.html` |
| `screenshot()`                         | `webdriver.takeScreenshot()` → return `{ image: base64, format: 'png' }`                                                        |
| `tap(target)`                          | Ensure runtime → `executeScript('return window.__orbit.click(arguments[0])', [target])`                                         |
| `fill(target, value)`                  | Ensure runtime → `executeScript('return window.__orbit.fill(arguments[0], arguments[1])', [target, value])`                     |
| `type(target, text)`                   | Ensure runtime → `executeScript('return window.__orbit.type(arguments[0], arguments[1])', [target, text])`                      |
| `select(target, values)`               | Ensure runtime → `executeScript('return window.__orbit.select(arguments[0], arguments[1])', [target, values])`                  |
| `check(target)`                        | Ensure runtime → `executeScript('return window.__orbit.check(arguments[0])', [target])`                                         |
| `uncheck(target)`                      | Ensure runtime → `executeScript('return window.__orbit.uncheck(arguments[0])', [target])`                                       |
| `swipe(dir, target?, dur?)`            | W3C Actions API (native touch gesture, see below)                                                                               |
| `scroll(direction, amount?)`           | Ensure runtime → `executeScript('return window.__orbit.scroll(null, arguments[0], arguments[1])', [dir, amount])`               |
| `evaluate(script)`                     | `executeScript('return (function(){ ' + script + ' })()')`                                                                      |
| `waitForSelector(sel, state, timeout)` | Polling loop every 200ms using `executeScript` (see below)                                                                      |
| `consoleLogs(level?)`                  | Ensure runtime → `executeScript('return window.__orbit.getConsoleLogs(arguments[0])', [level])` → return `.logs`                |

#### Swipe (native touch gestures via W3C Actions)

Swipe requires native touch actions, not JavaScript:

```json
{
  "actions": [{
    "type": "pointer",
    "id": "finger1",
    "parameters": { "pointerType": "touch" },
    "actions": [
      { "type": "pointerMove", "duration": 0, "x": startX, "y": startY },
      { "type": "pointerDown", "button": 0 },
      { "type": "pointerMove", "duration": durationMs, "x": endX, "y": endY },
      { "type": "pointerUp", "button": 0 }
    ]
  }]
}
```

Direction → coordinate delta (center ± 200px). If target provided, resolve bounding box via `window.__orbit.boundingBox(target)` and use center as start point.

Must switch back to `NATIVE_APP` context for touch actions, then back to `WEBVIEW_*` after.

#### waitForSelector (polling loop)

```
startTime = Date.now()
while (Date.now() - startTime < timeout):
  result = executeScript(checkScript)
  if matches(result, state): return { matched: true }
  await Bun.sleep(200)
throw Error('Timeout waiting for selector')
```

State checks via `window.__orbit`:

- `visible`: element exists AND `window.__orbit.isVisible({selector})` returns true
- `hidden`: element doesn't exist OR is not visible
- `attached`: element exists in DOM
- `detached`: element doesn't exist in DOM

**AC:**

- All 18 methods produce correct results
- Runtime re-injected after navigation
- Snapshot returns same `SnapshotResponse` shape as desktop browser
- Refs from snapshot work for subsequent tap/fill/type
- Swipe uses native touch actions with context switching
- waitForSelector respects timeout
- Console logs captured via injected runtime

### Phase 5: Dependency Wiring + Platform Gate Enhancement

**Create:** `agent-bridge/src/ios/adapters/dependencies.ts`

Factory function assembling all adapters:

```typescript
export function createRealDependencies(): IOSManagerDependencies {
  return {
    listDevices: simctlListDevices,
    bootDevice: simctlBootDevice,
    shutdownDevice: simctlShutdownDevice,
    startAppium: startAppiumProcess,
    createAutomationSession: createRealAutomationSession,
  };
}
```

**Create:** `agent-bridge/src/ios/adapters/index.ts` — barrel exports

**Modify:** `agent-bridge/src/ios/ios-manager.ts`

- Change `createUnconfiguredDependencies()` default to `createRealDependencies()` import
- Move `createUnconfiguredDependencies()` to test helper (or keep as fallback with lazy import)

**Modify:** `agent-bridge/src/ios/ios-service.ts`

- Add XCUITest driver check to `canEnableIOS()`:
  ```typescript
  await runExecFile('appium', ['driver', 'list', '--installed'], { timeout: IOS_CHECK_TIMEOUT_MS });
  // parse output to verify xcuitest is listed
  ```

**Modify:** `agent-bridge/src/ios/index.ts` — add barrel exports for adapters

**AC:**

- `new IOSManager()` without options uses real adapters
- Existing tests passing `{ dependencies: fakeDeps }` continue working unchanged
- `canEnableIOS()` returns false when XCUITest driver is missing

### Phase 6: Build-Time Runtime Embedding

**Create:** `agent-bridge/scripts/embed-runtime.sh`

Script that reads `orbit_runtime.js` and generates a TS file:

```bash
#!/bin/bash
SOURCE="../src-tauri/src/commands/browser/orbit_runtime.js"
TARGET="src/ios/adapters/orbit-runtime-source.ts"
echo "// Auto-generated — do not edit manually" > "$TARGET"
echo "// Source: src-tauri/src/commands/browser/orbit_runtime.js" >> "$TARGET"
echo "export const ORBIT_RUNTIME_SOURCE = $(node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('$SOURCE','utf8')))");" >> "$TARGET"
```

**Modify:** `agent-bridge/package.json`

- Add `"pregenerate": "bash scripts/embed-runtime.sh"` or integrate into existing build scripts
- No new dependencies

**AC:**

- `orbit-runtime-source.ts` contains the full runtime as a string
- Build succeeds with embedded runtime
- Runtime source stays in sync with `orbit_runtime.js`

---

## File-by-File Change List

### New Files (8)

| File                                                    | Purpose                            | ~Lines         |
| ------------------------------------------------------- | ---------------------------------- | -------------- |
| `agent-bridge/src/ios/adapters/simctl.ts`               | xcrun simctl wrapper               | ~120           |
| `agent-bridge/src/ios/adapters/appium-process.ts`       | Appium process lifecycle           | ~150           |
| `agent-bridge/src/ios/adapters/webdriver-client.ts`     | W3C WebDriver HTTP client          | ~200           |
| `agent-bridge/src/ios/adapters/automation-session.ts`   | IOSAutomationSession impl          | ~350           |
| `agent-bridge/src/ios/adapters/orbit-runtime-source.ts` | Embedded orbit_runtime.js          | ~1 (generated) |
| `agent-bridge/src/ios/adapters/dependencies.ts`         | Factory wiring all adapters        | ~30            |
| `agent-bridge/src/ios/adapters/index.ts`                | Barrel exports                     | ~10            |
| `agent-bridge/scripts/embed-runtime.sh`                 | Build script for runtime embedding | ~15            |

### Modified Files (3)

| File                                  | Change                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `agent-bridge/src/ios/ios-manager.ts` | Replace `createUnconfiguredDependencies()` default with `createRealDependencies()` lazy import |
| `agent-bridge/src/ios/ios-service.ts` | Add XCUITest driver check to `canEnableIOS()`                                                  |
| `agent-bridge/package.json`           | Add runtime embedding to build scripts                                                         |

### Unchanged (verified)

| File                 | Why no changes needed                             |
| -------------------- | ------------------------------------------------- |
| `ios-actions.ts`     | Complete dispatcher, routes to IOSManager methods |
| `ios-mcp-server.ts`  | Complete MCP registration with Zod schemas        |
| `types.ts`           | All interfaces already defined                    |
| `index.ts` (entry)   | Already creates IOSService conditionally          |
| `session-manager.ts` | Already wires iOS MCP server + cleanup            |
| `agent.ts`           | Already appends iOS system prompt                 |
| All 6 test files     | Continue passing with mock dependencies           |

---

## Test Strategy

### Existing Tests (keep as-is, must still pass)

All 6 existing test files use mock/fake dependencies and validate the shell layer. Zero modifications needed.

### New Integration Tests (4 files)

| Test File                        | What it tests                                                                            | Auto-skip condition        |
| -------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| `ios-simctl-adapter.test.ts`     | `simctlListDevices` returns parseable list, `boot`/`shutdown` lifecycle, AbortSignal     | Non-macOS or missing Xcode |
| `ios-appium-lifecycle.test.ts`   | `startAppiumProcess` on dynamic port, health check, terminate, onExit                    | `which appium` fails       |
| `ios-webdriver-client.test.ts`   | Session create/delete, navigate, executeScript, screenshot, error handling               | Missing Appium             |
| `ios-automation-session.test.ts` | Full lifecycle: boot → Appium → session → navigate → snapshot → tap → screenshot → close | Missing Appium + Xcode     |

### Existing E2E Test

`agent-bridge/src/__tests__/ios-e2e.test.ts` — already written, will pass once real dependencies are wired. No modifications needed.

### Validation Commands

```bash
# Unit tests (mock-based, always pass)
cd agent-bridge && bun test ios-service-lease ios-manager-lifecycle ios-platform-gate ios-mcp-server ios-session-wiring

# Integration tests (require macOS + Xcode + Appium)
cd agent-bridge && bun test ios-simctl-adapter ios-appium-lifecycle ios-webdriver-client ios-automation-session

# Full E2E
cd agent-bridge && ORBIT_ENABLE_IOS_TOOLS=1 bun test ios-e2e

# Build verification
cd agent-bridge && bun run typecheck && bun run build:dev

# Live verification
ORBIT_ENABLE_IOS_TOOLS=1 bunx tauri dev
# Then in agent: ios_launch → ios_navigate → ios_snapshot → ios_tap → ios_screenshot → ios_close
```

---

## Crash Recovery Flows

All leveraged by existing `IOSService` state machine — no new crash handling code needed.

| Scenario                      | What happens                                                                                                           | Recovery                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Appium crash**              | `onExit` fires → `appiumExitCode` set → next `assertUsable()` throws → `IOSService.handleAppiumCrash()` → `shutdown()` | Agent receives error, calls `ios_launch` to restart         |
| **Simulator crash**           | WebDriver calls fail with connection errors → propagate as tool errors                                                 | Agent calls `ios_close` then `ios_launch`                   |
| **Stale WebDriver session**   | HTTP errors from WebDriver → descriptive error thrown                                                                  | Agent calls `ios_close` + `ios_launch`                      |
| **Runtime injection failure** | `executeScript` throws → error propagated to agent                                                                     | For `screenshot()`, fallback to WebDriver native screenshot |

---

## Risks and Mitigations

| Risk                                               | Severity | Mitigation                                                           |
| -------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| Appium 2.x API changes                             | High     | Pin minimum version in docs. Test against Appium 2.x latest.         |
| Safari WebView context name varies                 | Medium   | Poll `getContexts()`, find first `WEBVIEW_*` match. Don't hardcode.  |
| `orbit_runtime.js` out of sync after edit          | Medium   | Build-time embedding script ensures latest copy. CI can verify hash. |
| Port collision on Appium start                     | Low      | Retry up to 3 times with new dynamic ports.                          |
| iOS simulator boot timeout                         | Medium   | 60-second timeout with 2s polling. Clear error on timeout.           |
| XCUITest driver not installed                      | High     | New `canEnableIOS()` check catches this early.                       |
| Context switching for swipe (NATIVE_APP ↔ WEBVIEW) | Medium   | Explicit context switch before/after touch actions.                  |
| `window.name` persistence differs on iOS Safari    | Low      | Runtime's localStorage fallback covers this. Verify in testing.      |

---

## Release Readiness Checklist

- [ ] Appium 2.x + XCUITest driver installed
- [ ] All 6 existing mock tests pass (regression)
- [ ] New simctl adapter tests pass on macOS
- [ ] New Appium lifecycle tests pass
- [ ] New WebDriver client tests pass
- [ ] New automation session tests pass E2E
- [ ] Existing `ios-e2e.test.ts` live test passes
- [ ] `bun run typecheck` passes (agent-bridge)
- [ ] Sidecar builds: `bun run build:dev`
- [ ] `ORBIT_ENABLE_IOS_TOOLS=1 bunx tauri dev` starts without errors
- [ ] Agent can `ios_device_list` and see simulators
- [ ] Agent can `ios_launch` → real simulator boots
- [ ] Agent can `ios_navigate` to example.com
- [ ] Agent can `ios_snapshot` → refs returned
- [ ] Agent can `ios_tap` with ref → element clicked
- [ ] Agent can `ios_fill` → input populated
- [ ] Agent can `ios_screenshot` → base64 PNG returned
- [ ] Agent can `ios_console_logs` → logs captured
- [ ] Agent can `ios_close` → simulator shuts down
- [ ] `orbit_runtime.js` auto-embedded at build time
- [ ] Zero new npm/bun dependencies in `package.json`
- [ ] Setup docs written for Appium prerequisites

---

## Open Questions

1. **`appium:safariInitialUrl`** — Should we use `about:blank` as initial URL to ensure clean slate? Recommend yes.
2. **Multiple Safari tabs** — If user navigates multiple times, does Appium open new tabs or reuse? Test and handle via `safariOpenLinksInBackground: false` capability if needed.
3. **iOS 26 compatibility** — The machine has iOS 26.0 simulators (Xcode 26 beta). Verify Appium XCUITest driver supports this runtime version. May need latest driver.
