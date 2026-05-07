/**
 * Sentry Error Monitoring Configuration
 *
 * Provides error tracking for the agent-bridge sidecar process.
 * Captures Claude SDK errors, tool execution failures, and session issues.
 */

import * as Sentry from '@sentry/bun';

import { redactSensitiveData, redactSensitiveLogValue } from '../common/logging/logger.js';
import { BRIDGE_VERSION } from '../version.js';

// Re-export for external use
export { BRIDGE_VERSION };

/**
 * Sentry DSN for the agent-bridge sidecar.
 * Uses the same frontend project for unified error tracking across all Orbit components.
 */
const SENTRY_DSN =
  'https://c9518e0817d46db099af2bfd59eb0fc0@o4510750911037440.ingest.us.sentry.io/4510750915624960';

/**
 * Recursively scrub sensitive data from an object.
 * Used for cleaning event.extra which may contain IPC payloads.
 */
function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = redactSensitiveLogValue(key, value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = scrubObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item: unknown): unknown => {
        if (typeof item === 'string') return redactSensitiveData(item);
        if (typeof item === 'object' && item !== null) {
          return scrubObject(item as Record<string, unknown>);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Before send hook to scrub sensitive data from Sentry events.
 * Prevents accidental leakage of API keys and tokens.
 *
 * Scrubs:
 * - event.message
 * - event.exception.values[].value
 * - event.breadcrumbs[].message
 * - event.extra (IPC payloads may contain sensitive data)
 */
function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // Scrub error messages
  if (event.message) {
    event.message = redactSensitiveData(event.message);
  }

  // Scrub exception values
  if (event.exception?.values) {
    for (const exception of event.exception.values) {
      if (exception.value) {
        exception.value = redactSensitiveData(exception.value);
      }
    }
  }

  // Scrub breadcrumb messages
  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      if (breadcrumb.message) {
        breadcrumb.message = redactSensitiveData(breadcrumb.message);
      }
    }
  }

  // Scrub event.extra - IPC payloads may contain API keys or tokens
  if (event.extra && typeof event.extra === 'object') {
    event.extra = scrubObject(event.extra as Record<string, unknown>);
  }

  return event;
}

/**
 * Initialize Sentry error monitoring for the agent-bridge.
 *
 * Should be called at the very start of the application before any
 * other initialization to ensure all errors are captured.
 *
 * @example
 * ```typescript
 * import { initSentry } from './sentry/index.js';
 *
 * function main(): void {
 *   initSentry();
 *   // ... rest of initialization
 * }
 * ```
 */
/**
 * Detect environment for Sentry.
 *
 * Priority:
 * 1. NODE_ENV environment variable (if explicitly set)
 * 2. TAURI_ENV environment variable (Tauri sets this in release builds)
 * 3. Compiled binary detection (agent-bridge suffix = production)
 * 4. Default to 'development' for safety
 *
 * Note: Tauri may launch the sidecar without NODE_ENV set, so we need
 * multiple fallback strategies to correctly detect production builds.
 */
function detectEnvironment(): 'production' | 'development' {
  // Check NODE_ENV first (explicit override)
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }
  if (process.env.NODE_ENV === 'development') {
    return 'development';
  }

  // Check TAURI_ENV (set by Tauri in release builds)
  if (process.env.TAURI_ENV === 'production') {
    return 'production';
  }

  // Check if running in a compiled binary (production indicator)
  // Bun.main ends with 'agent-bridge' when running as compiled binary
  // In dev mode, it ends with 'bun' or the source file path
  if (typeof Bun !== 'undefined') {
    const mainPath = Bun.main;
    // Compiled binary detection: path ends with agent-bridge (possibly with platform suffix)
    if (mainPath.includes('agent-bridge') && !mainPath.endsWith('.ts')) {
      return 'production';
    }
  }

  return 'development';
}

export function initSentry(): void {
  Sentry.init({
    dsn: SENTRY_DSN,

    // ============================================
    // Release Health Configuration
    // ============================================
    // Ties sessions, errors, and crashes to specific app versions
    // Format: "orbit@version" to match frontend/backend for correlation
    release: `orbit@${BRIDGE_VERSION}`,

    // Environment detection with robust fallbacks for Tauri sidecar
    environment: detectEnvironment(),

    // Note: Session tracking is not available in @sentry/bun
    // Sidecar errors are correlated via release name instead

    // ============================================
    // Privacy & Data Collection
    // ============================================
    // Don't send PII (IP addresses, etc.) by default
    sendDefaultPii: false,

    // ============================================
    // Sampling Rates
    // ============================================
    // Capture 100% of errors - sidecar is low volume
    tracesSampleRate: 1.0,

    // ============================================
    // Data Scrubbing
    // ============================================
    beforeSend,
  });
}

/**
 * Capture an exception to Sentry with agent-bridge context.
 *
 * @param error - The error to capture
 * @param context - Additional context for the error
 */
export function captureAgentError(
  error: Error | string,
  context?: {
    sessionId?: string;
    source?: string;
    extra?: Record<string, unknown>;
  }
): void {
  const errorObj = typeof error === 'string' ? new Error(error) : error;

  Sentry.captureException(errorObj, {
    tags: {
      component: 'agent-bridge',
      ...(context?.source ? { source: context.source } : {}),
      ...(context?.sessionId ? { sessionId: context.sessionId } : {}),
    },
    extra: context?.extra,
  });
}

/**
 * Capture a fatal error and flush Sentry before process exit.
 *
 * @param error - The fatal error
 * @param phase - The phase when the error occurred (e.g., 'startup', 'runtime')
 * @returns Promise that resolves when Sentry has flushed
 */
export async function captureFatalError(error: unknown, phase: string): Promise<void> {
  Sentry.captureException(error, {
    level: 'fatal',
    tags: {
      component: 'agent-bridge',
      phase,
    },
  });

  // Flush Sentry before exit (give it 2 seconds max)
  await Sentry.flush(2000);
}

// Re-export Sentry for direct access when needed
export { Sentry };
