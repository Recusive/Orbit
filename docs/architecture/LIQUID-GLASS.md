# Liquid Glass Design System

> **Status:** Experimental
> **Inspired by:** macOS Tahoe, iOS 26, visionOS
> **Last Updated:** February 2026

---

## Overview

The Liquid Glass design system brings a unified frosted glass aesthetic to Orbit, where all surfaces share the same semi-transparent base with subtle depth variations. This creates a cohesive, modern look inspired by Apple's latest design language.

### Key Principles

1. **Unified Surface Color** - All surfaces (background, sidebar, cards, chat area) use the same base color
2. **Depth Through Transparency** - Hierarchy is established via alpha channel, not different hues
3. **Frosted Glass Effect** - `backdrop-blur` and `backdrop-saturate` create the signature glass look
4. **Warm Color Palette** - OKLCH colors with warm hue (~70° light, ~58° dark) avoid cold/clinical feel

---

## Color System

### Light Mode

| Token            | Value                        | Purpose                                       |
| ---------------- | ---------------------------- | --------------------------------------------- |
| `--background`   | `oklch(0.94 0.04 70 / 85%)`  | Base surface - warm tint                      |
| `--card`         | `oklch(0.90 0.02 70 / 92%)`  | Message bubbles, inputs - darker for contrast |
| `--popover`      | `oklch(0.94 0.04 70 / 92%)`  | Frosted glass popovers                        |
| `--dialog-bg`    | `oklch(0.94 0.04 70)`        | Opaque dialogs - no alpha artifacts           |
| `--sidebar`      | `oklch(0.94 0.04 70 / 85%)`  | Same as background                            |
| `--chat-area`    | `oklch(0.94 0.04 70 / 85%)`  | Same as background                            |
| `--border`       | `oklch(0.70 0.03 70 / 55%)`  | Visible borders - darker for light mode       |
| `--border-panel` | `oklch(0.80 0.025 70 / 25%)` | Panel borders                                 |
| `--divider`      | `oklch(0.85 0.02 70 / 30%)`  | Structural dividers                           |

**HTML Background:** `oklch(0.92 0.065 70)` - Warm base that shows through transparent surfaces

### Dark Mode

| Token          | Value                        | Purpose                             |
| -------------- | ---------------------------- | ----------------------------------- |
| `--background` | `oklch(0.16 0.012 60 / 30%)` | Warm dark, transparent              |
| `--card`       | `oklch(0.2 0.015 58 / 35%)`  | Slightly elevated, transparent      |
| `--popover`    | `oklch(0.22 0.015 58 / 75%)` | Frosted glass - allows blur to show |
| `--dialog-bg`  | `oklch(0.22 0.015 58)`       | Opaque dialogs                      |
| `--sidebar`    | `oklch(0.2 0.015 58 / 30%)`  | Glass effect                        |
| `--chat-area`  | `oklch(0.18 0.012 60 / 30%)` | Chat area - transparent             |
| `--muted`      | `oklch(0.25 0.015 58 / 90%)` | High opacity for solid feel         |
| `--accent`     | `oklch(0.3 0.02 55 / 30%)`   | Transparent accent                  |

**HTML Background:** `transparent` - Allows backdrop-blur to show through

---

## OKLCH Color Format

All colors use the OKLCH color space for perceptual uniformity:

```css
oklch(L C H / A)
```

| Component     | Range  | Purpose                                       |
| ------------- | ------ | --------------------------------------------- |
| L (Lightness) | 0-1    | 0 = black, 1 = white                          |
| C (Chroma)    | 0-0.4  | Color intensity (0.02-0.04 for warm tints)    |
| H (Hue)       | 0-360  | ~70° warm tan (light), ~58° warm brown (dark) |
| A (Alpha)     | 0-100% | Transparency for glass effect                 |

### Why OKLCH?

- **Perceptual uniformity** - Equal lightness steps look equally different
- **Better for transparency** - Alpha blending looks more natural
- **Wider gamut** - P3 display support
- **Easier adjustments** - Change one value without affecting others

---

## Backdrop Effects

### Root Element

```css
#root {
  backdrop-filter: blur(8px) saturate(1.5);
  -webkit-backdrop-filter: blur(8px) saturate(1.5);
}
```

This applies the signature frosted effect to the entire app, allowing desktop wallpaper or underlying content to show through.

### Dialog Stacked Layer

The `.dialog-stack` class creates a depth effect behind dialogs:

```css
.dialog-stack::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 1rem;
  background: oklch(0.94 0.02 70 / 40%);
  backdrop-filter: blur(8px);
  z-index: -1;
  pointer-events: none;
}

html.dark .dialog-stack::before {
  background: oklch(0.5 0.04 55 / 15%);
}
```

---

## Component Styling

### Dialogs

```tsx
// DialogContent
className="dialog-stack relative z-50 grid w-full max-w-lg gap-4
  border-[3px] border-border/50
  bg-popover/60 backdrop-blur-xl backdrop-saturate-150
  p-6 shadow-lg sm:rounded-xl pointer-events-auto"
```

Key properties:

- `bg-popover/60` - 60% opacity background
- `backdrop-blur-xl` - Strong blur (24px)
- `backdrop-saturate-150` - Enhanced color saturation
- `border-border/50` - Semi-transparent border

### Overlay

```tsx
// DialogOverlay
className = 'fixed inset-0 z-50 bg-black/50';
```

Reduced from `bg-black/80` to allow more content to show through.

### Settings Dialog

```tsx
className="dialog-stack relative w-[720px] max-w-[90vw] h-[600px] max-h-[85vh]
  bg-sidebar backdrop-blur-xl backdrop-saturate-150
  border-[3px] border-border/50 rounded-xl overflow-hidden flex flex-col"
```

---

## Scroll Prevention

To prevent trackpad gestures from scrolling the app content:

```css
html,
body,
#root {
  overflow: hidden;
  overscroll-behavior: none;
}
```

Additionally, dialogs use:

```tsx
style={{ overscrollBehavior: 'contain' }}
```

---

## Files Modified

| File                                                           | Changes                                               |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/agent/src/globals.css`                                   | Color system, backdrop effects, `.dialog-stack` class |
| `apps/agent/src/components/ui/dialog.tsx`                      | Frosted glass styling, stacked layer                  |
| `apps/agent/src/components/modals/settings/SettingsDialog.tsx` | Frosted glass styling                                 |

---

## Browser Support

| Feature           | Chrome | Safari | Firefox |
| ----------------- | ------ | ------ | ------- |
| `backdrop-filter` | ✅     | ✅     | ✅      |
| `oklch()`         | ✅     | ✅     | ✅      |
| Alpha in oklch    | ✅     | ✅     | ✅      |

**Note:** Tauri uses WebKit (Safari engine) on macOS, so full support is guaranteed.

---

## Performance Considerations

1. **Backdrop blur is GPU-accelerated** - Minimal CPU impact
2. **Limit blur radius** - `blur(8px)` is optimal; larger values increase GPU load
3. **Avoid nested blurs** - Don't stack multiple `backdrop-filter` elements
4. **Use `will-change: transform`** - For animated glass elements

---

## Future Enhancements

- [ ] Dynamic blur intensity based on content behind
- [ ] Vibrancy effect using `-webkit-backdrop-filter` advanced options
- [ ] Glass thickness variants (thin, medium, thick)
- [ ] Motion blur during animations

---

## References

- [OKLCH Color Space](https://oklch.com/)
- [Apple Human Interface Guidelines - Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [CSS backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)
