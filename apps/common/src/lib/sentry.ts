/**
 * Shared Sentry Configuration
 *
 * Provides unified Sentry initialization for all frontend apps (Agent, Canvas, Editor).
 * Ensures consistent release naming, environment detection, and privacy settings.
 *
 * Usage:
 *   import { initSentry, SENTRY_DSN, getSentryConfig } from '@orbit/common/lib/sentry';
 *
 *   // In main.tsx:
 *   import * as Sentry from '@sentry/react';
 *   Sentry.init(getSentryConfig());
 */

/**
 * Sentry DSN for all frontend applications.
 * Uses the same project for unified error tracking across Orbit components.
 */
export const SENTRY_DSN =
  'https://c9518e0817d46db099af2bfd59eb0fc0@o4510750911037440.ingest.us.sentry.io/4510750915624960';

/**
 * Check if we're in development mode.
 * Uses Vite's import.meta.env for environment detection.
 */
export function isDev(): boolean {
  try {
    // Check for Vite's __DEV__ global first (defined in vite.config.ts)
    if (typeof __DEV__ !== 'undefined') {
      return __DEV__;
    }
    // Fallback to import.meta.env
    const mode = import.meta.env['MODE'];
    if (typeof mode === 'string') {
      return mode === 'development';
    }
    return process.env.NODE_ENV !== 'production';
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
}

/**
 * Get the app version from Vite's define.
 */
export function getAppVersion(): string {
  try {
    if (typeof __APP_VERSION__ !== 'undefined') {
      return __APP_VERSION__;
    }
    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Common Sentry integrations configuration.
 * Can be extended by individual apps if needed.
 */
export interface SentryConfigOptions {
  /** Additional integrations to include */
  additionalIntegrations?: unknown[];
  /** Custom sample rates */
  tracesSampleRate?: number;
  replaysSessionSampleRate?: number;
  replaysOnErrorSampleRate?: number;
  /** Whether to enable session replay (default: true for agent, false for canvas/editor) */
  enableReplay?: boolean;
  /** App-specific tag for filtering in Sentry */
  appTag?: 'agent' | 'canvas' | 'editor';
}

/**
 * Get Sentry configuration object for initialization.
 * This returns the config object to be passed to Sentry.init().
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/react';
 * import { getSentryConfig } from '@orbit/common/lib/sentry';
 *
 * Sentry.init(getSentryConfig({ appTag: 'canvas', enableReplay: true }));
 * ```
 */
export function getSentryConfig(options: SentryConfigOptions = {}): Record<string, unknown> {
  const {
    tracesSampleRate = 1.0,
    replaysSessionSampleRate = 0.1,
    replaysOnErrorSampleRate = 1.0,
    enableReplay = true,
    appTag,
  } = options;

  const dev = isDev();
  const version = getAppVersion();

  return {
    dsn: SENTRY_DSN,

    // ============================================
    // Release Health Configuration
    // ============================================
    release: `orbit@${version}`,
    environment: dev ? 'development' : 'production',

    // ============================================
    // Privacy & Data Collection
    // ============================================
    sendDefaultPii: false,

    // ============================================
    // Sampling Rates
    // ============================================
    tracesSampleRate,
    tracePropagationTargets: ['localhost'],
    replaysSessionSampleRate: enableReplay ? replaysSessionSampleRate : 0,
    replaysOnErrorSampleRate: enableReplay ? replaysOnErrorSampleRate : 0,

    // ============================================
    // Logging
    // ============================================
    enableLogs: dev,

    // ============================================
    // Initial Scope
    // ============================================
    initialScope: appTag
      ? {
          tags: {
            app: appTag,
          },
        }
      : undefined,
  };
}

/**
 * Common replay integration options for masking sensitive content.
 * Use with Sentry.replayIntegration(REPLAY_OPTIONS).
 */
export const REPLAY_OPTIONS: {
  maskAllText: boolean;
  blockAllMedia: boolean;
  mask: string[];
  block: string[];
} = {
  // Mask all text to prevent capturing sensitive code/prompts
  maskAllText: true,
  // Block media (images, videos) that might contain sensitive content
  blockAllMedia: true,
  // Additional selectors for elements that should always be masked
  mask: ['[data-sentry-mask]', '.sensitive', 'pre', 'code', '.terminal'],
  // Block elements that should not be recorded at all
  block: ['[data-sentry-block]', '.xterm'],
};

// Declare globals that Vite defines
declare const __DEV__: boolean;
declare const __APP_VERSION__: string;
