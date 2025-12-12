/**
 * TerminalResizeDebouncer - VS Code-style resize debouncing for xterm.js
 *
 * Based on VS Code's terminalResizeDebouncer.ts pattern:
 * - Separates horizontal (expensive) from vertical (cheap) resizing
 * - Uses idle callbacks for hidden terminals
 * - Small buffers resize immediately for responsiveness
 *
 * Reference: Orbit/src/vs/workbench/contrib/terminal/browser/terminalResizeDebouncer.ts
 */

import type { Terminal } from '@xterm/xterm';

// ============================================================================
// Constants
// ============================================================================

/**
 * Buffer line count threshold for immediate vs debounced resize.
 * Small buffers resize immediately (cheap), large buffers use debouncing.
 */
const START_DEBOUNCING_THRESHOLD = 200;

/**
 * Debounce delay for horizontal (column) resize in milliseconds.
 * Horizontal resize is expensive due to text reflow calculations.
 */
const HORIZONTAL_DEBOUNCE_MS = 100;

// ============================================================================
// TerminalResizeDebouncer Class
// ============================================================================

export class TerminalResizeDebouncer {
  private _latestCols = 0;
  private _latestRows = 0;
  private _resizeXTimeout: ReturnType<typeof setTimeout> | null = null;
  private _idleCallbackId: number | null = null;
  private _disposed = false;

  constructor(
    private readonly _getXterm: () => Terminal | null,
    private readonly _isVisible: () => boolean,
    private readonly _resizeCallback: (cols: number, rows: number) => void
  ) {}

  /**
   * Request a resize operation with smart debouncing.
   *
   * Strategy:
   * 1. Small buffers (<200 lines) resize immediately
   * 2. Hidden terminals defer to idle callback
   * 3. Visible terminals: Y immediate, X debounced (100ms)
   */
  resize(cols: number, rows: number, immediate = false): void {
    if (this._disposed) return;

    this._latestCols = cols;
    this._latestRows = rows;

    const xterm = this._getXterm();
    if (!xterm) return;

    // Small buffers resize immediately (cheap operation)
    const bufferLength = xterm.buffer.normal.length;
    if (immediate || bufferLength < START_DEBOUNCING_THRESHOLD) {
      this._doFlush();
      return;
    }

    // Hidden terminals use idle callback to avoid blocking UI
    if (!this._isVisible()) {
      this._scheduleIdleResize();
      return;
    }

    // Visible terminals: vertical is cheap, horizontal is expensive
    // Apply vertical immediately, debounce horizontal
    if (rows !== xterm.rows) {
      // Vertical resize is cheap - do it now
      this._resizeCallback(xterm.cols, rows);
    }

    // Horizontal resize is expensive (causes text reflow) - debounce it
    if (cols !== xterm.cols) {
      this._scheduleHorizontalResize(cols);
    }
  }

  /**
   * Debounced horizontal resize (100ms delay).
   * Horizontal changes cause expensive text reflow calculations.
   */
  private _scheduleHorizontalResize(cols: number): void {
    if (this._resizeXTimeout) {
      clearTimeout(this._resizeXTimeout);
    }

    this._resizeXTimeout = setTimeout(() => {
      this._resizeXTimeout = null;
      if (!this._disposed) {
        this._resizeCallback(cols, this._latestRows);
      }
    }, HORIZONTAL_DEBOUNCE_MS);
  }

  /**
   * Schedule resize on idle (for hidden terminals).
   * Uses requestIdleCallback to defer work until browser is idle.
   */
  private _scheduleIdleResize(): void {
    if (this._idleCallbackId !== null) return; // Already scheduled

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      this._idleCallbackId = requestIdleCallback(() => {
        this._idleCallbackId = null;
        if (!this._disposed) {
          this._doFlush();
        }
      });
    } else {
      // Fallback for environments without requestIdleCallback
      this._idleCallbackId = setTimeout(() => {
        this._idleCallbackId = null;
        if (!this._disposed) {
          this._doFlush();
        }
      }, 50) as unknown as number;
    }
  }

  /**
   * Flush any pending resize operations immediately.
   * Called when terminal becomes visible to apply deferred resizes.
   */
  flush(): void {
    if (this._disposed) return;

    // Clear any pending debounced operations
    if (this._resizeXTimeout) {
      clearTimeout(this._resizeXTimeout);
      this._resizeXTimeout = null;
    }

    if (this._idleCallbackId !== null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this._idleCallbackId);
      } else {
        clearTimeout(this._idleCallbackId);
      }
      this._idleCallbackId = null;
    }

    this._doFlush();
  }

  /**
   * Execute the resize callback with latest dimensions.
   */
  private _doFlush(): void {
    if (this._disposed) return;
    this._resizeCallback(this._latestCols, this._latestRows);
  }

  /**
   * Dispose and clean up all pending operations.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    if (this._resizeXTimeout) {
      clearTimeout(this._resizeXTimeout);
      this._resizeXTimeout = null;
    }

    if (this._idleCallbackId !== null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this._idleCallbackId);
      } else {
        clearTimeout(this._idleCallbackId);
      }
      this._idleCallbackId = null;
    }
  }
}
