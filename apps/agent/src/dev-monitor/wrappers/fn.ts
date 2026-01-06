/**
 * Function wrapper for dev-monitor.
 *
 * Traces function calls, arguments, returns, and errors.
 * Follows the error isolation pattern - monitoring errors never crash the app.
 */

import { captureEvent } from '../core/storage';

import type { FnOptions } from '../core/types';

// ═══════════════════════════════════════════════════════════════
// Function Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap a function to trace calls, arguments, returns, and errors.
 *
 * CRITICAL: Monitoring logic is wrapped in try/catch.
 * The original implementation ALWAYS runs, even if monitoring fails.
 *
 * @example
 * export const processFile = fnWrapper(
 *   'processFile',
 *   async (path: string): Promise<void> => { ... }
 * );
 */
export function fnWrapper<TArgs extends readonly unknown[], TReturn>(
  name: string,
  impl: (...args: TArgs) => TReturn,
  options: FnOptions = {}
): (...args: TArgs) => TReturn {
  const { category = 'fn:call', slowThreshold = 100, logArgs = false, logResult = false } = options;

  return (...args: TArgs): TReturn => {
    const start = performance.now();

    // ═══════════════════════════════════════════════════════════
    // Pre-call monitoring (ISOLATED)
    // ═══════════════════════════════════════════════════════════
    try {
      captureEvent({
        severity: 'info',
        category,
        file: 'unknown',
        function: name,
        title: `${name} called`,
        context: logArgs ? { args: sanitizeArgs(args) } : {},
      });
    } catch (monitorError: unknown) {
      console.error('[DevMonitor] fn pre-call error:', monitorError);
    }

    // ═══════════════════════════════════════════════════════════
    // ALWAYS execute original implementation
    // ═══════════════════════════════════════════════════════════
    let result: TReturn;

    try {
      result = impl(...args);
    } catch (implError: unknown) {
      // ═══════════════════════════════════════════════════════════
      // Error monitoring (ISOLATED)
      // ═══════════════════════════════════════════════════════════
      try {
        captureEvent({
          severity: 'error',
          category: `${category}:error`,
          file: 'unknown',
          function: name,
          title: `${name} threw error`,
          details: implError instanceof Error ? implError.message : String(implError),
          context: {
            stack: implError instanceof Error ? implError.stack : undefined,
            duration_ms: performance.now() - start,
          },
        });
      } catch (monitorError: unknown) {
        console.error('[DevMonitor] fn error capture failed:', monitorError);
      }

      // Re-throw the original error
      throw implError;
    }

    // ═══════════════════════════════════════════════════════════
    // Post-call monitoring (ISOLATED) - handles sync and async
    // ═══════════════════════════════════════════════════════════
    const captureCompletion = (finalResult: unknown, isAsync: boolean): void => {
      try {
        const duration = performance.now() - start;
        const isSlow = duration > slowThreshold;

        captureEvent({
          severity: isSlow ? 'perf' : 'info',
          category: isSlow ? `${category}:slow` : `${category}:complete`,
          file: 'unknown',
          function: name,
          title: `${name} ${isAsync ? 'resolved' : 'returned'} (${duration.toFixed(1)}ms)`,
          context: {
            duration_ms: duration,
            ...(logResult ? { result: sanitizeResult(finalResult) } : {}),
          },
        });
      } catch (monitorError: unknown) {
        console.error('[DevMonitor] fn post-call error:', monitorError);
      }
    };

    // Handle Promise results
    if (result instanceof Promise) {
      return result.then(
        (resolved: Awaited<TReturn>) => {
          captureCompletion(resolved, true);
          return resolved;
        },
        (rejected: unknown) => {
          try {
            captureEvent({
              severity: 'error',
              category: `${category}:rejected`,
              file: 'unknown',
              function: name,
              title: `${name} promise rejected`,
              details: rejected instanceof Error ? rejected.message : String(rejected),
              context: {
                stack: rejected instanceof Error ? rejected.stack : undefined,
                duration_ms: performance.now() - start,
              },
            });
          } catch (monitorError: unknown) {
            console.error('[DevMonitor] fn rejection capture failed:', monitorError);
          }
          throw rejected;
        }
      ) as TReturn;
    }

    // Sync result
    captureCompletion(result, false);
    return result;
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Sanitize function arguments for safe JSON serialization.
 */
function sanitizeArgs(args: readonly unknown[]): unknown[] {
  return args.map((arg) => sanitizeValue(arg));
}

/**
 * Sanitize a return value for safe JSON serialization.
 */
function sanitizeResult(result: unknown): unknown {
  return sanitizeValue(result);
}

/**
 * Sanitize any value for safe JSON serialization.
 */
function sanitizeValue(value: unknown): unknown {
  if (value === undefined) return '[undefined]';
  if (value === null) return null;
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
  if (typeof value === 'symbol') return `[symbol ${value.description ?? ''}]`;

  if (value instanceof Error) {
    return {
      error: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) {
    if (value.length > 10) {
      return `[Array(${String(value.length)})]`;
    }
    return value.map((v) => sanitizeValue(v));
  }

  if (typeof value === 'object') {
    try {
      // Check if it's serializable and not too large
      const json = JSON.stringify(value);
      if (json.length > 1000) {
        const keys = Object.keys(value);
        return `[Object(${String(keys.length)} keys)]`;
      }
      return value;
    } catch {
      return '[object]';
    }
  }

  return value;
}
