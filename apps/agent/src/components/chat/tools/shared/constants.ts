/**
 * Shared animation constants for tool card widgets.
 *
 * Easing: ease-out-quart — recommended for enter/exit transitions
 * (user-initiated interactions like clicking to expand a card).
 * Duration: 200ms — standard UI range per animation guidelines.
 * All paired elements (height + opacity) share the same curve and
 * duration to satisfy the "paired elements rule".
 *
 * @see /.claude/skills/web-animation-design for easing reference
 */

import type { Transition } from 'motion/react';

/**
 * ease-out-quart as cubic-bezier array for Framer Motion.
 * CSS equivalent: cubic-bezier(0.165, 0.84, 0.44, 1)
 */
const EASE_OUT_QUART: [number, number, number, number] = [0.165, 0.84, 0.44, 1];

/**
 * Expand/collapse transition for tool card content (AnimatePresence).
 *
 * height + opacity are paired — same easing and duration so the
 * container reveal and content fade feel like a single cohesive motion.
 */
export const TOOL_EXPAND_TRANSITION: Transition = {
  height: { duration: 0.2, ease: EASE_OUT_QUART },
  opacity: { duration: 0.2, ease: EASE_OUT_QUART },
};

/** Instant transition for users who prefer reduced motion. */
export const TOOL_EXPAND_TRANSITION_NONE: Transition = {
  duration: 0,
};

/**
 * Outer card container classes.
 *
 * - box-shadow removed from transition list (triggers paint, imperceptible change)
 * - [contain:content] isolates layout/paint from sibling cards in chat scroll
 */
export const TOOL_CARD_BASE =
  'bg-card overflow-hidden transition-[border-color,opacity] duration-200 [contain:content]';

/**
 * Header button classes.
 * Hover uses CSS `ease` (correct per animation guidelines for hover states).
 */
export const TOOL_HEADER_BASE =
  'w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/40 transition-colors duration-150';

/**
 * Chevron icon classes.
 * ease-out for user-initiated rotation (click-to-expand).
 */
export const TOOL_CHEVRON_BASE =
  'tool-chevron h-3 w-3 text-muted-foreground/60 transition-transform duration-200 ease-out';
