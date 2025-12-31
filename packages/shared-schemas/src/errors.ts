import type { z } from 'zod';

/**
 * Format a Zod error for display to users
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('\n');
}

/**
 * Get field-level errors for form validation
 */
export function getFieldErrors(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    errors[path] ??= [];
    errors[path].push(issue.message);
  }

  return errors;
}

/**
 * Get the first error for each field (useful for inline form validation)
 */
export function getFirstFieldErrors(error: z.ZodError): Record<string, string> {
  const allErrors = getFieldErrors(error);
  const firstErrors: Record<string, string> = {};

  for (const [field, messages] of Object.entries(allErrors)) {
    const firstMessage = messages[0];
    if (firstMessage !== undefined) {
      firstErrors[field] = firstMessage;
    }
  }

  return firstErrors;
}

/**
 * Check if a specific field has errors
 */
export function hasFieldError(error: z.ZodError, fieldPath: string): boolean {
  return error.issues.some((issue) => issue.path.join('.') === fieldPath);
}
