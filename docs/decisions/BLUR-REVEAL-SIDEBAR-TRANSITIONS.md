# Decision: Blur-Reveal Transitions for Sidebar View Switches

**Date:** 2026-03-12
**Status:** Implemented
**Branch:** `feat/migration`

---

## Problem

When switching between sidebar views (Sessions, Explorer, Settings), content appeared instantly — a hard cut that felt jarring compared to the polished transitions elsewhere in the UI. The goal: a blur-to-clear reveal animation on view switches, matching the `animate-title-in` effect already used for conversation title loading.

## Challenges Encountered

### 1. Per-item `filter: blur()` chokes the browser

First attempt: add `animate-title-in` to every file name `<span>` in the FileExplorer. With dozens of virtualized rows, each with `filter: blur(4px)` and `animation-fill-mode: both`, the browser couldn't start the animation timelines fast enough. Result: files appeared frozen in their blurred initial state for 1-1.5 seconds before the animation played.

**Root cause:** Each `filter: blur()` creates a separate compositing layer. Dozens of layers mounting simultaneously overwhelms GPU compositing. The `fill-mode: both` applies the `from` state (opacity: 0, blur: 4px) immediately, but the animation timeline can't start until the browser finishes layout for all layers.

**Fix:** Move the animation to the **container div** wrapping all virtualized rows. One compositing layer, one animation timeline. The blur on the parent visually blurs all children as a single composited unit.

### 2. `display: contents` breaks `filter` and `opacity`

For the ContentTopBar header text, we needed a wrapper element that wouldn't disrupt the flex layout. First attempt: `<span className="contents animate-title-in">`. The `display: contents` removes the element's box from the rendering tree, so `filter` and `opacity` have nothing to apply to — animation was completely invisible.

**Fix:** Use `<div className="flex items-center gap-1.5 min-w-0 animate-title-in">` — a real box element that mirrors the parent's flex layout.

### 3. Skeleton loading flash vs. minimum display time

The FileExplorer skeleton (replacing the old `Loader2` spinner) flashed too quickly on fast loads — appearing for a single frame before content replaced it. Added a `SKELETON_MIN_DISPLAY_MS = 250` hold timer. But the hold logic needed careful coordination with the blur reveal: the animation should only play when transitioning from skeleton to content, not on plain remount.

**Fix:** `animateReveal` state starts `true` on mount (covers tab switch) and is re-armed to `true` when `showSkeleton` becomes true (covers refresh). Cleared after 500ms.

## Architecture

### What Animates Where

| Element                               | Animation Strategy                              | Trigger                                                        |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| FileExplorer rows                     | `animate-title-in` on virtualizer container div | `animateReveal` state (true on mount, re-armed on skeleton)    |
| ConversationItem titles               | `animate-title-in` per item (unchanged)         | Component mount (few items, simple DOM — no perf issue)        |
| SettingsNavList                       | `animate-title-in` on root div                  | Component mount (conditional render — remounts on view switch) |
| Main Actions (New Session, etc.)      | `animate-title-in` on wrapper div               | Conditional render — remounts on tab switch                    |
| Bottom Utilities (Settings, Feedback) | `animate-title-in` + `key` on wrapper div       | `key` changes on view switch, forcing remount                  |
| ContentTopBar header text             | `animate-title-in` + `key` on flex wrapper      | `key` changes between `'settings-header'` / `'chat-header'`    |

### What Does NOT Animate

- Search bar (always visible, never changes)
- Tab headings and toggle switches (structural, not content)
- Navigation controls (sidebar toggle, back/forward arrows)

### The `title-reveal` Animation

Defined in `globals.css`:

```css
@keyframes title-reveal {
  from {
    opacity: 0;
    filter: blur(4px);
  }
  to {
    opacity: 1;
    filter: blur(0px);
  }
}

.animate-title-in {
  animation: title-reveal 400ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
```

- **Duration:** 400ms
- **Easing:** `cubic-bezier(0.23, 1, 0.32, 1)` — aggressive ease-out, snappy arrival
- **Fill mode:** `both` — initial state (blurred) applies from mount, final state (clear) persists
- **4px blur** is well under the 20px WKWebView performance threshold
- **Respects** `prefers-reduced-motion` (disabled via media query in globals.css)

### FileExplorer Skeleton + Reveal Flow

```
Tab Switch / Refresh
     │
     ▼
FileExplorer mounts
     │
     ├── Store has data? ──yes──► animateReveal=true, render container with animation
     │                            └── 500ms later: animateReveal=false (cleanup)
     │
     └── Store empty? ──yes──► isRootLoading=true
                                │
                                ▼
                          showSkeleton=true → <FileExplorerSkeleton />
                          (hold for SKELETON_MIN_DISPLAY_MS=250ms min)
                                │
                                ▼
                          Data arrives → showSkeleton=false
                          animateReveal re-armed → container renders with animation
                                │
                                ▼
                          500ms later: animateReveal=false (cleanup)
```

### Key-Based Remount Pattern

For elements that persist across view switches (Bottom Utilities, ContentTopBar header text), a React `key` prop forces unmount/remount when the view changes:

```tsx
<div
  key={settingsOpen ? 'settings' : activeTab}
  className="... animate-title-in"
>
```

Changing the key tells React this is a "different" element — it unmounts the old one and mounts a new one, re-triggering the CSS animation.

## Design Principles Applied

| Principle                 | Source                | Application                                                                        |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| Container-level animation | Performance           | One `filter: blur()` on parent vs. dozens on children — single compositing layer   |
| 4px blur max              | WKWebView limits      | Stays under the 20px threshold that causes WKWebView rendering issues              |
| `prefers-reduced-motion`  | Accessibility         | Animation disabled when user prefers reduced motion                                |
| Skeleton before reveal    | Perceived performance | Skeleton provides spatial preview; blur bridges skeleton→content transition        |
| Minimum display time      | Anti-flash            | 250ms skeleton hold prevents single-frame skeleton flash on fast loads             |
| Key-based remount         | React patterns        | Forces animation re-trigger on persistent elements without manual state management |

## Files Modified

| File                                                                              | Change                                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/files/file-explorer.tsx`                               | Skeleton component, skeleton hold timer, container-level blur reveal with `animateReveal` state |
| `apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`             | `animate-title-in` on Main Actions div, keyed Bottom Utilities div                              |
| `apps/agent/src/components/layout/primary-sidebar/components/SettingsNavList.tsx` | `animate-title-in` on root div                                                                  |
| `apps/agent/src/components/layout/content-top-bar.tsx`                            | Keyed flex wrapper with `animate-title-in` around header text                                   |

## Why Not Per-Item Animation for FileExplorer

ConversationItem uses per-item `animate-title-in` and works fine. The difference:

1. **Count:** ConversationList typically has 10-20 items. FileExplorer can have 50+ visible virtualized rows.
2. **DOM complexity:** Each FileTreeRow has icons, chevrons, git status badges, context menus. Conversation items are simpler.
3. **Mount timing:** Virtualized rows mount simultaneously into an absolutely-positioned container. The GPU must create compositing layers for all of them at once.

Container-level animation sidesteps all of this — one layer, one animation, visually identical.
