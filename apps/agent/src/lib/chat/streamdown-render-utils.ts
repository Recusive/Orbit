/**
 * Shared utilities for the Streamdown render cache pipeline.
 *
 * Used by both the background render service (to set hidden container width)
 * and FlowTokenSegment (to validate cache entries against current width).
 */
import { createLogger } from '@orbit/common/lib';

import { invalidateForViewportWidth } from '@/lib/chat/streamdown-cache';
import { CHAT_WIDTH } from '@/lib/utils/constants';

const logger = createLogger('StreamdownRenderUtils');

/** CSS var that controls chat content width — set by responsive breakpoints in globals.css. */
const CHAT_WIDTH_CSS_VAR = '--chat-width-primary';

/** Tolerance before triggering invalidation (matches streamdown-cache module). */
const WIDTH_CHANGE_THRESHOLD_PX = 16;

/** Debounce delay for resize events. */
const RESIZE_DEBOUNCE_MS = 300;

/**
 * Read the current chat content width from the CSS custom property.
 * Falls back to the constant default (650px) if the var isn't set.
 */
export function getChatContentWidth(): number {
  const cssValue = document.documentElement.style.getPropertyValue(CHAT_WIDTH_CSS_VAR);
  if (cssValue !== '') {
    const parsed = parseInt(cssValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return CHAT_WIDTH.primary;
}

// ── Viewport Width Tracking ────────────────────────────────────────────

let lastTrackedWidth = 0;
let resizeTimer = 0;
let resizeCleanup: (() => void) | null = null;

function handleResize(): void {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const currentWidth = getChatContentWidth();
    if (
      lastTrackedWidth > 0 &&
      Math.abs(currentWidth - lastTrackedWidth) > WIDTH_CHANGE_THRESHOLD_PX
    ) {
      const invalidated = invalidateForViewportWidth(currentWidth);
      // Lazy import to avoid circular dependency — render service imports this module.
      void import('@/services/chat/streamdown-render-service').then(({ onViewportWidthChange }) => {
        onViewportWidthChange();
      });
      if (invalidated > 0) {
        logger.debug('Viewport width changed, invalidated cache entries', {
          from: lastTrackedWidth,
          to: currentWidth,
          invalidated,
        });
      }
    }
    lastTrackedWidth = currentWidth;
  }, RESIZE_DEBOUNCE_MS);
}

/**
 * Start listening for viewport width changes. Call once at app startup.
 * Returns a cleanup function.
 */
export function startViewportWidthTracking(): () => void {
  if (resizeCleanup !== null) {
    return resizeCleanup;
  }

  lastTrackedWidth = getChatContentWidth();
  window.addEventListener('resize', handleResize, { passive: true });

  resizeCleanup = (): void => {
    window.removeEventListener('resize', handleResize);
    clearTimeout(resizeTimer);
    resizeCleanup = null;
  };

  return resizeCleanup;
}
