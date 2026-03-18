# Decision: overflow-clip vs overflow-hidden for Layout Containers

**Date:** 2026-03-18
**Status:** Implemented
**Branch:** `feat/migration`

---

## Problem

Clicking anchor tags, triggering `scrollIntoView()`, or browser focus-scroll on deeply nested content caused the entire ContentCard (the floating rounded card) to shift upward, cutting off ~40% of visible content. The dark base layer became visible at the bottom where the card should have been.

This was **not** page-specific — it reproduced on the Changelog, Vault, Development, and Chat pages. Any action that triggered scroll propagation through the DOM ancestor chain could shift the card.

## Root Cause Analysis

### Why `overflow: hidden` is dangerous in nested layouts

`scrollIntoView()` traverses **every** scrollable ancestor and adjusts each one's `scrollTop`. The key insight:

- **`overflow: hidden`** — Creates a scroll container. No visible scrollbar, but `scrollTop` can be set programmatically. `scrollIntoView` **will** scroll it.
- **`overflow: clip`** — Does **NOT** create a scroll container. `scrollTop` is always 0. `scrollIntoView` **skips** it entirely.

Both visually clip overflowing content identically. The difference is purely about scroll behavior.

### The ancestor chain before the fix

```
html (overflow: hidden)          ← scroll container — scrollIntoView targets this
  body (overflow: hidden)        ← scroll container — scrollIntoView targets this
    ...
      Main content wrapper       ← overflow-hidden — scrollIntoView targets this
        ContentCard              ← overflow-hidden — scrollIntoView targets this
          Mode wrapper           ← overflow-clip ✓ (already correct)
            SettingsPage         ← overflow-auto (intended scroll target)
```

When `scrollIntoView({ block: 'start' })` was called on a deeply nested element:

1. It correctly scrolled `SettingsPage` (the intended container)
2. It skipped the mode wrapper (`overflow-clip`, not a scroll container)
3. It hit `ContentCard` (`overflow-hidden`) — shifted its `scrollTop`
4. It hit the main content wrapper (`overflow-hidden`) — shifted its `scrollTop`
5. It hit `body` / `html` (`overflow: hidden`) — shifted their `scrollTop`

The cumulative effect: the card visually jumped upward.

### The existing comment knew but used the wrong fix

```css
/* globals.css — line 205 (before) */
/* Lock the viewport — prevent ProseMirror's scrollIntoView() from calling
   window.scrollBy() when it walks up to document.body. */
html,
body {
  overflow: hidden; /* ← Does NOT prevent scrollIntoView from setting scrollTop */
}
```

And in App.tsx (mode wrapper):

```tsx
{/* overflow-clip (not overflow-hidden) prevents ProseMirror's scrollIntoView()
    from programmatically scrolling this container */}
<div className="flex-1 min-h-0 overflow-clip relative z-0">
```

The mode wrapper was correctly using `overflow-clip`, but all its ancestors still used `overflow-hidden`.

## What Changed

### 1. html, body (globals.css)

**File:** `apps/agent/src/globals.css`

```css
/* Before */
html,
body {
  overflow: hidden;
  height: 100%;
}

/* After */
html,
body {
  overflow: clip;
  height: 100%;
}
```

### 2. Main content wrapper (App.tsx)

**File:** `apps/agent/src/App.tsx`

```tsx
/* Before */
<div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

/* After */
<div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-clip">
```

### 3. ContentCard (content-card.tsx)

**File:** `apps/agent/src/components/layout/content-card.tsx`

```tsx
/* Before */
className = 'flex flex-col flex-1 min-w-0 overflow-hidden relative';

/* After */
className = 'flex flex-col flex-1 min-h-0 min-w-0 overflow-clip relative';
```

Note: `min-h-0` was added because `overflow-hidden` implicitly causes flex items' automatic `min-height` to resolve to 0 (allowing shrink). `overflow-clip` does **not** have this side effect — without `min-h-0`, the card overflows its parent and the bottom margin (the Arc-style gap) gets clipped.

## Why Not `scrollIntoView` Fixes per Page

An earlier attempt replaced `scrollIntoView()` in `ChangelogSettings.tsx` with a targeted `scrollTo()` on a specific container found via `data-settings-scroll`. This worked for that one page but:

- Required a data attribute on the scroll container
- Required every page with anchors/focus to implement its own scroll logic
- Didn't fix browser focus-scroll, tab navigation, or other implicit scroll triggers
- Was a bandaid, not a root cause fix

## Architecture

### After the fix

```
html (overflow: clip)            ← NOT a scroll container, skipped
  body (overflow: clip)          ← NOT a scroll container, skipped
    ...
      Main content wrapper       ← overflow-clip, skipped
        ContentCard              ← overflow-clip + min-h-0, skipped
          Mode wrapper           ← overflow-clip, skipped
            SettingsPage         ← overflow-auto (sole scroll target) ✓
```

`scrollIntoView` now has exactly one scrollable ancestor to target: the intended one.

## Design Principles Applied

| Principle                              | Source               | Application                                                                    |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| Fix at the root, not per-page          | General              | Changed 3 ancestor containers instead of patching each page's scroll calls     |
| `overflow-clip` over `overflow-hidden` | CSS Overflow Level 3 | Use `clip` for visual clipping when scroll behavior is unwanted                |
| Explicit flex constraints              | Flexbox spec         | Added `min-h-0` to ContentCard since `overflow-clip` doesn't implicitly set it |

## Files Modified

| File                                                | Change                                                   |
| --------------------------------------------------- | -------------------------------------------------------- |
| `apps/agent/src/globals.css`                        | `html, body { overflow: hidden }` → `overflow: clip`     |
| `apps/agent/src/App.tsx`                            | Main content wrapper `overflow-hidden` → `overflow-clip` |
| `apps/agent/src/components/layout/content-card.tsx` | `overflow-hidden` → `overflow-clip`, added `min-h-0`     |
