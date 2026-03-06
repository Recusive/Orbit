# Spec: Agent-Browser Tools + iOS Simulator Integration

> **Companion plan**: `docs/plans/agent-browser-integration.md`
>
> **Status**: Revised (post-audit pass 6 --- see `reviews/audit-spec.md`)
> **Date**: 2026-03-05
> **Scope**: Part A (Desktop Browser Enhancement) + Part B (iOS Simulator Support)
>
> **Plan sync notice**: The companion plan was updated in pass 3 to add `browser_get_url`, `browser_get_title`, `browser_runtime_info` to Phase 2 (~25 new tools, 13 → 38 total), and to correct the screenshot deferral (only annotated overlays are deferred, not basic `browser_screenshot`). It was further updated on 2026-03-06 by `docs/plans/browser-csp-safe-transport.md` to move runtime calls onto a CSP-safe transport, add dedicated URL/title commands, and keep `browser_eval` on the legacy path for backward compatibility. **The spec is the source of truth for behavior.**

---

## 1. Problem Statement

### What's broken

Orbit's embedded browser has 13 MCP tools that use raw CSS selectors (`document.querySelector`) to target elements. This approach is **fundamentally unreliable for AI-driven automation** because:

1. **The AI has no semantic map of the page.** It must guess CSS selectors from raw HTML, which is brittle (classes change, IDs are dynamic, deeply nested structures produce fragile paths).
2. **No disambiguation.** If a page has three "Submit" buttons, the AI has no way to distinguish them without inspecting surrounding context and constructing complex selectors.
3. **No stale detection.** After navigation or DOM mutation, previously valid selectors may match different elements or nothing at all --- silently producing wrong results.
4. **No mobile testing.** There is no way to test web applications in iOS Safari, which has distinct rendering, touch behavior, and viewport constraints.

### Why it matters

Browser automation is a core differentiator for Orbit. Competing tools (Cursor, Windsurf) don't offer embedded browser control. But the current implementation only works for trivial cases --- the AI frequently fails on real-world pages with dynamic content, SPAs, and complex forms. This makes the feature feel unreliable and undermines user trust.

### What success looks like

An AI agent that can reliably navigate, inspect, and interact with any web page by working from an accessibility snapshot (semantic tree with stable refs) rather than guessing CSS selectors. The same capability extends to iOS Safari in the simulator for mobile testing.

---

## 2. Users and Use Cases

### Primary users

| User                                             | Context                                                            | Current pain                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Developer using Orbit's AI agent**             | Asks agent to "fill out this form" or "check if the deploy worked" | Agent picks wrong element, fills wrong field, or can't find the button |
| **Frontend developer testing responsive design** | Wants to verify layout in iOS Safari                               | Must manually open Simulator, navigate, inspect --- no AI assistance   |
| **QA-adjacent developer**                        | Uses AI to automate repetitive browser checks                      | CSS selector approach breaks across deploys; no mobile coverage        |

### Use cases

#### UC-1: Snapshot-driven page interaction (Desktop)

> "Go to our staging site and click the 'Deploy to Production' button"

1. Agent calls `browser_navigate` to load the URL
2. Agent calls `browser_snapshot` --- receives a semantic tree with `[ref=e1]` handles on every interactive element
3. Agent identifies the correct button from the tree (role: button, name: "Deploy to Production", ref: e5)
4. Agent calls `browser_click({ ref: "e5" })` --- clicks the correct element, even if there are other buttons on the page
5. Agent calls `browser_snapshot` again to verify the result

**Key property**: The agent never guesses a CSS selector. It reads the semantic tree and acts on stable refs.

#### UC-2: Form filling with disambiguation

> "Fill out the registration form with test data"

1. Agent snapshots the page, sees multiple `textbox` elements with labels (name, email, password)
2. Agent maps each field by its accessible name and fills them in order via `browser_fill({ ref: "e3", value: "test@example.com" })`
3. If two fields have the same label (e.g., "Password" and "Confirm Password"), they appear with `[nth=1]` and `[nth=2]` in the snapshot --- agent distinguishes them

**Key property**: Duplicate elements are disambiguated automatically. The agent doesn't need to construct complex `nth-child` selectors.

#### UC-3: Stale ref recovery

> Agent clicks a link, page navigates, then tries to click a ref from the old page

1. Agent has refs from a snapshot of Page A
2. Agent clicks a link, navigating to Page B
3. Agent attempts `browser_click({ ref: "e2" })` using a ref from Page A
4. System returns error: `"Ref is stale (epoch 3, current 4). Call browser_snapshot again."`
5. Agent calls `browser_snapshot`, gets fresh refs, continues

**Key property**: Stale refs fail loudly with actionable instructions, not silently with wrong-element clicks.

#### UC-4: Legacy selector fallback

> Existing prompts or workflows that use CSS selectors continue to work

1. Agent calls `browser_click({ selector: "button.submit" })` (no ref)
2. System resolves via `document.querySelector` as before
3. Works identically to pre-upgrade behavior

**Key property**: Zero breaking changes to existing tool invocations, with one deliberate exception: `browser_type` changes from replace semantics to append semantics (the old behavior moves to `browser_fill`). See Section 3.4.

#### UC-5: iOS Simulator mobile testing

> "Check if our landing page renders correctly on iPhone 16 Pro"

1. Agent calls `ios_launch({ device: "iPhone 16 Pro" })` --- boots simulator, starts Safari, connects via Appium
2. Agent calls `ios_navigate({ url: "https://staging.example.com" })`
3. Agent calls `ios_snapshot` --- gets the same accessibility tree format as desktop
4. Agent calls `ios_screenshot` --- captures the mobile viewport
5. Agent analyzes the layout and reports findings
6. Agent calls `ios_close` --- shuts down cleanly

**Key property**: Same snapshot format, same ref system, different execution target. The agent's mental model doesn't change between desktop and mobile.

#### UC-6: Cross-device comparison

> "Compare how the form looks on desktop vs iPhone"

1. Agent snapshots the desktop browser (embedded WKWebView)
2. Agent launches iOS Simulator and snapshots the same page
3. Agent compares the two trees --- notes missing elements, layout differences, viewport issues
4. Agent takes screenshots of both and reports

**Key property**: Unified tool interface means the agent can reason across targets without learning two different systems.

#### UC-7: iOS touch interactions

> "Test the swipe-to-delete gesture on our todo app"

1. Agent navigates to the app in iOS Safari
2. Agent snapshots, identifies a todo item
3. Agent calls `ios_swipe({ direction: "left" })` over the item
4. Agent snapshots again to verify the delete button appeared
5. Agent taps the delete button

**Key property**: iOS-native touch gestures (swipe, long-press) that don't exist on desktop are available as first-class tools.

#### UC-8: Multi-session iOS sharing

> Two chat sessions both want to use iOS Simulator

1. Session A calls `ios_launch` --- simulator boots, session A holds a lease
2. Session B calls `ios_navigate` --- Session B acquires a lease, shares the running simulator
3. Session A finishes and is deleted --- Session A's lease is released, but simulator stays running (Session B still active)
4. Session B finishes --- last lease released, simulator shuts down

**Key property**: One simulator, shared safely. No session can kill another's workspace.

---

## 3. Expected Behavior

### 3.1 Accessibility Snapshot

The snapshot is the core primitive. Everything else builds on it.

**Input**: `browser_snapshot({ interactive?: boolean, cursor?: boolean, compact?: boolean })`

- `interactive` (default: `true`): When `true`, only elements with interactive roles (button, link, textbox, etc.) receive refs. When `false`, ALL elements in the tree receive refs, including static text containers, headings, and landmarks. Useful for debugging layout issues where the agent needs to target non-interactive elements.
- `cursor` (default: `false`): When `true`, also assigns refs to elements with `cursor: pointer`, `onclick`, or positive `tabindex` that would not otherwise qualify as interactive.
- `compact` (default: `false`): When `true`, omits non-interactive elements entirely — only ref-bearing nodes appear in output.

**Output**: An indented text tree representing the page's accessibility structure, with `[ref=eN]` handles on interactive elements.

```
- navigation "Main"
  - link "Home" [ref=e1]
  - link "Products" [ref=e2]
  - link "About" [ref=e3]
- main
  - heading "Welcome" [level=1]
  - paragraph "Get started with our product..."
  - form "Sign Up"
    - textbox "Email" [ref=e4]
    - textbox "Password" [ref=e5]
    - button "Create Account" [ref=e6]
  - region "Featured"
    - link "Learn More" [ref=e7]
    - link "Learn More" [ref=e8] [nth=2]
- footer
  - link "Privacy" [ref=e9]
  - link "Terms" [ref=e10]
```

**Behavioral requirements**:

| Requirement               | Expected behavior                                                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ref assignment            | Every interactive element (button, link, textbox, checkbox, radio, combobox, select, tab, menuitem, etc.) gets a unique `[ref=eN]`                                                                                                                       |
| Ref uniqueness            | No two elements share a ref within the same epoch                                                                                                                                                                                                        |
| Duplicate disambiguation  | Elements with identical role + accessible name get `[nth=N]` suffix (see "Learn More" links above)                                                                                                                                                       |
| Non-interactive elements  | Rendered in tree for context (headings, paragraphs, landmarks) but WITHOUT refs by default (when `interactive: true`)                                                                                                                                    |
| `interactive: false` mode | ALL elements receive refs, including non-interactive ones (headings, paragraphs, landmarks). Useful for debugging layout issues.                                                                                                                         |
| `cursor: true` mode       | Also assigns refs to elements with `cursor: pointer`, `onclick`, or positive `tabindex` that don't have interactive roles. Additive with `interactive` — when `interactive: false`, this flag has no additional effect (all elements already have refs). |
| `compact: true` mode      | Omits non-interactive elements, only shows ref-bearing nodes. When combined with `interactive: false`, all elements have refs so nothing is omitted.                                                                                                     |
| Shadow DOM (open)         | Walked recursively via `element.shadowRoot`, refs assigned normally                                                                                                                                                                                      |
| Shadow DOM (closed)       | Noted as `[closed shadow root]` --- opaque, no refs                                                                                                                                                                                                      |
| Same-origin iframes       | Walked recursively, refs prefixed with frame index                                                                                                                                                                                                       |
| Cross-origin iframes      | Noted as `[cross-origin iframe]` --- opaque, no refs                                                                                                                                                                                                     |
| Empty/blank pages         | Returns minimal tree: `- document (empty)` with zero refs                                                                                                                                                                                                |
| Return value              | `SnapshotResponse` (see Section 8): `{ epoch, snapshot, refCount, totalElements, emittedElements, truncated, url, title, durationMs }`                                                                                                                   |

**Runtime-unavailable degraded snapshot**: CSP-hardened sites are supported by the CSP-safe runtime transport. If the runtime is still unavailable for another reason (for example it was manually removed and re-bootstrap fails), `browser_snapshot` returns a **successful** degraded `SnapshotResponse`:

| Field             | Value in degraded mode                       |
| ----------------- | -------------------------------------------- |
| `epoch`           | Incremented normally                         |
| `snapshot`        | `"- document [Orbit runtime unavailable]"`   |
| `refCount`        | `0`                                          |
| `totalElements`   | `0`                                          |
| `emittedElements` | `0`                                          |
| `truncated`       | `false`                                      |
| `url`             | Current page URL from browser metadata/store |
| `title`           | `""`                                         |
| `durationMs`      | `0`                                          |

This is a success response, not an error, so the agent can still orient around the page URL while surfacing that runtime-backed refs are unavailable.

### 3.2 Ref Resolution

All element-targeting tools accept **either** `ref` or `selector`. Resolution order:

| Input                              | Resolution                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ref: "e5"`                        | Look up in `_refMap` by ref ID. Validate epoch, verify element still in DOM via WeakRef + `isConnected`.     |
| `ref: "@e5"`                       | Same as above (leading `@` stripped).                                                                        |
| `ref: "ref=e5"`                    | Same as above (`ref=` prefix stripped). All three formats (`"e5"`, `"@e5"`, `"ref=e5"`) resolve identically. |
| `selector: "button.submit"`        | `document.querySelector(selector)`. Backward-compatible with all existing tools.                             |
| Both `ref` and `selector` provided | `ref` takes priority. `selector` ignored.                                                                    |
| Neither provided                   | Error: `"Provide ref (from snapshot) or selector (CSS)"`                                                     |
| Ref from wrong epoch               | Error: `"Ref is stale (epoch N, current M). Call browser_snapshot again."`                                   |
| Ref to GC'd element                | Error: `"Element no longer in DOM (garbage collected). Call browser_snapshot again."`                        |
| Ref to disconnected element        | Error: `"Element no longer in DOM (disconnected). Call browser_snapshot again."`                             |
| Selector matches nothing           | Error: `"No element found for selector: <selector>"`                                                         |

### 3.3 Epoch Lifecycle

| Event                            | Epoch behavior                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot()` called              | Epoch increments. All previous refs invalidated. Fresh refs assigned.                                                                                                                                                                                                                                                                                                                                           |
| `popstate` / `hashchange`        | Epoch increments immediately.                                                                                                                                                                                                                                                                                                                                                                                   |
| Full page navigation             | Epoch resets (new page context).                                                                                                                                                                                                                                                                                                                                                                                |
| DOM mutation (any)               | Epoch does NOT increment. Refs validated lazily at resolution time.                                                                                                                                                                                                                                                                                                                                             |
| SPA route change via `pushState` | No epoch change (no `popstate` fired). Refs remain valid if elements still exist. **Note**: SPA frameworks (React Router, Next.js) may unmount/remount the entire DOM tree on `pushState`. Refs to unmounted elements will fail with "Element no longer in DOM (disconnected)" at resolution time --- this is correct behavior via lazy validation. The agent should call `browser_snapshot` to get fresh refs. |

### 3.4 Interaction Tools

Each interaction tool must satisfy:

| Tool                                                    | Preconditions                                                                                                                                                                                                                                                                                                                                                                     | Postconditions                                                                                         | Side effects                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser_click(ref)`                                    | Element is in DOM                                                                                                                                                                                                                                                                                                                                                                 | `scrollIntoView` + `element.click()` dispatched                                                        | May trigger navigation (epoch changes). No visibility/disabled check --- clicks the element regardless (matches existing behavior).                                                                                                                                          |
| `browser_fill(ref, value)`                              | Element is a text input, textarea, or contenteditable                                                                                                                                                                                                                                                                                                                             | Value set via `el.value = value`, `input` and `change` events fired, previous value cleared            | Old value fully replaced. This is the "proper" way to set form values.                                                                                                                                                                                                       |
| `browser_type(ref, text)`                               | Element is focusable                                                                                                                                                                                                                                                                                                                                                              | Characters typed one-by-one with `keydown`/`keypress`/`keyup` per character                            | Appends to existing value (does NOT clear first). **Behavioral change from current `browser_type`**: the existing implementation replaces the value (like `fill`). The new behavior matches Playwright semantics --- `type` appends character-by-character, `fill` replaces. |
| `browser_select(ref, values)`                           | Element is `<select>`                                                                                                                                                                                                                                                                                                                                                             | Options matching `values` are selected. `change` event fired.                                          | Previous selection cleared if single-select                                                                                                                                                                                                                                  |
| `browser_check(ref)`                                    | Element is checkbox or switch                                                                                                                                                                                                                                                                                                                                                     | Checked state becomes `true`. `change` event fired.                                                    | No-op if already checked                                                                                                                                                                                                                                                     |
| `browser_uncheck(ref)`                                  | Element is checkbox or switch                                                                                                                                                                                                                                                                                                                                                     | Checked state becomes `false`. `change` event fired.                                                   | No-op if already unchecked                                                                                                                                                                                                                                                   |
| `browser_hover(ref)`                                    | Element is in DOM                                                                                                                                                                                                                                                                                                                                                                 | `mouseenter` and `mouseover` events dispatched                                                         | CSS :hover styles activate                                                                                                                                                                                                                                                   |
| `browser_scroll(ref?, direction, amount?)`              | `direction` is required: `"up"` \| `"down"` \| `"left"` \| `"right"`                                                                                                                                                                                                                                                                                                              | Element (or window if no ref) scrolled by `amount` pixels. Returns `{ scrollX, scrollY }`.             | Default amount: 300px                                                                                                                                                                                                                                                        |
| `browser_wait_for_selector(selector, state?, timeout?)` | Selector is valid CSS                                                                                                                                                                                                                                                                                                                                                             | Resolves when element matches `state` (default: `"visible"`). Timeout default: 30000ms, max: 120000ms. | Polls via Rust `tokio::time::interval`, NOT JS setInterval                                                                                                                                                                                                                   |
| `browser_wait_for_url(url, timeout?)`                   | URL is a plain string or a regex pattern encoded as `"/pattern/flags"` (e.g., `"/dashboard/i"`). Plain strings match via `location.href === url` (exact). Regex strings are detected by leading and trailing `/` delimiters, parsed via `new RegExp(pattern, flags)`, and matched via `regex.test(location.href)`. Invalid regex returns error: `"Invalid URL pattern: {error}"`. | Resolves when `location.href` matches. Timeout default: 30000ms, max: 120000ms.                        | Polls via Rust                                                                                                                                                                                                                                                               |

### 3.5 Inspection Tools

Tools that read element or page state without side effects. All element-targeting tools accept `ref` or `selector` via `TargetSchema` (Section 8). **All tools in this section require an active browser context** (see Section 3.9 no-browser lifecycle rule). Error cases listed below are in addition to the shared `"No browser open"` error.

| Tool                                  | Input                                      | Output                                                                                                            | Error cases                                                    |
| ------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------- |
| `browser_get_url()`                   | None                                       | `{ url: string }` — current browser URL from the native window API                                                | No-browser only                                                |
| `browser_get_title()`                 | None                                       | `{ title: string }` — current `document.title` via CSP-safe direct eval                                           | No-browser only                                                |
| `browser_get_text(target)`            | `TargetSchema`                             | `{ text: string }` — `element.textContent` with whitespace collapsed                                              | Standard ref/selector errors                                   |
| `browser_get_html(target, outer?)`    | `TargetSchema`, `outer` (default: `false`) | `{ html: string }` — `innerHTML` or `outerHTML`                                                                   | Standard ref/selector errors                                   |
| `browser_is_visible(target)`          | `TargetSchema`                             | `{ visible: boolean }` — true if element has non-zero bounding rect AND is not `display:none`/`visibility:hidden` | Standard ref/selector errors                                   |
| `browser_is_enabled(target)`          | `TargetSchema`                             | `{ enabled: boolean }` — true if element is not `disabled` and not `aria-disabled="true"`                         | Standard ref/selector errors                                   |
| `browser_get_attribute(target, name)` | `TargetSchema`, `name: string`             | `{ value: string                                                                                                  | null }`— result of`element.getAttribute(name)`                 | Standard ref/selector errors |
| `browser_bounding_box(target)`        | `TargetSchema`                             | `{ x, y, width, height: number }` — element's `getBoundingClientRect()` values                                    | Standard ref/selector errors                                   |
| `browser_count(selector)`             | `selector: string` (CSS)                   | `{ count: number }` — `document.querySelectorAll(selector).length`                                                | No-browser only (returns 0 for no matches when browser exists) |

### 3.6 Storage and Network Tools

Tools for reading/modifying browser storage and observing network activity. None of these target elements --- they operate on page-level state. **All tools in this section require an active browser context** (see Section 3.9 no-browser lifecycle rule). Error cases listed below are in addition to the shared `"No browser open"` error.

| Tool                                      | Input                                           | Output                                                                                                 | Error cases                                                                  |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `browser_cookies_get(name?, domain?)`     | Optional `name` and `domain` filters            | `{ cookies: Array<{ name, value, domain, path, expires }> }` — all matching cookies                    | No-browser only (returns empty array for no matches when browser exists)     |
| `browser_cookies_clear(name?, domain?)`   | Optional `name` and `domain` filters            | `{ cleared: number }` — count of cookies removed                                                       | No-browser only (returns 0 if nothing to clear when browser exists)          |
| `browser_storage_get(key, store?)`        | `key: string`, `store: "local"                  | "session"`(default:`"local"`)                                                                          | `{ value: string                                                             | null }`—`localStorage.getItem(key)`or`sessionStorage.getItem(key)` | CSP may block storage access; returns error `"Storage access blocked by page policy"` |
| `browser_storage_set(key, value, store?)` | `key: string`, `value: string`, `store: "local" | "session"`(default:`"local"`)                                                                          | `{ success: true }`                                                          | CSP/quota errors: `"Storage write failed: {error}"`                |
| `browser_storage_clear(store?)`           | `store: "local"                                 | "session"`(default:`"local"`)                                                                          | `{ success: true }`                                                          | CSP errors same as `storage_set`                                   |
| `browser_network_requests(filter?)`       | Optional `filter: { url?, method?, status? }`   | `{ requests: Array<{ url, method, status, duration, size }> }` — captured since last call or page load | Requires runtime injection; CSP-blocked pages return `"Runtime unavailable"` |

### 3.7 Additional Interaction Tools

Additional interaction tools beyond those in Section 3.4.

| Tool                               | Input          | Behavior                                                                 | Output               |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------ | -------------------- |
| `browser_focus(target)`            | `TargetSchema` | Calls `element.focus()`. Dispatches `focus` and `focusin` events.        | `{ focused: true }`  |
| `browser_scroll_into_view(target)` | `TargetSchema` | Calls `element.scrollIntoView({ behavior: 'instant', block: 'center' })` | `{ scrolled: true }` |

### 3.8 iOS-Specific Behavior

| Behavior         | Desktop browser                                                                       | iOS Simulator                                            |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Execution engine | WKWebView JS injection                                                                | Appium/WebDriverAgent                                    |
| Snapshot format  | Identical                                                                             | Identical                                                |
| Click/Tap        | `element.click()`                                                                     | WebDriver pointer action (touch)                         |
| Swipe            | Not available                                                                         | Native touch gesture via WebDriver                       |
| Screenshot       | Existing (`browser_screenshot` via `WKWebView.takeSnapshot`, saves JPEG to temp file) | WebDriver `takeScreenshot` (base64 PNG)                  |
| Wait tools       | Rust-side polling                                                                     | Rust-side polling (same)                                 |
| Startup time     | Instant (embedded)                                                                    | 10-30 seconds (simulator boot + Appium + WebDriverAgent) |

#### iOS Tool Behavioral Contracts

All iOS tools execute via Appium/WebDriverAgent. The ref system works identically to desktop (same `SnapshotResponse`, same epoch lifecycle). Tools listed in Appendix A that mirror desktop behavior follow the same contracts as their `browser_*` counterparts unless noted below.

| Tool                                                | Input                               | Output                                                  | Notes                                                                                                                          |
| --------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `ios_device_list()`                                 | None                                | `{ devices: IOSDevice[] }` (see Section 8)              | Lists all available simulators via `xcrun simctl list`. No lease required.                                                     |
| `ios_launch(device)`                                | `device: string` (name or UDID)     | `{ udid, name, runtime, appiumPort }`                   | Boots simulator, starts Appium, creates WebDriver session. Acquires lease. Idempotent if already running with matching device. |
| `ios_close()`                                       | None                                | `{ success: true }`                                     | Releases session's lease. If last lease, shuts down simulator + Appium.                                                        |
| `ios_navigate(url)`                                 | `url: string`                       | `{ success: true }`                                     | Opens URL in mobile Safari via WebDriver `navigateTo`.                                                                         |
| `ios_back()`                                        | None                                | `{ success: true }`                                     | WebDriver `back()` — browser back navigation.                                                                                  |
| `ios_forward()`                                     | None                                | `{ success: true }`                                     | WebDriver `forward()` — browser forward navigation.                                                                            |
| `ios_reload()`                                      | None                                | `{ success: true }`                                     | WebDriver `refresh()`.                                                                                                         |
| `ios_snapshot()`                                    | Same options as `browser_snapshot`  | `SnapshotResponse` (identical format)                   | Injects snapshot JS via WebDriver `executeScript`. Same epoch/ref system.                                                      |
| `ios_get_text(target)`                              | `TargetSchema`                      | `{ text: string }`                                      | Same as `browser_get_text`, executed via WebDriver.                                                                            |
| `ios_get_html(target, outer?)`                      | `TargetSchema`, `outer?: boolean`   | `{ html: string }`                                      | Same as `browser_get_html`, executed via WebDriver.                                                                            |
| `ios_screenshot()`                                  | None                                | `{ image: string, format: "png" }` — base64-encoded PNG | WebDriver `takeScreenshot`. Different format from desktop (PNG vs JPEG).                                                       |
| `ios_tap(target)`                                   | `TargetSchema`                      | `{ tapped: true }`                                      | WebDriver pointer action (touch). Equivalent to desktop `browser_click` but uses native touch events.                          |
| `ios_fill(target, value)`                           | `TargetSchema`, `value: string`     | `{ filled: true }`                                      | Clears field + sets value via WebDriver `element.clear()` + `element.sendKeys()`.                                              |
| `ios_type(target, text)`                            | `TargetSchema`, `text: string`      | `{ typed: true }`                                       | Appends text character-by-character via WebDriver `element.sendKeys()` without clearing.                                       |
| `ios_select(target, values)`                        | `TargetSchema`, `values: string[]`  | `{ selected: true }`                                    | Selects option(s) via WebDriver. For native iOS pickers, uses Appium mobile commands.                                          |
| `ios_check(target)`                                 | `TargetSchema`                      | `{ checked: true }`                                     | Taps checkbox if not already checked. No-op if already checked.                                                                |
| `ios_uncheck(target)`                               | `TargetSchema`                      | `{ unchecked: true }`                                   | Taps checkbox if currently checked. No-op if already unchecked.                                                                |
| `ios_swipe(direction, target?, duration?)`          | `direction: "up"                    | "down"                                                  | "left"                                                                                                                         | "right"`, optional `target`and`duration` (ms, default: 300) | `{ swiped: true }`                               | Native touch gesture via WebDriver pointer actions. If no target, swipes from viewport center.                                    |
| `ios_scroll(direction, amount?)`                    | `direction: "up"                    | "down"                                                  | "left"                                                                                                                         | "right"`, `amount?: number` (default: 300)                  | `{ scrollX, scrollY }`                           | Scrolls via JS `window.scrollBy` executed through WebDriver.                                                                      |
| `ios_eval(script)`                                  | `script: string`                    | `{ result: unknown }` — return value of script          | WebDriver `executeScript`. Same transport limits as desktop.                                                                   |
| `ios_wait_for_selector(selector, state?, timeout?)` | Same as `browser_wait_for_selector` | Same behavior                                           | Polls via Rust, verification via WebDriver `executeScript`.                                                                    |
| `ios_console_logs(level?)`                          | Optional `level: "error"            | "warn"                                                  | "info"                                                                                                                         | "log"` filter                                               | `{ logs: Array<{ level, message, timestamp }> }` | Captured via Appium log types. May be less complete than desktop `browser_console_logs` depending on WebDriverAgent capabilities. |

**Error behavior**: All iOS tools require an active lease. Calling any tool without a lease returns `"No iOS lease for session"`. If Appium has crashed, tools return `"Appium process exited unexpectedly"` (see Section 7).

### 3.9 Lifecycle, Debug, and Existing Tools

Contracts for existing tools and tools that don't fit the categories above. These tools are unchanged from their current behavior except where noted.

| Tool                           | Input                                           | Output                                                                  | Notes                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `browser_open(url?)`           | Optional `url: string` (default: `about:blank`) | `{ success: true }`                                                     | Creates the embedded WKWebView browser panel if it doesn't exist, or brings it to focus if it does. Navigates to `url` if provided. Idempotent.                                                                                                                                                   |
| `browser_close()`              | None                                            | `{ success: true }`                                                     | Closes the browser panel. All refs and epoch state are discarded. Subsequent browser tool calls return `"No browser open. Call browser_open or browser_navigate first."` until the browser is reopened.                                                                                           |
| `browser_navigate(url)`        | `url: string`                                   | `{ success: true }`                                                     | Navigates the browser to the given URL. If no browser exists, implicitly opens one (equivalent to `browser_open(url)`). Triggers epoch reset on full navigation.                                                                                                                                  |
| `browser_back()`               | None                                            | `{ success: true }`                                                     | Calls `history.back()`. Triggers `popstate` → epoch increment. No-op if no history.                                                                                                                                                                                                               |
| `browser_forward()`            | None                                            | `{ success: true }`                                                     | Calls `history.forward()`. Triggers `popstate` → epoch increment. No-op if no forward history.                                                                                                                                                                                                    |
| `browser_reload()`             | None                                            | `{ success: true }`                                                     | Reloads the current page. Triggers epoch reset (full navigation).                                                                                                                                                                                                                                 |
| `browser_screenshot()`         | None                                            | `{ path: string, format: "jpeg" }` — path to saved temp screenshot file | Uses native `WKWebView.takeSnapshot` (macOS). Saves as JPEG to a temp file. Does NOT require runtime injection — works even on CSP-blocked pages.                                                                                                                                                 |
| `browser_eval(script)`         | `script: string`                                | `{ result: unknown }` — return value of the script                      | Evaluates JavaScript in the page context via the legacy string-to-`new Function()` transport. This keeps `return`-statement compatibility for user-authored scripts, but remains CSP-unsafe on hardened pages. Subject to transport limits (100,000 chars URL path, 500,000 chars event channel). |
| `browser_console_logs(level?)` | Optional `level: "error"                        | "warn"                                                                  | "info"                                                                                                                                                                                                                                                                                            | "log"` filter | `{ logs: Array<{ level, message, timestamp }> }` | Returns captured console messages from the runtime. CSP-hardened pages are supported; `"Runtime unavailable"` indicates a bootstrap failure rather than CSP alone. |
| `browser_runtime_info()`       | None                                            | `BrowserRuntimeInfo` (see below)                                        | Reports the injected runtime's status. Returns `{ available: false, reason: "No browser open" }` if no browser exists, or `{ available: false, reason: "Runtime unavailable" }` if runtime couldn't be used.                                                                                      |

**`BrowserRuntimeInfo` contract (AC-30)**:

```typescript
interface BrowserRuntimeInfo {
  available: boolean; // Whether orbit_runtime.js is injected and responsive
  reason?: string; // Why unavailable (only present when available: false)
  version?: string; // orbit_runtime.js version string (when available)
  epoch?: number; // Current epoch counter (when available)
  capabilities?: {
    snapshot: boolean; // Can produce accessibility snapshots
    refResolution: boolean; // Can resolve refs to elements
    consoleCapture: boolean; // Console interception active
    networkCapture: boolean; // Network request capture active
    storageAccess: boolean; // Can read/write storage
  };
}
```

**No-browser lifecycle rule**: All browser-scoped tools (everything except `browser_open`) require an active browser context. If no browser exists, tools return error: `"No browser open. Call browser_open or browser_navigate first."` Exceptions: `browser_navigate` auto-opens the browser (see above), and `browser_runtime_info` returns a structured unavailable response instead of erroring.

---

## 4. Acceptance Criteria

Every criterion below must be demonstrably true before the feature is considered complete. Items are grouped by priority.

### P0 --- Must ship (blocks release)

- [ ] **AC-1**: `browser_snapshot` returns a text tree with `[ref=eN]` handles on all interactive elements for `https://example.com`, `https://news.ycombinator.com`, and a local React SPA with dynamic content.
- [ ] **AC-2**: `browser_click({ ref: "eN" })` clicks the correct element identified in a prior snapshot, verified by observing navigation or state change.
- [ ] **AC-3**: `browser_fill({ ref: "eN", value: "test" })` sets the value of an input field and fires `input` + `change` events, verified by reading the value back.
- [ ] **AC-4**: Using a ref from a previous epoch returns an error message containing the word "stale" and the instruction to call `browser_snapshot` again.
- [ ] **AC-5**: All 13 existing browser tools preserve their current inputs and produce identical results. The 4 element-targeting tools (`browser_click`, `browser_type`, `browser_get_text`, `browser_get_html`) continue to accept `selector`-only input while also gaining additive `ref` support. The remaining 9 tools (`browser_open`, `browser_close`, `browser_navigate`, `browser_back`, `browser_forward`, `browser_reload`, `browser_screenshot`, `browser_console_logs`, `browser_eval`) are unchanged. One deliberate behavior change: `browser_type` switches from replace to append semantics (old behavior migrated to `browser_fill`). Verified by automated backward-compat test suite that asserts: (a) all 12 unchanged tools produce identical results, (b) `browser_type` now appends to existing value instead of replacing, (c) `browser_fill` replaces value as the old `browser_type` did.
- [ ] **AC-6**: Snapshot payloads under 100,000 chars complete via `browser_eval` (URL path). Payloads between 100,000-500,000 chars complete via the Tauri event channel (verified by `browser:eval-large-result` event emission in Rust logs or test spy). Payloads over 500,000 chars return an error containing `"Result too large"` and the character count. Verified by integration tests using real HTML fixture pages (served via local Vite dev server or `file://` URL) with controlled element counts to produce payloads in each size tier.
- [ ] **AC-7**: When 3 `browser_snapshot` calls are issued concurrently, each returns a valid snapshot with incrementing epochs (no shared-state corruption). When `browser_click` runs concurrently with `browser_snapshot`, neither errors and the ref map after the last snapshot is consistent (all returned refs resolve correctly). Verified by parallel execution test.
- [ ] **AC-8**: `./scripts/lint-all.sh`, `bun run check`, `cargo clippy`, and `bun run build:sidecar` all pass.

### P1 --- Should ship (high value, part of core experience)

- [ ] **AC-9**: Duplicate elements with same role + accessible name are disambiguated with `[nth=N]` in the snapshot output.
- [ ] **AC-10**: Open shadow DOM roots are walked and their elements appear in the snapshot with refs.
- [ ] **AC-11**: Same-origin iframes are walked recursively. Cross-origin iframes appear as `[cross-origin iframe]`.
- [ ] **AC-12**: `browser_wait_for_selector` resolves within the specified timeout when a dynamically-added element appears. Timeout produces a clear error with elapsed time.
- [ ] **AC-13**: `ensureOrbitRuntime()` re-injects the runtime if (a) `window.__orbit` is undefined, (b) `window.__orbit.VERSION` is undefined, or (c) `window.__orbit.VERSION !== EXPECTED_VERSION` (exact string match against the bundled runtime version constant). After re-injection, `window.__orbit.VERSION` equals `EXPECTED_VERSION`.
- [ ] **AC-14**: If a page's CSP blocks script injection, tools return a diagnostic mentioning "CSP" rather than failing silently. Snapshot still reports URL (title is empty until the Rust `BrowserInfo` extension adds `WKWebView.title` — see Section 3.1 CSP-degraded table). `browser_eval` remains functional on CSP-blocked pages.
- [ ] **AC-15**: Per-tool timeouts are enforced: `browser_snapshot` (15s), `browser_click`/`browser_fill`/`browser_type` (10s), `browser_navigate` (30s), `browser_wait_for_selector`/`browser_wait_for_url` (configurable, default 30s, max 120s). When a tool exceeds its timeout, the error message includes the tool name and elapsed time (e.g., `"browser_snapshot timed out after 15000ms"`). Verified by tests that trigger intentional delays exceeding the timeout.

### P2 --- iOS Simulator (ships in same release, but could be held if blocking issues arise)

- [ ] **AC-16**: `ios_launch({ device: "iPhone 16 Pro" })` boots the simulator, starts Appium, and creates a WebDriver session within 60 seconds on a machine with Xcode installed.
- [ ] **AC-17**: `ios_snapshot` returns the same tree format as `browser_snapshot` --- identical structure, same ref system.
- [ ] **AC-18**: `ios_tap({ ref: "eN" })` taps the correct element, verified by page state change.
- [ ] **AC-19**: `ios_swipe({ direction: "up" })` scrolls the page in iOS Safari, verified by changed scroll position.
- [ ] **AC-20**: `ios_screenshot` returns a valid base64-encoded PNG image.
- [ ] **AC-21**: `ios_close` shuts down the simulator and kills the Appium process. No orphaned processes remain (`pgrep -if appium` returns exit code 1, indicating no matching processes).
- [ ] **AC-22**: iOS tools are NOT registered on non-macOS platforms. `canEnableIOS()` returns `false` without throwing.
- [ ] **AC-23**: iOS tools are NOT registered when `ORBIT_ENABLE_IOS_TOOLS` is unset or `0`, even on macOS.
- [ ] **AC-24**: Deleting a session that holds an iOS lease releases the lease. If it's the last lease, the simulator shuts down.
- [ ] **AC-25**: Two sessions can share the iOS Simulator concurrently. Closing one does not affect the other.
- [ ] **AC-26**: On macOS arm64: `bun run build:sidecar` produces a valid binary at `src-tauri/binaries/agent-bridge-aarch64-apple-darwin` that starts without error. `ORBIT_ENABLE_IOS_TOOLS=0 bun run build:sidecar` also produces a valid binary that starts without error. Both binaries respond correctly to a health-check probe (e.g., `echo '{}' | src-tauri/binaries/agent-bridge-aarch64-apple-darwin` exits cleanly or produces expected error). Cross-platform validation deferred to CI with Linux runners.
- [ ] **AC-27**: If Appium crashes mid-session, the next iOS tool call returns a clear error message suggesting `ios_launch` to restart. The system does NOT auto-restart.

### P3 --- Nice to have (defer if needed)

- [ ] **AC-28**: `executionTarget: 'desktop' | 'ios'` metadata appears in tool responses for mixed-target debugging.
- [ ] **AC-29**: Snapshot includes `totalElements` vs `emittedElements` truncation stats when truncation occurs.
- [ ] **AC-30**: `browser_runtime_info` tool reports runtime version, epoch, and capabilities.

---

## 5. Non-Functional Requirements

### Performance

| Metric                                       | Target                | Measurement method                                                                                    |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| Snapshot time (typical page, <500 elements)  | < 500ms               | `durationMs` field in `SnapshotResponse` (measured inside `orbit_runtime.js` via `performance.now()`) |
| Snapshot time (heavy page, ~5000 elements)   | < 3s                  | `durationMs` field + truncation if over 500,000 chars                                                 |
| Click/fill/type via ref                      | < 100ms               | Measured from tool call to completion                                                                 |
| Ref resolution (WeakRef + isConnected check) | < 1ms                 | Negligible --- WeakRef deref is O(1)                                                                  |
| iOS Simulator launch (cold)                  | < 60s                 | From `ios_launch` call to `ready` state                                                               |
| iOS tool execution (tap, fill, snapshot)     | < 5s                  | Appium roundtrip includes WebDriver overhead                                                          |
| Memory overhead of ref map                   | < 5MB for 10,000 refs | WeakRef means elements can still be GC'd                                                              |

### Reliability

| Requirement                     | Detail                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| No orphaned processes           | iOS shutdown must kill Appium and simulator. Verified by `pgrep -if appium` returning exit code 1 (no matches) in tests. |
| Idempotent cleanup              | `close()` and `dispose()` can be called multiple times safely.                                                           |
| Graceful degradation            | If runtime injection fails (CSP), tools return diagnostics, not silent failures.                                         |
| No silent wrong-element actions | Stale refs fail loudly. Epoch system prevents acting on wrong elements.                                                  |
| Transport reliability           | Dual-channel (URL + event) ensures large payloads don't silently truncate.                                               |

### Security

| Requirement                 | Detail                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| No persistent state leakage | Ref map is cleared on each snapshot. WeakRefs allow GC. Epoch prevents cross-page ref reuse.                                                      |
| CSP respect                 | Runtime injection failure is reported, not bypassed. We don't modify page CSP.                                                                    |
| Appium `--relaxed-security` | Required for `execute` command. Acceptable because this is a local development tool, not production infrastructure. Document this in setup guide. |
| No cross-origin bypass      | Cross-origin iframes are opaque. We don't attempt to circumvent browser security.                                                                 |

### Compatibility

| Requirement                        | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backward-compatible tool interface | All 13 existing tools (`browser_open`, `browser_navigate`, `browser_click`, `browser_type`, `browser_get_text`, `browser_get_html`, `browser_screenshot`, `browser_console_logs`, `browser_back`, `browser_forward`, `browser_reload`, `browser_close`, `browser_eval`) accept their current inputs as before. Element-targeting tools (`click`, `type`, `get_text`, `get_html`) gain an additive `ref` field. **Note**: `browser_type` changes behavior (see Section 3.4) --- the existing "replace" behavior moves to `browser_fill`. |
| macOS-only for iOS                 | iOS tools gated by `process.platform === 'darwin'`. Other platforms unaffected.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| WKWebView quirks                   | Snapshot engine must handle WebKit-specific behaviors (no `ariaSnapshot()`, limited `computedRole`). Role detection is tag-based + ARIA attribute-based.                                                                                                                                                                                                                                                                                                                                                                                |
| Appium version tolerance           | Compatible with Appium 2.x. Version check on reuse prevents incompatible server.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## 6. Constraints

These are hard boundaries that the implementation must not violate.

| Constraint                                      | Rationale                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No Playwright/Chromium process**              | Desktop browser tools execute in the embedded WKWebView. We do not spawn a separate browser.                                                                                                                                                                                       |
| **Single `orbit_runtime.js` source**            | The same JS file is used for desktop (initialization_script) and iOS (WebDriver execute). No divergent copies.                                                                                                                                                                     |
| **Ref map lives in page context**               | Refs are stored in `window.__orbit._refMap` inside the page. They cannot be serialized across page navigations --- epoch invalidation is the only correct response.                                                                                                                |
| **URL transport limit: 100,000 chars**          | The `orbit-eval://` URL callback path has a practical ~2MB WebKit limit, but `encodeURIComponent` triples size. 100,000 JSON characters (matching the existing constant in `mod.rs:709`) is the safe threshold for the fast path. Payloads above this use the Tauri event channel. |
| **Event transport limit: 500,000 chars**        | Defense-in-depth. Payloads over 500,000 JSON characters are truncated with diagnostics. No unbounded memory allocation for snapshot serialization.                                                                                                                                 |
| **iOS is opt-in**                               | Requires `ORBIT_ENABLE_IOS_TOOLS=1` env var AND macOS AND Xcode AND Appium. Never auto-enabled.                                                                                                                                                                                    |
| **No auto-restart of Appium**                   | If Appium crashes, the agent decides whether to restart. Orbit does not silently relaunch infrastructure.                                                                                                                                                                          |
| **One simulator instance**                      | `IOSService` manages a single simulator + Appium. No multi-device parallel sessions in this iteration.                                                                                                                                                                             |
| **`_createOptions()` stays sync**               | The agent's `_createOptions()` method (`agent-bridge/src/agent/core/agent.ts:538`) is synchronous --- the SDK calls it during query setup. iOS service injection must happen before this call, at session creation time in `SessionManager`, not inside `_createOptions()`.        |
| **No new protocol messages for iOS capability** | iOS availability is discoverable via the MCP tool list. No `capability:ios` event.                                                                                                                                                                                                 |

---

## 7. Error Taxonomy

Every error the system can produce, categorized by source and severity.

### Ref Errors (user-recoverable --- agent retries with fresh snapshot)

| Error                | Message template                                                               | Recovery                       |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| Stale ref            | `"Ref is stale (epoch {old}, current {new}). Call browser_snapshot again."`    | Agent calls `browser_snapshot` |
| GC'd element         | `"Element no longer in DOM (garbage collected). Call browser_snapshot again."` | Agent calls `browser_snapshot` |
| Disconnected element | `"Element no longer in DOM (disconnected). Call browser_snapshot again."`      | Agent calls `browser_snapshot` |
| Unknown ref          | `"Unknown ref: {ref}. Available refs: e1-e{N}."`                               | Agent checks snapshot output   |
| No target            | `"Provide ref (from snapshot) or selector (CSS)"`                              | Agent provides input           |

### Selector Errors (user-recoverable)

| Error                   | Message template                                                                               | Recovery                                |
| ----------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| No match                | `"No element found for selector: {selector}"`                                                  | Agent adjusts selector or uses snapshot |
| Multiple matches (info) | Not an error --- querySelector returns first match. Snapshot + ref is preferred for precision. | N/A                                     |

### Transport Errors (system-level)

| Error                | Message template                                                                                                    | Recovery                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Payload too large    | `"Result too large ({N} chars, max 500000). Use compact:true or target a subtree."`                                 | Agent retries with `compact: true`. Threshold matches the event transport limit (500,000 chars). |
| Large-result timeout | `"Large eval result not received within timeout. The page may have navigated or script execution was interrupted."` | Agent retries                                                                                    |
| Runtime unavailable  | `"Orbit runtime unavailable."` or runtime bootstrap failure details                                                 | Agent retries with runtime-backed tools only after re-snapshot or reports the limitation         |

### Timeout Errors (user-recoverable)

| Error               | Message template                                                                       | Recovery                          |
| ------------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| Tool timeout        | `"browser_{tool} timed out after {N}ms"`                                               | Agent retries or adjusts approach |
| Wait timeout        | `"browser_wait_for_selector: selector '{sel}' not found after {N}ms (state: {state})"` | Agent adjusts strategy            |
| Wait URL timeout    | `"browser_wait_for_url: URL did not match '{pattern}' after {N}ms (current: {url})"`   | Agent adjusts strategy            |
| Invalid URL pattern | `"Invalid URL pattern: {regex parse error}"`                                           | Agent fixes regex syntax          |

### iOS Errors (environment-level)

| Error                   | Message template                                                               | Recovery                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not macOS               | `"iOS tools require macOS with Xcode and Appium installed."`                   | User switches to macOS                                                                                                                                                                                                                                                                                                            |
| Appium not found        | `"Appium not found. Install: npm install -g appium"`                           | User installs Appium                                                                                                                                                                                                                                                                                                              |
| Xcode not found         | `"Xcode Command Line Tools not found. Install: xcode-select --install"`        | User installs Xcode                                                                                                                                                                                                                                                                                                               |
| Port conflict           | `"Appium ports 4723-4729 all occupied. PIDs: {list}"`                          | User kills conflicting processes                                                                                                                                                                                                                                                                                                  |
| Appium version mismatch | `"Existing Appium on port {N} is version {X}, expected {Y}."`                  | User updates or kills old Appium                                                                                                                                                                                                                                                                                                  |
| Appium crashed          | `"Appium process exited unexpectedly (code {N}). Call ios_launch to restart."` | Agent calls `ios_launch`. **Multi-session behavior**: When Appium crashes while multiple sessions hold leases, the next tool call from ANY session returns this error. All existing leases are implicitly invalidated. Any session can call `ios_launch` to restart. `IOSService` transitions to `idle`, allowing re-acquisition. |
| Simulator boot failed   | `"Failed to boot simulator: {xcrun error}"`                                    | User checks Xcode/simulator setup                                                                                                                                                                                                                                                                                                 |
| No iOS lease            | `"No iOS lease for session"`                                                   | Agent calls `ios_launch` first                                                                                                                                                                                                                                                                                                    |
| Device not found        | `"No simulator found matching '{query}'. Available: {list}"`                   | Agent picks from available list                                                                                                                                                                                                                                                                                                   |
| iOS service disposed    | `"IOSService disposed"`                                                        | Session is ending --- normal                                                                                                                                                                                                                                                                                                      |

---

## 8. Data Contracts

### Snapshot Response

```typescript
interface SnapshotResponse {
  epoch: number; // Monotonically increasing per page context
  snapshot: string; // Indented text tree with [ref=eN] markers
  refCount: number; // Total refs assigned in this snapshot
  totalElements: number; // Total DOM elements walked
  emittedElements: number; // Elements included in output (< total if truncated)
  truncated: boolean; // True if tree was cut short
  url: string; // Current page URL
  title: string; // Current page title
  durationMs: number; // Time taken to build snapshot (via performance.now())
}
```

### Ref Map Entry (internal, not serialized)

```typescript
interface RefEntry {
  ref: WeakRef<Element>; // Weak reference to DOM element
  role: string; // Computed accessibility role
  name: string; // Computed accessible name
  epoch: number; // Epoch when this ref was created
  nth?: number; // Disambiguation index (only if duplicate role+name)
  selector?: string; // Best-effort CSS selector (for debugging)
  frameIndex?: number; // If inside an iframe, which one
}
```

### Tool Target Schema (shared across all element-targeting tools)

```typescript
const TargetSchema = z
  .object({
    ref: z.string().optional().describe('Element ref from browser_snapshot (preferred)'),
    selector: z.string().optional().describe('CSS selector (legacy, still supported)'),
  })
  .refine(
    (v) => v.ref !== undefined || v.selector !== undefined,
    'Provide ref (from snapshot) or selector (CSS)'
  );
```

### iOS Device

```typescript
interface IOSDevice {
  name: string; // e.g., "iPhone 16 Pro"
  udid: string; // Simulator UDID
  state: 'Shutdown' | 'Booted' | 'Creating';
  runtime: string; // e.g., "iOS 18.2"
  isAvailable: boolean;
}
```

### IOSService State Machine

```
idle ──acquire()──> launching ──(success)──> ready
  ^                    |                      |
  |                    v (abort/close)        v release() (last)
  +──── closing <──────+──────────────────────+
                                              |
                                        disposed (terminal)
```

Transitions:

- `idle → launching`: first `acquire()` call triggers launch
- `launching → ready`: Appium + WebDriver session established
- `launching → closing`: `close()` or `AbortController.abort()` during in-progress launch (cancels partially-started resources)
- `ready → closing`: last lease released via `release()`, or explicit `shutdown()`
- `closing → idle`: cleanup complete, can be re-acquired
- `* → disposed`: terminal state via `dispose()`, no further operations allowed

---

## 9. Out of Scope

Explicitly excluded from this work. These are NOT bugs or oversights --- they are conscious deferrals.

| Item                                                  | Why deferred                                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Annotated pixel screenshots with element overlays** | DOM overlay numbering works, but combining it with pixel capture into a single annotated image needs additional native APIs. Basic `browser_screenshot` (via `WKWebView.takeSnapshot`) already exists and is in scope. |
| **PDF generation**                                    | Requires `WKWebView.createPDF` via Objective-C bridge. Separate effort.                                                                                                                                                |
| **Multi-tab browser support**                         | Architectural change to browser panel. Out of scope.                                                                                                                                                                   |
| **Real iOS device support**                           | Requires USB + code signing + provisioning profiles. Separate setup flow.                                                                                                                                              |
| **iOS video recording**                               | Appium supports this but adds significant complexity. Defer.                                                                                                                                                           |
| **iOS multi-touch gestures**                          | Pinch, rotate, etc. Not needed for web testing yet.                                                                                                                                                                    |
| **iOS network throttling**                            | Appium plugin available but not in initial scope.                                                                                                                                                                      |
| **Persistent iOS settings**                           | Device preference, port config. Add when users ask for it.                                                                                                                                                             |
| **Multi-simulator sessions**                          | One simulator shared across sessions. Parallel simulators deferred.                                                                                                                                                    |

---

## 10. Risks and Mitigations

| Risk                                                            | Likelihood | Impact | Mitigation                                                                                                          |
| --------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| **WKWebView accessibility role detection is incomplete**        | Medium     | Medium | Tag-based + ARIA attribute fallback. Not dependent on `ariaSnapshot()` (Chromium-only). Test against diverse pages. |
| **Large SPA snapshots exceed 500KB regularly**                  | Medium     | Low    | `compact: true` mode + subtree targeting. Truncation with diagnostics. User education in tool descriptions.         |
| **Appium startup is slow (30s+)**                               | High       | Medium | Reuse existing Appium when possible. Lease model prevents repeated launches. Clear timeout messaging.               |
| **`bun build --compile` chokes on `node-simctl`/`webdriverio`** | Medium     | High   | Lazy imports ensure deps only load on macOS when flag is set. Build validation in both modes is mandatory (AC-26).  |
| **WeakRef behavior differs across WebKit versions**             | Low        | Medium | `WeakRef` is well-supported in modern WebKit. Fallback: store strong refs with periodic cleanup (increases memory). |
| **Appium/WebDriverAgent version drift**                         | Medium     | Medium | Pin Appium version in docs. Version check on reuse. Clear error on mismatch.                                        |
| **CSS-in-JS libraries produce unstable class names**            | N/A        | N/A    | This is exactly what the ref system solves. Refs are assigned by role + accessible name, not class names.           |

---

## 11. Success Metrics

How we'll know this feature is working after launch.

| Metric                                     | Baseline (current)                                  | Target (30 days post-launch)                        | How to measure                                                                 |
| ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Agent browser task success rate            | ~40% (estimated, based on CSS selector brittleness) | >80%                                                | Sample 50 diverse browser tasks, measure completion without human intervention |
| Stale ref errors leading to recovery       | N/A (new)                                           | >90% of stale ref errors result in successful retry | Log analysis of `browser_snapshot` calls after stale ref errors                |
| iOS test sessions per week                 | 0                                                   | >5 (early adopters)                                 | Count `ios_launch` calls                                                       |
| Orphaned Appium processes                  | N/A                                                 | 0                                                   | Periodic `pgrep -if appium` on dev machines (exit code 1 = clean)              |
| User-reported "wrong element clicked" bugs | ~3/week (estimated)                                 | <1/week                                             | Bug tracker                                                                    |

---

## 12. Open Questions

Questions that may need resolution during implementation. Answering these is NOT blocking --- they have safe defaults.

| #   | Question                                                       | Default if unanswered                                                                       | Impact                                              |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Should `browser_type` clear existing input value first?        | No --- `type` appends, `fill` replaces (matching Playwright semantics)                      | Low --- documented in tool description              |
| 2   | Should snapshot include `aria-describedby` text?               | No --- only `aria-label`, `textContent`, `placeholder`, `alt`, `title` for name computation | Low --- can add later                               |
| 3   | What's the maximum number of refs before performance degrades? | 10,000 (based on WeakRef overhead estimate). Add `maxRefs` option if needed.                | Low --- most pages have <500 interactive elements   |
| 4   | Should iOS tools auto-dismiss native alerts/prompts?           | No --- report them in snapshot output and let agent decide                                  | Medium --- affects Safari cookie/permission dialogs |
| 5   | Should we pin Appium version or accept any 2.x?                | Accept any 2.x. Log version on connect.                                                     | Low --- version check prevents incompatible servers |
| 6   | Should `browser_scroll` return the new scroll position?        | Yes --- return `{ scrollX, scrollY }` after scroll                                          | Low --- useful for agent to verify scroll worked    |

---

## Appendix A: Tool Inventory

Complete list of tools after implementation, by target. Every tool listed here has behavioral coverage in Section 3 (Sections 3.1–3.9). Tools marked **(P3)** may be deferred.

### Desktop Browser (38 tools)

> **Existing tools (13)**: `browser_open`, `browser_navigate`, `browser_click`, `browser_type`, `browser_get_text`, `browser_get_html`, `browser_screenshot`, `browser_console_logs`, `browser_back`, `browser_forward`, `browser_reload`, `browser_close`, `browser_eval`

| #   | Tool                        | New/Updated                      | Category        |
| --- | --------------------------- | -------------------------------- | --------------- |
| 1   | `browser_open`              | Existing                         | Lifecycle       |
| 2   | `browser_close`             | Existing                         | Lifecycle       |
| 3   | `browser_navigate`          | Existing                         | Navigation      |
| 4   | `browser_back`              | Existing                         | Navigation      |
| 5   | `browser_forward`           | Existing                         | Navigation      |
| 6   | `browser_reload`            | Existing                         | Navigation      |
| 7   | `browser_get_url`           | **New**                          | Navigation      |
| 8   | `browser_get_title`         | **New**                          | Navigation      |
| 9   | `browser_snapshot`          | **New**                          | Inspection      |
| 10  | `browser_get_text`          | Updated (+ ref)                  | Inspection      |
| 11  | `browser_get_html`          | Updated (+ ref)                  | Inspection      |
| 12  | `browser_screenshot`        | Existing                         | Inspection      |
| 13  | `browser_is_visible`        | **New**                          | Inspection      |
| 14  | `browser_is_enabled`        | **New**                          | Inspection      |
| 15  | `browser_get_attribute`     | **New**                          | Inspection      |
| 16  | `browser_bounding_box`      | **New**                          | Inspection      |
| 17  | `browser_count`             | **New**                          | Inspection      |
| 18  | `browser_click`             | Updated (+ ref)                  | Interaction     |
| 19  | `browser_type`              | Updated (+ ref, behavior change) | Interaction     |
| 20  | `browser_fill`              | **New**                          | Interaction     |
| 21  | `browser_select`            | **New**                          | Interaction     |
| 22  | `browser_check`             | **New**                          | Interaction     |
| 23  | `browser_uncheck`           | **New**                          | Interaction     |
| 24  | `browser_hover`             | **New**                          | Interaction     |
| 25  | `browser_focus`             | **New**                          | Interaction     |
| 26  | `browser_scroll`            | **New**                          | Interaction     |
| 27  | `browser_scroll_into_view`  | **New**                          | Interaction     |
| 28  | `browser_wait_for_selector` | **New**                          | Synchronization |
| 29  | `browser_wait_for_url`      | **New**                          | Synchronization |
| 30  | `browser_eval`              | Existing                         | Advanced        |
| 31  | `browser_cookies_get`       | **New**                          | Storage         |
| 32  | `browser_cookies_clear`     | **New**                          | Storage         |
| 33  | `browser_storage_get`       | **New**                          | Storage         |
| 34  | `browser_storage_set`       | **New**                          | Storage         |
| 35  | `browser_storage_clear`     | **New**                          | Storage         |
| 36  | `browser_network_requests`  | **New**                          | Network         |
| 37  | `browser_console_logs`      | Existing                         | Debug           |
| 38  | `browser_runtime_info`      | **New** (P3)                     | Debug           |

> **Note**: `browser_runtime_info` (AC-30) is a P3 tool that reports runtime version, epoch, and capabilities. It is included here for completeness but may be deferred.

### iOS Simulator (22 tools)

| #   | Tool                    | Category                   |
| --- | ----------------------- | -------------------------- |
| 1   | `ios_device_list`       | Lifecycle                  |
| 2   | `ios_launch`            | Lifecycle                  |
| 3   | `ios_close`             | Lifecycle                  |
| 4   | `ios_navigate`          | Navigation                 |
| 5   | `ios_back`              | Navigation                 |
| 6   | `ios_forward`           | Navigation                 |
| 7   | `ios_reload`            | Navigation                 |
| 8   | `ios_snapshot`          | Inspection                 |
| 9   | `ios_get_text`          | Inspection                 |
| 10  | `ios_get_html`          | Inspection                 |
| 11  | `ios_screenshot`        | Inspection                 |
| 12  | `ios_tap`               | Interaction                |
| 13  | `ios_fill`              | Interaction                |
| 14  | `ios_type`              | Interaction                |
| 15  | `ios_select`            | Interaction                |
| 16  | `ios_check`             | Interaction                |
| 17  | `ios_uncheck`           | Interaction                |
| 18  | `ios_swipe`             | Interaction (touch-native) |
| 19  | `ios_scroll`            | Interaction                |
| 20  | `ios_eval`              | Advanced                   |
| 21  | `ios_wait_for_selector` | Synchronization            |
| 22  | `ios_console_logs`      | Debug                      |

---

## Appendix B: Glossary

| Term                       | Definition                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ref**                    | A short handle (`e1`, `e2`, ...) assigned to an interactive DOM element during a snapshot. Used to target elements in subsequent tool calls.             |
| **Epoch**                  | A monotonically increasing counter that invalidates all refs when incremented. Prevents acting on stale element references.                              |
| **Snapshot**               | An accessibility-tree representation of the current page, with refs on interactive elements. The primary way the AI "sees" the page.                     |
| **WeakRef**                | A JavaScript primitive that holds a reference to an object without preventing garbage collection. Used to store element references without memory leaks. |
| **Lease**                  | A session's claim on a shared resource (iOS Simulator). The resource stays alive while any lease is held. Last release triggers cleanup.                 |
| **Sidecar**                | The agent-bridge process, compiled as a standalone Bun binary and spawned by Tauri. Runs alongside the main app.                                         |
| **MCP**                    | Model Context Protocol --- the interface through which the AI agent discovers and invokes tools.                                                         |
| **Dual-channel transport** | The system for returning eval results: small payloads via URL callback, large payloads via Tauri event IPC.                                              |
| **Scoped invalidation**    | The strategy of NOT invalidating refs on every DOM mutation, instead validating lazily at resolution time. Prevents over-invalidation on dynamic SPAs.   |
