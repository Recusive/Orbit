/**
 * xterm.js wrapper for dev-monitor.
 *
 * Wraps a Terminal instance to monitor:
 * - Write operations
 * - Write storms (too many writes per second)
 * - Resize events
 * - Data events
 *
 * Uses Proxy pattern to wrap terminal methods without modifying the original.
 * Follows the error isolation pattern - monitoring errors never crash the terminal.
 */

import { captureEvent } from '../storage';

import type { XtermOptions } from '../types';
import type { Terminal } from '@xterm/xterm';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Internal state for write storm detection */
interface WriteStormState {
  writesInWindow: number;
  windowStart: number;
  totalWrites: number;
  totalBytes: number;
  stormWarned: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Window size for write storm detection (1 second) */
const STORM_WINDOW_MS = 1000;

// ═══════════════════════════════════════════════════════════════
// xterm Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap an xterm Terminal to add monitoring.
 *
 * Uses Proxy to intercept write() and writeln() calls without
 * modifying the original terminal instance.
 *
 * @example
 * const terminal = xtermWrapper('MainTerminal', new Terminal(options));
 */
export function xtermWrapper(
  name: string,
  terminal: Terminal,
  options: XtermOptions = {}
): Terminal {
  const { writeStormThreshold = 100 } = options;

  // Write storm detection state
  const stormState: WriteStormState = {
    writesInWindow: 0,
    windowStart: performance.now(),
    totalWrites: 0,
    totalBytes: 0,
    stormWarned: false,
  };

  // Log initialization
  try {
    captureEvent({
      severity: 'info',
      category: 'xterm:init',
      file: `terminal:${name}`,
      function: 'create',
      title: `${name} terminal created`,
      context: {
        cols: terminal.cols,
        rows: terminal.rows,
      },
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] xterm init capture failed:', err);
  }

  /**
   * Track a write operation for storm detection.
   */
  const trackWrite = (byteCount: number): void => {
    const now = performance.now();

    // Reset window if expired
    if (now - stormState.windowStart > STORM_WINDOW_MS) {
      stormState.writesInWindow = 0;
      stormState.windowStart = now;
      stormState.stormWarned = false;
    }

    stormState.writesInWindow += 1;
    stormState.totalWrites += 1;
    stormState.totalBytes += byteCount;

    // Check for write storm
    if (stormState.writesInWindow > writeStormThreshold && !stormState.stormWarned) {
      stormState.stormWarned = true;

      try {
        captureEvent({
          severity: 'perf',
          category: 'xterm:writeStorm',
          file: `terminal:${name}`,
          function: 'write',
          title: `${name} write storm detected (${String(stormState.writesInWindow)} writes/sec)`,
          context: {
            writesPerSecond: stormState.writesInWindow,
            threshold: writeStormThreshold,
            totalWrites: stormState.totalWrites,
            totalBytes: stormState.totalBytes,
          },
        });
      } catch (err: unknown) {
        console.error('[DevMonitor] xterm storm capture failed:', err);
      }
    }
  };

  /**
   * Wrap a write method to add monitoring.
   */
  const wrapWriteMethod = <T extends (data: string | Uint8Array, callback?: () => void) => void>(
    method: T
  ): T => {
    return function (this: Terminal, data: string | Uint8Array, callback?: () => void): void {
      const byteCount = typeof data === 'string' ? data.length : data.byteLength;

      // Track for storm detection
      trackWrite(byteCount);

      // Call original method
      method.call(this, data, callback);
    } as T;
  };

  // Create Proxy to intercept method calls
  const proxy = new Proxy(terminal, {
    get(target: Terminal, prop: string | symbol): unknown {
      const value = target[prop as keyof Terminal];

      // Wrap write methods
      if (prop === 'write' && typeof value === 'function') {
        return wrapWriteMethod(
          value.bind(target) as (data: string | Uint8Array, callback?: () => void) => void
        );
      }

      if (prop === 'writeln' && typeof value === 'function') {
        return wrapWriteMethod(
          value.bind(target) as (data: string | Uint8Array, callback?: () => void) => void
        );
      }

      // Wrap resize to track size changes
      if (prop === 'resize' && typeof value === 'function') {
        return function (this: Terminal, cols: number, rows: number): void {
          try {
            captureEvent({
              severity: 'info',
              category: 'xterm:resize',
              file: `terminal:${name}`,
              function: 'resize',
              title: `${name} resized to ${String(cols)}x${String(rows)}`,
              context: {
                cols,
                rows,
                prevCols: target.cols,
                prevRows: target.rows,
              },
            });
          } catch (err: unknown) {
            console.error('[DevMonitor] xterm resize capture failed:', err);
          }

          (value as (cols: number, rows: number) => void).call(target, cols, rows);
        };
      }

      // Wrap dispose to track cleanup
      if (prop === 'dispose' && typeof value === 'function') {
        return function (this: Terminal): void {
          try {
            captureEvent({
              severity: 'info',
              category: 'xterm:dispose',
              file: `terminal:${name}`,
              function: 'dispose',
              title: `${name} terminal disposed`,
              context: {
                totalWrites: stormState.totalWrites,
                totalBytes: stormState.totalBytes,
              },
            });
          } catch (err: unknown) {
            console.error('[DevMonitor] xterm dispose capture failed:', err);
          }

          (value as () => void).call(target);
        };
      }

      // Wrap clear to track buffer clears
      if (prop === 'clear' && typeof value === 'function') {
        return function (this: Terminal): void {
          try {
            captureEvent({
              severity: 'info',
              category: 'xterm:clear',
              file: `terminal:${name}`,
              function: 'clear',
              title: `${name} buffer cleared`,
              context: {},
            });
          } catch (err: unknown) {
            console.error('[DevMonitor] xterm clear capture failed:', err);
          }

          (value as () => void).call(target);
        };
      }

      // Wrap reset to track terminal resets
      if (prop === 'reset' && typeof value === 'function') {
        return function (this: Terminal): void {
          try {
            captureEvent({
              severity: 'info',
              category: 'xterm:reset',
              file: `terminal:${name}`,
              function: 'reset',
              title: `${name} terminal reset`,
              context: {},
            });
          } catch (err: unknown) {
            console.error('[DevMonitor] xterm reset capture failed:', err);
          }

          (value as () => void).call(target);
        };
      }

      // Return bound method or property
      if (typeof value === 'function') {
        return value.bind(target);
      }

      return value;
    },
  });

  return proxy;
}
