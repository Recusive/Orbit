# Plan: Fix Embedded Browser Overlapping Dialogs

## Context

The embedded browser is a **native Tauri child window** (WKWebView/NSWindow) that sits in a separate OS compositing layer above the main app's webview. CSS z-index cannot control stacking between native OS windows and DOM elements. When any Radix Dialog opens (worktree, skills, projects, clone repo, etc.), it renders inside the DOM via a `<DialogPortal>` with `fixed inset-0` — but the native browser window still composites on top, making dialogs invisible behind the browser.

The Rust backend already has `browser_hide` / `browser_show` commands that move the browser offscreen (-10000, -10000 at 1x1) to hide it and restore saved bounds to show it. These preserve the NSWindow parent-child relationship. The frontend already has `browserHide()` / `browserShow()` API wrappers. They just aren't wired to dialog open/close events.

**Settings and vault pages** are inline within the center content area (`absolute inset-0` inside the center panel div) and do NOT overlap the browser in the right activity panel. Only full-viewport Radix Dialog portals need coordination.

### Current Browser Visibility Authority

Browser visibility is currently owned by `ActivityPanel` (`activity-panel.tsx:432-441`). It sends `browser:show` or `browser:hide` messages based on `reviewPanelOpen && activeTab === 'browser'`. Any new visibility coordinator must integrate with this existing policy, not compete with it.

## Approach: Unified Visibility Predicate + DialogOverlay Hook

1. **Single visibility predicate** — `shouldBrowserBeVisible()` combines panel state, activity tab, browser existence, and overlay count into one truth source.
2. **Ref-counted overlay counter** — `onOverlayMount`/`onOverlayUnmount` track how many full-viewport overlays are active.
3. **`DialogOverlay` hook** — a `useEffect` in the shared `DialogOverlay` increments/decrements the counter, covering all dialog variants that use it.
4. **`BrowserAwareOverlay` export** — a tracked overlay primitive for raw Radix dialogs that don't use the shared `DialogOverlay` (settings child dialogs).
5. **Browser creation guard** — after `browserCreate` succeeds, check `getOverlayCount()` and auto-hide if dialogs are active.

## Files to Create

### 1. `apps/agent/src/lib/browser-overlay-coordination.ts` (NEW)

Module-level overlay counter, unified visibility predicate, and safe hide/show:

```typescript
import { useBrowserStore } from '@/stores/browser/browser-store';
import { useUIStore } from '@/stores/ui/ui-store';

let overlayCount = 0;
let hidePromise: Promise<void> | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/** Read current overlay count (used by browser creation and ActivityPanel). */
export function getOverlayCount(): number {
  return overlayCount;
}

/**
 * Single source of truth for whether the native browser window should be visible.
 * Used by both the overlay coordinator and ActivityPanel to prevent conflicting
 * show/hide commands.
 */
export function shouldBrowserBeVisible(): boolean {
  const { viewId } = useBrowserStore.getState();
  const { reviewPanelOpen, activityTab } = useUIStore.getState();

  return viewId !== null && reviewPanelOpen && activityTab === 'browser' && overlayCount === 0;
}

export function onOverlayMount(): void {
  // Cancel pending show (prevents flash between consecutive dialogs)
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  overlayCount++;
  if (overlayCount === 1) {
    hidePromise = hideBrowserSafe();
  }
}

export function onOverlayUnmount(): void {
  overlayCount = Math.max(0, overlayCount - 1);
  if (overlayCount === 0) {
    // 16ms debounce (1 frame) prevents flash between consecutive dialogs.
    // Radix delays DialogOverlay unmount until after exit animation completes,
    // so useEffect cleanup fires post-animation. The debounce primarily handles
    // the React render tick between unmount and mount of consecutive dialogs.
    showTimer = setTimeout(() => {
      showTimer = null;
      void showBrowserSafe();
    }, 16);
  }
}

/**
 * Called after browser creation to sync visibility with active overlays.
 * Routes the hide through the coordinator so `hidePromise` is tracked —
 * without this, a later `showBrowserSafe()` can race a raw `browserHide()`
 * and leave the browser hidden after the last dialog closes.
 */
export function syncBrowserVisibilityAfterCreate(): void {
  if (overlayCount === 0) return;
  hidePromise = hideBrowserSafe();
}

/**
 * Reset all module state. Used by HMR dispose and test teardown.
 */
export function resetBrowserOverlayCoordination(): void {
  overlayCount = 0;
  hidePromise = null;
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════

async function hideBrowserSafe(): Promise<void> {
  if (useBrowserStore.getState().viewId === null) return;
  try {
    const { browserHide } = await import('@/lib/api/browser');
    await browserHide();
  } catch {
    // Browser doesn't exist or already hidden — no-op
  }
}

async function showBrowserSafe(): Promise<void> {
  // Snapshot the current hide promise so we can check identity after await.
  // If a new dialog opens while we're waiting, onOverlayMount() overwrites
  // hidePromise with a newer promise. Without the identity check, we'd null
  // the newer promise and let browserShow() race ahead of browserHide().
  const pendingHide = hidePromise;

  if (pendingHide !== null) {
    await pendingHide;

    // Only clear the slot if nobody replaced it while we were waiting.
    if (hidePromise === pendingHide) {
      hidePromise = null;
    }
  }

  // Re-check after await — a new dialog may have opened while we waited,
  // or the user may have switched away from the browser tab
  if (!shouldBrowserBeVisible()) return;
  try {
    const { browserShow } = await import('@/lib/api/browser');
    await browserShow();
  } catch {
    // Browser was closed while dialog was open — no-op
  }
}

// ═══════════════════════════════════════════════════════════════
// HMR cleanup
// ═══════════════════════════════════════════════════════════════

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetBrowserOverlayCoordination();
  });
}
```

Key design decisions:

- **`shouldBrowserBeVisible()`** — single predicate that both the overlay coordinator and `ActivityPanel` use, preventing conflicting show/hide commands. Checks `reviewPanelOpen`, `activityTab === 'browser'`, `viewId !== null`, AND `overlayCount === 0`.
- **Module-level counter** (not Zustand) — no re-renders needed; purely for coordination
- **16ms debounce on show** — prevents browser flash when closing one dialog and opening another
- **Promise-identity check + `shouldBrowserBeVisible()` re-check after await** — `showBrowserSafe` snapshots `hidePromise` before awaiting. If a new dialog opened during the await (overwriting `hidePromise`), the identity check preserves the newer promise so the next show path still awaits it. The `shouldBrowserBeVisible()` re-check catches both overlay-count and panel-state changes.
- **`viewId` guard** — skips IPC when no browser exists
- **Dynamic import** of browser API — avoids circular deps, keeps module lightweight
- **`resetBrowserOverlayCoordination()`** — HMR cleanup + test teardown helper, matching the pattern used by `chat-message-service.ts`, `use-tauri.ts`, `browser-tool-handler.ts`, etc.

## Files to Modify

### 2. `apps/agent/src/components/ui/dialog.tsx`

Convert `DialogOverlay` from implicit return to explicit return (required to add the `useEffect` hook), and wire up the coordination:

```typescript
// Add import at top:
import { onOverlayMount, onOverlayUnmount } from '@/lib/browser-overlay-coordination';

// Replace the current DialogOverlay (implicit return) with explicit return:
const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  React.useEffect(() => {
    onOverlayMount();
    return (): void => { onOverlayUnmount(); };
  }, []);

  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-black/15 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    />
  );
});
```

This covers all ~15 dialog instances that use `DialogContent`, `DialogContentGlass`, or `DialogContentTopCenter` (including `CommandDialog`).

### 3. `apps/agent/src/components/modals/settings/pages/SlashCommandsSettings.tsx` and `SubagentsSettings.tsx`

These two components use raw `DialogPrimitive.Overlay` instead of the shared `DialogOverlay`. Replace with a browser-aware overlay. Two options:

**Option A (preferred): Import and use the shared `DialogOverlay`**

```typescript
// Replace:
import * as DialogPrimitive from '@radix-ui/react-dialog';
// ...
<DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-black/15 ..." />

// With:
import { DialogOverlay } from '@/components/ui/dialog';
// ...
<DialogOverlay className="z-60" />
```

**Option B: If z-60 or other class overrides prevent reuse, export a `BrowserAwareDialogOverlay` component**

Create a lightweight wrapper that can be dropped into any raw `DialogPrimitive.Portal`:

```tsx
// In browser-overlay-coordination.tsx (or a new file alongside dialog.tsx):
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { onOverlayMount, onOverlayUnmount } from '@/lib/browser-overlay-coordination';

export const BrowserAwareDialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  React.useEffect(() => {
    onOverlayMount();
    return (): void => {
      onOverlayUnmount();
    };
  }, []);

  return <DialogPrimitive.Overlay ref={ref} className={cn(className)} {...props} />;
});
BrowserAwareDialogOverlay.displayName = 'BrowserAwareDialogOverlay';
```

Then in `SlashCommandsSettings.tsx` / `SubagentsSettings.tsx`, replace the raw overlay:

```tsx
// Replace:
<DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-black/15 backdrop-blur-sm ..." />

// With:
<BrowserAwareDialogOverlay className="fixed inset-0 z-60 bg-black/15 backdrop-blur-sm ..." />
```

**IMPORTANT:** Do NOT use a component-level hook (e.g. `useBrowserOverlayTracking()` inside `CommandEditor` or `AgentEditor`). Those editor components stay mounted with `open={false}` and only toggle visibility — a component-level hook would fire `onOverlayMount` even when the dialog is closed, incorrectly hiding the browser whenever the settings page renders. The tracking must live inside the overlay element itself, which only mounts when the dialog is actually open.

### 4. `apps/agent/src/components/panels/activity-panel.tsx`

Update the browser visibility effect to use the shared predicate instead of making an independent decision:

```typescript
// Add import:
import { shouldBrowserBeVisible } from '@/lib/browser-overlay-coordination';

// Replace the visibility effect (lines 432-441):
useEffect(() => {
  if (!canManageBrowser || !isBrowserActive) return;

  const shouldShow = shouldBrowserBeVisible();

  postMessage({
    type: shouldShow ? 'browser:show' : 'browser:hide',
    uuid: generateUUID(),
  });
}, [canManageBrowser, activeTab, isBrowserActive, postMessage, reviewPanelOpen]);
```

**Note:** The dependency array stays the same — `shouldBrowserBeVisible()` reads from stores synchronously inside the effect. The effect re-runs when any of the listed deps change, which is correct because those are the same values `shouldBrowserBeVisible()` checks. The one missing dep is `overlayCount`, but the overlay coordinator handles that path independently (it calls `hideBrowserSafe`/`showBrowserSafe` directly). If this becomes a concern, `overlayCount` can be lifted into a tiny Zustand atom that `ActivityPanel` subscribes to.

### 5. `apps/agent/src/hooks/agent/handlers/browser-handlers.ts`

After browser creation succeeds, sync visibility through the coordinator so `hidePromise` is tracked:

```typescript
// After line 79 (browserStore.setCreating(false)):
import { syncBrowserVisibilityAfterCreate } from '@/lib/browser-overlay-coordination';

// If dialogs are open, hide the new browser through the coordinator.
// This updates hidePromise so later showBrowserSafe() awaits the correct
// hide before restoring. BrowserWindowState.hidden defaults to false on
// creation, so the Rust hidden flag won't block set_bounds without this.
syncBrowserVisibilityAfterCreate();
```

**Why not raw `browserHide()`?** A fire-and-forget `browserHide().catch(...)` bypasses the coordinator's `hidePromise`. If the dialog closes quickly after browser creation, `showBrowserSafe()` may not know about the in-flight hide and call `browserShow()` before the hide completes — leaving the browser hidden after the last dialog closes. Routing through `syncBrowserVisibilityAfterCreate()` stores the hide promise so the show path sequences correctly.

**Note:** This guard is only needed on the real Tauri creation path in `browser-handlers.ts`. In mock/browser-only mode (`use-tauri-mock.ts`), there is no native NSWindow to hide — `hideBrowserSafe()` catches the failed invoke silently. The `browser:created` event path in `use-browser.ts` does not need a separate guard.

## Edge Cases Handled

| Edge Case                                                  | Behavior                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple dialogs open simultaneously                       | Counter increments to 2+. Browser stays hidden until ALL close                                                                                                                                                            |
| Dialog animation exit (Radix delayed unmount)              | `useEffect` cleanup fires after exit animation completes — no premature show                                                                                                                                              |
| Consecutive dialogs (close one, open another)              | 16ms debounce cancels pending show; browser stays hidden throughout                                                                                                                                                       |
| No browser running                                         | `viewId === null` guard in `shouldBrowserBeVisible()` skips IPC — no errors                                                                                                                                               |
| Browser idle-closes while dialog is open                   | `browserShow` fails silently (swallowed catch)                                                                                                                                                                            |
| Browser created while dialog is open                       | `syncBrowserVisibilityAfterCreate()` routes hide through coordinator, updating `hidePromise`; later `showBrowserSafe` awaits that promise before restoring                                                                |
| Dialog opens during `showBrowserSafe` await                | Promise-identity check preserves the newer `hidePromise`; `shouldBrowserBeVisible()` re-check returns false (`overlayCount > 0`) — prevents premature show and ensures the later close path still awaits the correct hide |
| Dialog closes while browser tab is not active              | `shouldBrowserBeVisible()` returns false (`activityTab !== 'browser'`) — browser stays hidden                                                                                                                             |
| Dialog closes while review panel is collapsed              | `shouldBrowserBeVisible()` returns false (`!reviewPanelOpen`) — browser stays hidden                                                                                                                                      |
| ActivityPanel switches to browser tab while dialog is open | `shouldBrowserBeVisible()` returns false (`overlayCount > 0`) — browser stays hidden                                                                                                                                      |
| React StrictMode double-invoke (dev only)                  | Mount → unmount → mount: fires one extra `browserHide()`, net behavior correct                                                                                                                                            |
| `browserHide()` IPC fails                                  | Error swallowed, counter still tracks correctly                                                                                                                                                                           |
| HMR module reload                                          | `import.meta.hot.dispose()` calls `resetBrowserOverlayCoordination()`                                                                                                                                                     |
| App quit while dialog is open                              | Tauri destroys all windows. No leaked state                                                                                                                                                                               |
| Mock/browser-only mode                                     | `invoke()` throws (no `__TAURI__`), swallowed by catch blocks — silent no-op                                                                                                                                              |
| SlashCommands/Subagents settings child dialogs             | Use shared `DialogOverlay` (Option A) or `BrowserAwareDialogOverlay` component (Option B) — tracking lives in the overlay element, not the always-mounted editor component                                                |

## Verification

1. Open browser panel, launch a browser to any URL
2. Open worktree dialog (Cmd+Shift+W or sidebar) → browser should hide, dialog visible
3. Close dialog → browser should reappear at same position
4. Open settings (Cmd+,) → browser should remain visible (settings is center-only, not a portal dialog)
5. Open projects dialog → browser hides; open a sub-dialog inside → still hidden; close both → browser reappears
6. With no browser running, open/close dialogs → no errors in console
7. Open command palette (Cmd+K) → browser hides; close → browser reappears
8. Open a dialog, then create browser via AI tool → browser should auto-hide while dialog is open
9. Rapidly open/close consecutive dialogs with browser active → no flash of browser between transitions
10. Open Settings → Slash Commands → Create/Edit dialog → browser should hide (raw Radix overlay)
11. Open Settings → Subagents → Create/Edit dialog → browser should hide (raw Radix overlay)
12. Close a dialog while on `source` tab (not browser tab) → browser should NOT reappear
13. Close a dialog while review panel is collapsed → browser should NOT reappear
14. `bun run dev` (browser-only mode) → open/close dialogs → no console errors from failed invoke
