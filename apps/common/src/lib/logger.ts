/**
 * Structured logging system for production-ready observability.
 *
 * Usage:
 *   import { createLogger } from '@orbit/common/lib';
 *   const logger = createLogger('MyComponent');
 *   logger.debug('Processing data', { count: 42 });
 *   logger.error('Failed to fetch', new Error('Network error'), { url: '/api' });
 *
 * Log levels:
 *   - debug: Development only, filtered in production
 *   - info: General operational messages
 *   - warn: Potential issues that don't break functionality
 *   - error: Errors that need attention
 *
 * TODO: Production Telemetry
 * When ready for production monitoring:
 * 1. Add Sentry SDK for error tracking + performance monitoring
 * 2. Add LogTransport interface to abstract log destinations
 * 3. Create SentryTransport that pipes logs to Sentry dashboard
 * 4. Keep ConsoleTransport for local development debugging
 * 5. Add logger.time() / logger.timeEnd() for performance measurement
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogMeta = Record<string, unknown>;

interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly context: string;
  readonly message: string;
  readonly meta?: LogMeta | undefined;
  readonly error?:
    | {
        readonly name: string;
        readonly message: string;
        readonly stack?: string | undefined;
      }
    | undefined;
}

/**
 * Check if we're in development mode.
 * Uses Vite's import.meta.env for environment detection.
 */
const isDev = (): boolean => {
  try {
    // Vite sets MODE to 'development' or 'production'
    const mode = import.meta.env['MODE'];
    if (typeof mode === 'string') {
      return mode === 'development';
    }
    // Fallback to NODE_ENV
    return process.env.NODE_ENV !== 'production';
  } catch {
    // Fallback for non-Vite environments
    return process.env.NODE_ENV !== 'production';
  }
};

/**
 * Format a log entry for console output.
 */
function formatLogEntry(entry: LogEntry): string {
  const parts = [`[${entry.context}]`, entry.message];

  if (entry.meta !== undefined && Object.keys(entry.meta).length > 0) {
    parts.push(JSON.stringify(entry.meta));
  }

  return parts.join(' ');
}

/**
 * Serialize an Error object for logging.
 */
function serializeError(error: Error): LogEntry['error'] {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

/**
 * Logger class for structured logging with context.
 */
export class Logger {
  private readonly context: string;

  constructor(context: string) {
    this.context = context;
  }

  /**
   * Log a debug message. Only outputs in development mode.
   */
  debug(message: string, meta?: LogMeta): void {
    if (!isDev()) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      context: this.context,
      message,
      meta,
    };

    // eslint-disable-next-line no-console
    console.debug(formatLogEntry(entry));
  }

  /**
   * Log an informational message.
   */
  info(message: string, meta?: LogMeta): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      context: this.context,
      message,
      meta,
    };

    // eslint-disable-next-line no-console
    console.info(formatLogEntry(entry));
  }

  /**
   * Log a warning message.
   */
  warn(message: string, meta?: LogMeta): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      context: this.context,
      message,
      meta,
    };

    console.warn(formatLogEntry(entry));
  }

  /**
   * Log an error message with optional Error object.
   */
  error(message: string, error?: unknown, meta?: LogMeta): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      context: this.context,
      message,
      meta,
      error: error instanceof Error ? serializeError(error) : undefined,
    };

    const formatted = formatLogEntry(entry);

    if (error instanceof Error) {
      console.error(formatted, error);
    } else if (error !== undefined) {
      console.error(formatted, error);
    } else {
      console.error(formatted);
    }

    // Future: Send to error tracking service (Sentry, LogRocket, etc.)
    // if (!isDev()) {
    //   sendToErrorTracking(entry);
    // }
  }
}

/**
 * Create a new logger instance with a specific context.
 *
 * @param context - A short identifier for the component/module (e.g., 'FileService', 'ChatStore')
 * @returns A Logger instance
 *
 * @example
 * const logger = createLogger('ChatStore');
 * logger.info('Conversation created', { id: '123' });
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

/**
 * Default logger for quick use without creating an instance.
 * Prefer createLogger() for better context identification.
 */
export const logger = createLogger('App');
