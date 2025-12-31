/**
 * Tauri invoke wrapper for dev-monitor.
 *
 * Traces IPC calls to the Rust backend, including:
 * - Command name and arguments
 * - Duration and slow call warnings
 * - Errors
 */

import { captureEvent } from '../storage';

import type { InvokeOptions } from '../types';

// ═══════════════════════════════════════════════════════════════
// Invoke Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap a Tauri invoke call to trace IPC communication.
 *
 * @example
 * const content = await invokeWrapper<string>('read_file', { path });
 */
export async function invokeWrapper<T>(
  command: string,
  args?: Record<string, unknown>,
  options: InvokeOptions = {}
): Promise<T> {
  const { slowThreshold = 100 } = options;
  const start = performance.now();

  // ═══════════════════════════════════════════════════════════
  // Pre-call monitoring (ISOLATED)
  // ═══════════════════════════════════════════════════════════
  try {
    captureEvent({
      severity: 'info',
      category: 'ipc:invoke',
      file: 'tauri',
      function: command,
      title: `invoke(${command})`,
      context: {
        args: sanitizeArgs(args),
      },
    });
  } catch (monitorError: unknown) {
    console.error('[DevMonitor] invoke pre-call error:', monitorError);
  }

  // ═══════════════════════════════════════════════════════════
  // ALWAYS execute the invoke
  // ═══════════════════════════════════════════════════════════
  let result: T;

  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    result = await tauriInvoke<T>(command, args);
  } catch (invokeError: unknown) {
    // ═══════════════════════════════════════════════════════════
    // Error monitoring (ISOLATED)
    // ═══════════════════════════════════════════════════════════
    try {
      const duration = performance.now() - start;
      captureEvent({
        severity: 'error',
        category: 'ipc:invoke:error',
        file: 'tauri',
        function: command,
        title: `invoke(${command}) failed`,
        details: invokeError instanceof Error ? invokeError.message : String(invokeError),
        context: {
          duration_ms: duration,
          args: sanitizeArgs(args),
        },
      });
    } catch (monitorError: unknown) {
      console.error('[DevMonitor] invoke error capture failed:', monitorError);
    }

    throw invokeError;
  }

  // ═══════════════════════════════════════════════════════════
  // Post-call monitoring (ISOLATED)
  // ═══════════════════════════════════════════════════════════
  try {
    const duration = performance.now() - start;
    const isSlow = duration > slowThreshold;

    captureEvent({
      severity: isSlow ? 'perf' : 'info',
      category: isSlow ? 'ipc:invoke:slow' : 'ipc:invoke:complete',
      file: 'tauri',
      function: command,
      title: `invoke(${command}) (${duration.toFixed(1)}ms)`,
      context: {
        duration_ms: duration,
        ...(isSlow ? { threshold_ms: slowThreshold } : {}),
      },
    });
  } catch (monitorError: unknown) {
    console.error('[DevMonitor] invoke post-call error:', monitorError);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Sanitize invoke arguments for safe logging.
 *
 * Redacts potentially sensitive values like paths and credentials.
 */
function sanitizeArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) return {};

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    // Redact sensitive keys
    if (isSensitiveKey(key)) {
      sanitized[key] = '[redacted]';
      continue;
    }

    // Truncate long strings
    if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '...';
      continue;
    }

    // Summarize large arrays
    if (Array.isArray(value) && value.length > 10) {
      sanitized[key] = `[Array(${String(value.length)})]`;
      continue;
    }

    // Summarize large objects
    if (typeof value === 'object' && value !== null) {
      try {
        const json = JSON.stringify(value);
        if (json.length > 500) {
          sanitized[key] = `[Object]`;
          continue;
        }
      } catch {
        sanitized[key] = `[Object]`;
        continue;
      }
    }

    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Check if a key might contain sensitive data.
 */
function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = ['password', 'secret', 'token', 'key', 'auth', 'credential', 'private'];

  const lowerKey = key.toLowerCase();
  return sensitivePatterns.some((pattern) => lowerKey.includes(pattern));
}
