---
name: web-animation-best-practices
description: Comprehensive web animation guidelines for creating high-quality, performant, and accessible animations. Apply when implementing CSS transitions, keyframe animations, or using animation libraries like Framer Motion.
triggers:
  - writing CSS animations or transitions
  - implementing Framer Motion components
  - reviewing animation performance
  - creating micro-interactions
  - building modal or drawer animations
  - optimizing animation frame rate
---

# Web Animation Best Practices for Orbit

Production-tested guidelines for creating high-quality web animations. Contains core principles, timing references, easing curves, and copy-paste patterns for common animation scenarios.

## Rule Categories by Priority

| Priority | Category                 | Impact   | When to Apply                      |
| -------- | ------------------------ | -------- | ---------------------------------- |
| 1        | Performance Requirements | CRITICAL | All animations                     |
| 2        | Accessibility            | CRITICAL | All user-facing animations         |
| 3        | Timing & Easing          | HIGH     | Defining animation curves          |
| 4        | Natural Motion           | HIGH     | Interactive elements, feedback     |
| 5        | Origin Awareness         | MEDIUM   | Modals, dropdowns, contextual UI   |
| 6        | Interruptibility         | MEDIUM   | Long-running or chained animations |
| 7        | Purposeful Placement     | LOW      | Deciding when to animate           |

---

## 1. Performance Requirements (CRITICAL)

### anim-transform-opacity: Only animate transform and opacity

These properties trigger GPU-accelerated composite rendering only. Other properties trigger expensive layout and paint operations.

```css
/* BAD: Triggers layout + paint + composite */
.animate-bad {
  transition:
    width 300ms,
    height 300ms,
    padding 300ms;
}

/* GOOD: Composite only (GPU accelerated) */
.animate-good {
  transition:
    transform 300ms,
    opacity 300ms;
}
```

**Never animate these properties:**

- `width`, `height`, `padding`, `margin`
- `top`, `left`, `right`, `bottom`
- `border-width`, `font-size`

### anim-60fps: Target 60 frames per second minimum

All animations must run at 60fps. Test on lower-end hardware, not just development machines.

```css
/* Use DevTools Performance tab to verify:
   1. Record timeline during animation
   2. Look for dropped frames (red bars)
   3. Check for Layout/Paint events (expensive) */
```

### anim-duration-300ms: Keep animations under 300ms

Animations exceeding 300ms feel sluggish. Exception: intentionally slow animations like success celebrations.

```css
/* BAD: Too slow for typical interactions */
.transition-slow {
  transition: transform 500ms;
}

/* GOOD: Snappy and responsive */
.transition-good {
  transition: transform 200ms;
}
```

---

## 2. Accessibility (CRITICAL)

### anim-reduced-motion: Always respect prefers-reduced-motion

Some users experience motion sickness or vestibular disorders. This is a **mandatory requirement**.

```css
/* Global reduced motion reset */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Per-component alternative (preferred) */
.animated-element {
  transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@media (prefers-reduced-motion: reduce) {
  .animated-element {
    transition: opacity 150ms ease;
    transform: none !important;
  }
}
```

### anim-reduced-motion-react: Use Framer Motion's useReducedMotion hook

```tsx
import { useReducedMotion } from 'framer-motion';

function AnimatedComponent() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ x: 100 }}
      transition={{
        duration: shouldReduceMotion ? 0.01 : 0.3,
        ease: shouldReduceMotion ? 'linear' : [0.16, 1, 0.3, 1],
      }}
    />
  );
}
```

---

## 3. Timing & Easing (HIGH)

### anim-easing-custom: Use custom cubic-bezier curves

Built-in CSS curves (`ease`, `ease-in`, `ease-out`, `linear`) feel generic. Custom curves add personality.

| Curve Name      | cubic-bezier                        | Use Case                           |
| --------------- | ----------------------------------- | ---------------------------------- |
| **Spring-like** | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Buttons, cards, micro-interactions |
| **Smooth**      | `cubic-bezier(0.16, 1, 0.3, 1)`     | Modals, page transitions, drawers  |
| **Snappy**      | `cubic-bezier(0.4, 0, 0.2, 1)`      | Spinners, toggles, tooltips        |

### anim-timing-reference: Use appropriate durations by element type

| Element Type       | Duration  | Easing      | Reasoning                           |
| ------------------ | --------- | ----------- | ----------------------------------- |
| Button hover       | 200ms     | Spring-like | Fast + playful bounce               |
| Button press       | 80-100ms  | Snappy      | Must feel instant                   |
| Modal entrance     | 250-300ms | Smooth      | Large movement needs gentler easing |
| Slide transitions  | 300ms     | Spring-like | Bounce reinforces direction         |
| Success feedback   | 600ms     | Spring-like | Celebration deserves emphasis       |
| Micro-interactions | 150-200ms | Spring-like | Quick but noticeable                |
| Tooltip appear     | 100ms     | Snappy      | Informational; shouldn't distract   |
| Loading spinner    | 150ms     | Snappy      | Continuous motion                   |
| Page transition    | 300ms     | Smooth      | Large context change                |
| Dropdown menu      | 200ms     | Smooth      | Predictable; avoid bounce in menus  |

---

## 4. Natural Motion (HIGH)

### anim-spring-physics: Use spring animations for organic feel

Spring animations mimic real-world physics. Use for decorative elements; functional UI should prioritize clarity.

```tsx
// Framer Motion spring
<motion.div
  initial={{ scale: 0.95, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{
    type: 'spring',
    stiffness: 400,
    damping: 25,
  }}
/>
```

### anim-ease-out: Use ease-out for responsiveness

Start fast and slow at the end. Creates impression of quick response while maintaining smoothness.

```css
/* BAD: Linear feels robotic */
.linear-transition {
  transition: transform 200ms linear;
}

/* GOOD: Ease-out feels responsive */
.responsive-transition {
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

## 5. Origin Awareness (MEDIUM)

### anim-transform-origin: Animate from contextually meaningful locations

Elements should animate from where they logically originate, not just the center.

```css
/* BAD: Generic center origin */
.dropdown {
  transform-origin: center center;
}

/* GOOD: Originates from trigger button */
.dropdown-from-button {
  transform-origin: top center;
}

/* For right-aligned dropdown */
.dropdown-right {
  transform-origin: top right;
}
```

---

## 6. Interruptibility (MEDIUM)

### anim-interruptible: Ensure animations can be interrupted

Users should never feel locked into waiting for an animation to complete.

```css
/* CSS transitions are naturally interruptible */
.interruptible {
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Avoid: keyframe animations that can't be interrupted mid-sequence */
```

```tsx
// Framer Motion handles interruption automatically
<motion.div animate={{ x: isOpen ? 100 : 0 }} transition={{ duration: 0.3 }} />;
{
  /* Changing isOpen mid-animation smoothly transitions to new state */
}
```

---

## 7. Purposeful Placement (LOW)

### anim-when-to-animate: Only animate meaningful state changes

**Animate:**

- State changes (open/close, success/error)
- Modals, drawers, dropdowns
- Enter/exit scenarios
- User feedback (button press, hover)

**Don't animate:**

- Keyboard-initiated actions performed hundreds of times daily
- Every single UI change
- Operations that should feel instant

---

## Production-Ready Patterns

### Pattern: Fade In with Scale

```css
.fade-in-scale {
  animation: fadeInScale 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fade-in-scale {
    animation: none;
    opacity: 1;
    transform: scale(1);
  }
}
```

### Pattern: Button Press Feedback

```css
.button {
  transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.button:active {
  transform: scale(0.95);
  transition-duration: 80ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .button {
    transition: none;
  }
}
```

### Pattern: Hover Lift with Shadow

```css
.card {
  transition:
    transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

@media (prefers-reduced-motion: reduce) {
  .card {
    transition: box-shadow 200ms ease;
  }
  .card:hover {
    transform: none;
  }
}
```

### Pattern: Slide In from Bottom

```css
.slide-up {
  animation: slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .slide-up {
    animation: fadeIn 150ms ease forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}
```

### Pattern: Stagger Children Animation

```css
.stagger-container > * {
  animation: fadeInUp 400ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

.stagger-container > *:nth-child(1) {
  animation-delay: 0ms;
}
.stagger-container > *:nth-child(2) {
  animation-delay: 50ms;
}
.stagger-container > *:nth-child(3) {
  animation-delay: 100ms;
}
.stagger-container > *:nth-child(4) {
  animation-delay: 150ms;
}
.stagger-container > *:nth-child(5) {
  animation-delay: 200ms;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .stagger-container > * {
    animation: none;
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Pattern: Loading Spinner

```css
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: #000;
  border-radius: 50%;
  animation: spin 600ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 1200ms;
  }
}
```

---

## Framer Motion Patterns

### Basic Component Animation

```tsx
import { motion } from 'framer-motion';

function Card() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      Card content
    </motion.div>
  );
}
```

### Hover and Tap Animations

```tsx
<motion.button
  whileHover={{
    scale: 1.05,
    transition: { duration: 0.2, ease: [0.34, 1.56, 0.64, 1] },
  }}
  whileTap={{
    scale: 0.95,
    transition: { duration: 0.08, ease: [0.4, 0, 0.2, 1] },
  }}
>
  Click me
</motion.button>
```

### Stagger Children

```tsx
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

function List({ items }: { items: { id: string; text: string }[] }) {
  return (
    <motion.ul variants={container} initial="hidden" animate="show">
      {items.map((i) => (
        <motion.li key={i.id} variants={item}>
          {i.text}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

---

## Pre-Ship Checklist

Before deploying any animation to production, verify ALL of the following:

- [ ] **Duration**: Completes in under 300ms (unless intentionally slow)
- [ ] **Properties**: Only animates `transform` and/or `opacity`
- [ ] **Easing**: Uses custom cubic-bezier curve (no `linear` or default `ease`)
- [ ] **Accessibility**: Respects `prefers-reduced-motion` media query
- [ ] **Interruptibility**: User can interrupt animation smoothly
- [ ] **Origin**: Animation originates from contextually meaningful location
- [ ] **Value**: Animation adds genuine value to UX
- [ ] **Consistency**: Easing and duration match similar animations in system
- [ ] **Performance**: Runs at 60fps on target devices
- [ ] **Cross-browser**: Tested in Chrome, Firefox, Safari

---

## Common Mistakes to Avoid

### Animating Layout Properties

```css
/* BAD: Triggers layout + paint */
.dropdown {
  transition: height 300ms;
  height: 0;
}
.dropdown.open {
  height: 200px;
}

/* GOOD: Composite only */
.dropdown {
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
  transform: scaleY(0);
  transform-origin: top;
}
.dropdown.open {
  transform: scaleY(1);
}
```

### Ignoring Reduced Motion

```css
/* BAD: No accessibility consideration */
.animated {
  animation: bounce 500ms infinite;
}

/* GOOD: Provides alternative */
.animated {
  animation: bounce 500ms infinite;
}

@media (prefers-reduced-motion: reduce) {
  .animated {
    animation: none;
  }
}
```

### Over-animating

```css
/* BAD: 500ms for every interaction */
* {
  transition: all 500ms ease;
}

/* GOOD: Targeted, appropriate durations */
.button {
  transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## Tools & Resources

### Easing Curve Generators

- **easing.dev** - Interactive cubic-bezier generator with presets
- **cubic-bezier.com** - Classic tool for custom timing functions
- **easings.net** - Reference library of common easing functions

### Animation Libraries

- **Framer Motion** - Declarative React animation with spring physics
- **React Spring** - Spring-physics based animations for React
- **GSAP** - Industry-standard high-performance animation library
- **Motion One** - Modern, lightweight GSAP alternative

### Performance Testing

- Chrome DevTools Performance Tab
- Firefox DevTools Performance Monitor
- Real device testing on mid-range Android

---

## Orbit-Specific: Popover & Overlay Animation System

The codebase uses a centralized animation constant system for all overlays (popovers, tooltips, hover cards, dropdown menus, context menus). These rules were established through a full-tree animation audit of the chat input area.

### POPOVER_ANIMATION — Single Source of Truth

All overlay animations import timing from `@/lib/utils/constants.ts`:

```typescript
import { POPOVER_ANIMATION } from '@/lib/utils';

// Constants available:
POPOVER_ANIMATION.enterDuration; // '150ms' — enter animation
POPOVER_ANIMATION.exitDuration; // '100ms' — exit animation (shorter = snappier)
POPOVER_ANIMATION.exitDurationMs; // 100     — for setTimeout in manual exit animations
POPOVER_ANIMATION.enterEasing; // 'cubic-bezier(0.16, 1, 0.3, 1)' — ease-out (fast in, gentle settle)
POPOVER_ANIMATION.exitEasing; // 'cubic-bezier(0.4, 0, 1, 1)'    — ease-in (gentle start, fast out)

// Legacy unified values (for Radix primitives that don't split enter/exit):
POPOVER_ANIMATION.duration; // '150ms'
POPOVER_ANIMATION.easing; // 'cubic-bezier(0.16, 1, 0.3, 1)'
POPOVER_ANIMATION.durationMs; // 150
```

**Rule: Never define local animation constants in overlay components.** Import from `POPOVER_ANIMATION`.

### Asymmetric Enter/Exit Pattern

Enters and exits should feel fundamentally different, following macOS/iOS motion design:

| Phase | Properties Animated         | Easing   | Duration | Effect                    |
| ----- | --------------------------- | -------- | -------- | ------------------------- |
| Enter | scale + opacity + translate | ease-out | 150ms    | Rich: zoom + fade + slide |
| Exit  | opacity only                | ease-in  | 100ms    | Clean: fade only          |

**Why asymmetric?** A rich enter animation (zoom + slide + fade) draws attention to new content. But on exit, multi-property animations create visual artifacts:

- `zoom-out` with `backdrop-blur` creates a "smeared ghost" as the blur shows through decreasing opacity
- `slide-out` combined with `zoom-out` causes content to appear to "deflate and sink"
- These artifacts are especially visible on inner text/icon content

```tsx
// ✅ CORRECT: Asymmetric enter/exit
className={cn(
  // Enter: rich 3-property animation
  !isAnimatingOut && 'animate-in fade-in-0 zoom-in-[0.97] slide-in-from-bottom-1',
  // Exit: fade-only for clean disappearance
  isAnimatingOut && 'animate-out fade-out-0'
)}
style={{
  animationTimingFunction: isAnimatingOut
    ? POPOVER_ANIMATION.exitEasing    // ease-in
    : POPOVER_ANIMATION.enterEasing,  // ease-out
  animationDuration: isAnimatingOut
    ? POPOVER_ANIMATION.exitDuration  // 100ms
    : POPOVER_ANIMATION.enterDuration // 150ms
}}

// ❌ BAD: Symmetric enter/exit (causes deflating ghost)
className={cn(
  !isAnimatingOut && 'animate-in fade-in-0 zoom-in-[0.97] slide-in-from-bottom-1',
  isAnimatingOut && 'animate-out fade-out-0 zoom-out-[0.97] slide-out-to-bottom-1'
)}
```

### Easing Direction Rule

| Animation | Use      | cubic-bezier        | Why                                   |
| --------- | -------- | ------------------- | ------------------------------------- |
| Enter     | ease-out | `(0.16, 1, 0.3, 1)` | Fast arrival → gentle settle          |
| Exit      | ease-in  | `(0.4, 0, 1, 1)`    | Gentle departure → fast disappearance |

**Common mistake:** Using `ease-out` for both enter and exit. On exit, ease-out starts slow, making the element linger visually before accelerating away — the opposite of what users expect.

### Zoom Scale Consistency

All overlays must use the same zoom scale: **`0.97`** (3% scale).

```css
/* ✅ Consistent across all overlays */
zoom-in-[0.97] / zoom-out-[0.97]

/* ❌ Mismatched scales (tooltip used 0.95, others used 0.97) */
zoom-in-95  /* = 0.95 — too aggressive, visually inconsistent */
```

### Scoped Transitions — No `transition-all`

Never use `transition-all` — it transitions every CSS property including layout-triggering ones.

```css
/* ❌ BAD: Transitions width, height, padding, etc. */
transition-all duration-200

/* ✅ GOOD: Only transition what changes */
transition-[border-color,box-shadow] duration-200
transition-colors duration-150
transition-opacity duration-150
transition-transform duration-200
```

### Progress Bars — scaleX Instead of Width

Animating `width` triggers layout reflow. Use `transform: scaleX()` with `origin-left`:

```tsx
// ✅ GPU-only: scaleX stays on composite layer
<div className="h-full w-full origin-left rounded-full transition-transform duration-300 ease-out"
  style={{ transform: `scaleX(${percentage / 100})` }}
/>

// ❌ Layout-triggering: width causes reflow every frame
<div className="h-full rounded-full transition-[width] duration-300"
  style={{ width: `${percentage}%` }}
/>
```

### Reduced-Motion Guards for Tailwind Built-ins

Tailwind's built-in animation utilities (`animate-pulse`, `animate-spin`, etc.) don't respect `prefers-reduced-motion` by default. Add global guards in `globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-pulse,
  .animate-spin,
  .animate-bounce,
  .animate-ping {
    animation: none !important;
  }
}
```

### Full-Tree Audit Checklist

When auditing a component's animations, trace **every child in the render tree**, not just the top-level component:

1. **Map the DOM tree**: Identify every component rendered (including portals)
2. **Grep for animation keywords**: Search `transition`, `animate`, `duration`, `ease`, `scale`, `transform` across the entire directory
3. **Per-layer checks**:
   - [ ] Only `transform` and `opacity` animated (no layout properties)
   - [ ] Custom easing curves (no generic `ease`, `linear`)
   - [ ] Paired overlays share the same timing constants
   - [ ] `transition-all` replaced with scoped properties
   - [ ] `prefers-reduced-motion` respected
   - [ ] Zoom scale matches system standard (0.97)
4. **React performance**: Memo'd components, granular store selectors, no subscriptions to unused state
5. **Deduplication**: All animation constants imported from `POPOVER_ANIMATION`, no local copies

### Files Using POPOVER_ANIMATION

These files import from the centralized constant (keep this list updated):

| File                                       | Usage                              |
| ------------------------------------------ | ---------------------------------- |
| `components/ui/tooltip.tsx`                | Enter/exit timing + easing         |
| `components/ui/hover-card.tsx`             | Enter/exit timing + easing         |
| `components/ui/dropdown-menu.tsx`          | Content + SubContent timing        |
| `components/ui/context-menu.tsx`           | Content + SubContent timing        |
| `components/ui/popover.tsx`                | Enter/exit timing + easing         |
| `components/chat/input/model-selector.tsx` | Asymmetric enter/exit + setTimeout |

---

## Credits

Adapted from Emil Kowalski's animation guides:

- https://emilkowal.ski/ui/great-animations
- https://emilkowal.ski/ui/good-vs-great-animations
