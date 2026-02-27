/**
 * Local constants for chat-area layout
 *
 * Shared constants (TERMINAL_PANEL, ACTIVITY_PANEL, CHAT_PANEL)
 * are imported from @/lib/utils/constants
 */

/**
 * Time in ms that the container must remain a stable size before revealing content.
 * ResizeObserver fires on each dimension change — once no resize occurs for this
 * duration, we consider layout settled. ~50ms ≈ 3 frames at 60fps, matching the
 * previous 3-frame rAF stability check but without forced synchronous layout.
 */
export const STABILIZATION_STABLE_THRESHOLD_MS = 50;

/**
 * Minimum time in ms that the skeleton must be visible before revealing content.
 * Prevents a jarring flash when conversations load very quickly (<50ms).
 * Ensures the staggered skeleton animation has time to play before being replaced.
 * 200ms lets the first 3 skeleton blocks appear (delays: 0, 60, 120ms) before reveal.
 */
export const SKELETON_MIN_DISPLAY_MS = 500;

/** Empty state vertical positioning - pushes input above center */
export const EMPTY_STATE_PADDING_BOTTOM = '40%';
