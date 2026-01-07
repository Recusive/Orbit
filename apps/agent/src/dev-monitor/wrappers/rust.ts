/**
 * Rust tracing wrapper for dev-monitor.
 *
 * Subscribes to tracing events emitted from the Rust backend via Tauri.
 * The Rust side uses a custom tracing subscriber that emits events to
 * the frontend through Tauri's event system.
 *
 * Event format matches the frontend's DevEvent structure for unified
 * storage and analysis.
 *
 * Follows the error isolation pattern - monitoring errors never crash the app.
 */

import { captureEvent } from '../core/storage';

import type { Severity } from '../core/types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Rust tracing event from backend */
interface RustTracingEvent {
  /** Tracing level (trace, debug, info, warn, error) */
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  /** Target module path (e.g., "snowflake::fs::watcher") */
  target: string;
  /** Event message */
  message: string;
  /** Span name if inside a span */
  span?: string;
  /** Key-value fields from the event */
  fields?: Record<string, unknown>;
  /** Timestamp in milliseconds */
  timestamp?: number;
}

/** Rust span event (enter/exit) */
interface RustSpanEvent {
  /** Span ID */
  id: number;
  /** Span name */
  name: string;
  /** Target module */
  target: string;
  /** Event type */
  event: 'enter' | 'exit' | 'close';
  /** Duration in microseconds (for exit/close) */
  duration_us?: number;
  /** Span fields */
  fields?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

/** Cleanup function for the listener */
let unsubscribe: (() => void) | null = null;

/** Whether subscription is active */
let isSubscribed = false;

/** Active spans being tracked */
const activeSpans = new Map<number, { name: string; startTime: number }>();

// ═══════════════════════════════════════════════════════════════
// Severity Mapping
// ═══════════════════════════════════════════════════════════════

/**
 * Map Rust tracing level to dev-monitor severity.
 */
function mapLevel(level: RustTracingEvent['level']): Severity {
  switch (level) {
    case 'error':
      return 'error';
    case 'warn':
      return 'warning';
    case 'info':
    case 'debug':
    case 'trace':
      return 'info';
    default:
      return 'info';
  }
}

// ═══════════════════════════════════════════════════════════════
// Event Handlers
// ═══════════════════════════════════════════════════════════════

/**
 * Handle a tracing event from Rust.
 */
function handleTracingEvent(event: RustTracingEvent): void {
  try {
    // Parse target into file-like path
    const file = event.target.replace(/::/g, '/');

    captureEvent({
      severity: mapLevel(event.level),
      category: `rust:${event.level}`,
      file,
      function: event.span ?? 'unknown',
      title: event.message,
      context: event.fields ?? {},
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] Rust tracing event capture failed:', err);
  }
}

/**
 * Handle a span event from Rust.
 */
function handleSpanEvent(event: RustSpanEvent): void {
  try {
    const file = event.target.replace(/::/g, '/');

    switch (event.event) {
      case 'enter': {
        activeSpans.set(event.id, {
          name: event.name,
          startTime: performance.now(),
        });

        captureEvent({
          severity: 'info',
          category: 'rust:span:enter',
          file,
          function: event.name,
          title: `→ ${event.name}`,
          context: event.fields ?? {},
        });
        break;
      }

      case 'exit':
      case 'close': {
        const spanInfo = activeSpans.get(event.id);
        let duration: number | undefined;

        if (spanInfo !== undefined) {
          duration = performance.now() - spanInfo.startTime;
        } else if (event.duration_us !== undefined) {
          duration = event.duration_us / 1000;
        }

        activeSpans.delete(event.id);

        // Determine severity based on duration
        const isSlow = duration !== undefined && duration > 100;
        const severity: Severity = isSlow ? 'perf' : 'info';

        captureEvent({
          severity,
          category: isSlow ? 'rust:span:slow' : 'rust:span:exit',
          file,
          function: event.name,
          title:
            duration !== undefined
              ? `← ${event.name} (${duration.toFixed(1)}ms)`
              : `← ${event.name}`,
          context: {
            ...(event.fields ?? {}),
            ...(duration !== undefined ? { duration_ms: duration } : {}),
          },
        });
        break;
      }
    }
  } catch (err: unknown) {
    console.error('[DevMonitor] Rust span event capture failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// Subscription
// ═══════════════════════════════════════════════════════════════

/**
 * Subscribe to Rust tracing events.
 *
 * This sets up a Tauri event listener for tracing events emitted
 * from the Rust backend. Call this during app initialization.
 *
 * @returns Cleanup function to unsubscribe
 *
 * @example
 * // In main.tsx or app initialization
 * const cleanup = await subscribeToRustTracing();
 *
 * // Later, to clean up
 * cleanup();
 */
export async function subscribeToRustTracing(): Promise<() => void> {
  if (isSubscribed) {
    // Already subscribed, return existing cleanup
    return (): void => {
      unsubscribeFromRustTracing();
    };
  }

  try {
    // Dynamic import to avoid issues when Tauri is not available
    const { listen } = await import('@tauri-apps/api/event');

    // Subscribe to tracing events
    const unlistenTracing = await listen<RustTracingEvent>('devmonitor:tracing', (event) => {
      handleTracingEvent(event.payload);
    });

    // Subscribe to span events
    const unlistenSpans = await listen<RustSpanEvent>('devmonitor:span', (event) => {
      handleSpanEvent(event.payload);
    });

    isSubscribed = true;

    // Create combined cleanup function
    unsubscribe = (): void => {
      unlistenTracing();
      unlistenSpans();
      isSubscribed = false;
      activeSpans.clear();
    };

    // Log successful subscription
    captureEvent({
      severity: 'info',
      category: 'rust:subscribe',
      file: 'rust',
      function: 'subscribe',
      title: 'Subscribed to Rust tracing events',
      context: {},
    });

    return (): void => {
      unsubscribeFromRustTracing();
    };
  } catch (err: unknown) {
    console.error('[DevMonitor] Failed to subscribe to Rust tracing:', err);

    // Return no-op cleanup on error
    return (): void => {
      // No-op
    };
  }
}

/**
 * Unsubscribe from Rust tracing events.
 */
export function unsubscribeFromRustTracing(): void {
  if (unsubscribe) {
    try {
      captureEvent({
        severity: 'info',
        category: 'rust:unsubscribe',
        file: 'rust',
        function: 'unsubscribe',
        title: 'Unsubscribed from Rust tracing events',
        context: {
          activeSpansCleared: activeSpans.size,
        },
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] Rust unsubscribe capture failed:', err);
    }

    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * Check if currently subscribed to Rust tracing.
 */
export function isRustTracingSubscribed(): boolean {
  return isSubscribed;
}

// ═══════════════════════════════════════════════════════════════
// Manual Logging (for testing without Rust backend)
// ═══════════════════════════════════════════════════════════════

/**
 * Manually log a Rust-style event (useful for testing).
 */
export function logRustEvent(
  level: RustTracingEvent['level'],
  target: string,
  message: string,
  fields?: Record<string, unknown>
): void {
  const event: RustTracingEvent = {
    level,
    target,
    message,
    timestamp: Date.now(),
  };

  if (fields) {
    event.fields = fields;
  }

  handleTracingEvent(event);
}
