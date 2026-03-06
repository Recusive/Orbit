# Fix: browser_navigate returns success without verifying navigation

## Context

`browser_navigate` can return success even when the page hasn't actually changed. The Rust backend calls `window.navigate(url)` on the WKWebView and returns `Ok(())` immediately. The frontend tool handler then returns `{ navigated: true, url }` without waiting for navigation to commit. When the AI follows up with `browser_get_url`, it reads the old URL.

A previous fix attempt polled `window.url()` in Rust immediately after `window.navigate()`, which caused a panic in `wry::wkwebview::url_from_webview` (`Option::unwrap()` on `None`). We must not call `window.url()` synchronously after navigate.

**Goal**: Make `browser_navigate` wait for WebKit's navigation-committed signal before reporting success, using the existing `browser:navigated` Tauri event infrastructure.

## Root Cause

1. **Rust** (`mod.rs:746`): `browser_navigate_inner` calls `window.navigate(parsed_url)` and returns `Ok(())` — no verification.
2. **Frontend** (`browser-tool-handler.ts:337`): `executeBrowserTool('browser_navigate')` calls `browserNavigate(url)` then only checks `waitForBrowserReady()` (window existence), not URL change.
3. **Event gap**: `on_navigation` (line 672) fires asynchronously and emits `browser:navigated` with the committed URL, but nothing listens for it during the navigate flow.

## Approach: Frontend Event-Based Verification

Pure frontend fix — no Rust changes needed. The `on_navigation` callback (WebKit's `decidePolicyForNavigationAction`) already emits `browser:navigated` with the destination URL when WebKit **accepts** the navigation. We listen for this event before triggering navigate, then wait for it with a timeout.

### Why frontend-only?

- `on_navigation` already emits the needed event from Rust — the signal exists
- Adding async waiting in the Rust command would require restructuring `browser_navigate_inner` (currently sync)
- The `browser:navigated` event payload contains the committed URL, handling redirects
- No `window.url()` calls — zero crash risk

## Changes

### 1. `apps/agent/src/lib/api/core.ts` — Add `listenOnce`

Add a one-shot event listener (mirrors existing `listen` on line 77):

```typescript
export async function listenOnce<T>(
  event: string,
  callback: EventCallback<T>
): Promise<() => void> {
  if (!IS_TAURI) {
    logger.debug(`Mock listenOnce: ${event}`);
    return (): void => {};
  }
  const { once: tauriOnce } = await import('@tauri-apps/api/event');
  const unlisten = await tauriOnce<T>(event, (e): void => {
    callback(e.payload);
  });
  return unlisten;
}
```

### 2. `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts` — Navigation verification

Add `waitForNavigationCommit()` helper and update both `browser_navigate` and `browser_open` cases.

**New helper** (~25 lines):

```typescript
const NAVIGATION_COMMIT_TIMEOUT_MS = 5000;

async function waitForNavigationCommit(
  timeoutMs = NAVIGATION_COMMIT_TIMEOUT_MS
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let settled = false;
    let unlistenFn: (() => void) | null = null;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        unlistenFn?.();
        resolve(null);
      }
    }, timeoutMs);

    listenOnce<BrowserNavigatedEvent>('browser:navigated', (event) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(event.url);
      }
    })
      .then((unlisten) => {
        unlistenFn = unlisten;
        if (settled) unlisten();
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
  });
}
```

**Modified `browser_navigate` case** (key change):

- Set up `waitForNavigationCommit()` BEFORE calling `browserNavigate(url)` (avoids missing the event)
- After `browserNavigate` returns and browser is ready, await the commit promise
- Return `committedUrl` (from event) instead of the requested `url`
- On timeout, log warning but still return success with requested URL (graceful degradation)

**Same pattern applied to `browser_open`** when browser already exists (the `if (exists)` branch).

### 3. `apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts` — Tests

Add to the existing `browser_open/browser_navigate stale state` describe block:

1. **`browser_navigate waits for navigation commit and returns committed URL`**
   - Mock `listenOnce` to resolve with `{ url: 'https://example.com/' }` (trailing slash = redirect)
   - Verify result contains the committed URL, not the requested URL

2. **`browser_navigate returns requested URL on commit timeout`**
   - Mock `listenOnce` to never fire (simulating timeout)
   - Verify result still returns success with the originally requested URL

3. **`browser_navigate sets up listener before calling browserNavigate`**
   - Verify `listenOnce` is called before `mockBrowserNavigate`

4. **`browser_open with existing browser waits for navigation commit`**
   - Same pattern as test 1, but for `browser_open` with `browserHas()` returning true

Mock setup: Add `mockListenOnce` to the `vi.hoisted` block and `vi.mock('@/lib/api/core')` with the existing `listenOnce` export.

## Files Modified

| File                                                                     | Change                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `apps/agent/src/lib/api/core.ts`                                         | Add `listenOnce<T>()` (6 lines)                                             |
| `apps/agent/src/hooks/agent/handlers/browser-tool-handler.ts`            | Add `waitForNavigationCommit()`, update `browser_navigate` + `browser_open` |
| `apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts` | 4 new test cases                                                            |

## Files Referenced (read-only)

| File                                          | Why                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src-tauri/src/commands/browser/mod.rs`       | Verified `on_navigation` emits `browser:navigated` with committed URL (line 682-687) |
| `apps/agent/src/lib/api/browser.ts`           | `BrowserNavigatedEvent` type (line 26-29), `browserNavigate` function (line 115-118) |
| `apps/agent/src/hooks/browser/use-browser.ts` | Verified `browser:navigated` handler updates store URL (line 107-120)                |

## Key Safety Properties

1. **No `window.url()` call** — zero crash risk from Wry
2. **Listener registered BEFORE navigate** — no race condition
3. **5-second timeout** — prevents hanging; falls back to requested URL
4. **`orbit-eval://` URLs filtered** — `on_navigation` returns `false` for eval callbacks, so `browser:navigated` never fires for them
5. **Sequential tool execution** — tools run one at a time, so no concurrent-navigation conflicts
6. **Mock mode safe** — `listenOnce` returns no-op in non-Tauri, timeout resolves `null`

## Verification

```bash
# 1. TypeScript checks
bun run typecheck
bun run lint

# 2. Run tests
bun run test apps/agent/src/__tests__/unit/hooks/agent/browser-tool-handler.test.ts

# 3. Full check suite
bun run check

# 4. Rust check (no Rust changes, but verify nothing broke)
cargo check

# 5. Manual test (bunx tauri dev)
#    - Open embedded browser to https://news.ycombinator.com/
#    - Run browser_navigate to https://example.com/
#    - Run browser_get_url
#    - Verify URL shows https://example.com/ (not HN)
```
