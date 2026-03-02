# Fix: Smooth sidebar scroll fade transition

## Context

The sidebar's bottom fade mask (`mask-image` gradient) cuts off the last file when scrolled to the bottom. The mask needs to disappear when there's no more content below, but `mask-image` is NOT a CSS-animatable property — toggling it on/off creates a jarring visual pop. An overlay gradient approach was tried but looked "sharp" due to `transparent` → color interpolation going through black.

## Approach: Animate `mask-position` (not `mask-image`)

`mask-position` IS animatable (coordinate-based, like `background-position`). Keep the mask gradient always present but oversized, and slide it in/out of view:

- **Mask gradient**: `linear-gradient(to bottom, black calc(100% - 32px), transparent)` — always present
- **Mask size**: `100% calc(100% + 32px)` — 32px taller than the container
- **Fade visible** (`canScrollDown = true`): `mask-position: 0 -32px` — shifts mask up, transparent zone enters view
- **No fade** (`canScrollDown = false`): `mask-position: 0 0` — transparent zone pushed below container
- **Transition**: `mask-position 200ms ease-out` — smooth slide between states

### Why this works (math)

The gradient's transparent zone spans from `containerHeight` to `containerHeight + 32px`. At `position: 0 0`, the visible window `[0, containerHeight]` sees only solid black. At `position: 0 -32px`, the visible window shifts to `[32, containerHeight + 32]`, bringing the transparent zone into view.

## File to modify

**`apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`** — lines ~576-585 (inline `style` prop)

### Replace

```tsx
style={
  canScrollDown
    ? {
        maskImage: 'linear-gradient(to bottom, black calc(100% - 32px), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 32px), transparent 100%)',
      }
    : undefined
}
```

### With

```tsx
style={{
  maskImage: 'linear-gradient(to bottom, black calc(100% - 32px), transparent)',
  WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 32px), transparent)',
  maskSize: '100% calc(100% + 32px)',
  WebkitMaskSize: '100% calc(100% + 32px)',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskPosition: canScrollDown ? '0 -32px' : '0 0',
  WebkitMaskPosition: canScrollDown ? '0 -32px' : '0 0',
  transition: 'mask-position 200ms ease-out, -webkit-mask-position 200ms ease-out',
}}
```

No other files need changes. The scroll detection logic (capture-phase listeners, `findScrollable()`, `checkElement()`) is already correct.

## Why this approach over alternatives

| Approach                   | Problem                                                       |
| -------------------------- | ------------------------------------------------------------- |
| Toggle `mask-image` on/off | Not CSS-animatable — hard pop                                 |
| Overlay gradient + opacity | `transparent` interpolates through black — dark band artifact |
| Padding-bottom             | User wants dynamic mask, not permanent padding                |
| **`mask-position` slide**  | Animatable, smooth, keeps mask visual quality                 |

## Validation

- `maskPosition`/`WebkitMaskPosition` already used in `sf-symbol.tsx:137-138` — confirmed working in Tauri's WKWebView
- CSS transitions are interruptible — rapid scroll near threshold reverses smoothly
- 200ms `ease-out` per animation skills (standard UI, 150-250ms range)
- First render: `canScrollDown = false` → no fade → first overflow check triggers smooth fade-in

## Verification

1. `bun run typecheck` — clean compile
2. `bunx tauri dev` — open sidebar with enough files to overflow
3. Scroll to bottom → fade smoothly disappears, last file fully visible
4. Scroll up → fade smoothly reappears
5. Switch tabs (conversations ↔ explorer) → correct initial state
6. Rapid scroll near threshold → no jank, smooth reversal
