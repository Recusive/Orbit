/**
 * Performance logging for agent-bridge sidecar
 *
 * IMPORTANT: Logs to stderr to avoid polluting stdout which is used for JSON IPC.
 *
 * Output format matches the Rust perf_logger:
 * [timestamp] [AGENT:operation] START
 * [timestamp] [AGENT:operation] END (123ms)
 * [timestamp] [AGENT:operation] END (123ms) - 450 input tokens, 380 output tokens
 *
 * @example
 * ```typescript
 * import { perfStart, perfEnd, perfEndWithTokens } from '../common/perf/perf.js';
 *
 * // Simple timing
 * const start = perfStart('request');
 * // ... do work ...
 * perfEnd('request', start);
 *
 * // With token counts
 * const apiStart = perfStart('api_call');
 * // ... call Claude API ...
 * perfEndWithTokens('api_call', apiStart, { input: 450, output: 380 });
 *
 * // Log a custom event
 * perfEvent('request', 'Received prompt (1250 chars)');
 * ```
 */

/**
 * Token count data from Claude API responses
 */
export interface TokenCounts {
  input: number;
  output: number;
}

/**
 * Get the current timestamp in milliseconds since Unix epoch
 */
function getTimestamp(): number {
  return Date.now();
}

/**
 * Write a log entry to stderr (avoids stdout IPC interference)
 */
function writeToStderr(entry: string): void {
  process.stderr.write(entry + '\n');
}

/**
 * Start a performance measurement and log START event.
 * Returns the start timestamp for use with perfEnd().
 *
 * @param operation - The operation name (e.g., 'init', 'request', 'api_call')
 * @returns Start timestamp in milliseconds
 */
export function perfStart(operation: string): number {
  const ts = getTimestamp();
  writeToStderr(`[${String(ts)}] [AGENT:${operation}] START`);
  return ts;
}

/**
 * End a performance measurement and log END event with duration.
 *
 * @param operation - The operation name (must match perfStart)
 * @param startMs - The start timestamp from perfStart()
 */
export function perfEnd(operation: string, startMs: number): void {
  const ts = getTimestamp();
  const duration = ts - startMs;
  writeToStderr(`[${String(ts)}] [AGENT:${operation}] END (${String(duration)}ms)`);
}

/**
 * End a performance measurement and log END event with duration and token counts.
 * Use this for Claude API calls where token usage is available.
 *
 * @param operation - The operation name (must match perfStart)
 * @param startMs - The start timestamp from perfStart()
 * @param tokens - Token counts from the Claude response
 */
export function perfEndWithTokens(operation: string, startMs: number, tokens: TokenCounts): void {
  const ts = getTimestamp();
  const duration = ts - startMs;
  writeToStderr(
    `[${String(ts)}] [AGENT:${operation}] END (${String(duration)}ms) - ${String(tokens.input)} input tokens, ${String(tokens.output)} output tokens`
  );
}

/**
 * End a performance measurement and log END event with duration and a custom count.
 * Use this for operations that process items (bytes, messages, etc.)
 *
 * @param operation - The operation name (must match perfStart)
 * @param startMs - The start timestamp from perfStart()
 * @param count - The count value
 * @param unit - The unit name (e.g., 'bytes', 'chars', 'messages')
 */
export function perfEndWithCount(
  operation: string,
  startMs: number,
  count: number,
  unit: string
): void {
  const ts = getTimestamp();
  const duration = ts - startMs;
  writeToStderr(
    `[${String(ts)}] [AGENT:${operation}] END (${String(duration)}ms) - ${String(count)} ${unit}`
  );
}

/**
 * Log a custom performance event without timing.
 * Use this for logging informational events like payload sizes.
 *
 * @param operation - The operation name
 * @param message - The event message
 */
export function perfEvent(operation: string, message: string): void {
  const ts = getTimestamp();
  writeToStderr(`[${String(ts)}] [AGENT:${operation}] ${message}`);
}

/**
 * Performance timer class for scoped timing.
 * Automatically logs START on creation.
 *
 * @example
 * ```typescript
 * const timer = new PerfTimer('api_call');
 * // ... do work ...
 * timer.end();
 * // or with tokens:
 * timer.endWithTokens({ input: 450, output: 380 });
 * ```
 */
export class PerfTimer {
  private readonly operation: string;
  private readonly startMs: number;
  private ended = false;

  constructor(operation: string) {
    this.operation = operation;
    this.startMs = perfStart(operation);
  }

  /**
   * End the timer and log duration
   */
  end(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    perfEnd(this.operation, this.startMs);
  }

  /**
   * End the timer and log duration with token counts
   */
  endWithTokens(tokens: TokenCounts): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    perfEndWithTokens(this.operation, this.startMs, tokens);
  }

  /**
   * End the timer and log duration with a custom count
   */
  endWithCount(count: number, unit: string): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    perfEndWithCount(this.operation, this.startMs, count, unit);
  }
}
