# Fix: Activity panel pushed off-screen when sidebar opens

## Context

When the activity panel is open at a large width and the sidebar is collapsed, everything fits. But when the user opens the sidebar, it takes ~256px, reducing available space. The activity panel width is never re-clamped, so with the chat column's `minWidth: 400px` floor, the total exceeds the viewport — pushing the activity panel off the right edge of the window.

Root cause: `reviewPanelWidth` is only clamped at drag-time (`getActivityMax` in the `ResizeHandle`). No reactive mechanism re-clamps it when the cards row width changes.

## Changes

### 1. Add selectors in App.tsx

**File:** `apps/agent/src/App.tsx` ~line 387 (after `reviewPanelWidth` selector)

```typescript
const setReviewPanelWidth = useUIStore((s) => s.setReviewPanelWidth);
```

### 2. Observe cards row width via local ResizeObserver

**File:** `apps/agent/src/App.tsx` — after `cardsRowRef` declaration (~line 807)

Track the actual cards row width with a local `ResizeObserver`. This reacts to sidebar toggle, sidebar drag (DOM-only until mouseup), right sidebar toggle, and window resize through a single source of truth.

**Why not `useContainerWidth`:** That hook attaches its observer once on mount. `App.tsx` returns early to `<OnboardingFlow />` before `cardsRowRef` mounts, so the ref is `null` on first effect run. Because the hook depends only on the stable `ref` object, it never retries. A local observer with `hasCompletedOnboarding` in the dependency array re-runs when onboarding completes and the cards row actually mounts.

```typescript
const [cardsRowWidth, setCardsRowWidth] = useState(0);

// Observe the cards row width — drives the activity panel clamp.
// ResizeObserver fires on any cause: sidebar toggle/drag, right sidebar,
// window resize. Re-attaches after onboarding completes (ref becomes non-null).
useEffect(() => {
  const row = cardsRowRef.current;
  if (!row) return;

  setCardsRowWidth(row.getBoundingClientRect().width);

  let rafId: number | null = null;
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;

    // RAF-debounce: coalesce rapid resize events into one update per frame
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      setCardsRowWidth(entry.contentRect.width);
    });
  });

  observer.observe(row);
  return (): void => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    observer.disconnect();
  };
}, [hasCompletedOnboarding, isDemo]);
```

### 3. Add reactive clamp effect driven by observed row width

**File:** `apps/agent/src/App.tsx` — insert after `getActivityMax` (after line 827)

```typescript
// Re-clamp activity panel width when the cards row shrinks below what
// the current reviewPanelWidth + CHAT_PANEL.MIN_WIDTH requires.
// Driven by observed row width (ResizeObserver) — not sidebar store events.
const clampActivityToRow = useCallback((): void => {
  if (!activityOpen || cardsRowWidth <= 0) return;

  const maxWidth = cardsRowWidth - CHAT_PANEL.MIN_WIDTH - CONTENT_CARD.gap;
  const { reviewPanelWidth } = useUIStore.getState();

  if (reviewPanelWidth <= maxWidth) return;

  if (maxWidth >= PANEL_SIZES.review.min) {
    setReviewPanelWidth(maxWidth);
    return;
  }

  // Impossible layout — chat + activity minima don't fit.
  // Fallback chain: collapse left sidebar → close right sidebar → close review panel.
  setReviewPanelWidth(PANEL_SIZES.review.min);
  enforceImpossibleLayoutFallback();
}, [activityOpen, cardsRowWidth, enforceImpossibleLayoutFallback, setReviewPanelWidth]);

useEffect(() => {
  clampActivityToRow();
}, [clampActivityToRow]);
```

**Why no infinite loop:** `reviewPanelWidth` is read via `getState()` (not a dependency). `cardsRowWidth` reflects the observed DOM width — shrinking the activity panel may slightly increase the row width on the next observer callback, but `reviewPanelWidth <= maxWidth` will be satisfied, so the clamp exits early.

### 4. Add impossible-layout fallback function

**File:** `apps/agent/src/App.tsx` — before the clamp callback

Defines the policy when `CHAT_PANEL.MIN_WIDTH + PANEL_SIZES.review.min + CONTENT_CARD.gap` (704px, or 739px with right sidebar) cannot fit. Wrapped in `useCallback` with empty deps (reads only via `getState()`).

**Runtime scope:** The desktop Tauri app has `minWidth: 800` (`src-tauri/tauri.conf.json`), so steps 2–3 are only reachable in browser/demo mode. Step 1 (collapse sidebar) is the common desktop path.

```typescript
// Last-resort fallback when chat + activity minima cannot coexist.
// Priority: collapse left sidebar → close right sidebar → close review panel.
// Steps 2–3 are browser/demo-only; desktop Tauri enforces minWidth: 800.
const enforceImpossibleLayoutFallback = useCallback((): void => {
  const state = useUIStore.getState();

  // Step 1: collapse left sidebar if still expanded
  if (state.leftSidebarWidth > SIDEBAR.collapsed) {
    state.collapseLeftSidebar();
    return; // Observer will re-fire once row width settles
  }

  // Step 2 (browser/demo only): close right sidebar if open (frees ~35px)
  if (state.rightSidebarOpen) {
    state.toggleRightSidebar();
    return;
  }

  // Step 3 (browser/demo only): close review panel.
  // In editor mode the activity column is always-on — accept documented overflow
  // below 704px in browser/demo editor renders. This is not a supported viewport.
  if (state.activeTab !== 'editor' && state.reviewPanelOpen) {
    state.toggleReviewPanel();
  }
}, []);
```

### 5. Improve `handleResize` to clamp before collapsing (secondary)

**File:** `apps/agent/src/App.tsx` lines 531-553

Before collapsing the sidebar, try shrinking the activity panel first. Graceful degradation: shrink activity → only collapse sidebar if that's insufficient.

```typescript
if (window.innerWidth < requiredWidth) {
  // Try clamping activity panel before collapsing sidebar
  if (activityPanelOpen) {
    let maxActivity =
      window.innerWidth - leftSidebarWidth - CHAT_PANEL.MIN_WIDTH - CONTENT_CARD.gap;
    if (rightSidebarOpen) maxActivity -= SIDEBAR.iconColumnWidth;
    if (maxActivity >= PANEL_SIZES.review.min && reviewPanelWidth > maxActivity) {
      useUIStore.getState().setReviewPanelWidth(maxActivity);
      return;
    }
  }
  collapseLeftSidebar();
}
```

**Note:** This window-resize handler still uses `window.innerWidth`-derived math (not `cardsRowWidth`) because it fires from a `resize` event listener, not from the React render cycle. Both paths converge on the same `setReviewPanelWidth` / `collapseLeftSidebar` calls.

## Files modified

| File                     | Change                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/App.tsx` | Add selector (~L387), observe row width, add clamp effect + fallback (~L828), improve handleResize (~L544) |

## Edge cases to verify

1. **Activity at min + sidebar opens on narrow window.** Activity already at 300px, sidebar opens, total exceeds viewport. Fallback step 1 should collapse left sidebar.
2. **Sidebar drag with activity open.** Drag sidebar wider — `ResizeObserver` on `cardsRowRef` fires continuously, activity re-clamps live (not just on mouseup).
3. **Rapid sidebar toggle.** Open sidebar → activity clamps down → immediately close sidebar. Activity stays at its smaller width (user must re-drag). Intentional — the clamp only shrinks, never grows.
4. **Right sidebar toggle.** Actions bar opens while activity is near max. Observer detects the ~35px row width change and clamps.
5. **Editor mode.** `activityOpen` includes `activeTab === 'editor'` (always-on activity column). Sidebar toggle should clamp identically. Fallback step 3 skips closing the review panel in editor mode.
6. **Demo mode formula.** `activityOpen` uses `!isWelcome` while `handleResize` uses `hasWorkspace || isDemo`. These are equivalent (`isWelcome = !hasWorkspace && !isDemo`) but worth confirming they don't diverge.
7. **Browser/demo below 704px.** Fallback chain steps 2–3 fire: close right sidebar → close review panel. Editor mode below 704px accepts overflow (not a supported viewport).
8. **First-launch onboarding → workspace.** Complete onboarding without reloading. The local observer re-attaches because `hasCompletedOnboarding` is in the dependency array. Verify `cardsRowWidth` updates correctly after the cards row mounts.

## Verification

### Desktop Tauri (`bunx tauri dev`, window minWidth: 800)

1. Run `bun run check` — typecheck + lint + tests pass
2. **Repro test:** Open activity panel → drag it wide → close sidebar → open sidebar → activity panel should shrink to fit (not slide off-screen)
3. **Sidebar drag:** Open activity wide → drag sidebar wider via handle → activity re-clamps live on each frame (not just on mouseup)
4. **Edge cases:** Drag activity to exactly min (300px) → toggle sidebar → no clamp needed, panel stays at 300px
5. **Window resize:** Resize window to ~800px (minimum) while both panels open → activity shrinks first, sidebar collapses only if needed

### Browser/demo (`bun run dev`, no minWidth constraint)

6. **Full fallback chain:** Resize browser to ~650px → open activity → observe: sidebar collapses → right sidebar closes → review panel closes
7. **Editor mode narrow:** Same as above in editor tab → activity column stays open (always-on), overflow accepted below 704px

## Audit

**Audited**: 2026-04-01 | **Verdict**: Approve with changes (applied above) | **Report**: `reviews/audit-plan.md`

Changes applied from audit (4 rounds):

**Round 1** — CSS transition timing + missing fallbacks:

- Identified `row.clientWidth` stale read during sidebar `margin-left` transition
- Added `collapseLeftSidebar()` fallback when `maxWidth < PANEL_SIZES.review.min`

**Round 2** — Observer-driven architecture:

- Replaced store-event-driven effect + 220ms timeout with observer-driven row width
- Added `enforceImpossibleLayoutFallback` for viewports below 704px
- Sidebar drag now covered (ResizeObserver fires on DOM width changes, not just store updates)

**Round 3** — Runtime scope + lint compliance:

- Split verification by runtime (desktop Tauri minWidth:800 vs browser/demo)
- Documented editor-mode `<704px` as unsupported viewport (accepted overflow)
- Wrapped `enforceImpossibleLayoutFallback` in `useCallback` for ESLint exhaustive-deps

**Round 4** — Late-mounted ref fix:

- Replaced `useContainerWidth(cardsRowRef)` with local ResizeObserver in App.tsx
- `useContainerWidth` only attaches once (stable ref dep) — fails when `cardsRowRef.current` is null during onboarding early return
- Local observer uses `[hasCompletedOnboarding, isDemo]` deps so it re-attaches when the cards row mounts
- Added onboarding→workspace transition edge case
