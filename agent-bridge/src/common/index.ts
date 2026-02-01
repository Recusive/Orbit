/**
 * Common Module
 * Shared utilities used by both Agent and Canvas integrations
 */

// Authentication
export { ClaudeCredentials } from './auth/index.js';
export type { CredentialResult } from './auth/credentials.js';

// Shell environment capture
export { getShellEnvironment, clearShellEnvironmentCache } from './env/index.js';

// Event emitter and disposable pattern
export { Disposable, Emitter } from './events/index.js';
export type { IDisposable, Listener, Event } from './events/index.js';

// Localization (simple passthrough)
export { localize } from './i18n/index.js';

// Logging
export { createLogger } from './logging/index.js';

// Retry utilities
export { withRetry, createRetryable, RetryPresets } from './retry/index.js';
export type { RetryOptions } from './retry/index.js';
