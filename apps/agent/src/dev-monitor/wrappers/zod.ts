/**
 * Zod validation wrapper for dev-monitor.
 *
 * Traces Zod parse attempts, logging failures with details about
 * what failed validation and why.
 */

import { captureEvent } from '../storage';

import type { SafeParseResult } from '../types';

// ═══════════════════════════════════════════════════════════════
// Zod Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap Zod parsing to trace validation failures.
 *
 * @example
 * const result = zodWrapper(UserSchema, data, 'UserSchema');
 */
export function zodWrapper<TOutput>(
  schema: { safeParse: (data: unknown) => SafeParseResult<TOutput> },
  data: unknown,
  schemaName: string
): SafeParseResult<TOutput> {
  // ═══════════════════════════════════════════════════════════
  // ALWAYS execute the parse
  // ═══════════════════════════════════════════════════════════
  const result = schema.safeParse(data);

  // ═══════════════════════════════════════════════════════════
  // Post-parse monitoring (ISOLATED)
  // ═══════════════════════════════════════════════════════════
  try {
    if (result.success) {
      // Only log successful parses if they're interesting
      // (e.g., we could add a verbose mode later)
      // For now, we just log failures to reduce noise
    } else {
      // Parse failed - log the error details
      const issues = result.error.issues;
      const formattedIssues = issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
        expected: 'expected' in issue ? issue.expected : undefined,
        received: 'received' in issue ? issue.received : undefined,
      }));

      captureEvent({
        severity: 'warning',
        category: 'zod:parse:error',
        file: `schema:${schemaName}`,
        function: 'safeParse',
        title: `${schemaName} validation failed (${String(issues.length)} issue${issues.length === 1 ? '' : 's'})`,
        details: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        context: {
          issues: formattedIssues,
          inputPreview: getInputPreview(data),
          inputType: getInputType(data),
        },
      });
    }
  } catch (monitorError: unknown) {
    console.error('[DevMonitor] zod wrapper error:', monitorError);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Get a safe preview of the input data for logging.
 */
function getInputPreview(data: unknown): string {
  if (data === undefined) return '[undefined]';
  if (data === null) return 'null';

  try {
    const json = JSON.stringify(data);
    if (json.length > 200) {
      return json.slice(0, 200) + '...';
    }
    return json;
  } catch {
    return `[${typeof data}]`;
  }
}

/**
 * Get the type of input for context.
 */
function getInputType(data: unknown): string {
  if (data === null) return 'null';
  if (data === undefined) return 'undefined';
  if (Array.isArray(data)) return 'array';
  return typeof data;
}
