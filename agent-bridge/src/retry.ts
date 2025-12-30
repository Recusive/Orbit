/**
 * Retry utility with exponential backoff for SDK reliability
 */

import { createLogger } from './logger.js';

const logger = createLogger('Retry');

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Add jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Operation name for logging */
  operationName?: string;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Abort signal to cancel retries */
  signal?: AbortSignal;
}

/**
 * Error types that are typically retryable
 */
const RETRYABLE_ERROR_PATTERNS = [
  // Network errors
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'socket hang up',
  'network error',
  'fetch failed',
  // Rate limiting
  'rate limit',
  'too many requests',
  '429',
  // Server errors
  '500',
  '502',
  '503',
  '504',
  'internal server error',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
  // API overload
  'overloaded',
  'capacity',
  // Temporary failures
  'temporary',
  'try again',
  'retry',
];

/**
 * Error types that should NOT be retried
 */
const NON_RETRYABLE_ERROR_PATTERNS = [
  // Authentication errors
  'unauthorized',
  'invalid api key',
  'authentication',
  '401',
  '403',
  // Client errors
  'invalid request',
  'bad request',
  '400',
  // Not found
  '404',
  // Validation errors
  'validation',
  'invalid',
];

/**
 * Default function to determine if an error is retryable
 */
function defaultIsRetryable(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }

  const errorMessage =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : 'unknown error';

  // Check non-retryable patterns first
  for (const pattern of NON_RETRYABLE_ERROR_PATTERNS) {
    if (errorMessage.includes(pattern)) {
      return false;
    }
  }

  // Check retryable patterns
  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (errorMessage.includes(pattern)) {
      return true;
    }
  }

  // Default: retry unknown errors (safer for SDK reliability)
  return true;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitter: boolean
): number {
  // Exponential backoff: delay = initial * multiplier^attempt
  let delay = initialDelayMs * Math.pow(backoffMultiplier, attempt);

  // Cap at maximum delay
  delay = Math.min(delay, maxDelayMs);

  // Add jitter (±25%) to prevent thundering herd
  if (jitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Retry aborted'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new Error('Retry aborted'));
    });
  });
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => sdkCall(),
 *   { operationName: 'SDK Query', maxRetries: 3 }
 * );
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    jitter = true,
    operationName = 'operation',
    isRetryable = defaultIsRetryable,
    signal,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for abort before each attempt
    if (signal?.aborted) {
      throw new Error(`${operationName} aborted`);
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if we should retry
      if (attempt >= maxRetries) {
        logger.error(
          {
            operation: operationName,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            error: errorMessage,
          },
          'All retry attempts exhausted'
        );
        throw error;
      }

      if (!isRetryable(error)) {
        logger.warn(
          {
            operation: operationName,
            attempt: attempt + 1,
            error: errorMessage,
          },
          'Error is not retryable'
        );
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, initialDelayMs, maxDelayMs, backoffMultiplier, jitter);

      logger.warn(
        {
          operation: operationName,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          error: errorMessage,
          nextRetryMs: delay,
        },
        'Retrying after error'
      );

      // Wait before retry
      try {
        await sleep(delay, signal);
      } catch {
        // Abort was triggered during sleep
        throw new Error(`${operationName} aborted during retry wait`);
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Create a retryable version of an async function
 *
 * @example
 * ```ts
 * const retryableQuery = createRetryable(
 *   (msg: string) => sdk.query(msg),
 *   { operationName: 'SDK Query' }
 * );
 * const result = await retryableQuery('Hello');
 * ```
 */
export function createRetryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}

/**
 * Retry options presets for common scenarios
 */
export const RetryPresets = {
  /** Quick retries for fast operations */
  quick: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 2000,
    backoffMultiplier: 2,
  } satisfies RetryOptions,

  /** Standard retries for normal SDK calls */
  standard: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  } satisfies RetryOptions,

  /** Aggressive retries for critical operations */
  aggressive: {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  } satisfies RetryOptions,

  /** Patient retries for operations that may have rate limits */
  patient: {
    maxRetries: 5,
    initialDelayMs: 2000,
    maxDelayMs: 60000,
    backoffMultiplier: 2.5,
  } satisfies RetryOptions,
} as const;
