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

## Credits

Adapted from Emil Kowalski's animation guides:

- https://emilkowal.ski/ui/great-animations
- https://emilkowal.ski/ui/good-vs-great-animations
