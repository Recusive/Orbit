/**
 * TerminalFitDebouncer - RAF-based debouncer for xterm.js FitAddon
 *
 * Uses requestAnimationFrame for instant resize response:
 * 1. Coalesces multiple resize events within a single frame
 * 2. Syncs fit() with browser's render cycle for smooth resizing
 * 3. xterm's onResize event automatically notifies backend
 *
 * FitAddon.fit() is the source of truth - it reads the container and calculates.
 */

import type { FitAddon } from '@xterm/addon-fit';

// ============================================================================
// Constants
// ============================================================================

/** Delay for idle callback when terminal is hidden */
const IDLE_DELAY_MS = 100;

// ============================================================================
// TerminalFitDebouncer Class
// ============================================================================

export class TerminalFitDebouncer {
  private _rafId: number | null = null;
  private _idleCallback: number | null = null;
  private _disposed = false;
  private _pendingFit = false;

  constructor(
    private readonly _fitAddon: FitAddon,
    private readonly _isVisible: () => boolean
  ) {}

  /**
   * Request a fit operation.
   * The actual fit() call is debounced to prevent rapid successive calls.
   *
   * @param immediate - If true, fit immediately without debouncing
   */
  fit(immediate = false): void {
    if (this._disposed) return;

    if (immediate) {
      this._clearPending();
      this._doFit();
      return;
    }

    // Mark that a fit is pending
    this._pendingFit = true;

    // If terminal is hidden, defer to idle callback
    if (!this._isVisible()) {
      this._scheduleIdleFit();
      return;
    }

    // Debounce visible terminal fits
    this._scheduleFit();
  }

  /**
   * Schedule a fit for visible terminals using requestAnimationFrame.
   * This syncs with the browser's render cycle for instant, smooth resizing.
   *
   * Note: Unlike the previous setTimeout-based debouncer which used trailing-edge
   * behavior (last call wins, timer resets on each call), this uses frame-coalescing
   * (first call triggers RAF, subsequent calls within same frame are no-ops).
   * This provides faster, more responsive resize behavior.
   */
  private _scheduleFit(): void {
    // Already scheduled for this frame
    if (this._rafId !== null) return;

    this._rafId = requestAnimationFrame(() => {
      try {
        if (!this._disposed && this._pendingFit) {
          this._doFit();
        }
      } finally {
        this._rafId = null;
      }
    });
  }

  /**
   * Schedule a fit for hidden terminals using idle callback.
   */
  private _scheduleIdleFit(): void {
    // Already scheduled
    if (this._idleCallback !== null) return;

    if (typeof requestIdleCallback !== 'undefined') {
      this._idleCallback = requestIdleCallback(() => {
        this._idleCallback = null;
        if (!this._disposed && this._pendingFit) {
          this._doFit();
        }
      });
    } else {
      // Fallback for environments without requestIdleCallback
      // Use window.setTimeout explicitly to get browser's numeric return type
      this._idleCallback = window.setTimeout(() => {
        this._idleCallback = null;
        if (!this._disposed && this._pendingFit) {
          this._doFit();
        }
      }, IDLE_DELAY_MS);
    }
  }

  /**
   * Flush any pending fit operation immediately.
   * Call this when terminal becomes visible to ensure correct sizing.
   */
  flush(): void {
    if (this._disposed) return;

    // Cancel any scheduled RAF/idle callbacks (doesn't clear _pendingFit flag)
    this._clearPending();

    // Execute immediately if a fit was pending
    if (this._pendingFit) {
      this._doFit(); // This sets _pendingFit = false
    }
  }

  /**
   * Force an immediate fit, regardless of pending state.
   * Use for critical moments like initial PTY creation.
   */
  forceFit(): void {
    if (this._disposed) return;
    this._clearPending();
    this._doFit();
  }

  /**
   * Clear all pending callbacks.
   */
  private _clearPending(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    if (this._idleCallback !== null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this._idleCallback);
      } else {
        clearTimeout(this._idleCallback);
      }
      this._idleCallback = null;
    }
  }

  /**
   * Execute the fit operation.
   */
  private _doFit(): void {
    this._pendingFit = false;

    try {
      this._fitAddon.fit();
    } catch {
      // Ignore fit errors (e.g., container not visible or zero dimensions)
    }
  }

  /**
   * Check if there's a pending fit operation.
   */
  get hasPendingFit(): boolean {
    return this._pendingFit;
  }

  /**
   * Dispose and clean up all pending operations.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._clearPending();
  }
}
