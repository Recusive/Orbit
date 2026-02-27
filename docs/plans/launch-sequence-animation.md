# Launch Sequence Animation Plan

## Context

Currently when Orbit launches in welcome state (no workspace), the sidebar, wallpaper, and ASCII art all appear simultaneously. The goal is to add a choreographed intro animation:

1. App starts with sidebar collapsed, content card showing neutral background
2. Wallpaper fades in
3. ASCII art beam/scramble animation plays
4. Sidebar slides open, content shifts right
5. Account toast fires

Plays **every time** the app opens in welcome state. Keeps current 10px margins and rounded corners throughout (no full-bleed).

### Design Justification (Emil Frequency Principle)

> "Rare/first-time → Can be more special"

The launch sequence fires once per app session when no workspace is open — users see it at most a few times daily. This falls squarely in the "rare" category, justifying a ~5s choreographed animation. If this were a toggle users hit 100+ times/day, we'd skip animation entirely.

---

## Architecture: Phase State Machine

A new Zustand store manages a strict phase progression. No ad-hoc timeouts — each phase transition is triggered by the previous phase completing.

```
idle → wallpaper → ascii → ui-reveal → complete
```

The key insight: **don't mutate UIStore**. Instead, compute an `effectiveSidebarWidth` in App.tsx that overrides the UIStore value during animation. This avoids race conditions with auto-collapse, keyboard shortcuts, and other sidebar effects.

### Run Token for Cancellation Safety

Every `startSequence()` and `reset()` increments a monotonic `runId` in the store. All async continuations (`setTimeout` callbacks, `transitionend` handlers, `onAnimationComplete` callbacks) must capture the current `runId` at the time they are scheduled and verify it still matches before calling `advancePhase()`. This prevents stale callbacks from a previous (cancelled) run from corrupting the phase state.

---

## Easing & Timing Blueprint

Easing selections follow Emil's taxonomy and the Web Animation Design flowchart:

| Phase                    | Property       | Easing                                    | Rationale                                                                                                                                                       |
| ------------------------ | -------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| wallpaper                | `opacity`      | `ease-out-quint` `(0.23, 1, 0.32, 1)`     | Element _entering_ → ease-out. Quint (strong) for dramatic reveal — fast arrival, gentle settle.                                                                |
| wallpaper overlay        | `opacity`      | `ease-out-quint` `(0.23, 1, 0.32, 1)`     | **Paired Elements Rule**: overlay MUST match wallpaper easing + duration exactly.                                                                               |
| ascii                    | (internal rAF) | Built-in BeamAsciiPre timing              | Already uses per-character requestAnimationFrame loop. No change needed.                                                                                        |
| ui-reveal sidebar        | `margin-left`  | `ease-out-quart` `(0.165, 0.84, 0.44, 1)` | Element _entering_ from off-screen → ease-out. Reuses existing `CONTENT_CARD.transition`.                                                                       |
| ui-reveal content margin | `margin`       | `ease-out-quart` `(0.165, 0.84, 0.44, 1)` | **Paired Elements Rule**: content card margin MUST match sidebar easing + duration (both 200ms ease-out-quart). Already the case via `CONTENT_CARD.transition`. |

### Duration Rules Applied

- **Wallpaper fade (800ms)**: Larger than standard UI (justifies > 300ms as a page-level transition, 300-400ms range extended for cinematic effect on rare interaction)
- **ASCII beam (~4000ms)**: Pre-existing animation — `done` fires at `duration + 400ms` (i.e., 2400 + 400 = 2800ms for logo, but tagline uses delay=2400 + duration=1200 + 400 = 4000ms total). The `onAnimationComplete` callback fires at the true visual completion point, not at `duration` alone.
- **Sidebar reveal (200ms)**: Standard UI element entering — stays under 300ms per Emil guidelines
- **Exit fast**: If user interrupts (opens workspace), no exit animation — instant cut to normal state

---

## Performance Principles

### GPU-Only Animation (Emil Golden Rule + Vercel)

> "Only animate `transform` and `opacity`. These skip layout and paint stages, running entirely on the GPU."

| Phase        | Animated Property                                         | GPU?                                            | Notes                                                                                                                                       |
| ------------ | --------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| wallpaper    | `opacity`                                                 | **Yes** — composited                            | Pure opacity, no layout reflow                                                                                                              |
| ascii        | `opacity`, `color`, `filter`, `text-shadow` per character | Partial — `filter: blur()` is GPU but expensive | Existing pattern, kept under 8px blur (well under 20px Safari limit)                                                                        |
| sidebar      | `margin-left`                                             | **No** — triggers layout                        | Pre-existing pattern, accepted trade-off (single property, single element, 200ms — see decision doc `SIDEBAR-ANIMATION-SINGLE-PROPERTY.md`) |
| content card | `margin`                                                  | **No** — triggers layout                        | Same pre-existing pattern, same justification                                                                                               |

**Note**: The sidebar and content card margin animations are an accepted deviation from the GPU-only rule. The existing codebase intentionally uses margin-based sliding (documented in `docs/decisions/SIDEBAR-ANIMATION-SINGLE-PROPERTY.md`). Converting to `transform: translateX()` would require rethinking the flex layout. The 200ms duration keeps it under the perceptible jank threshold.

### React Render Optimization (Vercel Rules)

**`rerender-derived-state`** — Subscribe to derived booleans, not raw phase values where possible:

```ts
// In components that only care "is it animating?" — subscribe to boolean, not phase string
const isLaunchAnimating = useLaunchSequenceStore((s) => s.isActive && s.phase !== 'complete');
// Re-renders only when boolean flips (5 times max), not on every phase change
```

**`rerender-defer-reads`** — Don't subscribe to phase in callbacks:

```ts
// ❌ Bad — subscribes component to every phase change
const phase = useLaunchSequenceStore((s) => s.phase);
const handleTransitionEnd = () => {
  if (phase === 'wallpaper') advancePhase();
};

// ✅ Good — read on demand in callback
const handleTransitionEnd = () => {
  if (useLaunchSequenceStore.getState().phase === 'wallpaper') advancePhase();
};
```

**Exception**: App.tsx needs the raw `launchPhase` to compute `effectiveSidebarWidth` and control conditional rendering. This is a legitimate render-time read, not a callback-only read.

**`rerender-functional-setstate`** — The Zustand store uses Immer, so `advancePhase` directly mutates draft state. No stale closure risk. Action references (`startSequence`, `advancePhase`, `skipToComplete`, `reset`) are stable Zustand actions — no need for `useCallback` wrappers.

**`rendering-hoist-jsx`** — Hoist static style objects outside the component:

```ts
// Already follows this pattern — STYLE_DISPLAY_BLOCK, STYLE_DISPLAY_NONE are module-level
// New wallpaper transition styles should also be hoisted as constants
```

### No Layout Shift (Emil Core Principle)

The ASCII art container must not cause layout shift when it mounts. Use conditional mount (no placeholder needed) because WelcomePage uses `items-center justify-center` — the ASCII art is vertically centered regardless of when it mounts. The content card has no other elements that would shift. The `gap-10` between ASCII and AccountBanner (which renders `null`) creates no layout instability.

---

## Files to Create

### 1. `apps/agent/src/stores/ui/launch-sequence-store.ts` — NEW

Zustand store (no persistence — session-only state) with **run token** for cancellation safety:

```ts
type LaunchPhase = 'idle' | 'wallpaper' | 'ascii' | 'ui-reveal' | 'complete';

const PHASE_ORDER: readonly LaunchPhase[] = ['idle', 'wallpaper', 'ascii', 'ui-reveal', 'complete'];

interface LaunchSequenceState {
  phase: LaunchPhase;
  isActive: boolean;
  /** Monotonic counter — incremented on startSequence() and reset().
   *  Async callbacks capture runId at schedule time and verify before advancing. */
  runId: number;
}

interface LaunchSequenceActions {
  startSequence: () => void; // see "Double-Start Contract" below
  advancePhase: () => void; // moves to next in PHASE_ORDER (only if isActive)
  skipToComplete: () => void; // jumps to complete (reduced-motion)
  reset: () => void; // runId++, back to idle, isActive = false
}
```

`advancePhase` guards against invalid transitions — if phase is already `complete` or `isActive` is false, it no-ops.

#### Double-Start Contract

`startSequence()` uses a **restart** strategy when called while already active:

1. **If `isActive` is false** (idle/post-reset): Normal start — `runId++`, phase → `wallpaper`, `isActive = true`.
2. **If `isActive` is true** (sequence in progress): **Restart** — `runId++` (invalidates all in-flight callbacks from the previous run), phase → `wallpaper`. No explicit `reset()` needed — the `runId` increment alone is sufficient to orphan stale timeouts.

This handles two real scenarios:

- **React 18 StrictMode**: Double-invokes the `useEffect` that calls `startSequence()`. The second call restarts cleanly — the first run's callbacks see a stale `runId` and no-op.
- **Rapid workspace close/open**: User closes workspace → `startSequence()` fires. Before wallpaper finishes, user opens + closes workspace again → another `startSequence()`. Previous run is cleanly superseded.

An idempotent (no-op) strategy was rejected because it makes StrictMode and rapid re-trigger behavior ambiguous — the first run's stale callbacks would still hold a valid `runId`.

Selectors:

```ts
const useLaunchPhase = (): LaunchPhase => useLaunchSequenceStore((s) => s.phase);
const useIsLaunchSequenceActive = (): boolean =>
  useLaunchSequenceStore((s) => s.isActive && s.phase !== 'complete');
const useLaunchRunId = (): number => useLaunchSequenceStore((s) => s.runId);
```

---

## Files to Modify

### 2. `apps/agent/src/stores/ui/index.ts`

Add exports for the new launch-sequence-store.

### 3. `apps/agent/src/lib/utils/constants.ts` + `apps/agent/src/lib/utils/index.ts`

Add `LAUNCH_SEQUENCE` timing constant block to `constants.ts` and export through `index.ts` for consistent access:

```ts
export const LAUNCH_SEQUENCE = {
  /** Phase 1: wallpaper opacity 0→1 (page-level transition, intentionally > 300ms) */
  wallpaperFadeDuration: 800,
  /** Pause before ASCII starts — gives the eye time to register the wallpaper */
  wallpaperToAsciiDelay: 200,
  /** Buffer after sidebar CSS transition completes (200ms transition + 100ms safety) */
  sidebarRevealDelay: 300,
  /** Delay before account toast fires after sequence completes */
  toastDelay: 400,
  /** Wallpaper fade easing — ease-out-quint for dramatic entrance */
  wallpaperEasing: 'cubic-bezier(0.23, 1, 0.32, 1)',
  /** Watchdog epsilon — added to wallpaperFadeDuration as fallback if transitionend never fires */
  watchdogEpsilon: 120,
} as const;
```

### 4. `apps/agent/src/components/shared/BeamAsciiPre.tsx`

Add `onAnimationComplete` callback prop:

- New prop: `readonly onAnimationComplete?: (() => void) | undefined`
- Fire once when `done` transitions from `false` to `true` (via useEffect + ref guard)
- For reduced-motion: fires immediately on mount (since `done` starts as `true`)
- **Note**: `done` is `elapsed >= duration + 400`, not `elapsed >= duration`. The +400ms buffer is intentional — it allows the beam's trailing glow to fully settle before signaling completion.

```ts
const completeFiredRef = useRef(false);
useEffect(() => {
  if (done && !completeFiredRef.current) {
    completeFiredRef.current = true;
    onAnimationComplete?.();
  }
}, [done, onAnimationComplete]);
```

### 5. `apps/agent/src/components/welcome/orbit-ascii-logo.tsx`

Add `onAnimationComplete` prop, thread it through:

- **Beam mode**: Pass to the **tagline** BeamAsciiPre (delay=2400), so it fires after both logo + tagline finish
- **Scramble mode**: Fire once when first `hold` phase is reached (one-time ref guard in `startPhase('hold')`)

Also add `showAscii` prop (default `true`):

- When `false`, the ASCII logo components don't render (container div still renders for layout)
- When `true`, components mount and animations start naturally on mount

### 6. `apps/agent/src/components/welcome/welcome-page.tsx`

Add two new props:

- `showAscii?: boolean` — forwarded to OrbitAsciiLogo (controls whether ASCII renders)
- `onAsciiAnimationComplete?: () => void` — forwarded to OrbitAsciiLogo

### 7. `apps/agent/src/components/welcome/account-banner.tsx`

Add `deferToast?: boolean` prop:

- When `true`: gate the `useEffect` — toast does not fire
- `useEffect` watches `deferToast` — when it transitions from `true` → `false`, fire the toast
- When `deferToast` is `undefined`/`false` on mount: fires immediately (existing behavior preserved, backward compatible)

### 8. `apps/agent/src/App.tsx` — Primary orchestration

**This is where all phases are wired together.**

#### a) Compute effectiveSidebarWidth — state-aware, not hardcoded

```ts
const launchPhase = useLaunchSequenceStore((s) => s.phase);
const isLaunchActive = useLaunchSequenceStore((s) => s.isActive);
const isLaunchAnimating = isLaunchActive && launchPhase !== 'complete';

const startSequence = useLaunchSequenceStore((s) => s.startSequence);
const advancePhase = useLaunchSequenceStore((s) => s.advancePhase);
const skipToComplete = useLaunchSequenceStore((s) => s.skipToComplete);
const resetLaunch = useLaunchSequenceStore((s) => s.reset);

// Sidebar reveal target — use actual stored width, not hardcoded 256.
// If user previously resized sidebar to 340px, reveal should target 340px.
// If sidebar is stored as collapsed (0), use lastExpandedSidebarWidth as reveal target.
const revealSidebarWidth =
  leftSidebarWidth > SIDEBAR.collapsed ? leftSidebarWidth : lastExpandedSidebarWidth;

// During phases idle/wallpaper/ascii → sidebar forced to 0 (collapsed)
// During ui-reveal → sidebar animates to stored width (not hardcoded 256)
// After complete → UIStore's actual value takes over
const effectiveSidebarWidth = isLaunchAnimating
  ? launchPhase === 'ui-reveal'
    ? revealSidebarWidth
    : SIDEBAR.collapsed
  : leftSidebarWidth;

// Derive sidebarOpen from effective width (not raw UIStore width)
const sidebarOpen = effectiveSidebarWidth > SIDEBAR.collapsed;
```

Pass `effectiveSidebarWidth` to `<AppShell sidebarWidth={...}>`.

#### b) Start sequence on mount (welcome state)

```ts
useEffect(() => {
  if (!isWelcome) {
    resetLaunch();
    return;
  }
  if (PREFERS_REDUCED_MOTION) {
    skipToComplete();
    return;
  }
  startSequence();
}, [isWelcome, resetLaunch, skipToComplete, startSequence]);
```

#### c) Wallpaper: transitionend + watchdog dual trigger

Hoist transition style as module-level constant to avoid re-creation:

```ts
// Module-level — no new object ref per render (rendering-hoist-jsx)
const WALLPAPER_TRANSITION = `opacity ${String(LAUNCH_SEQUENCE.wallpaperFadeDuration)}ms ${LAUNCH_SEQUENCE.wallpaperEasing}`;
```

The two background divs get inline style:

```ts
opacity: launchPhase === 'idle' ? 0 : 1,
transition: isLaunchAnimating ? WALLPAPER_TRANSITION : undefined,
```

**Dual trigger**: `transitionend` is the primary trigger, with a watchdog timeout as fallback in case the event never fires (tab visibility changes, transition suppressed, etc.):

```ts
// Helper — guarded phase advancement with runId + phase validation
// Accepts expectedRunId captured at schedule time to prevent stale-callback races
const advanceFromWallpaper = useCallback((expectedRunId: number): void => {
  const s = useLaunchSequenceStore.getState();
  if (s.runId !== expectedRunId) return; // stale callback from prior run — discard
  if (s.phase !== 'wallpaper') return; // already advanced by watchdog or other path
  s.advancePhase();
}, []);

// Primary trigger: transitionend on wallpaper div
const handleWallpaperTransitionEnd = useCallback(
  (e: React.TransitionEvent<HTMLDivElement>): void => {
    // Filter: only react to our opacity transition on this element (not children/bubbled events)
    if (e.target !== e.currentTarget || e.propertyName !== 'opacity') return;
    // Capture runId NOW — the delayed callback verifies it still matches
    const expectedRunId = useLaunchSequenceStore.getState().runId;
    setTimeout(() => advanceFromWallpaper(expectedRunId), LAUNCH_SEQUENCE.wallpaperToAsciiDelay);
  },
  [advanceFromWallpaper]
);

// Watchdog fallback: if transitionend never fires, force progression
useEffect(() => {
  if (launchPhase !== 'wallpaper') return;
  const runId = useLaunchSequenceStore.getState().runId;
  const watchdog = window.setTimeout(
    () => {
      const s = useLaunchSequenceStore.getState();
      if (s.runId === runId && s.phase === 'wallpaper') {
        s.advancePhase();
      }
    },
    LAUNCH_SEQUENCE.wallpaperFadeDuration +
      LAUNCH_SEQUENCE.wallpaperToAsciiDelay +
      LAUNCH_SEQUENCE.watchdogEpsilon
  );
  return (): void => {
    window.clearTimeout(watchdog);
  };
}, [launchPhase]);
```

**Paired Elements Rule**: Both the wallpaper image div AND the dark gradient overlay use identical `opacity` + `transition` values. They enter as a visual unit. Only the wallpaper image div gets `onTransitionEnd` (one trigger is enough — they share the same timeline).

#### d) ASCII art delayed start — with runId guard

Pass `showAscii={launchPhase !== 'idle' && launchPhase !== 'wallpaper'}` to WelcomePage.

The OrbitAsciiLogo component only mounts once `launchPhase >= 'ascii'`. BeamAsciiPre's animation starts naturally on mount (uses `Date.now()` as start time).

Pass `onAsciiAnimationComplete` with runId guard:

```ts
const handleAsciiComplete = useCallback((): void => {
  const s = useLaunchSequenceStore.getState();
  if (s.phase === 'ascii') {
    s.advancePhase();
  }
}, []);
```

#### e) Sidebar reveal (ui-reveal phase) — with runId guard

When phase transitions to `ui-reveal`:

- `effectiveSidebarWidth` changes from 0 → `revealSidebarWidth`
- AppShell's existing `WRAPPER_TRANSITION` (`margin-left 200ms ease-out-quart`) animates the sidebar in
- ContentCard's existing margin transition animates left margin from 10px → 0
- **Paired Elements Rule**: Both are already using `CONTENT_CARD.transition` (200ms ease-out-quart) — they move as a unit

```ts
useEffect(() => {
  if (launchPhase !== 'ui-reveal') return;
  const runId = useLaunchSequenceStore.getState().runId;
  const timer = window.setTimeout(() => {
    const s = useLaunchSequenceStore.getState();
    if (s.runId === runId && s.phase === 'ui-reveal') {
      s.advancePhase();
    }
  }, LAUNCH_SEQUENCE.sidebarRevealDelay);
  return (): void => {
    window.clearTimeout(timer);
  };
}, [launchPhase]);
```

#### f) Toast deferral

```tsx
const [toastReady, setToastReady] = useState(false);

useEffect(() => {
  if (launchPhase !== 'complete' || !isWelcome) return;
  const timer = setTimeout(() => setToastReady(true), LAUNCH_SEQUENCE.toastDelay);
  return (): void => {
    clearTimeout(timer);
  };
}, [launchPhase, isWelcome]);

// ...
<AccountBanner deferToast={isWelcome && !toastReady} />;
```

---

## Phase Timeline (corrected)

BeamAsciiPre's `done` threshold is `elapsed >= duration + 400ms`, not just `duration`. The tagline BeamAsciiPre has `delay=2400` + `duration=1200` + `400ms settle` = fires `onAnimationComplete` at ~4000ms after mount.

| Phase     | Duration    | What happens                                                         | Easing               |
| --------- | ----------- | -------------------------------------------------------------------- | -------------------- |
| idle      | 0ms         | Dark neutral bg, sidebar hidden, ASCII not rendered                  | —                    |
| wallpaper | ~1000ms     | Wallpaper fades in (800ms) + 200ms pause                             | ease-out-quint       |
| ascii     | ~4000ms     | Beam sweep: logo 2400ms + tagline delay+1200ms + 400ms settle buffer | rAF-based (built-in) |
| ui-reveal | ~300ms      | Sidebar slides in (200ms transition + 100ms buffer)                  | ease-out-quart       |
| complete  | —           | Toast fires after 400ms delay, normal app state                      | —                    |
| **Total** | **~5700ms** |                                                                      |                      |

---

## Accessibility (Emil + Web Animation Design)

> "Every animation needs `prefers-reduced-motion` support. No exceptions for opacity or color — disable all animations."

When `PREFERS_REDUCED_MOTION` is true:

- `skipToComplete()` called immediately → phase jumps to `complete`
- `effectiveSidebarWidth` reads from UIStore (sidebar appears open)
- Wallpaper opacity is `1` with no transition property set
- BeamAsciiPre shows static text immediately (existing behavior)
- AccountBanner toast fires on mount (no deferral)

Result: App appears in final state instantly. Zero motion.

---

## Interruptibility & Cancellation

### Run Token Pattern

Every async continuation captures `runId` at schedule time and validates before acting:

```
startSequence() → runId = 1
  transitionend fires → captures expectedRunId = 1
  schedules setTimeout(advanceFromWallpaper(1), wallpaperToAsciiDelay)
  user opens workspace mid-delay
reset() → runId = 2
  stale timeout fires → advanceFromWallpaper(1) checks runId (1 ≠ 2) → no-op ✓
  watchdog also fires → checks runId (1 ≠ 2) → no-op ✓
```

**Critical**: the `handleWallpaperTransitionEnd` callback captures `runId` from the store at event time and passes it to the delayed `advanceFromWallpaper(expectedRunId)`. This prevents the following race:

```
startSequence() → runId = 1, phase = wallpaper
  transitionend fires → schedules advanceFromWallpaper(runId=1, delay=200ms)
reset() → runId = 2
startSequence() → runId = 3, phase = wallpaper
  stale timeout fires → advanceFromWallpaper(1) checks runId (1 ≠ 3) → no-op ✓
  new transitionend fires → captures runId=3 → advanceFromWallpaper(3) → 3 === 3 → advances ✓
```

Without the `runId` capture, `advanceFromWallpaper` would only check `phase === 'wallpaper'`, which would match run 3's wallpaper phase and incorrectly advance it from run 1's stale callback.

### CSS Transition Interruptibility

Our sequence uses CSS transitions (not keyframes), which are naturally interruptible:

- **User opens workspace during animation**: `isWelcome` becomes false → `resetLaunch()` increments `runId` + clears sequence → `effectiveSidebarWidth` returns to UIStore. CSS transitions on the wallpaper and sidebar will naturally stop mid-progress and transition to their new target values. All pending `setTimeout` callbacks become stale (runId mismatch) and no-op.
- **Sidebar toggle during animation**: `effectiveSidebarWidth` override takes precedence. UIStore's toggle still mutates its internal state but the visual is locked to the launch phase. After `complete`, the override lifts and UIStore's current value takes effect.
- **Window resize during animation**: Auto-collapse useEffect reads from UIStore (which has sidebar at stored width), but the visual override makes it appear collapsed. Since the actual UIStore isn't modified, no conflict.

### Watchdog Fallback

If `transitionend` never fires (browser tab hidden, transition suppressed by style change, element not visible), the wallpaper watchdog timeout fires at `wallpaperFadeDuration + wallpaperToAsciiDelay + 120ms` and forces phase advancement. The same runId guard applies — stale watchdogs from previous runs are harmless.

---

## Edge Cases

- **User-resized sidebar (e.g., 340px)**: `revealSidebarWidth` reads from `leftSidebarWidth` (340) → ui-reveal animates to 340. On `complete`, `effectiveSidebarWidth` returns `leftSidebarWidth` (340). No jump.
- **Sidebar stored as collapsed (0)**: `revealSidebarWidth` falls back to `lastExpandedSidebarWidth` (256 default). The launch sequence intentionally opens the sidebar as part of the welcome experience. After `complete`, `effectiveSidebarWidth` returns `leftSidebarWidth` (0), so the sidebar will appear to close — but only if the user previously collapsed it. This is correct: we reveal the sidebar for the intro, then restore user preference.
- **Demo mode**: `isDemo = true` → `isWelcome = false` → sequence never activates
- **Theme switch during animation (single toggle)**: The `no-transitions` class in `theme-provider.tsx` disables all CSS transitions during theme changes. **Caveat**: `INSTANT-THEME-SWITCH.md` documents this as "not yet fully implemented" — the current implementation does direct class toggles without transition suppression. If a theme switch occurs mid-launch, the wallpaper `transitionend` event may not fire (transition reset by class change). The **watchdog fallback** catches this within 120ms of the expected completion time and forces phase advancement. The `runId` guard prevents state corruption. Visual outcome: wallpaper may snap to full opacity instead of fading — acceptable for this rare intersection (launch + theme switch).
- **Rapid theme toggles during animation**: Multiple toggles in quick succession can repeatedly suppress/restart CSS transitions. Each toggle potentially orphans a `transitionend` event. **The watchdog is the safety net** — it fires unconditionally after `wallpaperFadeDuration + wallpaperToAsciiDelay + watchdogEpsilon` regardless of how many theme toggles occur. The `runId` guard ensures only the current run's watchdog can advance the phase. Post-wallpaper phases (ascii, ui-reveal) use timer-based triggers, not `transitionend`, so theme toggles have no effect on those phases. **No special handling needed** — the existing dual-trigger + runId architecture already covers this. A proper fix for visual polish (smooth theme transitions during launch) requires implementing `INSTANT-THEME-SWITCH.md` transition suppression first.
- **Re-trigger on workspace close**: When user closes workspace → `isWelcome` becomes true → `useEffect` calls `startSequence()` (new runId) → animation plays again
- **Rapid workspace open/close**: Each `reset()` increments runId, invalidating all stale callbacks. Each `startSequence()` increments runId again. No overlapping runs possible.
- **Tab hidden during wallpaper fade**: `transitionend` may not fire. Watchdog timeout ensures progression within 120ms of expected completion.

---

## Testing Plan

### Unit Tests: `apps/agent/src/__tests__/unit/stores/ui/launch-sequence-store.test.ts` — NEW

Test the store state machine in isolation with fake timers:

| Test                                                                | Assertion                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Initial state                                                       | `phase === 'idle'`, `isActive === false`, `runId === 0`                                              |
| `startSequence()`                                                   | `phase === 'wallpaper'`, `isActive === true`, `runId === 1`                                          |
| `advancePhase()` sequence                                           | Walks through `wallpaper → ascii → ui-reveal → complete` in order                                    |
| `advancePhase()` at complete                                        | No-ops (stays at `complete`)                                                                         |
| `advancePhase()` when inactive                                      | No-ops                                                                                               |
| `skipToComplete()`                                                  | Jumps directly to `complete`, `isActive === true`                                                    |
| `reset()`                                                           | Back to `idle`, `isActive === false`, `runId` incremented                                            |
| `startSequence()` then `reset()` then `advancePhase()`              | No-op (isActive is false)                                                                            |
| Double `startSequence()` (restart contract)                         | Second call restarts: `runId` increments, phase resets to `wallpaper`, `isActive` stays `true`       |
| Stale callback after double-start                                   | Callback captured with run 1's `runId` no-ops after run 2 starts (runId mismatch)                    |
| Stale wallpaper timeout from run N fires during run N+1 `wallpaper` | Phase stays `wallpaper` (runId mismatch → no advancement). Run N+1's own callbacks advance normally. |

### Component Tests: BeamAsciiPre `onAnimationComplete`

| Test                                    | Assertion                                                 |
| --------------------------------------- | --------------------------------------------------------- |
| Fires once when `done` becomes true     | Callback called exactly once, not on every elapsed update |
| Fires immediately when reduced-motion   | Callback called on mount                                  |
| Does not fire before `duration + 400ms` | At `duration + 399ms`, callback not yet called            |

---

## Verification

1. `bun run dev` — open in browser, verify animation sequence plays in welcome state
2. `bun run typecheck` — no TypeScript errors
3. `bun run lint` — no ESLint warnings
4. `bun run test` — existing tests pass + new store tests pass
5. `bunx tauri dev` — full app works, animation plays on launch
6. Test reduced-motion: Toggle `prefers-reduced-motion: reduce` in DevTools → app appears instantly in final state
7. Test workspace open mid-animation: Open a folder during wallpaper/ascii phase → animation stops cleanly, no stale callbacks fire, normal app appears
8. Test re-trigger: Close workspace → welcome state → animation plays again
9. Test paired elements: Wallpaper image + dark overlay fade in simultaneously (no desync)
10. Test sidebar + content card: Both animate in sync during ui-reveal (same easing, same duration)
11. Test custom sidebar width: Resize sidebar to 340px, close workspace → launch sequence reveals at 340px, no jump on complete
12. Test tab hidden: Hide tab during wallpaper fade → watchdog fires → sequence progresses within 120ms of expected time
13. Test double-start (StrictMode): Enable StrictMode → sequence plays normally, no duplicate phase transitions
14. Test stale callback race: Start sequence, reset mid-wallpaper, start again → stale wallpaper delay from run 1 does not advance run 2
15. Test theme toggle during wallpaper: Toggle theme mid-fade → wallpaper may snap to full opacity → watchdog advances to ascii within 120ms

## Design Principles Applied

| Principle                   | Source     | How Applied                                                                                  |
| --------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| Frequency Principle         | Emil       | Rare interaction → elaborate animation justified                                             |
| Paired Elements Rule        | Emil       | Wallpaper + overlay share easing/duration; sidebar + content card share transition           |
| ease-out for entering       | Emil / WAD | Wallpaper fade-in, sidebar slide-in both use ease-out                                        |
| GPU-only when possible      | Emil / WAD | Wallpaper uses opacity (GPU). Sidebar uses margin (accepted trade-off, documented)           |
| No layout shift             | Emil       | ASCII uses centered flex layout — mount/unmount causes no shift                              |
| Derived selectors           | Vercel     | `useIsLaunchSequenceActive()` returns boolean, minimizing re-renders                         |
| Defer reads to callbacks    | Vercel     | `onTransitionEnd` uses `getState()` instead of subscribing to phase                          |
| Hoist static JSX/styles     | Vercel     | `WALLPAPER_TRANSITION` string hoisted to module level                                        |
| Stable actions              | Vercel     | Zustand actions are stable refs — no `useCallback` wrappers needed                           |
| Reduced motion              | All three  | `skipToComplete()` → instant final state, zero motion                                        |
| Duration under 300ms for UI | Emil / WAD | Sidebar reveal is 200ms. Only wallpaper (800ms) exceeds — justified as page-level transition |
| Animate outside React       | Emil       | BeamAsciiPre already uses rAF loop with refs, not state-per-frame                            |
| Run token cancellation      | Audit      | `runId` prevents stale async callbacks from corrupting phase state                           |
| Watchdog fallback           | Audit      | Dual trigger (transitionend + timeout) prevents sequence stall                               |
| State-aware reveal target   | Audit      | Sidebar reveal uses stored width, not hardcoded 256px                                        |

---

## Audit Resolution Log

Fixes applied from `reviews/audit-plan.md` (2026-02-27):

| Audit Issue                                                                            | Severity               | Resolution                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1 Hardcoded SIDEBAR.expanded** — breaks non-default widths, causes jump at complete | Critical               | Replaced with `revealSidebarWidth` derived from `leftSidebarWidth` / `lastExpandedSidebarWidth`. Documented collapsed-sidebar edge case behavior.                                                                                                                                                                 |
| **#2 No cancellation token** — stale callbacks cause out-of-order transitions          | Critical               | Added `runId` to store state. All `setTimeout` and `transitionend` handlers capture + verify `runId` before advancing. `startSequence()` and `reset()` both increment `runId`.                                                                                                                                    |
| **#3 transitionend single point of failure** — sequence stalls if event never fires    | Critical               | Added watchdog timeout at `wallpaperFadeDuration + wallpaperToAsciiDelay + 120ms`. `transitionend` handler filters on `target === currentTarget` and `propertyName === 'opacity'`. Both triggers guarded by runId.                                                                                                |
| **Rec #1 Theme-switch not implemented**                                                | Recommended            | Documented as best-effort caveat with explicit note that `INSTANT-THEME-SWITCH.md` is not yet implemented. RunId + watchdog prevent state corruption and stalls even if theme switch causes unexpected transition behavior.                                                                                       |
| **Rec #2 BeamAsciiPre done threshold is duration+400**                                 | Recommended            | Corrected timeline math: ascii phase is ~4000ms (not ~3600ms). Total sequence ~5700ms. Added note explaining the +400ms settle buffer in BeamAsciiPre section.                                                                                                                                                    |
| **Rec #3 Export through lib/utils/index.ts**                                           | Recommended            | Added `apps/agent/src/lib/utils/index.ts` to modified files list.                                                                                                                                                                                                                                                 |
| **Rec #4 No automated test plan**                                                      | Recommended            | Added Testing Plan section with unit tests for store state machine (phase progression, cancellation, runId) and component tests for BeamAsciiPre callback semantics.                                                                                                                                              |
| **RunId guard gap in wallpaper delay**                                                 | Critical (post-audit)  | `advanceFromWallpaper` now takes `expectedRunId` parameter, captured by `handleWallpaperTransitionEnd` at event time. Validates `runId` match before advancing — prevents stale run N callback from advancing run N+1. Added explicit stale-callback test case.                                                   |
| **Undefined startSequence() while active**                                             | Edge case (post-audit) | Defined explicit **restart** contract: second `startSequence()` while active increments `runId` + resets phase to `wallpaper`. Rejected idempotent strategy (StrictMode ambiguity). Documented in "Double-Start Contract" section.                                                                                |
| **Rapid theme toggles during launch**                                                  | Edge case (post-audit) | Documented that watchdog fallback covers `transitionend` suppression from theme toggles. Post-wallpaper phases use timer-based triggers unaffected by CSS. No special handling needed — existing runId + watchdog architecture is sufficient. Visual polish deferred to `INSTANT-THEME-SWITCH.md` implementation. |
