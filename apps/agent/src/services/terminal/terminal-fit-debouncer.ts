/**
 * TerminalFitDebouncer - Simple debouncer for xterm.js FitAddon
 *
 * This debouncer handles the proper pattern for terminal resizing:
 * 1. Debounce rapid resize events to prevent UI blocking
 * 2. Call fitAddon.fit() which calculates cols/rows from container
 * 3. xterm's onResize event automatically notifies backend
 *
 * Unlike the previous implementation, this doesn't try to compare dimensions.
 * FitAddon.fit() is the source of truth - it reads the container and calculates.
 */

import type { FitAddon } from '@xterm/addon-fit';

// ============================================================================
// Constants
// ============================================================================

/** Debounce delay in milliseconds for resize operations */
const RESIZE_DEBOUNCE_MS = 50;

/** Delay for idle callback when terminal is hidden */
const IDLE_DELAY_MS = 100;

// ============================================================================
// TerminalFitDebouncer Class
// ============================================================================

export class TerminalFitDebouncer {
  private _timeout: ReturnType<typeof setTimeout> | null = null;
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
   * Schedule a debounced fit for visible terminals.
   */
  private _scheduleFit(): void {
    // Clear any existing timeout
    if (this._timeout !== null) {
      clearTimeout(this._timeout);
    }

    this._timeout = setTimeout(() => {
      this._timeout = null;
      if (!this._disposed && this._pendingFit) {
        this._doFit();
      }
    }, RESIZE_DEBOUNCE_MS);
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
      this._idleCallback = setTimeout(() => {
        this._idleCallback = null;
        if (!this._disposed && this._pendingFit) {
          this._doFit();
        }
      }, IDLE_DELAY_MS) as unknown as number;
    }
  }

  /**
   * Flush any pending fit operation immediately.
   * Call this when terminal becomes visible to ensure correct sizing.
   */
  flush(): void {
    if (this._disposed) return;

    this._clearPending();

    if (this._pendingFit) {
      this._doFit();
    }
  }

  /**
   * Force an immediate fit, regardless of pending state.
   * Use for critical moments like initial PTY creation.
   */
  forcefit(): void {
    if (this._disposed) return;
    this._clearPending();
    this._doFit();
  }

  /**
   * Clear all pending callbacks.
   */
  private _clearPending(): void {
    if (this._timeout !== null) {
      clearTimeout(this._timeout);
      this._timeout = null;
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
