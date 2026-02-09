# Instant Theme Switching (Transition Suppression)

> **Status:** Not yet implemented
> **Priority:** Medium
> **Category:** Polish / perceived performance

---

## Problem

When toggling between light and dark mode, every element with a CSS transition (e.g. `transition-colors duration-150`) visibly interpolates between its light and dark color values. This creates a ~150ms "color wash" effect where backgrounds, borders, and text all lerp through intermediate states.

This is noticeable because the app has `transition-colors` or `transition-[background-color,color]` on nearly every interactive element (buttons, sidebar items, menu items, tabs, inputs). The cumulative effect looks sluggish compared to VS Code, Zed, or any native macOS app where theme changes are instant.

## How Other Editors Handle It

VS Code, Zed, and Cursor all suppress transitions during theme switches. The theme change appears to happen in a single frame — no interpolation visible.

## Recommended Fix

Use the **two-frame requestAnimationFrame disable pattern** in the theme toggle logic:

```typescript
function setTheme(isDark: boolean): void {
  // 1. Inject a temporary style that kills ALL transitions
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }
  `;
  document.head.appendChild(style);

  // 2. Toggle the theme class
  document.documentElement.classList.toggle('dark', isDark);

  // 3. Force a synchronous reflow so the browser paints with new colors
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  document.body.offsetHeight;

  // 4. Remove the suppression style on the next frame
  // Two rAF calls ensure the browser has fully painted before re-enabling transitions
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      style.remove();
    });
  });
}
```

### Why two `requestAnimationFrame` calls?

A single `requestAnimationFrame` fires _before_ the browser paints. The callback runs in the "pre-paint" phase, so removing the style there could still allow the browser to see the old and new values in the same paint and interpolate. The second `requestAnimationFrame` guarantees the suppression style was present for at least one full paint cycle.

### Why `offsetHeight`?

Reading a layout property like `offsetHeight` forces a synchronous reflow. This ensures the browser processes the class change (and all resulting style recalculations) _before_ we schedule the style removal. Without it, the browser might batch the class toggle and style removal together, defeating the purpose.

## Where to Implement

The theme class is toggled in the theme sync system. The relevant code path:

1. **Backend event** — Tauri emits a theme change event when the OS appearance changes or the user toggles in settings
2. **Frontend handler** — `useThemeSync` (or equivalent) in `App.tsx` receives the event and sets `document.documentElement.classList`
3. **Settings UI** — The appearance settings page has a theme toggle that calls the same path

All paths that call `document.documentElement.classList.toggle('dark', ...)` should use the suppression wrapper.

### Suggested API

Create a utility function in `apps/agent/src/lib/utils/`:

```typescript
// theme-utils.ts

/**
 * Toggle the dark class on <html> with transition suppression.
 * Prevents the visible "color wash" when switching themes.
 */
export function applyThemeInstant(isDark: boolean): void {
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }
  `;
  document.head.appendChild(style);

  document.documentElement.classList.toggle('dark', isDark);

  // Force synchronous reflow
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  document.body.offsetHeight;

  // Re-enable transitions after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      style.remove();
    });
  });
}
```

Then replace all direct `classList.toggle('dark', ...)` calls with `applyThemeInstant(isDark)`.

## Edge Cases

- **Initial load**: No suppression needed — the theme class is set before the first paint (in `<script>` or during hydration), so there's nothing to transition from.
- **System theme change**: macOS can change appearance while the app is backgrounded. When the app returns to foreground, the same suppression should apply.
- **CodeMirror**: The editor uses a `MutationObserver` on the `dark` class to swap its internal theme. The observer fires synchronously during the class toggle, so the editor theme change is already captured within the suppression window.
- **Terminal (xterm.js)**: Terminal theme is synced via a separate `theme-sync.ts` module that writes to the xterm `ITheme` object. This is not CSS-based, so transition suppression doesn't affect it.

## References

- Emil Kowalski's design engineering principles on theme transitions
- [Chrome DevTools source](https://chromium.googlesource.com/devtools/devtools-frontend/) — uses the same pattern for their theme toggle
- VS Code uses a similar approach in `vs/platform/theme`
