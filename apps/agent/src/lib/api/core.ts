/**
 * Core Tauri utilities
 *
 * Foundation module containing invoke(), listen(), and Tauri detection.
 * All other API modules import from this file.
 *
 * Includes Sentry span instrumentation for performance monitoring.
 */

import { createLogger } from '@orbit/common/lib';
import * as Sentry from '@sentry/react';

// ============================================
// OpenTelemetry SpanStatusCode (per spec)
// ============================================

/**
 * Span status codes following OpenTelemetry specification.
 * @see https://opentelemetry.io/docs/specs/otel/trace/api/#set-status
 */
const SpanStatusCode = {
  /** The operation completed successfully. */
  OK: 1,
  /** The operation contains an error. */
  ERROR: 2,
} as const;

// ============================================
// Tauri Detection & Imports
// ============================================

export const logger = createLogger('Backend');
export const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

/**
 * Invoke a Tauri command with automatic Sentry span instrumentation.
 *
 * Each invocation creates a span under the `tauri.invoke` operation,
 * allowing performance monitoring of all backend calls.
 */
export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  if (!IS_TAURI) {
    // Mock mode for browser development
    logger.debug(`Mock invoke: ${command}`, args);
    throw new Error(`Tauri not available. Cannot invoke '${command}'`);
  }

  // Wrap the Tauri invoke in a Sentry span for performance tracing
  return Sentry.startSpan(
    {
      op: 'tauri.invoke',
      name: command,
      attributes: {
        'tauri.command': command,
        'tauri.has_args': args !== undefined,
      },
    },
    async (span) => {
      try {
        const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
        const invokePromise = tauriInvoke<T>(command, args);

        if (!signal) {
          const result = await invokePromise;
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        }

        if (signal.aborted) {
          throw createAbortError();
        }

        let rejectAbort: ((reason: DOMException) => void) | null = null;
        const abortPromise = new Promise<never>((_, reject) => {
          rejectAbort = reject;
        });
        const onAbort = (): void => {
          rejectAbort?.(createAbortError());
        };

        signal.addEventListener('abort', onAbort, { once: true });
        try {
          const racedResult = await Promise.race([invokePromise, abortPromise]);
          span.setStatus({ code: SpanStatusCode.OK });
          return racedResult;
        } finally {
          signal.removeEventListener('abort', onAbort);
        }
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    }
  );
}

export type EventCallback<T> = (payload: T) => void;

export async function listen<T>(event: string, callback: EventCallback<T>): Promise<() => void> {
  if (!IS_TAURI) {
    logger.debug(`Mock listen: ${event}`);
    return (): void => {
      // No-op for mock mode
    };
  }
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  const unlisten = await tauriListen<T>(event, (e): void => {
    callback(e.payload);
  });
  return unlisten;
}

/**
 * Decode base64 string to UTF-8 text.
 */
export function decodeBase64(base64: string): string {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    // If decoding fails, return empty string
    return '';
  }
}

/**
 * Check if running in Tauri environment.
 */
export function isTauri(): boolean {
  return IS_TAURI;
}
