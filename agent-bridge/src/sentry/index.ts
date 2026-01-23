/**
 * Sentry Error Monitoring Module
 *
 * Provides error tracking for the agent-bridge sidecar.
 *
 * @example
 * ```typescript
 * import { initSentry, captureAgentError, Sentry } from './sentry/index.js';
 *
 * // Initialize at app startup
 * initSentry();
 *
 * // Capture errors with context
 * captureAgentError(new Error('Tool failed'), {
 *   sessionId: 'abc-123',
 *   source: 'session_manager',
 * });
 *
 * // Direct Sentry access for advanced use
 * Sentry.addBreadcrumb({ message: 'User action' });
 * ```
 */

export {
  BRIDGE_VERSION,
  captureAgentError,
  captureFatalError,
  initSentry,
  Sentry,
} from './config.js';
