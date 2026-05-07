/**
 * Simple logger for agent-bridge
 * IMPORTANT: Uses stderr to avoid polluting stdout which is used for JSON IPC
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

const REDACTED_SECRET = '[REDACTED_SECRET]';

const SENSITIVE_KEY_PATTERN =
  /^(?:apiKey|api_key|anthropicApiKey|authorization|authToken|accessToken|refreshToken|token|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_AUTH_TOKEN)$/i;

const JSON_CREDENTIAL_FIELD_PATTERN =
  /("(?:apiKey|api_key|anthropicApiKey|authorization|authToken|accessToken|refreshToken|token|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_AUTH_TOKEN)"\s*:\s*")([^"]*)(")/gi;

const ASSIGNMENT_CREDENTIAL_FIELD_PATTERN =
  /\b(api[_-]?key|anthropicApiKey|authorization|authToken|accessToken|refreshToken|token|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_AUTH_TOKEN)\b(\s*[=:]\s*['"]?)([^'",\s}]+)/gi;

/**
 * Redact known credential shapes from arbitrary log strings.
 *
 * [warning] TESTED: Bridge log credential redaction is covered by integration tests.
 *     If you modify this, run: cd agent-bridge && bun test src/__tests__/logger-redaction.test.ts
 *     Test file: src/__tests__/logger-redaction.test.ts
 */
export function redactSensitiveData(value: string): string {
  let redacted = value;
  redacted = redacted.replace(JSON_CREDENTIAL_FIELD_PATTERN, `$1${REDACTED_SECRET}$3`);
  redacted = redacted.replace(/sk-ant-[a-zA-Z0-9._-]+/g, '[REDACTED_ANTHROPIC_KEY]');
  redacted = redacted.replace(/\bBearer\s+[a-zA-Z0-9._~+/=-]+/gi, 'Bearer [REDACTED_BEARER_TOKEN]');
  redacted = redacted.replace(ASSIGNMENT_CREDENTIAL_FIELD_PATTERN, `$1$2${REDACTED_SECRET}`);
  return redacted;
}

export function redactSensitiveLogValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    return SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_SECRET : redactSensitiveData(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveData(value.message),
      stack: value.stack === undefined ? undefined : redactSensitiveData(value.stack),
    };
  }

  return value;
}

function stringifyContext(context: LogContext): string {
  const seen = new WeakSet();
  const serialized = JSON.stringify(context, (key: string, value: unknown): unknown => {
    const redacted = redactSensitiveLogValue(key, value);

    if (redacted !== value) {
      return redacted;
    }

    if (typeof redacted === 'object' && redacted !== null) {
      if (seen.has(redacted)) {
        return '[Circular]';
      }
      seen.add(redacted);
    }

    return redacted;
  });

  return serialized;
}

interface Logger {
  debug(context: LogContext, message: string): void;
  debug(message: string): void;
  info(context: LogContext, message: string): void;
  info(message: string): void;
  warn(context: LogContext, message: string): void;
  warn(message: string): void;
  error(context: LogContext, message: string): void;
  error(message: string): void;
}

/**
 * Create a logger instance with a prefix
 * All output goes to STDERR to avoid polluting the JSON IPC channel on stdout
 */
export function createLogger(prefix: string): Logger {
  const formatMessage = (
    level: LogLevel,
    context: LogContext | string,
    message?: string
  ): string => {
    const timestamp = new Date().toISOString();
    const contextStr = typeof context === 'string' ? '' : ` ${stringifyContext(context)}`;
    const msg = redactSensitiveData(typeof context === 'string' ? context : (message ?? ''));
    return `[${timestamp}] [${prefix}] [${level.toUpperCase()}]${contextStr} ${msg}`;
  };

  // Write to stderr instead of stdout
  const writeToStderr = (message: string): void => {
    process.stderr.write(message + '\n');
  };

  return {
    debug(contextOrMessage: LogContext | string, message?: string): void {
      if (process.env.DEBUG) {
        writeToStderr(formatMessage('debug', contextOrMessage, message));
      }
    },
    info(contextOrMessage: LogContext | string, message?: string): void {
      writeToStderr(formatMessage('info', contextOrMessage, message));
    },
    warn(contextOrMessage: LogContext | string, message?: string): void {
      writeToStderr(formatMessage('warn', contextOrMessage, message));
    },
    error(contextOrMessage: LogContext | string, message?: string): void {
      writeToStderr(formatMessage('error', contextOrMessage, message));
    },
  };
}
