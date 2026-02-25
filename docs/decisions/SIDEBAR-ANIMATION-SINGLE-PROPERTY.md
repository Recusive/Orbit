# Decision: Single-Property Sidebar Animation

**Date:** 2026-02-24
**Status:** Implemented
**Branch:** `fix/0.0.5`

---

## Problem

The primary sidebar's collapse/expand animation was visibly glitchy — laggy, desynced, and janky when toggled rapidly. The activity panel, by contrast, animated smoothly. Both panels are structurally similar (flex children with slide-to-hide behavior), so the difference came down to their animation strategies.

### Old Sidebar (Glitchy)

Animated **two layout properties** simultaneously:

```typescript
transition: `margin-left ${CONTENT_CARD.transition}, width ${CONTENT_CARD.transition}`;
```

```typescript
// Width shrinks while margin slides — two layout recalculations per frame
width: isSliding ? minWidth : sidebarWidth,
marginLeft: isSliding ? sidebarWidth - minWidth : 0,
```

### Activity Panel (Smooth)

Animated **one property** on a fixed-width container:

```typescript
transition: `margin-right ${CONTENT_CARD.transition}`;
```

```typescript
// Width never changes — only marginRight slides the panel off-screen
width: reviewPanelWidth,
marginRight: activityOpen ? 0 : -reviewPanelWidth,
```

## Why Two Properties Cause Jank

Each animated layout property (`width`, `margin-left`) triggers a full layout recalculation per frame. With two properties animating simultaneously:

1. **Double layout cost**: The browser recalculates layout twice per frame instead of once
2. **Desync risk**: Even with identical easing/duration, browser scheduling can cause the two properties to be at slightly different interpolation points within the same frame — the Paired Elements Rule from Emil's animation course warns against this
3. **Content reflow**: Changing `width` forces all child elements to reflow (ConversationList, FileExplorer, SourceControlTab), multiplying the layout cost
4. **Compound jank**: The sidebar has heavier content than the activity panel, so layout recalculation is more expensive

## What Changed

### 1. AppShell — Single `margin-left` Transition

**File:** `apps/agent/src/components/layout/app-shell.tsx`

Replaced the two-property transition with a single `margin-left` slide on a fixed-width wrapper:

```typescript
// Before: two layout properties
transition: `margin-left ${CONTENT_CARD.transition}, width ${CONTENT_CARD.transition}`;
width: isSliding ? minWidth : sidebarWidth;
marginLeft: isSliding ? sidebarWidth - minWidth : 0;

// After: single property, fixed width
transition: `margin-left ${CONTENT_CARD.transition}`;
width: isCollapsed ? lastExpandedSidebarWidth : sidebarWidth; // never transitions
marginLeft: isCollapsed ? -visualWidth : 0; // only this animates
```

The `lastExpandedSidebarWidth` prop (from UIStore) keeps the wrapper at its last expanded width during collapse. `marginLeft: -visualWidth` slides it off the left edge. The parent's `overflow: hidden` clips the offscreen portion.

### 2. App.tsx — Pass `lastExpandedSidebarWidth`

**File:** `apps/agent/src/App.tsx`

Added store selector and prop pass-through:

```typescript
const lastExpandedSidebarWidth = useUIStore((s) => s.lastExpandedSidebarWidth);
// ...
<AppShell lastExpandedSidebarWidth={lastExpandedSidebarWidth} ... />
```

### 3. SidebarResizeHandle — Match Drag Behavior to New Layout

**File:** `apps/agent/src/components/layout/sidebar-resize-handle.tsx`

Updated `applySidebarWidth` to handle three states during drag (with `transition: none`):

| State                         | Width         | MarginLeft     |
| ----------------------------- | ------------- | -------------- |
| Normal (>= minUsable)         | actual width  | 0              |
| Resistance (< minUsable, > 0) | minUsable     | 0              |
| Collapsed (<= 0)              | expandedWidth | -expandedWidth |

The collapsed case uses `expandedWidth` (not `minUsable`) so the DOM matches what React will set on mouseup — prevents a visible width flash when transitions re-enable.

### 4. ContentTopBar — Animated Controls Reveal

**File:** `apps/agent/src/components/layout/content-top-bar.tsx`

The navigation controls (sidebar toggle, back/forward arrows, new session button) were conditionally rendered with `{!sidebarOpen ? <buttons/> : null}`, causing the project name and session title to jump instantly when the sidebar closed.

Replaced with an always-rendered `overflow: hidden` container that transitions `max-width` + `opacity` in sync with the sidebar timing:

```typescript
<div
  className="shrink-0 overflow-hidden"
  aria-hidden={sidebarOpen}
  style={{
    maxWidth: sidebarOpen ? 0 : CONTROLS_MAX_WIDTH,
    opacity: sidebarOpen ? 0 : 1,
    pointerEvents: sidebarOpen ? 'none' : 'auto',
    transition: CONTROLS_TRANSITION, // same easing as sidebar
  }}
>
```

Includes `aria-hidden`, `tabIndex: -1`, and `pointer-events: none` for accessibility when hidden.

## Architecture

```
Toggle Sidebar
     │
     ▼
UIStore.toggleLeftSidebar()
     │
     ├── leftSidebarWidth → 0 (collapse) or lastExpandedSidebarWidth (expand)
     │
     ▼
AppShell (wrapperStyle)
     │
     ├── width: lastExpandedSidebarWidth     ← NEVER changes during animation
     ├── marginLeft: 0 → -width              ← ONLY this animates
     └── transition: margin-left 200ms ease-out-quart
     │
     ▼
ContentTopBar (controls wrapper)
     │
     ├── maxWidth: 0 → 148px                 ← reveals in sync
     ├── opacity: 0 → 1
     └── transition: same easing as sidebar

Drag Resize (SidebarResizeHandle)
     │
     ├── transition: none (disabled during drag)
     ├── applySidebarWidth() sets width + marginLeft directly on DOM
     └── On mouseup: commit to React state, re-enable transitions
```

## Design Principles Applied

| Principle                              | Source               | Application                                                                                  |
| -------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| Only animate `transform` and `opacity` | Emil — Golden Rule   | Sidebar uses `margin-left` (one layout prop, not two) — pragmatic compromise for flex layout |
| Paired Elements Rule                   | Emil — Animations    | Controls transition uses same easing/duration as sidebar                                     |
| No layout shift                        | Emil — Core #1       | Controls always in DOM with `overflow: hidden`, not conditionally rendered                   |
| prefers-reduced-motion                 | Emil — Accessibility | `PREFERS_REDUCED_MOTION` disables all transitions                                            |
| Exit faster than entrance              | Emil — Duration      | Both directions use 200ms (symmetric for sidebar feel)                                       |

## Files Modified

| File                                                         | Change                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `apps/agent/src/components/layout/app-shell.tsx`             | Single `margin-left` transition, `lastExpandedSidebarWidth` prop |
| `apps/agent/src/App.tsx`                                     | Pass `lastExpandedSidebarWidth` from store                       |
| `apps/agent/src/components/layout/sidebar-resize-handle.tsx` | Three-state `applySidebarWidth` with `expandedWidth` parameter   |
| `apps/agent/src/components/layout/content-top-bar.tsx`       | Animated controls reveal with `max-width` + `opacity`            |

## Why Not Pure `transform` + `opacity`

The golden rule says to only animate `transform` and `opacity`. We use `margin-left` instead because:

1. The sidebar participates in flex layout — its width determines the content card's available space
2. `transform: translateX()` would move the sidebar visually but not reclaim space — the content card wouldn't expand to fill the gap
3. A single `margin-left` on a fixed-width wrapper is the minimal layout cost: one property, one recalculation per frame, no content reflow inside the sidebar
4. This matches the activity panel pattern that already feels smooth in production
