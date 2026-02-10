/**
 * Source Control Constants
 *
 * Extracted hardcoded values for maintainability.
 */

import type { Transition } from 'motion/react';

/** Polling interval for git status updates (ms) */
export const GIT_STATUS_POLL_INTERVAL = 5000;

/** Duration before operation error auto-dismisses (ms) */
export const OPERATION_ERROR_TIMEOUT = 5000;

/** Height of the source control header in pixels */
export const HEADER_HEIGHT = 35;

/** Number of rows for commit message textarea */
export const COMMIT_TEXTAREA_ROWS = 3;

// ---------------------------------------------------------------------------
// Diff card animation constants
// ---------------------------------------------------------------------------

/**
 * ease-out-quart as cubic-bezier array.
 * Aligned with tool widget transitions for visual consistency.
 */
const EASE_OUT_QUART: [number, number, number, number] = [0.165, 0.84, 0.44, 1];

/** Expand/collapse transition for diff file cards (AnimatePresence). */
export const DIFF_EXPAND_TRANSITION: Transition = {
  height: { duration: 0.2, ease: EASE_OUT_QUART },
  opacity: { duration: 0.2, ease: EASE_OUT_QUART },
};

/** Instant transition for users who prefer reduced motion. */
export const DIFF_EXPAND_TRANSITION_NONE: Transition = {
  duration: 0,
};
